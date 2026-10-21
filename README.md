# This-is-Swell — AgilityCore for ShadowLabz

**A pioneering financial and privacy execution layer designed to revolutionize the security, compliance, and efficiency of digital transactions and confidential DAO governance using the Midnight Network and the XRP Ledger (XRPL).**

---

## For AI Agents: Autonomous, Policy-Guarded Money on XRPL

> *Track: build the tools that let AI agents make payments and manage money on the XRP Ledger — autonomously, safely, and at machine speed.*

Swell gives an agent a wallet it can actually be trusted with. Every transaction, from any entry point, goes through the same six-step ceremony — **receive → load key → autofill → preview → policy → sign → `submitAndWait`** — with a spending policy the operator controls and an audit trail that survives crashes.

| Entry point | For whom | What it does |
| :-- | :-- | :-- |
| **MCP server** `mcp-server/` | LLM agents (Devin, Claude, Cursor…) | 10 tools: `xrpl_get_account`, `xrpl_quote_payment`, `xrpl_send_payment`, `xrpl_pay_for_resource`, `xrpl_create_escrow`, `xrpl_finish_escrow`, `xrpl_split_payment`, `xrpl_policy_status`, `xrpl_audit_log`, `xrpl_reconcile`. Autonomous mode: only policy-allowed txs are signed; anything else returns `needs_approval` with the preview. |
| **CLI** `swell` | The human supervising the agent | `wallet status`, `quote`, `pay`, `pay-for <url>`, `escrow`, `policy show/set`, `audit`, `reconcile`. Interactive by default (previews and asks); `--yes` for policy-only autonomy. |
| **x402 payer** | Agents buying HTTP 402 resources | GET → 402 challenge → policy check (price, destination, network all treated as untrusted) → pay → retry with the validated tx hash as `X-Payment`. TypeScript and Python (`xrpl_x402/swell_agent/`), sharing one policy file and one audit DB. |
| **Verifying gateway** `gateway/` | Merchants / APIs selling to agents | Issues 402 challenges and accepts **only a validated XRPL tx hash** as proof: checks `validated`, `tesSUCCESS`, destination, `meta.delivered_amount`, optional `SourceTag`; SQLite replay guard; bearer-protected admin API. |

**Safety model (`agent-policy.json`)** — per-tx cap, 24h cap, tx/hour rate limit, allowed tx types and assets (XRP, RLUSD), optional destination allowlist, expiry. Hard violations (wrong network, expired policy, disallowed type/asset/destination) are *denied* even if a human says yes; soft caps *escalate* to a human. The seed never leaves the process and never enters chat or logs (`EnvSeedSigner` for dev; `ExternalSigner` interface for HSM/KMS/OWS in production). The tx hash is persisted **before** submission so a crash is reconciled from the ledger, never blindly resubmitted.

```bash
npm install && nvm use 24
npm run wallet:create                    # testnet wallet → seed written to .env, only the address is printed, faucet-funded
npm run swell -- wallet status           # balance, reserve, spendable, policy headroom
npm run swell -- quote rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe 1     # dry run: autofill + simulate + policy verdict
npm run swell -- pay   rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe 1 --memo "hello"   # previews, asks, signs, submitAndWait

# Sell to agents: start the verifying 402 gateway, then let the agent buy a plan autonomously
XRPL_PAY_TO=<your r-address> ADMIN_API_TOKEN=secret npm run dev:gateway
npm run swell -- pay-for http://127.0.0.1:8787/api/x402/plan/starter --yes
.venv/bin/python xrpl_x402/shadowlabz_payer_agent.py http://127.0.0.1:8787/api/x402/plan/starter --yes   # same thing from Python

npm run dev:mcp                          # stdio MCP server (also registered in .devin/mcp_config.json)
npm test                                 # 35 unit tests (mocked ledger)
npm run test:testnet                     # live testnet: real payment, delivered_amount check, crash → reconcile
```

Policy and audit state live in `agent-policy.json` and `.state/agent-wallet.sqlite` (gitignored); Midnight ZK-KYC is an optional gate on the gateway (`REQUIRE_MIDNIGHT_KYC=true`).

---

## Introduction & How This All Came Into Place

Conceived in **2022** during **Ripple's inaugural "Real-Life Use Cases" Hackathon**, **Agility** initially focused on enabling businesses and communities to accept **XRP Ledger (XRPL)** tokens as seamless payments — similar to PayPal for business and e-commerce stores, but settling on-chain in seconds. The team built a working prototype application, and with the help of the **XRdoge** decentralized community (founders' bags burned), even created a companion hardware device for point-of-sale and physical payment interactions.

