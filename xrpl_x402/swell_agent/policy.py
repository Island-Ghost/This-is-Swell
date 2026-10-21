"""Spending policy — same JSON schema and same semantics as agent-wallet/src/policy.ts."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

RLUSD_CURRENCY_HEX = "524C555344000000000000000000000000000000"

Network = Literal["testnet", "mainnet"]


@dataclass
class SpendingPolicy:
    network: Network = "testnet"
    maxPerTxDrops: str = "5000000"
    maxPerDayDrops: str = "25000000"
    maxTxPerHour: int = 20
    allowedTxTypes: list[str] = field(default_factory=lambda: ["Payment", "EscrowCreate", "EscrowFinish", "EscrowCancel", "TrustSet"])
    allowedAssets: list[str] = field(default_factory=lambda: ["XRP", "RLUSD"])
    maxPerTxRlusd: str | None = "10"
    maxPerDayRlusd: str | None = "50"
    destinationAllowlist: list[str] | None = None
    expiresAt: str | None = None


@dataclass
class Decision:
    allowed: bool
    requires_human: bool
    denied: bool
    reasons: list[str]


@dataclass
class SpendWindow:
    spent_last_24h_xrp: int = 0
    spent_last_24h_rlusd_units: int = 0
    tx_last_hour: int = 0


def load_policy(path: str | os.PathLike | None = None) -> SpendingPolicy:
    p = Path(path or os.getenv("AGENT_POLICY_PATH", "agent-policy.json"))
    if not p.exists():
        return SpendingPolicy()
    raw = json.loads(p.read_text())
    known = {k: v for k, v in raw.items() if k in SpendingPolicy.__dataclass_fields__}
    policy = SpendingPolicy(**known)
    if policy.network not in ("testnet", "mainnet"):
        raise ValueError(f"policy.network must be testnet|mainnet, got {policy.network}")
    return policy


def decimal_to_units(value: str) -> int:
    whole, _, frac = str(value).partition(".")
    return int(whole or "0") * 1_000_000 + int((frac + "000000")[:6])


def tx_value(tx: dict) -> tuple[str, int]:
    """Returns (asset, amount) where XRP amount is drops and RLUSD amount is micro-units."""
    amt = tx.get("Amount")
    if amt is None:
        return "XRP", 0
    if isinstance(amt, str):
        return "XRP", int(amt)
    if isinstance(amt, dict) and "currency" in amt:
        cur = amt["currency"]
        asset = "RLUSD" if cur in (RLUSD_CURRENCY_HEX, "RLUSD") else "OTHER"
        return asset, decimal_to_units(amt["value"])
    return "OTHER", 0


def evaluate(policy: SpendingPolicy, tx: dict, window: SpendWindow, network: Network, now: datetime | None = None) -> Decision:
    now = now or datetime.now(timezone.utc)
    hard: list[str] = []
    soft: list[str] = []

    if network != policy.network:
        hard.append(f"network {network} does not match policy network {policy.network}")
    if policy.expiresAt and now > datetime.fromisoformat(policy.expiresAt.replace("Z", "+00:00")):
        hard.append(f"policy expired at {policy.expiresAt}")
    if tx.get("TransactionType") not in policy.allowedTxTypes:
        hard.append(f"transaction type {tx.get('TransactionType')} not in allowedTxTypes")
    dest = tx.get("Destination")
    if dest and policy.destinationAllowlist and dest not in policy.destinationAllowlist:
        hard.append(f"destination {dest} not in destinationAllowlist")

    asset, amount = tx_value(tx)
    if asset == "OTHER":
        hard.append("asset not in allowedAssets")
    elif asset not in policy.allowedAssets:
        hard.append(f"asset {asset} not in allowedAssets")
    elif asset == "XRP":
        if amount > int(policy.maxPerTxDrops):
            soft.append(f"amount {amount} drops exceeds maxPerTxDrops {policy.maxPerTxDrops}")
        projected = window.spent_last_24h_xrp + amount
        if projected > int(policy.maxPerDayDrops):
            soft.append(f"24h spend would reach {projected} drops, exceeding maxPerDayDrops {policy.maxPerDayDrops}")
    else:
        if amount > decimal_to_units(policy.maxPerTxRlusd or "0"):
            soft.append(f"RLUSD amount exceeds maxPerTxRlusd {policy.maxPerTxRlusd}")
        if window.spent_last_24h_rlusd_units + amount > decimal_to_units(policy.maxPerDayRlusd or "0"):
            soft.append(f"24h RLUSD spend would exceed maxPerDayRlusd {policy.maxPerDayRlusd}")

    if window.tx_last_hour >= policy.maxTxPerHour:
        soft.append(f"{window.tx_last_hour} transactions in the last hour reaches maxTxPerHour {policy.maxTxPerHour}")

    if hard:
        return Decision(False, False, True, hard + soft)
    if soft:
        return Decision(False, True, False, soft)
    return Decision(True, False, False, [])
