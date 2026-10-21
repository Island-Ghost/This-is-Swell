# Agent Instructions for This-is-Swell

## Overview
**This-is-Swell** builds the tools that let AI agents make payments and manage money on the XRP Ledger autonomously and safely:
a policy-guarded agent wallet runtime (`agent-wallet/`), an MCP server (`mcp-server/`), a supervision CLI (`cli/`), autonomous
HTTP 402 payers (TypeScript + Python), and a gateway (`gateway/`) that verifies XRPL payments on-ledger before unlocking resources.
Midnight Network Zero-Knowledge KYC (`ShadowLabzKyc.compact`) is an optional gate on the gateway; m402 (`m402Vault.compact`) is a demo mode.

## Environment & Toolchains

- **Node.js:** v24.x (`nvm use 24`, pinned in `.nvmrc`). Node ≥22.5 required for the built-in `node:sqlite` used by the audit stores.
- **Compact CLI & Compiler:** `~/.local/bin/compact` (`0.5.3`), compiler pinned to `0.31.1` (`pragma language_version 0.23`). Only needed to recompile contracts.
- **Python:** 3.12 in `.venv` managed by `~/.local/bin/uv` (`uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt`).
- **Midnight Proof Server:** optional, `midnightntwrk/proof-server:8.1.0` on `127.0.0.1:6300` (`npm run proof-server:up`).

```bash
export PATH="$HOME/.local/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24
```

## Wallet, policy, and state

- The agent wallet seed lives in `.env` as `XRPL_SEED` (chmod 600, gitignored). **Never print, log, or paste it.** Create with `npm run wallet:create`.
- Spending policy: `agent-policy.json` (testnet, ≤5 XRP/tx, ≤25 XRP/day, 20 tx/hour, expires weekly). Edit with `npm run swell -- policy set key=value`.
- Audit DB: `.state/agent-wallet.sqlite` (shared by CLI, MCP server, and the Python agent). Gateway state: `.state/gateway.sqlite`.
- Every signature goes through `executeTransaction` in `agent-wallet/src/ceremony.ts`. Do not add code paths that call `wallet.sign` / `submit` directly.
- Hard policy violations are denied even with human approval; soft caps escalate (`needs_approval`). With no `confirm` callback the ceremony is autonomous and only policy-allowed transactions are signed.
- Gateway admin API requires `ADMIN_API_TOKEN` (bearer); without it the gateway generates and prints a session token.

## Available Project Skills (`.devin/skills/`)

1. **`xrpl-agent-wallet`** — wallet creation (seed → `.env`, never echoed), key loading, the 6-step signing ceremony, default `SourceTag = 20260530`. Implemented in `agent-wallet/`.
2. **`xrpl-payments`** — XRP, RLUSD (`524C555344000000000000000000000000000000`), IOU, cross-currency, Escrow builders; reserve and `lsfRequireDestTag` checks; `simulate` before submit.
3. **`xrpl-trading`** — DEX `OfferCreate`/`OfferCancel` construction and `book_offers` reads (not yet wired into the agent wallet).
4. **`xrpl-x402`** — HTTP 402 on XRPL (`x402-xrpl`, T54 facilitators, `SourceTag`/`Memos` telemetry). The Swell gateway uses the simpler tx-hash proof scheme; `xrpl_x402/shadowlabz_merchant.py` shows the T54 middleware.
5. **`midnight-compact`**, 6. **`midnight-sdk-wallet`**, 7. **`midnight-tooling`**, 8. **`m402-private-payments`** — Midnight contracts, SDK, toolchain, and the m402 vault (optional / demo).

## Verification Commands

- Typecheck all workspaces: `npm run typecheck`
- Unit tests (mocked ledger, no network): `npm test` — agent-wallet (policy, ceremony, store, payer) + gateway (402 flow, verification, admin)
- Live testnet suite (spends ~2 test XRP; needs `XRPL_SEED`): `npm run test:testnet`
- End-to-end: `ADMIN_API_TOKEN=x XRPL_PAY_TO=<r-address> npm run dev:gateway` then `npm run swell -- pay-for http://127.0.0.1:8787/api/x402/plan/starter --yes`
- MCP server smoke: `npm run dev:mcp` (stdio; registered in `.devin/mcp_config.json` as `swell-xrpl-agent-wallet`)
- Python: `.venv/bin/python -c "import xrpl, x402_xrpl, fastapi; print('OK')"` and `.venv/bin/python xrpl_x402/shadowlabz_payer_agent.py <url> --yes`
- Compile Compact contracts (optional): `npm run compile:skip-zk`
