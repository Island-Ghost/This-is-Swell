import { Client } from "xrpl";
import { WS_URLS, type XrplNetwork } from "@swell/agent-wallet";

export type ExpectedPayment = {
  destination: string;
  minDrops: bigint;
  sourceTag?: number;
  /** Reject payments validated more than this many ledgers ago (≈4s each). */
  maxAgeLedgers?: number;
};

export type VerifyResult =
  | { ok: true; payer: string; deliveredDrops: bigint; ledgerIndex: number; sourceTag?: number; memo?: Record<string, unknown> }
  | { ok: false; reason: string };

export interface PaymentVerifier {
  readonly network: XrplNetwork;
  verify(txHash: string, expected: ExpectedPayment): Promise<VerifyResult>;
}

const HASH_RE = /^[0-9A-Fa-f]{64}$/;

/**
 * Verifies that an `X-Payment` value is the hash of a validated XRPL Payment that actually delivered
 * at least the asked amount to the merchant address. Uses `meta.delivered_amount`, never `Amount`.
 */
export class XrplPaymentVerifier implements PaymentVerifier {
  private client?: Client;

  constructor(readonly network: XrplNetwork, private readonly wsUrl = process.env.XRPL_WS_URL ?? WS_URLS[network]) {}

  private async getClient() {
    if (!this.client) this.client = new Client(this.wsUrl);
    if (!this.client.isConnected()) await this.client.connect();
    return this.client;
  }

  async close() {
    if (this.client?.isConnected()) await this.client.disconnect();
  }

  async verify(txHash: string, expected: ExpectedPayment): Promise<VerifyResult> {
    if (!HASH_RE.test(txHash)) return { ok: false, reason: "X-Payment must be a 64-hex XRPL transaction hash" };
    let res;
    try {
      const client = await this.getClient();
      res = await client.request({ command: "tx", transaction: txHash.toUpperCase() });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      if (e.data?.error === "txnNotFound") return { ok: false, reason: "transaction not found on ledger (not yet validated, wrong network, or never submitted)" };
      return { ok: false, reason: `ledger lookup failed: ${e.message ?? String(err)}` };
    }
    return checkTxResponse(res.result as unknown as TxResult, expected);
  }
}

export type TxResult = {
  validated?: boolean;
  ledger_index?: number;
  tx_json?: Record<string, unknown>;
  meta?: { TransactionResult?: string; delivered_amount?: unknown } | string;
} & Record<string, unknown>;

export function checkTxResponse(r: TxResult, expected: ExpectedPayment, currentLedger?: number): VerifyResult {
  const tx = (r.tx_json ?? r) as Record<string, unknown>;
  const meta = typeof r.meta === "object" && r.meta ? r.meta : undefined;
  if (!r.validated) return { ok: false, reason: "transaction is not in a validated ledger yet" };
  if (meta?.TransactionResult !== "tesSUCCESS") return { ok: false, reason: `transaction result ${meta?.TransactionResult ?? "unknown"} is not tesSUCCESS` };
  if (tx.TransactionType !== "Payment") return { ok: false, reason: `expected a Payment, got ${String(tx.TransactionType)}` };
  if (tx.Destination !== expected.destination) return { ok: false, reason: `payment destination ${String(tx.Destination)} is not the merchant address ${expected.destination}` };
  const delivered = meta?.delivered_amount;
  if (typeof delivered !== "string") return { ok: false, reason: "payment did not deliver XRP (delivered_amount is not drops)" };
  const deliveredDrops = BigInt(delivered);
  if (deliveredDrops < expected.minDrops) return { ok: false, reason: `delivered ${deliveredDrops} drops is less than the ${expected.minDrops} drops required` };
  if (expected.sourceTag !== undefined && tx.SourceTag !== expected.sourceTag) return { ok: false, reason: `SourceTag ${String(tx.SourceTag)} does not match merchant tag ${expected.sourceTag}` };
  if (expected.maxAgeLedgers && currentLedger && r.ledger_index && currentLedger - r.ledger_index > expected.maxAgeLedgers) {
    return { ok: false, reason: `payment is ${currentLedger - r.ledger_index} ledgers old (max ${expected.maxAgeLedgers})` };
  }
  return {
    ok: true,
    payer: String(tx.Account),
    deliveredDrops,
    ledgerIndex: r.ledger_index ?? 0,
    sourceTag: typeof tx.SourceTag === "number" ? tx.SourceTag : undefined,
    memo: decodeFirstMemo(tx),
  };
}

/** Memo contents are attacker-controlled; return them as data only, never act on them. */
function decodeFirstMemo(tx: Record<string, unknown>): Record<string, unknown> | undefined {
  const memos = tx.Memos as { Memo?: { MemoData?: string } }[] | undefined;
  const hex = memos?.[0]?.Memo?.MemoData;
  if (!hex) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(hex, "hex").toString("utf8"));
    return typeof parsed === "object" && parsed ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Test/demo verifier: accepts hashes registered via `accept()`, rejects everything else. */
export class StaticPaymentVerifier implements PaymentVerifier {
  private readonly known = new Map<string, Omit<Extract<VerifyResult, { ok: true }>, "ok">>();
  constructor(readonly network: XrplNetwork = "testnet") {}

  accept(hash: string, details: { payer: string; deliveredDrops: bigint; ledgerIndex?: number; sourceTag?: number }) {
    this.known.set(hash.toUpperCase(), { ledgerIndex: 1, ...details });
    return this;
  }

  async verify(txHash: string, expected: ExpectedPayment): Promise<VerifyResult> {
    const k = this.known.get(txHash.toUpperCase());
    if (!k) return { ok: false, reason: "transaction not found on ledger (static verifier)" };
    if (k.deliveredDrops < expected.minDrops) return { ok: false, reason: "delivered less than required" };
    return { ok: true, ...k };
  }
}
