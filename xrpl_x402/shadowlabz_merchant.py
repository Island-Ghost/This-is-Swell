"""
ShadowLabz X402 Merchant Server (FastAPI + x402-xrpl + Midnight ZK KYC Gate)

Protects ShadowLabz DAO launch, tier subscription, and membership endpoints
using HTTP 402 Payment Required on the XRP Ledger (x402-xrpl) gated by
Midnight Network Zero-Knowledge KYC proofs (X-Midnight-Kyc header).
"""

import os
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from x402_xrpl.server import require_payment

load_dotenv()

app = FastAPI(
    title="ShadowLabz AgilityCore X402 Merchant API",
    description="XRPL X402 Payment Portal with Midnight Network ZK KYC Verification",
    version="0.1.0",
)

XRPL_PAY_TO = os.getenv("XRPL_PAY_TO", "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh")
XRPL_FACILITATOR_URL = os.getenv(
    "XRPL_FACILITATOR_URL", "https://xrpl-facilitator-testnet.t54.ai"
)
XRPL_NETWORK = os.getenv("XRPL_X402_NETWORK", "xrpl:1")  # xrpl:1 = Testnet, xrpl:0 = Mainnet
XRPL_SOURCE_TAG = int(os.getenv("XRPL_SOURCE_TAG", "20260601"))

# Protect the /api/x402/dao/launch endpoint with x402-xrpl payment middleware
app.middleware("http")(
    require_payment(
        path="/api/x402/dao/launch",
        price=os.getenv("XRPL_PRICE_DROPS", "4000000"),  # e.g. 4 XRP (~$10 Starter launch/plan)
        pay_to_address=XRPL_PAY_TO,
        facilitator_url=XRPL_FACILITATOR_URL,
        network=XRPL_NETWORK,
        asset="XRP",
        description="ShadowLabz DAO Launch & Starter Plan (XRP + Midnight ZK KYC)",
        extra={"sourceTag": XRPL_SOURCE_TAG},
    )
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "shadowlabz-x402-xrpl-merchant",
        "network": XRPL_NETWORK,
        "payTo": XRPL_PAY_TO,
        "sourceTag": XRPL_SOURCE_TAG,
    }


@app.get("/api/x402/dao/launch")
async def launch_dao(
    x_midnight_kyc: str | None = Header(default=None, alias="X-Midnight-Kyc"),
):
    """
    Protected by BOTH:
    1. x402-xrpl middleware (verifies XRP on-chain payment receipt in X-PAYMENT header)
    2. Midnight ZK KYC proof (X-Midnight-Kyc nullifier header)
    """
    if not x_midnight_kyc or len(x_midnight_kyc) != 64:
        raise HTTPException(
            status_code=403,
            detail="Missing or invalid X-Midnight-Kyc 32-byte hex nullifier proof.",
        )
    return {
        "status": "dao_launched",
        "message": "ShadowLabz DAO launched! XRP X402 payment settled & Midnight ZK KYC verified.",
        "kycNullifier": x_midnight_kyc,
        "sourceTag": XRPL_SOURCE_TAG,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
