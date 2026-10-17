---
name: xrpl-payments
description: >
  XRPL payments playbook for AI agent developers. Covers the full developer journey:
  wallet setup, XRP payments, RLUSD and IOU token payments, cross-currency payments, escrow, agentic best practices (SourceTag, Memos, audit trail), and testnet-to-mainnet migration.
  Use this skill whenever a user asks about sending XRP or RLUSD, trust lines, xrpl-py,
  xrpl.js, agentic transactions, SourceTag, the XRPL AI Starter Kit,
  X402 payments on XRPL, or building any payment workflow on the XRP Ledger.
  This skill constructs transactions. The XRPL Agent Wallet skill signs and submits them.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# XRPL Payments

The XRP Ledger is purpose-built for fast, reliable value transfer. The same properties that make it reliable for institutional payments make it well-suited for AI agents: **3–5 second deterministic finality**, predictable fees, and no ambiguous pending state — a transaction either confirms (`tesSUCCESS`) or expires. No retry loops required.

This skill constructs the right transaction object for any payment task — XRP transfers, RLUSD, cross-currency, escrow, and more — and hands that object to the **XRPL Agent Wallet skill** (`xrpl-agent-wallet`) for signing and submission. Both skills are required for a complete agentic payment workflow.

## What this Skill covers

| Area | What it knows |
| :---- | :---- |
| **Account funding** | Faucet funding, balance checks, reserve requirements |
| **XRP payments** | Direct payments, destination tags, partial payments |
| **RLUSD payments** | Trust line setup, RLUSD sends, issuer addresses for Testnet and Mainnet |
| **IOU token payments** | Generic trust-line token transfers |
| **Cross-currency payments** | Single-transaction currency conversion via the built-in DEX |
| **Escrow** | Time-based and conditional escrow create, finish, and cancel |
| **Agentic best practices** | `SourceTag` for agent attribution, `Memos` for on-chain audit trails, WebSocket monitoring |
| **Error handling** | Transaction result codes (`tec*`, `tef*`, `tem*`, `ter*`), reserve requirements, simulation before submit |
| **Security** | Key management patterns, spending controls, reserve awareness |

## Default behavior and stack decisions

- **Languages:** Python (`xrpl-py`) and TypeScript/JavaScript (`xrpl.js`) are both first-class. Use whichever the developer's project already uses; if there is no existing codebase, ask.
- **Transaction submission:** Handled entirely by the XRPL Agent Wallet skill. This skill builds transaction objects; it does not call `submit_and_wait` or `submitAndWait` directly.
- **Amount handling:** Always `xrp_to_drops()` / `drops_to_xrp()` from `xrpl.utils` or `xrpToDrops()` / `dropsToXrp()` from `xrpl`. Never pass raw XRP floats to the ledger.
- **Network:** Testnet (`https://s.altnet.rippletest.net:51234` / `wss://s.altnet.rippletest.net:51233`) by default.
- **Agent tagging:** Do not set `SourceTag` in payment-construction code unless overriding with a custom tag or `0` to opt out. The XRPL Agent Wallet skill applies `SourceTag = 20260530` during the signing ceremony to any transaction that arrives without one. Note that x402 payments carry a merchant-declared tag (e.g. `20260601`).
- **Simulate before submit:** For new payment flows, call `simulate` on the raw transaction object before handing it to the Wallet skill.

## Operating procedure

1. **Identify the payment type** — XRP, RLUSD, IOU, cross-currency, or escrow. Check [`references/payments.md`](references/payments.md).
2. **Check prerequisites** — Trust line set up? Destination requires `DestinationTag` (`lsfRequireDestTag`)? Destination has base reserve (1 XRP)? Sufficient spendable balance (`Balance - 1_000_000 - OwnerCount * 200_000`) including fees?
3. **Build** — Construct the transaction object. Set `Memos` on every agent-initiated transaction. Do not set `Fee`, `Sequence`, or `LastLedgerSequence` — the Wallet skill's autofill step populates these from the live node.
4. **Simulate** — Call `simulate` on the transaction before handing off.
5. **Hand off to the Wallet skill** — Pass the transaction object to the XRPL Agent Wallet skill (`xrpl-agent-wallet`).
6. **Handle errors explicitly** — `tec*` codes indicate a fee was charged. `tef*`/`tem*` indicate no fee was charged. Always check `meta.delivered_amount` (never `Amount`) when verifying received payments.

## Reference files

- [`references/payments.md`](references/payments.md) — XRP, RLUSD, IOU, cross-currency, escrow, agentic patterns, error codes, reserves
