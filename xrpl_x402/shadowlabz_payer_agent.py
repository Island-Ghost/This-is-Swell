"""
Swell Autonomous Payer Agent (Python)

Pays for an HTTP 402 resource on the Swell gateway using the same spending policy
(`agent-policy.json`) and audit database (`.state/agent-wallet.sqlite`) as the TypeScript CLI and
MCP server. Payment proof is the validated XRPL tx hash sent back in `X-Payment`.

    .venv/bin/python xrpl_x402/shadowlabz_payer_agent.py http://127.0.0.1:8787/api/x402/plan/starter

Interactive by default (previews each signature and asks). Pass --yes for autonomous mode, where only
policy-allowed payments are signed and anything else comes back as needs_approval.

For a T54 `x402-xrpl` merchant (shadowlabz_merchant.py), use the `x402_requests` session from the
x402-xrpl package instead — that protocol carries a presigned payload rather than a tx hash.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import asdict

from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(__file__))
from swell_agent import AgentWallet, pay_for_resource  # noqa: E402

load_dotenv()


def ask_human(preview: str, decision) -> bool:
    print(preview)
    if decision.reasons:
        print("⚠ Outside policy: " + "; ".join(decision.reasons))
    return input("Sign and submit? (yes / no) ").strip().lower() in ("y", "yes")


def main() -> int:
    ap = argparse.ArgumentParser(description="Swell autonomous 402 payer")
    ap.add_argument("url", nargs="?", default=os.getenv("RESOURCE_URL", "http://127.0.0.1:8787/api/x402/plan/starter"))
    ap.add_argument("--yes", action="store_true", help="autonomous mode (policy-allowed only, no prompt)")
    ap.add_argument("--max-xrp", type=float, help="hard ceiling for this call")
    ap.add_argument("--header", action="append", default=[], help="extra header K=V (e.g. X-Midnight-Kyc=...)")
    ap.add_argument("--seed-env", default="XRPL_SEED", help="env var holding the seed (XRPL_SEED or XRPL_BUYER_SEED)")
    args = ap.parse_args()

    headers = dict(h.split("=", 1) for h in args.header)
    kyc = os.getenv("MIDNIGHT_KYC_NULLIFIER")
    if kyc and "X-Midnight-Kyc" not in headers:
        headers["X-Midnight-Kyc"] = kyc

    wallet = AgentWallet(seed_env=args.seed_env, source="py-cli", confirm=None if args.yes else ask_human)
    result = pay_for_resource(wallet, args.url, headers=headers,
                              max_price_drops=int(args.max_xrp * 1_000_000) if args.max_xrp else None)

    out = asdict(result)
    if result.payment:
        out["payment"] = {"status": result.payment.status, "hash": result.payment.hash, "result_code": result.payment.result_code,
                          "reasons": result.payment.decision.reasons, "intent_id": result.payment.intent_id}
    print(json.dumps(out, indent=2, default=str))
    return 0 if result.status in ("ok", "no_payment_required") else 1


if __name__ == "__main__":
    sys.exit(main())
