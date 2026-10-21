import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { Asset } from "./policy.js";
import type { SpendWindow } from "./policy.js";

export type IntentStatus =
  | "quoted"
  | "denied"
  | "needs_approval"
  | "signed"
  | "submitted"
  | "validated"
  | "failed"
  | "unknown";

export type TxIntent = {
  id: number;
  createdAt: string;
  updatedAt: string;
  network: string;
  account: string;
  txType: string;
  destination: string | null;
  asset: string;
  amount: string;
  status: IntentStatus;
  hash: string | null;
  resultCode: string | null;
  ledgerIndex: number | null;
  policyDecision: string;
  preview: string;
  source: string;
  note: string | null;
};

const SCHEMA = `
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
CREATE TABLE IF NOT EXISTS consumed_receipts (
  receipt TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  consumed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/** Statuses that count as money committed on the ledger for spending-window purposes. */
const SPEND_STATUSES = ["signed", "submitted", "validated", "unknown"];

export class IntentStore {
  readonly db: DatabaseSync;

  constructor(dbPath = process.env.AGENT_DB_PATH || ".state/agent-wallet.sqlite") {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  createIntent(input: {
    network: string;
    account: string;
    txType: string;
    destination?: string;
    asset: string;
    amount: bigint;
    status: IntentStatus;
    policyDecision: unknown;
    preview: string;
    source: string;
    note?: string;
  }): number {
    const now = new Date().toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO tx_intents (created_at, updated_at, network, account, tx_type, destination, asset, amount, status, policy_decision, preview, source, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        now,
        now,
        input.network,
        input.account,
        input.txType,
        input.destination ?? null,
        input.asset,
        input.amount.toString(),
        input.status,
        JSON.stringify(input.policyDecision),
        input.preview,
        input.source,
        input.note ?? null,
      );
    return Number(res.lastInsertRowid);
  }

  /** Called immediately after wallet.sign() and BEFORE submitAndWait — the crash-recovery anchor. */
  markSigned(id: number, hash: string) {
    this.update(id, { status: "signed", hash });
  }

  markSubmitted(id: number) {
    this.update(id, { status: "submitted" });
  }

  finalize(id: number, status: "validated" | "failed" | "unknown", resultCode: string | null, ledgerIndex: number | null, note?: string) {
    this.update(id, { status, resultCode, ledgerIndex, note });
  }

  setStatus(id: number, status: IntentStatus, note?: string) {
    this.update(id, { status, note });
  }

  private update(id: number, fields: Partial<{ status: IntentStatus; hash: string; resultCode: string | null; ledgerIndex: number | null; note?: string }>) {
    const sets: string[] = ["updated_at = ?"];
    const vals: (string | number | null)[] = [new Date().toISOString()];
    if (fields.status !== undefined) { sets.push("status = ?"); vals.push(fields.status); }
    if (fields.hash !== undefined) { sets.push("hash = ?"); vals.push(fields.hash); }
    if (fields.resultCode !== undefined) { sets.push("result_code = ?"); vals.push(fields.resultCode); }
    if (fields.ledgerIndex !== undefined) { sets.push("ledger_index = ?"); vals.push(fields.ledgerIndex); }
    if (fields.note !== undefined) { sets.push("note = ?"); vals.push(fields.note ?? null); }
    vals.push(id);
    this.db.prepare(`UPDATE tx_intents SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  }

  get(id: number): TxIntent | undefined {
    const row = this.db.prepare("SELECT * FROM tx_intents WHERE id = ?").get(id) as Row | undefined;
    return row ? toIntent(row) : undefined;
  }

  getByHash(hash: string): TxIntent | undefined {
    const row = this.db.prepare("SELECT * FROM tx_intents WHERE hash = ?").get(hash) as Row | undefined;
    return row ? toIntent(row) : undefined;
  }

  list(opts: { status?: IntentStatus; limit?: number } = {}): TxIntent[] {
    const limit = opts.limit ?? 50;
    const rows = (opts.status
      ? this.db.prepare("SELECT * FROM tx_intents WHERE status = ? ORDER BY id DESC LIMIT ?").all(opts.status, limit)
      : this.db.prepare("SELECT * FROM tx_intents ORDER BY id DESC LIMIT ?").all(limit)) as Row[];
    return rows.map(toIntent);
  }

  /** Intents that were signed/submitted but never reached a final state — candidates for ledger reconciliation. */
  pending(): TxIntent[] {
    const rows = this.db
      .prepare("SELECT * FROM tx_intents WHERE status IN ('signed','submitted') ORDER BY id ASC")
      .all() as Row[];
    return rows.map(toIntent);
  }

  spendWindow(account: string, now = new Date()): SpendWindow {
    const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
    const hourAgo = new Date(now.getTime() - 3600 * 1000).toISOString();
    const placeholders = SPEND_STATUSES.map(() => "?").join(",");
    const rows = this.db
      .prepare(
        `SELECT asset, amount FROM tx_intents WHERE account = ? AND created_at >= ? AND status IN (${placeholders})`,
      )
      .all(account, dayAgo, ...SPEND_STATUSES) as { asset: string; amount: string }[];
    const spent: Record<Asset, bigint> = { XRP: 0n, RLUSD: 0n };
    for (const r of rows) if (r.asset === "XRP" || r.asset === "RLUSD") spent[r.asset] += BigInt(r.amount);
    const hourRow = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM tx_intents WHERE account = ? AND created_at >= ? AND status IN (${placeholders})`,
      )
      .get(account, hourAgo, ...SPEND_STATUSES) as { n: number };
    return { spentLast24h: spent, txLastHour: Number(hourRow.n) };
  }

  // --- Gateway-side replay guard for X-Payment receipts / tx hashes ---

  consumeReceipt(receipt: string, serviceId: string): boolean {
    try {
      this.db
        .prepare("INSERT INTO consumed_receipts (receipt, service_id, consumed_at) VALUES (?, ?, ?)")
        .run(receipt, serviceId, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }

  hasReceipt(receipt: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM consumed_receipts WHERE receipt = ?").get(receipt);
  }

  kvGet(key: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM kv WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value;
  }

  kvSet(key: string, value: string) {
    this.db.prepare("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
  }
}

type Row = {
  id: number;
  created_at: string;
  updated_at: string;
  network: string;
  account: string;
  tx_type: string;
  destination: string | null;
  asset: string;
  amount: string;
  status: IntentStatus;
  hash: string | null;
  result_code: string | null;
  ledger_index: number | null;
  policy_decision: string;
  preview: string;
  source: string;
  note: string | null;
};

function toIntent(r: Row): TxIntent {
  return {
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    network: r.network,
    account: r.account,
    txType: r.tx_type,
    destination: r.destination,
    asset: r.asset,
    amount: r.amount,
    status: r.status,
    hash: r.hash,
    resultCode: r.result_code,
    ledgerIndex: r.ledger_index,
    policyDecision: r.policy_decision,
    preview: r.preview,
    source: r.source,
    note: r.note,
  };
}
