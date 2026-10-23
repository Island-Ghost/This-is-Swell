---
name: mastercard-agent-pay
description: >-
  Mastercard Agent Pay & Agent Pay for Machines (AP4M) architecture and integration with @agility/sdk, XRPL X402 (x402-xrpl), RLUSD/XRP settlement, and Midnight Network Zero-Knowledge Permissioning (AgilityAgentPay.compact).
  Covers the 4 pillars of Mastercard AP4M: (1) Credentialing (Know Your Agent + Agentic Tokens), (2) Permissioning (On-chain spending limits & Verifiable Intent in Zero Knowledge on Midnight), (3) Transacting (HTTP 402 / x402 protocol), and (4) Multi-Rail Settlement (RLUSD, XRP, Midnight m402, and Mastercard network tokens).
  Use this skill whenever building or pitching Mastercard Agent Pay, Agent Pay for Machines (AP4M), Agentic Tokens, Verifiable Intent, or Know Your Agent (KYA) flows.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Mastercard Agent Pay & Agent Pay for Machines (AP4M) on Midnight + XRPL

## Overview

**Mastercard Agent Pay** and **Mastercard Agent Pay for Machines (AP4M)** (built on the open **x402** protocol) enable AI agents and machines to execute permissioned, programmatic payments — from microtransactions to enterprise B2B settlements — at machine speed.

In **`This-is-Swell` (`@agility/sdk`)**, we extend Mastercard Agent Pay for Machines with **Midnight Network Zero-Knowledge Privacy (`AgilityAgentPay.compact`)** and **XRP Ledger 3–5s Settlement (`x402-xrpl` in RLUSD & XRP)**:

## The 4 Foundational Pillars of Mastercard AP4M in `@agility/sdk`

| AP4M Pillar | Mastercard AP4M Requirement | How `@agility/sdk` + Midnight + XRPL Implements It |
| :--- | :--- | :--- |
| **1. Credentialing ("Know Your Agent")** | Every AI agent must be uniquely registered, verified, and issued a cryptographic **Agentic Token** tied to a KYC-verified human or enterprise. | `AgilityAgentPay.compact` (`registerAgentCredential`) binds a Mastercard **Agentic Token** commitment to the owner's Midnight ZK KYC credential (`ShadowLabzKyc.compact`) and XRPL settlement account. |
| **2. Permissioning ("Verifiable Intent")** | Humans/enterprises grant AI agents on-chain spending limits, per-call caps, and merchant category rules. *(On transparent chains like Base/Polygon/Solana, this leaks corporate budgets to competitors!)* | `AgilityAgentPay.compact` (`verifyAgentIntent`) stores the agent's budget & policy as a blinded `persistentCommit` on Midnight. The agent proves in zero knowledge that `amount <= maxSpendPerCall` and `category == allowedCategory`, emitting only a `true` verdict and an `X-Mastercard-Agent-Intent` nullifier. |
| **3. Transacting (`x402` Protocol)** | Services request payment online via `HTTP 402 Payment Required`; credentialed agents fulfill them at machine speed. | `agility.agentPay` + `agility.x402` verify **three** cryptographic headers on every 402 call: `X-Midnight-Kyc` (KYA/KYC), `X-Mastercard-Agent-Intent` (AP4M Verifiable Intent), and `X-Payment` (on-chain settlement receipt). |
| **4. Settling (Multi-Rail: Cards, RLUSD, XRP, m402)** | Guaranteed settlement across cards, accounts, and programmable stablecoins. | Settles in 3–5 seconds on the **XRP Ledger** in **RLUSD** (`524C555344...`) or **XRP** with automatic 3-way network/acquirer/merchant fee splits, or privately via Midnight `m402` shielded credits. |
