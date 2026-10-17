# This-is-Swell

**XRPL Payment Portal (x402) with Midnight Network Zero-Knowledge KYC & m402 Private Agentic Payments.**

## Architecture Overview

- **Midnight Network (Zero-Knowledge KYC & Private Payments):**
  - `contracts/src/swellKyc.compact`: Zero-knowledge KYC credential commitments (`persistentCommit`), selective disclosure predicates (`verifySelectiveKyc`), and unlinkable anonymous KYC membership (`HistoricMerkleTree<16, Bytes<32>>` + nullifiers in `authorizeAnonymousPayment`).
  - `contracts/src/m402Vault.compact`: Pooled NIGHT reserve issuing 1:1 shielded credits (`registerService`, `deposit`, `pay`, `redeem`, `withdraw`) for private HTTP 402 payments where no payer identity appears on-chain.
- **XRP Ledger (x402 & Agentic Settlement):**
  - Deterministic 3–5 second settlement in **XRP** and **RLUSD** via `xrpl.js` (TypeScript) and `xrpl-py` / `x402-xrpl` (Python 3.12).
  - Full XRPL Agent Skills (`xrpl-agent-wallet`, `xrpl-payments`, `xrpl-trading`, `xrpl-x402`) and Midnight Skills (`midnight-compact`, `midnight-sdk-wallet`, `midnight-tooling`, `m402-private-payments`) configured in `.devin/skills/`.

## Quickstart

### 1. Activate Toolchains

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24
source .venv/bin/activate
```

### 2. Compile Midnight Compact Contracts & Typecheck

```bash
# Fast compile (generates TypeScript bindings in contracts/src/managed/ without heavy ZK keys)
npm run compile:skip-zk

# Full compile (generates ZK proving/verifying keys in contracts/src/managed/*/keys/)
npm run compile

# Build & typecheck TypeScript workspaces
npm run build
npm run typecheck
```

### 3. Start Local Midnight Proof Server (Docker)

```bash
npm run proof-server:up
npm run proof-server:health
```

## Repository Structure

```text
This-is-Swell/
├── .devin/skills/               # XRPL, x402, Midnight, and m402 agent skills
├── contracts/                   # Midnight Compact smart contracts (m402Vault & swellKyc)
├── shared/                      # Shared TypeScript protocol types & constants (@swell/shared)
├── docs/                        # Reference documentation for Midnight, XRPL x402, and m402
├── docker-compose.yml           # Local Midnight proof-server on 127.0.0.1:6300
├── requirements.txt             # Python 3.12 dependencies (x402-xrpl, xrpl-py, FastAPI)
├── package.json                 # Node 24 npm workspaces root
└── AGENTS.md                    # Project rules and verification commands
```
