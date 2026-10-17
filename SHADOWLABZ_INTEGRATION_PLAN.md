# Agility Integration Plan for ShadowLabz (`shadowlabz.io`)
*(Replaces `KEDAS_BREW_INTEGRATION_PLAN.md` from `Island-Ghost/Agility-Summit`)*

## Overview
This document outlines how Agility's privacy-preserving payment and zero-knowledge KYC platform (**AgilityCore**) integrates into **ShadowLabz / Shadow DAOs** (<https://www.shadowlabz.io/dashboard>), replacing traditional PayPal billing with **XRPL X402 (`x402-xrpl`)**, **Midnight private payments (`m402`)**, and **Midnight Zero-Knowledge KYC (`ShadowLabzKyc.compact`)**.

---

## 1. Current ShadowLabz Architecture vs. AgilityCore Upgrade

| ShadowLabz Feature | Previous State (`shadowlabz.io`) | Upgraded with AgilityCore (`This-is-Swell`) |
| :--- | :--- | :--- |
| **Platform Plans** (`Starter` $10, `Community` $50, `Growth` $250, `Corporate`) | Billed in USD via PayPal | Billed in **XRP** or **RLUSD** via **HTTP 402 (`x402-xrpl`)** or privately via **Midnight `m402`**, gated by **Midnight ZK KYC** |
| **Paid DAO Memberships** (5% platform / 0–95% organizer / remainder to DAO treasury) | Billed in USD via PayPal with off-chain payout ledger | Settled directly on **XRP Ledger** via `buildDaoMembershipSplitPayments()` + tracked on Midnight via `ShadowLabzSubscription.compact` |
| **2-Week Treasury Crowdfunding Pools** | Planned / coming soon | Implemented via **`AgilityEscrow.compact`** (Midnight) + **`EscrowCreate`** (XRPL time-locked escrow) |
| **KYC & Compliance-Ready Audits** (Corporate plan & gated DAOs) | Manual / planned | Implemented via **`ShadowLabzKyc.compact`** (`persistentCommit` + selective disclosure + `HistoricMerkleTree` anonymous membership) |
| **Alias-Only XP Leaderboard** | Off-chain tracking | Implemented via **`ShadowLabzReputation.compact`** (`deriveAliasHash` + `deriveXpActionNullifier`) |
| **Dashboard `AgilityCore execution layer` Status** | Shows `"Checking…"` | Powered live by `GET /api/agility-core/status` |

---

## 2. End-to-End User Flows on ShadowLabz

### Flow A: KYC-Verified XRP Payment for a ShadowLabz Plan or DAO Launch
1. User connects **Xaman (XRPL)** and **Lace (Midnight)** on `shadowlabz.io/dashboard`.
2. User completes one-time KYC credential commitment on Midnight (`ShadowLabzKyc.compact`). Only the 32-byte commitment and Merkle leaf are stored on-chain — zero PII ever leaves the user's device.
3. User clicks **Subscribe with XRP (X402)** on `/pricing` (e.g., `Community` $50/mo).
4. Frontend sends `GET /api/x402/plan/community` with `X-Midnight-Kyc: <nullifier>`.
5. AgilityCore Gateway returns `402 Payment Required` with XRPL X402 payment headers, the unsigned XRPL `Payment` transaction (stamped with `SourceTag: 20260601` and KYC nullifier memo), and the `xrpl-agent-wallet` preview.
6. User approves in Xaman (or autonomous AI agent signs via `x402_requests` / `xrpl-agent-wallet`), transaction confirms on XRPL in 3–5 seconds, and retry with `X-Payment` activates the plan.

### Flow B: Paid DAO Membership with Automatic 3-Way XRP Revenue Split
1. DAO admin configures a monthly membership price (e.g., $25/mo) and organizer fee slider (e.g., 20%) via `ShadowLabzSubscription.compact` (`configureDaoSubscriptionSplit`).
2. New member proves KYC / gate eligibility via `ShadowLabzKyc.compact` and requests `/api/dao/:daoId/membership/checkout`.
3. AgilityCore computes the exact 3-way split in XRP drops (`computeShadowLabzSplit`):
   - **5%** -> ShadowLabz Platform Wallet
   - **20%** -> DAO Organizer Wallet
   - **75%** -> DAO Treasury Wallet
4. Member signs and submits the split payment on XRPL; membership activates immediately.
