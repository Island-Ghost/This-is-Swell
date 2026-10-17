"""
ShadowLabz Autonomous Payer Agent (x402-xrpl + Midnight ZK KYC Header)

Demonstrates how a ShadowLabz user or AI agent:
1. Attaches their Midnight ZK KYC nullifier proof in `X-Midnight-Kyc`
2. Calls an X402-protected ShadowLabz endpoint
3. Automatically detects the 402 Payment Required response, signs and submits the
   XRP payment on-chain via `x402_requests`, and retries with the facilitator receipt.
"""

import json
import os
from dotenv import load_dotenv
from xrpl.wallet import Wallet
from x402_xrpl.clients import x402_requests, decode_payment_response

load_dotenv()


def pay_and_launch_dao(
    buyer_seed: str,
    kyc_nullifier_hex: str,
    resource_url: str = "http://127.0.0.1:8000/api/x402/dao/launch",
    rpc_url: str = "https://s.altnet.rippletest.net:51234/",
) -> dict:
    buyer = Wallet.from_seed(buyer_seed)
    session = x402_requests(
        buyer,
        rpc_url=rpc_url,
        network_filter=None,
        scheme_filter="exact",
    )
    session.headers.update({"X-Midnight-Kyc": kyc_nullifier_hex})

    response = session.get(resource_url, timeout=180)
    settlement = None
    payment_response = response.headers.get("PAYMENT-RESPONSE")
    if payment_response:
        settlement = decode_payment_response(payment_response)

    return {
        "status_code": response.status_code,
        "body": response.json(),
        "settlement": settlement,
    }


if __name__ == "__main__":
    seed = os.getenv("XRPL_BUYER_SEED")
    kyc_nul = os.getenv("MIDNIGHT_KYC_NULLIFIER", "a" * 64)
    if not seed:
        raise RuntimeError("Set XRPL_BUYER_SEED in .env before running payer agent.")
    result = pay_and_launch_dao(
        buyer_seed=seed,
        kyc_nullifier_hex=kyc_nul,
        resource_url=os.getenv("RESOURCE_URL", "http://127.0.0.1:8000/api/x402/dao/launch"),
        rpc_url=os.getenv("XRPL_RPC_URL", "https://s.altnet.rippletest.net:51234/"),
    )
    print(json.dumps(result, indent=2))
