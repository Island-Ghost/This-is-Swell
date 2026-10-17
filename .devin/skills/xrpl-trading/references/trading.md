# XRPL Trading — Reference

## 1. OfferCreate & OfferCancel

```typescript
import { OfferCreate, OfferCancel, OfferCreateFlags, xrpToDrops, dropsToXrp } from "xrpl";

const XRPL_EPOCH_OFFSET = 946_684_800; // Unix_s - 946_684_800

// Limit order: sell 100 XRP, receive 50 USD
const offer: Omit<OfferCreate, "Fee" | "Sequence" | "LastLedgerSequence" | "SourceTag"> = {
  TransactionType: "OfferCreate",
  Account: "rYourAddress",
  TakerPays: {
    currency: "USD",
    issuer: "rvYAfWj5gh67oV6fW32ZzP3Aw4Eubs59B",
    value: "50",
  },
  TakerGets: xrpToDrops(100),
};
```

- **Flags:** `tfPassive` (`0x00010000`), `tfImmediateOrCancel` (`0x00020000`), `tfFillOrKill` (`0x00040000`), `tfSell` (`0x00080000`). Reject `tfImmediateOrCancel + tfFillOrKill` at construction (`temINVALID_FLAG`).
- **OfferCancel:** Always verify offer ownership and existence via `account_offers` before submitting `OfferCancel`, because cancelling a non-existent offer still returns `tesSUCCESS` and burns a transaction fee.

## 2. Order Book Funded Depth & Slippage

`book_offers` returns unfunded phantom offers. Always filter by funded amount (`taker_gets_funded ?? TakerGets > 0`) and compute price from original amounts in human units:

```typescript
const isXRP = (a: unknown): a is string => typeof a === "string";
const amt = (a: any) => (isXRP(a) ? Number(dropsToXrp(a)) : Number(a.value));
const fundedGets = (o: any) => o.taker_gets_funded ?? o.TakerGets;
const fundedPays = (o: any) => o.taker_pays_funded ?? o.TakerPays;
const liveOffers = (offers: any[]) => offers.filter((o) => amt(fundedGets(o)) > 0);

// Price of BASE in QUOTE; bookGetsBase = true when queried with taker_gets = base
const offerPrice = (o: any, bookGetsBase: boolean) =>
  bookGetsBase ? amt(o.TakerPays) / amt(o.TakerGets) : amt(o.TakerGets) / amt(o.TakerPays);
```

## 3. Fill Status Classification

Compute balance deltas from `meta.AffectedNodes`:
- `CreatedNode` (Offer, our account) exists AND `TakerGets` spent > 0 -> `partial (remainder resting)`
- `CreatedNode` exists AND nothing spent -> `resting (no immediate fill)`
- No `CreatedNode` AND nothing spent -> `unfilled (nothing exchanged)`
- No `CreatedNode` AND spent >= original `TakerGets` -> `filled`
- No `CreatedNode` AND 0 < spent < original `TakerGets` -> `partial (remainder cancelled)`
