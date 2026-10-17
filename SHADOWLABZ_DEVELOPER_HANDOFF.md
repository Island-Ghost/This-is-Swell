# ShadowLabz Developer Handoff Guide
## Integrating AgilityCore (XRPL X402 + Midnight ZK KYC + m402) into `shadowlabz.io`

---

## 1. Executive Summary for the ShadowLabz Developer

This repository (`This-is-Swell`) upgrades the original [`Island-Ghost/Agility-Summit`](https://github.com/Island-Ghost/Agility-Summit) codebase (replacing the Keda's Brew e-commerce demo with **ShadowLabz / Shadow DAOs**) and provides the complete **AgilityCore Execution Layer** referenced on `https://www.shadowlabz.io/dashboard`.

### What This Replaces & Upgrades on `shadowlabz.io`
1. **Replaces PayPal Billing on `/pricing` and DAO Paid Memberships (`/docs#paid-membership`) with KYC-Gated XRP (X402) & Midnight Shielded Credits (`m402`):**
   - Users verify KYC once in zero knowledge on Midnight (`ShadowLabzKyc.compact`) and bind their XRPL wallet (`r...` connected via Xaman or XRPL Agent Wallet / OWS).
   - Platform Plans (`Starter` $10/mo, `Community` $50/mo, `Growth` $250/mo, `Corporate`) and DAO Launch Fees are gated by HTTP `402 Payment Required` (`x402-xrpl` + `m402`) and settled in **XRP** (or **RLUSD**) in 3–5 seconds.
   - Paid DAO Membership Subscriptions enforce the exact **ShadowLabz 3-way revenue split** on-chain:
     - **5% Platform Fee** (`500 bps`, fixed) -> ShadowLabz Platform Wallet
     - **0%–95% Organizer Fee** (`0..9500 bps`, slider) -> DAO Organizer Wallet
     - **Remainder (`100% - 5% - organizer%`)** -> DAO Treasury Wallet (derived by subtraction so not a single drop is lost to rounding).
2. **Powers the `/dashboard` "AgilityCore execution layer" & "Connected networks" Widget:**
   - `GET /api/agility-core/status` returns real-time status for Midnight (`preview`), XRP Ledger (`xrpl:1`), Cardano, Xahau, and all 6 compiled Compact `0.31.1` smart contracts.
3. **Powers 2-Week DAO Crowdfunding Escrow Pools (`AgilityEscrow.compact` + XRPL `EscrowCreate`):**
   - Matches the Community plan's 2-week treasury crowdfunding pools (`POST /api/dao/:daoId/crowdfund/escrow`), supporting time-locked `FinishAfter`/`CancelAfter` on XRPL and private receipt commitments on Midnight.
4. **Powers Proof-Gated DAO Membership & Alias-Only XP Leaderboards (`ShadowLabzKyc.compact` + `ShadowLabzReputation.compact`):**
   - Uses `HistoricMerkleTree<16, Bytes<32>>` + domain-separated nullifiers so members prove they belong (or earn XP under an alias) without exposing their wallet address.

---

## 2. Contract Mapping (From `Agility-Summit` to `ShadowLabz` on Compact `0.31.1`)

All 6 contracts in `contracts/src/` are upgraded to **Compact compiler `0.31.1`** and **`pragma language_version 0.23;`** (fixing the deprecated `kernel.sender()`, `kernel.blockTime()`, and `Bool` syntax from last year's repo):

| Legacy `Agility-Summit` Contract | New ShadowLabz Contract (`contracts/src/`) | Purpose in ShadowLabz (`shadowlabz.io`) |
| :--- | :--- | :--- |
| `AgilityPayment.compact` | `AgilityPayment.compact` | Verifies KYC-to-XRPL wallet binding commitments (`deriveKycPaymentBinding`) and records settled XRP X402 / NIGHT payments (`recordKycVerifiedPayment`). |
| `AgilityEscrow.compact` | `AgilityEscrow.compact` | Manages 2-week DAO crowdfunding pools (`createCrowdfundingPool`, `contributeToPool`, `releasePoolToTreasury`, `refundContribution`). |
| `KedasBrewCustomer.compact` | `ShadowLabzKyc.compact` | Zero-Knowledge KYC commitments (`persistentCommit`), selective disclosure (`verifySelectiveKycForXrpPayment`), and `HistoricMerkleTree` anonymous DAO membership (`authorizeAnonymousDaoAction`). |
| `KedasBrewSubscription.compact` | `ShadowLabzSubscription.compact` | Platform tier subscriptions (`Free`, `Starter`, `Community`, `Growth`, `Corporate`) & DAO organizer split config (`configureDaoSubscriptionSplit`). |
| `KedasBrewLoyalty.compact` | `ShadowLabzReputation.compact` | Privacy-preserving DAO XP & alias-only leaderboard (`registerDaoAlias`, `awardGovernanceXp`, `proveMinimumXp`). |
| *(New — from `julianariel/m402`)* | `m402Vault.compact` | Pooled NIGHT vault issuing 1:1 shielded credits (`registerService`, `deposit`, `pay`, `redeem`, `withdraw`) for unlinkable HTTP 402 payments. |

---

## 3. Running the Services Locally

### Prerequisites
- **Node.js 24** (`nvm use 24`)
- **Compact Compiler `0.31.1`** (`~/.local/bin/compact`)
- **Python 3.12 virtualenv** (`.venv`, managed by `uv`)

### Commands

```bash
# 1. Compile all 6 Midnight Compact contracts and build TypeScript bindings
npm run compile:skip-zk
npm run build
npm run typecheck

# 2. Run the integration test suite (verifies KYC, 402 flow, 3-way split, and escrow)
npm test

# 3. Start the TypeScript AgilityCore Gateway (Port 8787)
npm run dev:gateway

# 4. Start the Python FastAPI x402-xrpl Merchant Server (Port 8000)
.venv/bin/python xrpl_x402/shadowlabz_merchant.py
```

---

## 4. API Reference for the `shadowlabz.io` Frontend

### 4.1 `GET /api/agility-core/status` — Dashboard Network & AgilityCore Status
Wire this directly into the **"Network status / AgilityCore execution layer"** card on `https://www.shadowlabz.io/dashboard`:

```ts
// Example Next.js fetch in ShadowLabz Dashboard
const res = await fetch(`${ process.env.NEXT_PUBLIC_AGILITY_CORE_URL }/api/agility-core/status`);
const { agilityCoreExecutionLayer, connectedNetworks } = await res.json();
// agilityCoreExecutionLayer.status === "operational"
// connectedNetworks => [{ chain: "Midnight", status: "connected" }, { chain: "XRP Ledger", status: "connected" }, ...]
```

### 4.2 `POST /api/kyc/verify` — Midnight ZK KYC + XRPL Wallet Binding
Call this after a user connects their XRPL wallet (via Xaman) and Midnight wallet (via Lace `window.midnight`):

**Request:**
```json
{
  "userSecret": "<32-byte-hex-secret-or-signed-nonce>",
  "xrplAddress": "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
  "contextId": "shadowlabz:plan:community",
  "tier": 2,
  "jurisdictionCode": 840,
  "isSanctioned": false
}
```

**Response (`200 OK`):**
```json
{
  "verified": true,
  "kycHeaderName": "X-Midnight-Kyc",
  "kycToken": "64-char-hex-nullifier",
  "proof": {
    "userPkHashHex": "...",
    "xrplAddress": "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    "kycBindingHex": "...",
    "kycNullifierHex": "...",
    "tier": 2
  }
}
```

### 4.3 `GET /api/x402/plan/:tier` — HTTP 402 Plan Checkout (`starter` | `community` | `growth` | `corporate`)
1. **First request (with `X-Midnight-Kyc: <kycToken>`, no `X-Payment`):**
   Returns `HTTP 402 Payment Required` containing:
   - `paymentRequired.xrpl`: `{ network: "xrpl:1", asset: "XRP", priceDrops: "4000000", payToAddress, facilitatorUrl, sourceTag: 20260601 }`
   - `paymentRequired.midnight`: `{ network: "preview", vaultAddress, kycContractAddress, priceStar }`
   - `unsignedXrplTx`: Ready-to-sign XRPL `Payment` object (with `SourceTag: 20260601` and hex-encoded `Memos` carrying the `kyc_nullifier`) for Xaman or the `xrpl-agent-wallet` signing ceremony.
   - `walletCeremonyPreview`: Formatted human confirmation block.
2. **Retry request (with `X-Midnight-Kyc: <kycToken>` AND `X-Payment: <txHashOrReceiptSecret>`):**
   Returns `HTTP 200 OK` with `{ status: "settled", subscriptionId, receiptHash }`.

### 4.4 `POST /api/dao/:daoId/membership/checkout` — Paid DAO Membership 3-Way XRP Split
Replaces the PayPal subscription button on `/projects/[daoId]` with on-chain XRP payments split across Platform (5%), Organizer (0–95%), and DAO Treasury (remainder):

**Request:**
```json
{
  "monthlyPriceUsd": 50,
  "organizerFeePercent": 20,
  "organizerXrplAddress": "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
  "daoTreasuryXrplAddress": "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv"
}
```

**Response (`200 OK`):**
Returns `split` (`platformDrops`, `organizerDrops`, `treasuryDrops`), the array of unsigned XRPL `Payment` transactions (`transactions`), and human-readable `previews`.

### 4.5 `POST /api/dao/:daoId/crowdfund/escrow` — 2-Week DAO Crowdfunding Escrow
Returns both the deterministic Midnight `AgilityEscrow` pool ID (`midnightEscrowId`) and the unsigned XRPL `EscrowCreate` transaction (`xrplEscrowTx`) with `FinishAfter` (14 days in Ripple epoch time) and `CancelAfter`.

---

## 5. Drop-In Next.js / React Hook for `shadowlabz.io`

The ShadowLabz frontend (`app/dashboard` and `app/pricing`) can drop in this hook to connect to `AgilityCore`:

```tsx
"use client";
import { useState, useEffect, useCallback } from "react";

const AGILITY_CORE_URL =
  process.env.NEXT_PUBLIC_AGILITY_CORE_URL || "http://127.0.0.1:8787";

export function useAgilityCore() {
  const [status, setStatus] = useState<any>(null);
  const [kycToken, setKycToken] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${AGILITY_CORE_URL}/api/agility-core/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error);
  }, []);

  const verifyKyc = useCallback(async (xrplAddress: string, userSecret: string, tier = 2) => {
    const res = await fetch(`${AGILITY_CORE_URL}/api/kyc/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ xrplAddress, userSecret, tier }),
    });
    const data = await res.json();
    if (!res.ok || !data.verified) {
      throw new Error(data.error || "Midnight ZK KYC verification failed");
    }
    setKycToken(data.kycToken);
    return data;
  }, []);

  const initiatePlanX402Checkout = useCallback(
    async (tier: "starter" | "community" | "growth" | "corporate", token?: string) => {
      const activeToken = token || kycToken;
      if (!activeToken) throw new Error("Run verifyKyc() first");

      // Step 1: Request protected resource -> receives 402 Payment Required + unsignedXrplTx
      const challengeRes = await fetch(`${AGILITY_CORE_URL}/api/x402/plan/${tier}`, {
        headers: { "X-Midnight-Kyc": activeToken },
      });
      const challenge = await challengeRes.json();
      return { status: challengeRes.status, ...challenge };
    },
    [kycToken],
  );

  return { status, kycToken, verifyKyc, initiatePlanX402Checkout };
}
```

---

## 6. Production Checklist for the ShadowLabz Team

1. **XRPL Mainnet Cutover (`xrpl-x402` & `xrpl-agent-wallet`):**
   - Switch `XRPL_X402_NETWORK=xrpl:0`, `XRPL_FACILITATOR_URL=https://xrpl-facilitator-mainnet.t54.ai`, and `XRPL_WS_URL=wss://xrplcluster.com`.
   - Set `XRPL_PAY_TO` to the ShadowLabz production XRPL platform fee wallet.
   - For automated backend signing, use **Open Wallet Standard (OWS)** (`@open-wallet-standard/core`) with a scoped `ows_key_...` agent token (never a raw seed in source or a vault passphrase; see `.devin/skills/xrpl-agent-wallet/references/ows.md`).
2. **Midnight Proof Server & Preview Deployment:**
   - Start the local proof server via `npm run proof-server:up` (keep bound to `127.0.0.1:6300`).
   - Run `npm run compile` in `contracts/` to generate full ZK proving/verifying keys (`keys/` and `zkir/`) when deploying to Midnight `preview` or `preprod`.
3. **Updating `shadowlabz.io/docs` (`app/docs/content.tsx`):**
   - The "Paid membership subscriptions", "Plans & subscriptions", "Funding campaigns", and "Privacy on Midnight" sections in `app/docs/content.tsx` can now be updated from PayPal-only to document the **XRP X402 + Midnight ZK KYC** flow implemented in this repository.
