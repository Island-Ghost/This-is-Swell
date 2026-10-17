# Payments, Escrow & Agentic Patterns

> **Architecture note — who submits.** In the two-skill setup, this Payments skill *constructs* the transaction object; the **XRPL Agent Wallet skill** (`xrpl-agent-wallet`) owns the final steps — autofill, human preview, local signing, and `submitAndWait`.

## The build -> hand-off flow

```python
from xrpl.models.transactions import Payment
from xrpl.utils import xrp_to_drops

payment = Payment(
    account=wallet.address,
    destination="rDestinationAddress",
    amount=xrp_to_drops(25),
)
# Hand `payment` to XRPL Agent Wallet skill (autofill -> preview -> confirm -> sign -> submitAndWait)
```

```typescript
import { Payment, xrpToDrops } from "xrpl";

const payment: Payment = {
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: "rDestinationAddress",
  Amount: xrpToDrops("25"),
};
// Hand `payment` to XRPL Agent Wallet skill
```

## Destination Tag Check

Sending to an account with `lsfRequireDestTag` (`0x00020000`) set without a `DestinationTag` fails with `tecDST_TAG_NEEDED`:

```typescript
import { AccountRootFlags } from "xrpl";

async function requiresDestTag(client: any, address: string): Promise<boolean> {
  const info = await client.request({
    command: "account_info",
    account: address,
    ledger_index: "validated",
  });
  const flags = info.result.account_data.Flags ?? 0;
  return (flags & AccountRootFlags.lsfRequireDestTag) !== 0;
}
```

## RLUSD Payments

```typescript
// Hex-encoded currency code — "RLUSD" in ASCII padded to 40 hex chars
export const RLUSD_CURRENCY = "524C555344000000000000000000000000000000";
export const RLUSD_ISSUER_TESTNET = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
export const RLUSD_ISSUER_MAINNET = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De"; // Confirm at docs.ripple.com before production
```

### Step 1: TrustSet (one-time per wallet)

```typescript
import { TrustSet } from "xrpl";

const trustSet: TrustSet = {
  TransactionType: "TrustSet",
  Account: wallet.address,
  LimitAmount: {
    currency: RLUSD_CURRENCY,
    issuer: RLUSD_ISSUER_TESTNET,
    value: "10000",
  },
};
```

### Step 2: Send RLUSD

```typescript
import { Payment } from "xrpl";

const payment: Payment = {
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: "rDestinationAddress",
  Amount: {
    currency: RLUSD_CURRENCY,
    issuer: RLUSD_ISSUER_TESTNET,
    value: "250",
  },
};
```

## Cross-Currency Payments

```typescript
const payment: Payment = {
  TransactionType: "Payment",
  Account: wallet.address,
  Destination: "rDestinationAddress",
  Amount: { currency: RLUSD_CURRENCY, issuer: RLUSD_ISSUER_TESTNET, value: "10" },
  SendMax: xrpToDrops("15"),
};
```

## Escrow (Time-Based & Conditional)

```python
import time
from xrpl.models.transactions import EscrowCreate, EscrowFinish, EscrowCancel
from xrpl.utils import xrp_to_drops

RIPPLE_EPOCH_OFFSET = 946684800

def unix_to_ripple_time(unix_ts: float) -> int:
    return int(unix_ts) - RIPPLE_EPOCH_OFFSET

escrow_create = EscrowCreate(
    account=wallet.address,
    destination="rRecipientAddress",
    amount=xrp_to_drops(50),
    finish_after=unix_to_ripple_time(time.time() + 86400),
    cancel_after=unix_to_ripple_time(time.time() + 604800),
)
```

## Memos & Telemetry

```typescript
export function buildMemo(agentId: string, sessionId: string, action: string, taskId: string) {
  const payload = JSON.stringify({ agent_id: agentId, session_id: sessionId, action, task_id: taskId });
  return { Memo: { MemoData: Buffer.from(payload).toString("hex").toUpperCase() } };
}
```

## Reserve Requirements & Network Endpoints

- Base reserve: **1 XRP** (`1,000,000` drops)
- Owner reserve: **0.2 XRP** (`200,000` drops) per trust line, escrow, open DEX offer, or payment channel
- Testnet RPC: `https://s.altnet.rippletest.net:51234` | WS: `wss://s.altnet.rippletest.net:51233`
- Mainnet RPC: `https://xrplcluster.com` | WS: `wss://xrplcluster.com`
- Devnet RPC: `https://s.devnet.rippletest.net:51234` | WS: `wss://s.devnet.rippletest.net:51233`
