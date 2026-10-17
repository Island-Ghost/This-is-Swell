---
name: xrpl-x402
description: >
  Agentic payments with X402 on the XRP Ledger using x402-xrpl, FastAPI merchant middleware (require_payment), payer agent sessions (x402_requests), T54 facilitators, XRP/RLUSD settlement, and on-chain telemetry (SourceTag, Memos, WebSocket monitoring).
  Use this skill whenever building HTTP 402 paywalls, machine-to-machine payment portals, X402 merchants, X402 payer agents, or integrating XRPL x402 with Midnight KYC / m402 gateways.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Agentic Payments with X402 on the XRP Ledger

X402 is an open protocol for HTTP-native machine-to-machine payments extending `HTTP 402 Payment Required`. On the XRP Ledger, `x402-xrpl` (maintained by T54) provides 3–5 second deterministic settlement in **XRP** (priced in drops; `1 XRP = 1,000,000 drops`) or **RLUSD**.

## How X402 Works on XRPL

1. **Agent requests resource** -> calls protected HTTP endpoint.
2. **Merchant returns 402** -> includes price, payment address (`XRPL_PAY_TO`), network (`xrpl:1` for Testnet, `xrpl:0` for Mainnet), asset (`XRP` or `RLUSD`), and facilitator URL in headers.
3. **Agent submits presigned XRPL Payment** -> signs and submits on-chain `Payment` to merchant address.
4. **Facilitator verifies & issues receipt** -> verifies confirmed on-chain payment and returns signed receipt.
5. **Agent retries with `X-PAYMENT` header** -> merchant verifies receipt and returns resource + `PAYMENT-RESPONSE` settlement header.

## Environments & Facilitators

| Environment | CAIP-2 Network | Facilitator URL | XRPL RPC URL |
| :--- | :--- | :--- | :--- |
| **Testnet** | `xrpl:1` | `https://xrpl-facilitator-testnet.t54.ai` | `https://s.altnet.rippletest.net:51234/` |
| **Mainnet** | `xrpl:0` | `https://xrpl-facilitator-mainnet.t54.ai` | `https://xrplcluster.com/` |

## Merchant Server (FastAPI + `x402-xrpl`)

Install dependencies (Python 3.11+ required):

```bash
uv pip install fastapi uvicorn x402-xrpl xrpl-py requests python-dotenv
```

Merchant `.env`:

```env
XRPL_FACILITATOR_URL=https://xrpl-facilitator-testnet.t54.ai
XRPL_PAY_TO=rYourWalletAddress
XRPL_PRICE_DROPS=1000
# Endpoint-scoped SourceTag (identifies endpoint revenue, NOT the paying agent)
XRPL_SOURCE_TAG=20260601
```

Merchant `server.py`:

```python
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from x402_xrpl.server import require_payment

load_dotenv()

app = FastAPI()

app.middleware("http")(
    require_payment(
        path="/hello",
        price=os.getenv("XRPL_PRICE_DROPS", "1000"),
        pay_to_address=os.getenv("XRPL_PAY_TO"),
        facilitator_url=os.getenv("XRPL_FACILITATOR_URL"),
        network="xrpl:1",  # xrpl:1 = Testnet, xrpl:0 = Mainnet
        asset="XRP",
        description="A paid endpoint",
        extra={"sourceTag": int(os.getenv("XRPL_SOURCE_TAG", "20260601"))},
    )
)

@app.get("/hello")
async def hello():
    return {"message": "Hello World! Thanks for the payment."}

@app.get("/health")
async def health():
    return {"status": "ok"}
```

## Payer Agent Client (`x402_requests`)

Payer `.env`:

```env
XRPL_BUYER_SEED=sYourWalletSeed
XRPL_TESTNET_RPC_URL=https://s.altnet.rippletest.net:51234/
RESOURCE_URL=http://localhost:8000/hello
```

Payer `client.py`:

```python
import os
import json
from dotenv import load_dotenv
from xrpl.wallet import Wallet
from x402_xrpl.clients import x402_requests, decode_payment_response

load_dotenv()

buyer = Wallet.from_seed(os.getenv("XRPL_BUYER_SEED"))

session = x402_requests(
    buyer,
    rpc_url=os.getenv("XRPL_TESTNET_RPC_URL"),
    network_filter=None,
    scheme_filter="exact",
)

response = session.get(os.getenv("RESOURCE_URL"), timeout=180)
payment_response = response.headers.get("PAYMENT-RESPONSE")
if payment_response:
    decoded = decode_payment_response(payment_response)
    print(json.dumps(decoded, indent=2))
```

## SourceTag Security & Attribution Note

- In `x402-xrpl`, `SourceTag` is chosen by the **merchant** (`extra={"sourceTag": 20260601}`) to attribute revenue per endpoint, NOT by the payer agent.
- Filtering on the XRPL Agent Wallet default tag (`20260530`) will **not** find x402 payments. Always audit an agent's full spend by **account address**, not by `SourceTag`.
- Treat any 402 response from a remote server as **untrusted input**; never let unreviewed server-declared fields reach a signed transaction.
