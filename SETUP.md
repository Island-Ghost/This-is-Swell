# Environment Setup & Installation Guide (`SETUP.md`)

This guide walks through setting up the complete **This-is-Swell (`AgilityCore` for ShadowLabz)** development environment on **macOS** or **Linux (including WSL2)**.

---

## 1. Prerequisites Overview

| Requirement | Version | Purpose |
| :--- | :--- | :--- |
| **Node.js** | **`22.x` or `24.x`** (`v24` recommended, pinned in `.nvmrc`) | Required for `@midnight-ntwrk/*` SDK v4.1.1, `xrpl.js`, and Hono gateway. *(Note: Node 20, 23, and 26 are not supported by the Midnight SDK ESM resolver).* |
| **Compact CLI & Compiler** | CLI `0.5.3` / Compiler **`0.31.1`** (`language_version 0.23`) | Compiles `.compact` zero-knowledge smart contracts into circuits and TypeScript bindings. |
| **Python & `uv`** | **Python `3.11+`** (`3.12` recommended) | Required for `x402-xrpl`, `xrpl-py`, and FastAPI merchant/payer services. |
| **Docker Desktop** | Docker Compose v2 | Runs the local Midnight Proof Server container (`midnightntwrk/proof-server:8.1.0`) on `127.0.0.1:6300`. |
| **Wallets** | **Xaman (XUMM)** & **Lace** | Xaman for XRPL/Xahau signing; Lace browser extension for Midnight (`window.midnight`). |

---

## 2. Step-by-Step Toolchain Installation

### Step 2.1: Install Node.js 24 via NVM

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

nvm install 24
nvm use 24
nvm alias default 24
node -v   # Should print v24.x.x
```

### Step 2.2: Install the Midnight Compact Toolchain (`0.31.1`)

Install the official Compact CLI binary to `~/.local/bin/compact` and pin compiler version **`0.31.1`** (the version supported on Midnight Preview and public networks):

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install and set Compact compiler 0.31.1 as default
compact update 0.31.1

# Verify versions
compact --version                     # compact 0.5.3
compact compile --version             # 0.31.1
compact compile --language-version    # 0.23.0
```

> **Important:** Do not run a bare `compact update` without `0.31.1`, as newer pre-release compilers (`0.35.0`) target ledger versions not yet deployed on Midnight Preview.

### Step 2.3: Install `uv` and Python 3.12 (for `x402-xrpl` & `xrpl-py`)

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

uv python install 3.12
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt
```

Verify the Python XRPL & X402 packages:

```bash
.venv/bin/python -c "import xrpl, x402_xrpl, fastapi; print('XRPL + x402-xrpl ready!')"
```

---

## 3. Project Setup & Contract Compilation

### Step 3.1: Install Node Workspace Dependencies

```bash
npm install
```

### Step 3.2: Configure Environment Variables

```bash
cp .env.example .env
```

Key variables in `.env`:
- `XRPL_NETWORK=testnet`
- `XRPL_WS_URL=wss://s.altnet.rippletest.net:51233`
- `XRPL_RPC_URL=https://s.altnet.rippletest.net:51234/`
- `XRPL_FACILITATOR_URL=https://xrpl-facilitator-testnet.t54.ai`
- `XRPL_PAY_TO=rYourMerchantWalletAddressHere`
- `XRPL_SOURCE_TAG=20260601`
- `MIDNIGHT_NETWORK=preview`
- `MIDNIGHT_PROOF_SERVER_URL=http://127.0.0.1:6300`
- `MIDNIGHT_PREVIEW_MNEMONIC_FILE=.mnemonic` *(Never pass raw mnemonic words in env vars or CLI args; store in a `chmod 600` `.mnemonic` file).*

### Step 3.3: Compile Midnight Compact Smart Contracts

```bash
# Fast compile (generates JS/TS bindings in contracts/src/managed/ without heavy ZK proving keys)
npm run compile:skip-zk

# Full compile (generates ZK proving & verifying keys in contracts/src/managed/*/keys/)
npm run compile

# Build & Typecheck all TypeScript workspaces (shared, contracts, gateway)
npm run build
npm run typecheck
```

---

## 4. Running the Midnight Proof Server (Docker)

When generating real zero-knowledge proofs locally, start the Midnight Proof Server container (bound strictly to loopback `127.0.0.1:6300`):

```bash
npm run proof-server:up
npm run proof-server:health
```

---

## 5. Running the Services & Demo

### 5.1 Run the Integration Tests

```bash
npm test
```

### 5.2 Start the TypeScript AgilityCore Gateway & Live Control Room UI

```bash
npm run dev:gateway
```
Open **`http://127.0.0.1:8787`** in your browser to interact with the **ShadowLabz Payment Portal & Midnight ZK KYC Control Room**, or query the API endpoints directly:
- `GET http://127.0.0.1:8787/api/agility-core/status`
- `GET http://127.0.0.1:8787/api/plans`
- `POST http://127.0.0.1:8787/api/kyc/verify`
- `GET http://127.0.0.1:8787/api/x402/plan/community`
- `POST http://127.0.0.1:8787/api/dao/nightshade-collective/membership/checkout`
- `POST http://127.0.0.1:8787/api/dao/nightshade-collective/crowdfund/escrow`

### 5.3 Start the Python FastAPI `x402-xrpl` Merchant Server

```bash
.venv/bin/python xrpl_x402/shadowlabz_merchant.py
```
This starts the FastAPI merchant server on **`http://127.0.0.1:8000`**, protecting `/api/x402/dao/launch` with both T54's `require_payment` XRPL middleware and the `X-Midnight-Kyc` nullifier check.
