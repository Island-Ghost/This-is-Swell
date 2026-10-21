import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

/**
 * Durable gateway state. Records are stored as JSON documents keyed by id so the HTTP layer keeps
 * its existing shapes; `receipts` is the replay guard for X-Payment values.
 */
export class GatewayStore {
  readonly db: DatabaseSync;

  constructor(dbPath = process.env.GATEWAY_DB_PATH || ".state/gateway.sqlite") {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    for (const t of ["kyc_records", "daos", "escrows"]) {
      this.db.exec(`CREATE TABLE IF NOT EXISTS ${t} (id TEXT PRIMARY KEY, doc TEXT NOT NULL, updated_at TEXT NOT NULL)`);
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, doc TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (receipt TEXT PRIMARY KEY, service_id TEXT NOT NULL, payer TEXT, consumed_at TEXT NOT NULL);
    `);
  }

  close() {
    this.db.close();
  }

  private put(table: string, id: string, doc: unknown) {
    this.db
      .prepare(`INSERT INTO ${table} (id, doc, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET doc = excluded.doc, updated_at = excluded.updated_at`)
      .run(id, serialize(doc), new Date().toISOString());
  }

  private getDoc<T>(table: string, id: string): T | undefined {
    const row = this.db.prepare(`SELECT doc FROM ${table} WHERE id = ?`).get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as T) : undefined;
  }

  private allDocs<T>(table: string): T[] {
    return (this.db.prepare(`SELECT doc FROM ${table} ORDER BY rowid ASC`).all() as { doc: string }[]).map((r) => JSON.parse(r.doc) as T);
  }

  private count(table: string): number {
    return Number((this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);
  }

  // KYC
  putKyc<T>(nullifier: string, rec: T) { this.put("kyc_records", nullifier, rec); }
  getKyc<T>(nullifier: string) { return this.getDoc<T>("kyc_records", nullifier); }
  hasKyc(nullifier: string) { return this.getKyc(nullifier) !== undefined; }
  allKyc<T>() { return this.allDocs<T>("kyc_records"); }

  // DAOs (bigint fields are serialized as strings and revived by the caller)
  putDao<T>(id: string, rec: T) { this.put("daos", id, rec); }
  getDao<T>(id: string) { return this.getDoc<T>("daos", id); }
  allDaos<T>() { return this.allDocs<T>("daos"); }
  daoCount() { return this.count("daos"); }

  // Escrows
  putEscrow<T>(id: string, rec: T) { this.put("escrows", id, rec); }
  getEscrow<T>(id: string) { return this.getDoc<T>("escrows", id); }
  allEscrows<T>() { return this.allDocs<T>("escrows"); }

  // Settlement ledger (newest first, like the previous in-memory unshift)
  addSettlement<T extends { id: string }>(entry: T) {
    const seq = Number((this.db.prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS s FROM settlements").get() as { s: number }).s);
    this.db.prepare("INSERT INTO settlements (id, seq, doc) VALUES (?, ?, ?)").run(entry.id, seq, serialize(entry));
  }
  settlements<T>(limit = 500): T[] {
    return (this.db.prepare("SELECT doc FROM settlements ORDER BY seq DESC LIMIT ?").all(limit) as { doc: string }[]).map((r) => JSON.parse(r.doc) as T);
  }

  // Replay guard
  consumeReceipt(receipt: string, serviceId: string, payer?: string): boolean {
    try {
      this.db.prepare("INSERT INTO receipts (receipt, service_id, payer, consumed_at) VALUES (?, ?, ?, ?)").run(receipt.toUpperCase(), serviceId, payer ?? null, new Date().toISOString());
      return true;
    } catch {
      return false;
    }
  }
}

const serialize = (v: unknown) => JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