However, as the project evolved, a critical gap in Web3 became clear: **transparent blockchains expose every customer's identity, balance, and spending history**, while **businesses and DAOs still require verifiable KYC compliance, escrow, and auditability**. Funding hurdles and evolving regulatory clarity meant the underlying privacy and agentic payment standards needed time to mature. Rather than compromise on the vision, the Agility team dedicated themselves to mastering each pillar of the stack while the technology caught up.

**Today, all of those pieces have come into place:**
1. **Midnight Network & Compact (`0.31.1` / `language_version 0.23`)** — Zero-Knowledge Proof smart contracts (`ShadowLabzKyc.compact`, `AgilityPayment.compact`, `AgilityEscrow.compact`, `ShadowLabzSubscription.compact`, `ShadowLabzReputation.compact`) allow users to prove **KYC compliance, accreditation, and DAO membership** without ever exposing personal information (PII) or wallet links on-chain.
2. **XRPL Agentic Payments & X402 (`x402-xrpl`)** — HTTP-native machine-to-machine and portal payments (`HTTP 402 Payment Required`) settling in **3–5 seconds** on the XRP Ledger in **XRP** or **RLUSD**, paired with the **XRPL Agent Wallet, Payments, and Trading Skills** (supporting Xaman and Open Wallet Standard policy-gated signing).
3. **Midnight Private 402 Payments (`m402`)** — A pooled NIGHT vault (`m402Vault.compact`) issuing 1:1 shielded credits where `pay()` carries **no payer address on-chain**, enabling completely unlinkable API and portal payments.
4. **ShadowLabz / Shadow DAOs (`shadowlabz.io`)** — The **AgilityCore Execution Layer** now powers confidential governance, KYC-verified XRP plan subscriptions, automatic 3-way DAO membership revenue splits (**5% Platform / 0–95% Organizer / Remainder to DAO Treasury**), and 2-week DAO crowdfunding escrow pools on [shadowlabz.io/dashboard](https://www.shadowlabz.io/dashboard).

---

## Core Technologies

- **Midnight Network** — Zero-knowledge proofs (PLONK / Zswap), `HistoricMerkleTree` anonymous credentials, and `persistentCommit` selective disclosure written in **Compact `0.31.1`**.
- **XRP Ledger (XRPL)** — 3–5 second deterministic finality, native `EscrowCreate`/`EscrowFinish`, built-in DEX/AMM, **RLUSD** stablecoin support, and on-chain telemetry via `SourceTag` and `Memos`.
- **X402 & m402 Protocols** — Dual-rail HTTP `402 Payment Required` settlement supporting both transparent, auditable **XRP / RLUSD (`x402-xrpl`)** and shielded **Midnight credits (`m402`)**.
- **Interledger Protocol (ILP) & Cross-Chain Routing** — Connecting Midnight, XRPL, Cardano, and Xahau under one unified identity and execution layer.
- **AI/ML with MCP & Agent Skills** — Built-in `.devin/skills/` for autonomous XRPL wallet ceremonies (`xrpl-agent-wallet`), payments (`xrpl-payments`), DEX trading (`xrpl-trading`), X402 paywalls (`xrpl-x402`), and Midnight Compact/SDK engineering (`midnight-compact`, `midnight-sdk-wallet`, `midnight-tooling`, `m402-private-payments`).

---

## Key Features Built for ShadowLabz (`shadowlabz.io`)

### 1. Privacy-Preserving Zero-Knowledge KYC (`ShadowLabzKyc.compact`)
- **Selective Disclosure for XRP Payments & Corporate Audits:** Commits user KYC credentials (`KycCredential`) on Midnight using `persistentCommit` with a 32-byte CSPRNG blinding factor. Proves non-sanctioned status, allowed jurisdiction, minimum KYC tier, and XRPL wallet binding while disclosing **only a single boolean (`true`/`false`)**.
- **Anonymous DAO Membership (`HistoricMerkleTree` + Nullifiers):** Proves a user belongs to a gated DAO or is eligible to cast a secret ballot without revealing *which* member they are.

### 2. XRPL X402 + Midnight m402 Payment Portal (`gateway/` & `xrpl_x402/`)
- **Replaces PayPal on `/pricing`:** Powers ShadowLabz Platform Plans (**Free** $0, **Starter** $10/mo, **Community** $50/mo, **Growth** $250/mo, **Corporate** $1,000/mo) with instant XRP / RLUSD X402 checkout or private Midnight `m402` credits.
- **3-Way Paid DAO Membership Split (`ShadowLabzSubscription.compact`):** Automatically splits membership payments on XRPL:
  - **5% Platform Fee** (`500 bps`, fixed) -> ShadowLabz Platform Wallet
  - **0%–95% Organizer Fee** (`0..9500 bps`, configurable slider) -> DAO Organizer Wallet
  - **Remainder (`100% - 5% - organizer%`)** -> DAO Treasury Wallet (with zero drop rounding loss).

### 3. 2-Week DAO Treasury Crowdfunding Escrow (`AgilityEscrow.compact` + XRPL `EscrowCreate`)
- Locks contributor funds into an on-chain escrow with a target goal and 14-day deadline.
- Releases funds directly to the DAO Treasury when the goal is hit, or enables contributor refunds if the deadline passes without reaching the goal.

### 4. Alias-Only Reputation & XP Leaderboard (`ShadowLabzReputation.compact`)
- Awards governance XP for proposals and secret ballots under a deterministic, unlinkable alias hash (`deriveAliasHash`), never exposing the member's wallet address on the public leaderboard.

---

## Project Structure

```text
This-is-Swell/
├── .devin/skills/                      # 8 AI Agent Skills for XRPL, X402, Midnight, and m402
│   ├── xrpl-agent-wallet/              # XRPL wallet lifecycle, 6-step ceremony, OWS signing
│   ├── xrpl-payments/                  # XRP, RLUSD, IOU, cross-currency, and Escrow builder
│   ├── xrpl-trading/                   # XRPL DEX OfferCreate, OfferCancel, funded order books
│   ├── xrpl-x402/                      # FastAPI & client patterns for x402-xrpl
│   ├── midnight-compact/               # Compact 0.31.1 language, stdlib, and ZK KYC patterns
│   ├── midnight-sdk-wallet/            # Midnight.js v4.1.1, WalletFacade, Lace DApp Connector
│   ├── midnight-tooling/               # Compact CLI & Docker Proof Server management
│   └── m402-private-payments/          # Private 402 vault & gateway architecture
├── contracts/                          # Midnight Compact 0.31.1 Smart Contracts (language 0.23)
│   ├── src/AgilityPayment.compact      # KYC-bound XRP/Midnight payment receipts
│   ├── src/AgilityEscrow.compact       # 2-week DAO crowdfunding pools & conditional escrow
│   ├── src/ShadowLabzKyc.compact       # ZK KYC commitments, selective disclosure, Merkle auth
│   ├── src/ShadowLabzSubscription.compact # Platform plans & DAO 3-way split configuration
│   ├── src/ShadowLabzReputation.compact   # Alias-only DAO XP & reputation levels
│   ├── src/m402Vault.compact           # Pooled NIGHT -> 1:1 shielded credit 402 vault
│   ├── src/pure.ts                     # Fast off-chain pureCircuits & ledger exports
│   └── src/managed/                    # Compiled JS/TS contract bindings
├── agent-wallet/                       # @swell/agent-wallet — the policy-guarded XRPL wallet runtime for agents
│   ├── src/policy.ts                   # SpendingPolicy: per-tx / 24h caps, rate limit, allowlists, expiry; hard vs soft
│   ├── src/ceremony.ts                 # 6-step signing ceremony; hash persisted before submitAndWait; reconcile
│   ├── src/signer.ts                   # EnvSeedSigner (dev) / ExternalSigner (HSM, KMS, OWS); secret redaction
│   ├── src/store.ts                    # node:sqlite audit trail of tx intents + spend windows
│   ├── src/x402-payer.ts               # Autonomous 402 loop: challenge → policy → pay → retry with tx hash
│   ├── src/builders.ts, preview.ts     # Unsigned XRP/RLUSD/TrustSet/Escrow/split builders; human preview
│   └── src/*.test.ts                   # 23 unit tests (mocked ledger) + gated live testnet suite
├── mcp-server/                         # MCP (stdio) server exposing the wallet as 10 tools for LLM agents
├── cli/                                # `swell` CLI for the supervising human (pay, pay-for, escrow, policy, audit)
├── scripts/create-agent-wallet.ts      # Wallet bootstrap per xrpl-agent-wallet skill (seed → .env, faucet funding)
├── agent-policy.json                   # The agent's spending policy (shared by TS and Python)
├── gateway/                            # Verifying HTTP 402 gateway + ShadowLabz Admin / Portal UI (Hono)
│   ├── src/app.ts                      # createApp(): 402 challenges, ledger-verified settlement, admin API
│   ├── src/payment-verifier.ts         # X-Payment tx hash → validated / tesSUCCESS / destination / delivered_amount
│   ├── src/store.ts                    # SQLite persistence (KYC, DAOs, escrows, settlements, replay guard)
│   ├── src/kyc-verifier.ts             # Midnight ZK KYC nullifier derivation (optional gate)
│   ├── src/xrpl-service.ts             # ShadowLabz wrappers over @swell/agent-wallet builders
│   └── src/app.test.ts                 # 12 gateway tests
├── xrpl_x402/                          # Python 3.12 counterpart
│   ├── swell_agent/                    # policy.py / store.py / wallet.py / payer.py — same policy file & audit DB as TS
│   ├── shadowlabz_payer_agent.py       # Autonomous Python 402 payer against the Swell gateway
│   └── shadowlabz_merchant.py          # FastAPI server with T54 x402-xrpl require_payment + ZK KYC check
├── shared/                             # Shared TypeScript types, plans, & 3-way split math
├── docs/                               # Deep-dive references for Midnight, XRPL X402, & m402
├── ABOUT.md                            # Complete project history, vision, and roadmap
├── SETUP.md                            # Full environment setup & installation guide
├── SHADOWLABZ_DEVELOPER_HANDOFF.md     # API reference & React hooks for the ShadowLabz team
├── SHADOWLABZ_INTEGRATION_PLAN.md      # Business & technical integration plan for ShadowLabz
├── SHADOWLABZ_PRIVACY_ARCHITECTURE.md  # Zero-Knowledge KYC & privacy architecture guide
├── docker-compose.yml                  # Local Midnight Proof Server on 127.0.0.1:6300
└── package.json                        # Node 24 npm workspaces root
```

---

## Quick Start

For complete step-by-step installation instructions from scratch, see **[SETUP.md](./SETUP.md)**.

```bash
# 1. Clone the repository
git clone https://github.com/Island-Ghost/This-is-Swell.git
cd This-is-Swell

# 2. Activate Node 24 and install workspace dependencies
nvm use 24
npm install

# 3. Compile all 6 Midnight Compact contracts, build, and run tests
npm run compile:skip-zk
npm run build
npm run typecheck
npm test

# 4. Create the agent's testnet wallet (seed → .env, never printed) and launch the verifying 402 gateway
npm run wallet:create
ADMIN_API_TOKEN=secret npm run dev:gateway
# Open http://127.0.0.1:8787/admin?token=secret (Admin Control Room) or /portal (member payer demo)

# 5. Let an agent buy a plan: 402 → policy → XRPL payment → ledger-verified → settled
npm run swell -- pay-for http://127.0.0.1:8787/api/x402/plan/starter --yes
```

---

## Documentation Index

- **[ABOUT.md](./ABOUT.md)** — Full story, history (from the 2022 Ripple Hackathon & XRdoge hardware to Midnight ZKPs), vision, and roadmap.
- **[SETUP.md](./SETUP.md)** — Step-by-step toolchain installation (Node 24, Compact `0.31.1`, Python 3.12 + `uv`, Docker Proof Server) and verification guide.
- **[SHADOWLABZ_DEVELOPER_HANDOFF.md](./SHADOWLABZ_DEVELOPER_HANDOFF.md)** — Turnkey integration guide, REST/402 API specs, and drop-in React/Next.js hooks for `shadowlabz.io`.
- **[SHADOWLABZ_INTEGRATION_PLAN.md](./SHADOWLABZ_INTEGRATION_PLAN.md)** — How AgilityCore replaces PayPal with XRP X402, Midnight `m402`, and ZK KYC across ShadowLabz.
- **[SHADOWLABZ_PRIVACY_ARCHITECTURE.md](./SHADOWLABZ_PRIVACY_ARCHITECTURE.md)** — Deep dive into `ShadowLabzKyc.compact` selective disclosure and `HistoricMerkleTree` anonymous membership.
- **[AGENTS.md](./AGENTS.md)** — Agent instructions, active `.devin/skills/` overview, and verification commands.

---

## License

Apache-2.0 / MIT — see [LICENSE](./LICENSE) for details.
