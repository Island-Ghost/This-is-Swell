# This-is-Swell — AgilityCore for ShadowLabz

**A pioneering financial and privacy execution layer designed to revolutionize the security, compliance, and efficiency of digital transactions and confidential DAO governance using the Midnight Network and the XRP Ledger (XRPL).**

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
├── gateway/                            # TypeScript AgilityCore Execution Layer & Demo UI (Hono)
│   ├── src/app.ts                      # REST + HTTP 402 endpoints for shadowlabz.io
│   ├── src/demo-ui.ts                  # Interactive ShadowLabz Control Room UI (GET /)
│   ├── src/kyc-verifier.ts             # Midnight ZK KYC & nullifier verification service
│   ├── src/xrpl-service.ts             # XRPL Payment, 3-way split, and EscrowCreate builder
│   └── src/app.test.ts                 # End-to-end Vitest integration suite
├── xrpl_x402/                          # Python 3.12 x402-xrpl Merchant & Payer Agent
│   ├── shadowlabz_merchant.py          # FastAPI server with T54 require_payment + ZK KYC check
│   └── shadowlabz_payer_agent.py       # Autonomous x402_requests payer agent
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

# 4. Launch the interactive ShadowLabz + AgilityCore Live Demo UI
npm run dev:gateway
# Open http://127.0.0.1:8787 in your browser
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
