# Agent Instructions for This-is-Swell

## Overview
**This-is-Swell** is an XRPL Payment Portal (X402 & Direct/RLUSD/Escrow/DEX) integrated with Midnight Network Zero-Knowledge KYC (`swellKyc.compact`) and private agentic payments (`m402Vault.compact`).

## Environment & Toolchains

Always ensure the following paths and versions are active when running shell commands:
- **Node.js:** v24.x (`nvm use 24`, pinned in `.nvmrc`). Do NOT use Node 20, 23, or 26 (Midnight SDK requires Node 22 or 24).
- **Compact CLI & Compiler:** `~/.local/bin/compact` (`0.5.3`), compiler pinned to `0.31.1` (`pragma language_version 0.23`).
- **Python (for `x402-xrpl` & `xrpl-py`):** Python 3.12 in `.venv` managed by `~/.local/bin/uv` (`source .venv/bin/activate`).
- **Midnight Proof Server:** Local Docker container `midnightntwrk/proof-server:8.1.0` bound strictly to `127.0.0.1:6300` (`npm run proof-server:up`).

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24
```

## Available Project Skills (`.devin/skills/`)

1. **`xrpl-agent-wallet`** — XRPL wallet creation (seed written directly to `.env`, never echoed in chat), key loading (env-var, external signer, or Open Wallet Standard `ows_key_...`), and the mandatory 6-step signing ceremony (`receive` -> `load` -> `autofill` -> `preview` -> `sign` -> `submitAndWait`). Applies default `SourceTag = 20260530`.
2. **`xrpl-payments`** — Constructs XRP, RLUSD (`524C555344000000000000000000000000000000`), IOU, cross-currency, and Escrow transactions (`xrpl.js` / `xrpl-py`), checks reserves and `lsfRequireDestTag`, simulates via `simulate`, and hands off to `xrpl-agent-wallet`.
3. **`xrpl-trading`** — Constructs XRPL DEX `OfferCreate` / `OfferCancel` transactions and reads `book_offers` (filtering unfunded offers via `taker_gets_funded`), computes funded depth/slippage, shows mandatory pre-trade summary, and hands off to `xrpl-agent-wallet`.
4. **`xrpl-x402`** — HTTP 402 machine-to-machine payments on XRPL using `x402-xrpl`, FastAPI `require_payment` middleware, `x402_requests` payer client, T54 facilitators (`xrpl-facilitator-testnet.t54.ai` / `xrpl-facilitator-mainnet.t54.ai`), and `SourceTag` / `Memos` telemetry.
5. **`midnight-compact`** — Compact `0.31.1` (`pragma language_version 0.23`) language mechanics, stdlib signatures, `disclose()` rules, Zswap shielded/unshielded token circuits, TypeScript `WitnessContext` implementation, and ZK KYC / Selective Disclosure / `HistoricMerkleTree` patterns.
6. **`midnight-sdk-wallet`** — Midnight.js SDK `v4.1.1`, `@midnight-ntwrk/wallet-sdk`, Lace DApp Connector `v4.0.1` (`window.midnight`), `levelPrivateStateProvider` rules, unshielded `signRecipe` requirement, and Preview network endpoints.
7. **`midnight-tooling`** — Compact CLI (`compact compile`, `compact format`, `compact fixup`) and Docker Proof Server management on `127.0.0.1:6300`.
8. **`m402-private-payments`** — `m402Vault.compact` shielded credit pool, Hono HTTP 402 gateway, `X-Payment` receipt secret verification, SQLite replay guard, and Midnight-to-XRPL x402 payment relaying.

## Verification Commands

- Compile Compact contracts (fast typecheck / no ZK keys): `npm run compile:skip-zk`
- Compile Compact contracts (full ZK keys): `npm run compile`
- Build & Typecheck TypeScript workspaces: `npm run build && npm run typecheck`
- Verify Python XRPL / X402 environment: `.venv/bin/python -c "import xrpl, x402_xrpl, fastapi; print('OK')"`
