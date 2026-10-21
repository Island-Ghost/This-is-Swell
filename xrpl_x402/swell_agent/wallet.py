"""
Policy-guarded signing ceremony in Python (xrpl-py), mirroring agent-wallet/src/ceremony.ts:
receive → load key → autofill → preview → policy / human → sign (persist hash) → submit_and_wait.
"""

from __future__ import annotations

import binascii
import json
import os
import re
from dataclasses import dataclass
from typing import Callable

from xrpl.clients import JsonRpcClient
from xrpl.models.transactions import Payment, Memo, Transaction
from xrpl.transaction import autofill, sign, submit_and_wait
from xrpl.utils import drops_to_xrp, xrp_to_drops
from xrpl.wallet import Wallet

from .policy import SpendingPolicy, Decision, Network, evaluate, load_policy, tx_value
from .store import IntentStore

XRPL_AI_STARTER_KIT_SOURCE_TAG = 20260530
RPC_URLS = {"testnet": "https://s.altnet.rippletest.net:51234/", "mainnet": "https://xrplcluster.com/"}
SEED_RE = re.compile(r"\bs[1-9A-HJ-NP-Za-km-z]{25,}\b")


def redact(text: str) -> str:
    return SEED_RE.sub("[REDACTED_SEED]", text)


@dataclass
class ExecuteResult:
    status: str  # validated | failed | unknown | denied | needs_approval | rejected_by_human
    intent_id: int
    preview: str
    decision: Decision
    hash: str | None = None
    result_code: str | None = None
    ledger_index: int | None = None
    summary: str | None = None


def build_memo(payload: dict, memo_type: str = "swell/agent") -> Memo:
    data = json.dumps(payload, separators=(",", ":"))
    return Memo(memo_type=memo_type.encode().hex().upper(), memo_data=data.encode().hex().upper())


def format_preview(tx: dict, network: str, auto_scope: str | None = None) -> str:
    amount = tx.get("Amount")
    if isinstance(amount, str):
        amount_s = f"{drops_to_xrp(amount)} XRP ({amount} drops)"
    elif isinstance(amount, dict):
        amount_s = f"{amount['value']} {amount['currency']} (issuer: {amount.get('issuer')})"
    else:
        amount_s = "—"
    memos = tx.get("Memos") or []
    memo_txt = " | ".join(
        binascii.unhexlify(m["Memo"]["MemoData"]).decode("utf8", "replace") for m in memos if m.get("Memo", {}).get("MemoData")
    ) or "—"
    fee = tx.get("Fee", "—")
    lines = [
        "─── XRPL Transaction Preview ────────────────────────────────────────",
        f"Network           : {network}",
        f"Type              : {tx.get('TransactionType')}",
        f"From              : {tx.get('Account')}",
        f"To                : {tx.get('Destination', '—')}",
        f"Amount            : {amount_s}",
        f"Fee               : {drops_to_xrp(fee) if fee != '—' else '—'} XRP ({fee} drops)" + ("  ⚠ fee above 100 drops — verify" if fee != "—" and int(fee) > 100 else ""),
        f"Sequence          : {tx.get('Sequence', '(autofilled)')}",
        f"LastLedgerSequence: {tx.get('LastLedgerSequence', '(autofilled)')}",
        f"Flags             : {tx.get('Flags', 0)}",
        f"Memos             : {memo_txt}",
        f"SourceTag         : {tx.get('SourceTag', XRPL_AI_STARTER_KIT_SOURCE_TAG)}",
    ]
    if auto_scope:
        lines.append(f"[auto-signed under policy: {auto_scope}]")
    lines.append("─────────────────────────────────────────────────────────────────────")
    return "\n".join(lines)


def classify(code: str | None) -> tuple[str, str]:
    if code is None:
        return "unknown", "No result code — check the ledger by hash before doing anything else."
    if code == "tesSUCCESS":
        return "validated", "Validated and applied."
    if code.startswith("tec"):
        return "failed", f"Included in a validated ledger but failed ({code}); fee was charged. Do not resubmit."
    if code.startswith("ter"):
        return "unknown", f"Provisional retry ({code}); may still validate before LastLedgerSequence."
    return "failed", f"Rejected before ledger inclusion ({code}); nothing charged."


