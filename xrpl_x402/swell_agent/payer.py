"""Autonomous HTTP 402 payer against the Swell gateway (X-Payment = validated XRPL tx hash)."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import requests
from xrpl.core.addresscodec import is_valid_classic_address

from .wallet import AgentWallet, ExecuteResult

CAIP2 = {"xrpl:1": "testnet", "xrpl:0": "mainnet", "testnet": "testnet", "mainnet": "mainnet"}
PAYMENT_HEADER = "X-Payment"


@dataclass
class Challenge:
    pay_to: str
    amount_drops: int
    network: str
    asset: str
    source_tag: int | None
    service_id: str | None
    description: str | None


@dataclass
class PayForResourceResult:
    status: str
    http_status: int
    body: Any
    challenge: Challenge | None = None
    payment: ExecuteResult | None = None
    reason: str | None = None


def parse_challenge(body: Any) -> Challenge | None:
    if not isinstance(body, dict):
        return None
    pr = body.get("paymentRequired", body)
    x = pr.get("xrpl") if isinstance(pr, dict) else None
    if isinstance(x, dict) and "payToAddress" in x and "priceDrops" in x:
        net = CAIP2.get(str(x.get("network")))
        if not net:
            return None
        return Challenge(x["payToAddress"], int(x["priceDrops"]), net, str(x.get("asset", "XRP")), x.get("sourceTag"),
                         pr.get("serviceId"), pr.get("description"))
    for a in body.get("accepts", []) or []:
        if str(a.get("network", "")).startswith("xrpl") and "payTo" in a:
            net = CAIP2.get(str(a["network"]))
            if not net:
                return None
            return Challenge(a["payTo"], int(a["maxAmountRequired"]), net, str(a.get("asset", "XRP")),
                             (a.get("extra") or {}).get("sourceTag"), None, a.get("description"))
    return None


def _body(res: requests.Response) -> Any:
    try:
        return res.json()
    except ValueError:
        return res.text


def pay_for_resource(wallet: AgentWallet, url: str, *, headers: dict[str, str] | None = None, method: str = "GET",
                     max_price_drops: int | None = None, timeout: int = 60) -> PayForResourceResult:
    headers = dict(headers or {})
    first = requests.request(method, url, headers=headers, timeout=timeout)
    if first.status_code != 402:
        return PayForResourceResult("no_payment_required" if first.ok else "resource_error", first.status_code, _body(first))

    body = _body(first)
    ch = parse_challenge(body)
    if ch is None:
        return PayForResourceResult("challenge_rejected", 402, body, reason="Unrecognised 402 challenge format")
    if not is_valid_classic_address(ch.pay_to):
        return PayForResourceResult("challenge_rejected", 402, body, ch, reason=f"Invalid payTo address {ch.pay_to}")
    if ch.asset != "XRP":
        return PayForResourceResult("challenge_rejected", 402, body, ch, reason=f"Only XRP challenges supported (got {ch.asset})")
    if ch.network != wallet.network:
        return PayForResourceResult("challenge_rejected", 402, body, ch, reason=f"Challenge network {ch.network} != wallet network {wallet.network}")
    if max_price_drops is not None and ch.amount_drops > max_price_drops:
        return PayForResourceResult("challenge_rejected", 402, body, ch, reason=f"Price {ch.amount_drops} drops exceeds ceiling {max_price_drops}")

    payment = wallet.pay_drops(ch.pay_to, ch.amount_drops, source_tag=ch.source_tag,
                               memo={"action": "x402_pay", "url": url, "service_id": ch.service_id})
    if payment.status == "denied":
        return PayForResourceResult("payment_denied", 402, body, ch, payment, "; ".join(payment.decision.reasons))
    if payment.status in ("needs_approval", "rejected_by_human"):
        return PayForResourceResult("needs_approval", 402, body, ch, payment, "; ".join(payment.decision.reasons) or "human declined")
    if payment.status != "validated" or not payment.hash:
        return PayForResourceResult("payment_failed", 402, body, ch, payment, payment.summary)

    second = requests.request(method, url, headers={**headers, PAYMENT_HEADER: payment.hash, "X-Payment-Network": ch.network}, timeout=timeout)
    return PayForResourceResult("ok" if second.ok else "resource_error", second.status_code, _body(second), ch, payment)
