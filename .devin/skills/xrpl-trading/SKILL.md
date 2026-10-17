---
name: xrpl-trading
description: >
  XRPL DEX trading playbook for AI agent developers. Covers permissionless limit-order placement and cancellation on the XRPL decentralised exchange, order book reads, cross-currency offer construction, fill-outcome parsing, AMM liquidity interaction, and agentic best practices (SourceTag, pre-trade summary, spending controls).
  Use this skill whenever a user asks about placing or cancelling offers on the XRPL DEX, OfferCreate, OfferCancel, TakerPays, TakerGets, XRPL order book, AMM swaps, DEX trading, or cross-currency exchange via the built-in DEX.
  This skill constructs transactions. The XRPL Agent Wallet skill signs and submits them.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# XRPL Trading

The XRPL DEX is a fully on-ledger, permissionless exchange — no intermediary, no off-chain matching engine, no custody transfer. Every offer is a ledger object. Crossing happens atomically during transaction processing in the order determined by ledger consensus.

This skill constructs the right transaction object for any trading task (`OfferCreate`, `OfferCancel`, `book_offers`) and hands that object to the **XRPL Agent Wallet skill** (`xrpl-agent-wallet`) for signing and submission.

## Operating procedure

1. **Identify the operation** — `create_offer`, `cancel_offer`, or `get_order_book`. Check [`references/trading.md`](references/trading.md).
2. **Check prerequisites** — Funded trust line exists for IOU in `TakerGets` (sell side)? If `TakerPays` (buy side) is an IOU, check if issuer has `lsfRequireAuth` (`0x00040000`) — ordinary issuers auto-create a trust line on fill (budget +1 owner reserve). Account has sufficient XRP balance for reserves + fees? `Expiration` (in XRPL epoch `Unix_s - 946_684_800`) is in the future?
3. **Fetch order book & filter unfunded offers** — Use `taker_gets_funded ?? TakerGets` and drop offers with funded size `0`. Compute prices from human units (never use raw `quality` directly).
4. **Run built-in guardrails & `simulate`** — Never ask a user to approve a trade that is already known to fail (`tec*` charges a fee).
5. **Show mandatory pre-trade summary** — Present network, offering (`TakerGets` with full issuer), receiving (`TakerPays` with full issuer), limit price, mid price, est. fill, slippage, expiry, network fee, and pre-flight verdict. Collect user acknowledgement.
6. **Re-assert guardrails & hand off to Wallet skill** — Pass the transaction object (without `Fee`, `Sequence`, `LastLedgerSequence`) to `xrpl-agent-wallet`.
7. **Parse fill outcome from balance deltas** — Compute balance changes from `meta.AffectedNodes` (`getBalanceChanges(meta)`), never from the absence of `CreatedNode` alone.

## Reference files

- [`references/trading.md`](references/trading.md) — OfferCreate, OfferCancel, order book funded-depth math, AMM interaction, error codes, reserves