class AgentWallet:
    """
    confirm: optional callable(preview, decision) -> bool. If given, the wallet is interactive and asks on
    every signature. If None, it is autonomous: only policy-allowed transactions are signed.
    """

    def __init__(self, *, seed_env: str = "XRPL_SEED", policy: SpendingPolicy | None = None, store: IntentStore | None = None,
                 rpc_url: str | None = None, source: str = "py-agent", confirm: Callable[[str, Decision], bool] | None = None):
        self.policy = policy or load_policy()
        self.network: Network = self.policy.network
        self.store = store or IntentStore()
        self.client = JsonRpcClient(rpc_url or os.getenv("XRPL_RPC_URL") or RPC_URLS[self.network])
        self.source = source
        self.confirm = confirm
        self._seed_env = seed_env
        self.address = self._with_wallet(lambda w: w.classic_address)

    def _with_wallet(self, fn):
        seed = os.getenv(self._seed_env)
        if not seed:
            raise RuntimeError(f"{self._seed_env} is not set. Run `npm run wallet:create` first.")
        return fn(Wallet.from_seed(seed))

    def _record(self, tx: dict, decision: Decision, preview: str, status: str) -> int:
        asset, amount = tx_value(tx)
        return self.store.create_intent(network=self.network, account=tx["Account"], tx_type=tx["TransactionType"],
                                        destination=tx.get("Destination"), asset=asset, amount=amount, status=status,
                                        decision=decision, preview=preview, source=self.source)

    def execute(self, tx: Transaction) -> ExecuteResult:
        if tx.account != self.address:
            raise ValueError(f"tx.Account {tx.account} does not match the agent wallet {self.address}; refusing to sign for another account.")
        if tx.source_tag is None:
            tx = Transaction.from_dict({**tx.to_dict(), "source_tag": XRPL_AI_STARTER_KIT_SOURCE_TAG})

        prepared = autofill(tx, self.client)
        ptx = prepared.to_xrpl()
        window = self.store.spend_window(self.address)
        decision = evaluate(self.policy, ptx, window, self.network)
        scope = None
        if decision.allowed and self.confirm is None:
            scope = f"{self.policy.network}, ≤{int(self.policy.maxPerTxDrops)/1e6} XRP/tx, ≤{int(self.policy.maxPerDayDrops)/1e6} XRP/day"
        preview = format_preview(ptx, self.network, scope)

        if decision.denied:
            iid = self._record(ptx, decision, preview, "denied")
            return ExecuteResult("denied", iid, preview, decision)
        if self.confirm is not None:
            if not self.confirm(preview, decision):
                iid = self._record(ptx, decision, preview, "needs_approval")
                self.store.set_status(iid, "needs_approval", "rejected by human")
                return ExecuteResult("rejected_by_human", iid, preview, decision)
        elif decision.requires_human:
            iid = self._record(ptx, decision, preview, "needs_approval")
            return ExecuteResult("needs_approval", iid, preview, decision)

        iid = self._record(ptx, decision, preview, "quoted")
        signed = self._with_wallet(lambda w: sign(prepared, w))
        tx_hash = signed.get_hash()
        self.store.mark_signed(iid, tx_hash)
        self.store.mark_submitted(iid)
        try:
            resp = submit_and_wait(signed, self.client)
            meta = resp.result.get("meta") or {}
            code = meta.get("TransactionResult") if isinstance(meta, dict) else None
            status, summary = classify(code)
            ledger = resp.result.get("ledger_index")
            self.store.finalize(iid, status, code, ledger, summary)
            return ExecuteResult(status, iid, preview, decision, hash=tx_hash, result_code=code, ledger_index=ledger, summary=summary)
        except Exception as err:  # noqa: BLE001 — never resubmit; surface the hash for reconciliation
            msg = redact(str(err))
            m = re.search(r"\b(te[cfmlrs][A-Z_]+)\b", msg)
            code = m.group(1) if m else None
            status = "failed" if code and not code.startswith(("tec", "ter")) else "unknown"
            self.store.finalize(iid, status, code, None, f"submit_and_wait: {msg}")
            return ExecuteResult(status, iid, preview, decision, hash=tx_hash, result_code=code, summary=msg)

    def pay_xrp(self, destination: str, xrp: str | float, *, memo: dict | None = None, source_tag: int | None = None,
                destination_tag: int | None = None) -> ExecuteResult:
        tx = Payment(
            account=self.address,
            destination=destination,
            amount=xrp_to_drops(xrp),
            source_tag=source_tag,
            destination_tag=destination_tag,
            memos=[build_memo({"app": "swell/py-agent", "action": "pay_xrp", **(memo or {})})],
        )
        return self.execute(tx)

    def pay_drops(self, destination: str, drops: int, *, memo: dict | None = None, source_tag: int | None = None) -> ExecuteResult:
        tx = Payment(account=self.address, destination=destination, amount=str(drops), source_tag=source_tag,
                     memos=[build_memo({"app": "swell/py-agent", "action": "pay", **(memo or {})})])
        return self.execute(tx)
