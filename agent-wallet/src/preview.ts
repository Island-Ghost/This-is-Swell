import { dropsToXrp, PaymentFlags, type SubmittableTransaction } from "xrpl";
import { XRPL_AI_STARTER_KIT_SOURCE_TAG } from "@swell/shared";
import type { XrplNetwork } from "./policy.js";

const FEE_WARN_DROPS = 100n;
const CORE_FIELDS = new Set([
  "TransactionType", "Account", "Destination", "Amount", "Fee", "Sequence", "LastLedgerSequence",
  "Flags", "Memos", "SourceTag", "SigningPubKey", "TxnSignature", "NetworkID",
]);
const ASSET_FIELDS = ["TakerGets", "TakerPays", "SendMax", "DeliverMin", "LimitAmount"];

export function formatAmount(amount: unknown): string {
  if (amount === undefined || amount === null) return "—";
  if (typeof amount === "string") return `${dropsToXrp(amount)} XRP (${amount} drops)`;
  if (typeof amount === "object" && "currency" in (amount as object)) {
    const a = amount as { currency: string; issuer?: string; value: string };
    const cur = a.currency.length === 40 ? `${decodeCurrencyHex(a.currency)} [${a.currency}]` : a.currency;
    return `${a.value} ${cur}${a.issuer ? ` (issuer: ${a.issuer})` : ""}`;
  }
  if (typeof amount === "object" && "mpt_issuance_id" in (amount as object)) {
    const a = amount as { value: string; mpt_issuance_id: string };
    return `${a.value} (mpt_issuance_id: ${a.mpt_issuance_id})`;
  }
  return JSON.stringify(amount);
}

function decodeCurrencyHex(hex: string): string {
  const txt = Buffer.from(hex, "hex").toString("utf8").replace(/\0+$/g, "");
  return /^[\x20-\x7e]+$/.test(txt) ? txt : hex;
}

export function decodeFlags(tx: SubmittableTransaction): string {
  const flags = typeof tx.Flags === "number" ? tx.Flags : 0;
  if (!flags) return "0";
  const names: string[] = [];
  let known = 0;
  if (tx.TransactionType === "Payment") {
    for (const [name, bit] of Object.entries(PaymentFlags)) {
      if (typeof bit === "number" && flags & bit) { names.push(name); known |= bit; }
    }
  }
  const unknown = flags & ~known & 0x7fffffff;
  if (unknown) names.push(`0x${unknown.toString(16)} (unknown flag bit set — verify before signing)`);
  return `${flags} (${names.join(", ") || "unrecognised"})`;
}

export function decodeMemos(tx: SubmittableTransaction): string {
  const memos = tx.Memos ?? [];
  if (!memos.length) return "—";
  return memos
    .map((m) => {
      const hex = m.Memo?.MemoData;
      if (!hex) return "(empty)";
      const buf = Buffer.from(hex, "hex");
      const txt = buf.toString("utf8");
      return /^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(txt) ? txt : `(binary memo, ${buf.length} bytes)`;
    })
    .join(" | ");
}

/**
 * The human-confirmation preview mandated by the xrpl-agent-wallet skill. Full addresses, decoded
 * amounts/flags/memos, fee warnings, and expiry so a human can catch a misconfiguration before signing.
 */
export function formatXrplTransactionPreview(
  tx: SubmittableTransaction,
  network: XrplNetwork = "testnet",
  opts: { currentLedger?: number; autoSignScope?: string } = {},
): string {
  const t = tx as SubmittableTransaction & Record<string, unknown>;
  const feeDrops = tx.Fee ?? "—";
  const feeLine = feeDrops === "—" ? "— (autofilled at sign time)" : `${dropsToXrp(feeDrops)} XRP (${feeDrops} drops)${BigInt(feeDrops) > FEE_WARN_DROPS ? `  ⚠ fee is ${BigInt(feeDrops) / 10n}× the 10-drop base — verify` : ""}`;

  let lls = tx.LastLedgerSequence !== undefined ? String(tx.LastLedgerSequence) : "(autofilled at sign time)";
  if (tx.LastLedgerSequence !== undefined && opts.currentLedger) {
    const n = tx.LastLedgerSequence - opts.currentLedger;
    lls += `  (expires in ~${n} ledgers, ~${n * 4}s)`;
  }

  const lines = [
    "─── XRPL Transaction Preview ────────────────────────────────────────",
    `Network           : ${network}`,
    `Type              : ${tx.TransactionType}`,
    `From              : ${tx.Account}`,
    `To                : ${(t.Destination as string | undefined) ?? "—"}`,
    `Amount            : ${formatAmount(t.Amount)}`,
    `Fee               : ${feeLine}`,
    `Sequence          : ${tx.Sequence ?? "(autofilled at sign time)"}`,
    `LastLedgerSequence: ${lls}`,
    `Flags             : ${decodeFlags(tx)}`,
    `Memos             : ${decodeMemos(tx)}`,
    `SourceTag         : ${tx.SourceTag ?? XRPL_AI_STARTER_KIT_SOURCE_TAG}`,
  ];

  for (const f of ASSET_FIELDS) if (t[f] !== undefined) lines.push(`${f.padEnd(18)}: ${formatAmount(t[f])}`);

  const other = Object.keys(t)
    .filter((k) => !CORE_FIELDS.has(k) && !ASSET_FIELDS.includes(k))
    .sort()
    .map((k) => `  ${k}: ${typeof t[k] === "object" ? JSON.stringify(t[k]) : String(t[k])}`);
  lines.push(`Other fields      : ${other.length ? "" : "—"}`, ...other);

  if (opts.autoSignScope) lines.push(`[auto-signed under policy: ${opts.autoSignScope}]`);
  lines.push("─────────────────────────────────────────────────────────────────────");
  return lines.join("\n");
}
