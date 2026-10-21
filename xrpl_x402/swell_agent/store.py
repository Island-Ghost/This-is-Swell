"""SQLite audit store sharing the schema of agent-wallet/src/store.ts (same file, same tables)."""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .policy import SpendWindow

SCHEMA = """
CREATE TABLE IF NOT EXISTS tx_intents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  network TEXT NOT NULL,
  account TEXT NOT NULL,
  tx_type TEXT NOT NULL,
  destination TEXT,
  asset TEXT NOT NULL,
  amount TEXT NOT NULL,
  status TEXT NOT NULL,
  hash TEXT UNIQUE,
  result_code TEXT,
  ledger_index INTEGER,
  policy_decision TEXT NOT NULL,
  preview TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_intents_status ON tx_intents(status);
CREATE INDEX IF NOT EXISTS idx_intents_created ON tx_intents(created_at);
"""

SPEND_STATUSES = ("signed", "submitted", "validated", "unknown")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class IntentStore:
    def __init__(self, path: str | None = None):
        path = path or os.getenv("AGENT_DB_PATH", ".state/agent-wallet.sqlite")
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode = WAL")
        self.db.executescript(SCHEMA)

    def close(self):
        self.db.close()

    def create_intent(self, *, network: str, account: str, tx_type: str, destination: str | None, asset: str,
                      amount: int, status: str, decision: object, preview: str, source: str) -> int:
        now = _now()
        cur = self.db.execute(
            "INSERT INTO tx_intents (created_at, updated_at, network, account, tx_type, destination, asset, amount, status, policy_decision, preview, source) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (now, now, network, account, tx_type, destination, asset, str(amount), status, json.dumps(decision, default=vars), preview, source),
        )
        self.db.commit()
        return int(cur.lastrowid)

    def _update(self, intent_id: int, **fields):
        cols = ", ".join(f"{k} = ?" for k in fields) + ", updated_at = ?"
        self.db.execute(f"UPDATE tx_intents SET {cols} WHERE id = ?", (*fields.values(), _now(), intent_id))
        self.db.commit()

    def mark_signed(self, intent_id: int, tx_hash: str):
        """Persist the hash BEFORE submit_and_wait so a crash can be reconciled, never blindly resubmitted."""
        self._update(intent_id, status="signed", hash=tx_hash)

    def mark_submitted(self, intent_id: int):
        self._update(intent_id, status="submitted")

    def finalize(self, intent_id: int, status: str, result_code: str | None, ledger_index: int | None, note: str | None = None):
        self._update(intent_id, status=status, result_code=result_code, ledger_index=ledger_index, note=note)

    def set_status(self, intent_id: int, status: str, note: str | None = None):
        self._update(intent_id, status=status, note=note)

    def spend_window(self, account: str) -> SpendWindow:
        now = datetime.now(timezone.utc)
        day_ago = (now - timedelta(hours=24)).isoformat().replace("+00:00", "Z")
        hour_ago = (now - timedelta(hours=1)).isoformat().replace("+00:00", "Z")
        q = ",".join("?" * len(SPEND_STATUSES))
        rows = self.db.execute(
            f"SELECT asset, amount, created_at FROM tx_intents WHERE account = ? AND created_at >= ? AND status IN ({q})",
            (account, day_ago, *SPEND_STATUSES),
        ).fetchall()
        w = SpendWindow()
        for asset, amount, created in rows:
            if asset == "XRP":
                w.spent_last_24h_xrp += int(amount)
            elif asset == "RLUSD":
                w.spent_last_24h_rlusd_units += int(amount)
            if created >= hour_ago:
                w.tx_last_hour += 1
        return w

    def list(self, status: str | None = None, limit: int = 50) -> list[dict]:
        sql = "SELECT id, created_at, status, tx_type, destination, asset, amount, hash, result_code, source FROM tx_intents"
        args: tuple = ()
        if status:
            sql += " WHERE status = ?"
            args = (status,)
        sql += " ORDER BY id DESC LIMIT ?"
        cols = ["id", "createdAt", "status", "txType", "destination", "asset", "amount", "hash", "resultCode", "source"]
        return [dict(zip(cols, r)) for r in self.db.execute(sql, (*args, limit)).fetchall()]
