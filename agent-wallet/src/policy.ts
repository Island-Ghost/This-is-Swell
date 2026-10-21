import fs from "node:fs";
import type { SubmittableTransaction } from "xrpl";
import { RLUSD_CURRENCY_HEX } from "@swell/shared";

export type XrplNetwork = "testnet" | "mainnet";
export type Asset = "XRP" | "RLUSD";

/**
 * Spending policy an AI agent operates under. Deny-by-default: anything the policy does not
 * explicitly allow is either refused outright (hard violation) or escalated to a human (soft cap).
 * Amounts are strings so the JSON file round-trips bigint drops without precision loss.
 */
export type SpendingPolicy = {
  network: XrplNetwork;
  maxPerTxDrops: string;
  maxPerDayDrops: string;
  maxTxPerHour: number;
  allowedTxTypes: string[];
  allowedAssets: Asset[];
  maxPerTxRlusd?: string;
  maxPerDayRlusd?: string;
  destinationAllowlist?: string[];
  expiresAt?: string;
};

export type PolicyDecision = {
  /** Fully inside policy — may be auto-signed without a human. */
  allowed: boolean;
  /** Outside a soft cap — may proceed only with explicit human confirmation. */
  requiresHuman: boolean;
  /** Hard violation — must never be signed, even by a human in this session. */
  denied: boolean;
  reasons: string[];
};

export type SpendWindow = {
  spentLast24h: Record<Asset, bigint>;
  txLastHour: number;
};

export type TxValue = { asset: Asset | "OTHER"; amount: bigint; currency?: string; issuer?: string };

export const DEFAULT_POLICY: SpendingPolicy = {
  network: "testnet",
  maxPerTxDrops: "5000000",
  maxPerDayDrops: "25000000",
  maxTxPerHour: 20,
  allowedTxTypes: ["Payment", "EscrowCreate", "EscrowFinish", "EscrowCancel", "TrustSet"],
  allowedAssets: ["XRP", "RLUSD"],
  maxPerTxRlusd: "10",
  maxPerDayRlusd: "50",
};

export function loadPolicy(path = process.env.AGENT_POLICY_PATH || "agent-policy.json"): SpendingPolicy {
  if (!fs.existsSync(path)) return { ...DEFAULT_POLICY };
  const raw = JSON.parse(fs.readFileSync(path, "utf8")) as Partial<SpendingPolicy>;
  return validatePolicy({ ...DEFAULT_POLICY, ...raw });
}

export function savePolicy(policy: SpendingPolicy, path = process.env.AGENT_POLICY_PATH || "agent-policy.json") {
  fs.writeFileSync(path, JSON.stringify(validatePolicy(policy), null, 2) + "\n");
}

export function validatePolicy(p: SpendingPolicy): SpendingPolicy {
  if (p.network !== "testnet" && p.network !== "mainnet") throw new Error(`policy.network must be testnet|mainnet, got ${p.network}`);
  for (const k of ["maxPerTxDrops", "maxPerDayDrops"] as const) {
    if (!/^\d+$/.test(p[k])) throw new Error(`policy.${k} must be a non-negative integer string`);
  }
  if (!Number.isInteger(p.maxTxPerHour) || p.maxTxPerHour < 0) throw new Error("policy.maxTxPerHour must be a non-negative integer");
  if (p.expiresAt && Number.isNaN(Date.parse(p.expiresAt))) throw new Error("policy.expiresAt must be an ISO date");
  return p;
}

/** Extracts the economic value a transaction moves out of the account. */
export function transactionValue(tx: SubmittableTransaction): TxValue {
  const amt = (tx as { Amount?: unknown }).Amount;
  if (amt === undefined) return { asset: "XRP", amount: 0n };
  if (typeof amt === "string") return { asset: "XRP", amount: BigInt(amt) };
  if (typeof amt === "object" && amt !== null && "currency" in amt) {
    const iou = amt as { currency: string; issuer: string; value: string };
    const asset: TxValue["asset"] = iou.currency === RLUSD_CURRENCY_HEX || iou.currency === "RLUSD" ? "RLUSD" : "OTHER";
    return { asset, amount: decimalToUnits(iou.value), currency: iou.currency, issuer: iou.issuer };
  }
  return { asset: "OTHER", amount: 0n };
}

/** RLUSD and policy caps are expressed in whole-unit decimals; compare in micro-units (6 dp). */
export function decimalToUnits(value: string): bigint {
  const [whole, frac = ""] = value.split(".");
  return BigInt(whole || "0") * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
}

export function evaluatePolicy(
  policy: SpendingPolicy,
  tx: SubmittableTransaction,
  window: SpendWindow,
  network: XrplNetwork,
  now = new Date(),
): PolicyDecision {
  const hard: string[] = [];
  const soft: string[] = [];

  if (network !== policy.network) hard.push(`network ${network} does not match policy network ${policy.network}`);
  if (policy.expiresAt && now.getTime() > Date.parse(policy.expiresAt)) hard.push(`policy expired at ${policy.expiresAt}`);
  if (!policy.allowedTxTypes.includes(tx.TransactionType)) hard.push(`transaction type ${tx.TransactionType} not in allowedTxTypes`);

  const dest = (tx as { Destination?: string }).Destination;
  if (dest && policy.destinationAllowlist?.length && !policy.destinationAllowlist.includes(dest)) {
    hard.push(`destination ${dest} not in destinationAllowlist`);
  }

  const value = transactionValue(tx);
  if (value.asset === "OTHER") {
    hard.push(`asset ${value.currency ?? "unknown"} not in allowedAssets`);
  } else if (!policy.allowedAssets.includes(value.asset)) {
    hard.push(`asset ${value.asset} not in allowedAssets`);
  } else if (value.asset === "XRP") {
    if (value.amount > BigInt(policy.maxPerTxDrops)) soft.push(`amount ${value.amount} drops exceeds maxPerTxDrops ${policy.maxPerTxDrops}`);
    const projected = window.spentLast24h.XRP + value.amount;
    if (projected > BigInt(policy.maxPerDayDrops)) soft.push(`24h spend would reach ${projected} drops, exceeding maxPerDayDrops ${policy.maxPerDayDrops}`);
  } else {
    const perTx = decimalToUnits(policy.maxPerTxRlusd ?? "0");
    const perDay = decimalToUnits(policy.maxPerDayRlusd ?? "0");
    if (value.amount > perTx) soft.push(`RLUSD amount exceeds maxPerTxRlusd ${policy.maxPerTxRlusd ?? "0"}`);
    if (window.spentLast24h.RLUSD + value.amount > perDay) soft.push(`24h RLUSD spend would exceed maxPerDayRlusd ${policy.maxPerDayRlusd ?? "0"}`);
  }

  if (window.txLastHour >= policy.maxTxPerHour) soft.push(`${window.txLastHour} transactions in the last hour reaches maxTxPerHour ${policy.maxTxPerHour}`);

  if (hard.length) return { allowed: false, requiresHuman: false, denied: true, reasons: hard.concat(soft) };
  if (soft.length) return { allowed: false, requiresHuman: true, denied: false, reasons: soft };
  return { allowed: true, requiresHuman: false, denied: false, reasons: [] };
}

export function describePolicy(policy: SpendingPolicy, window: SpendWindow): Record<string, unknown> {
  const dayCap = BigInt(policy.maxPerDayDrops);
  const remaining = dayCap > window.spentLast24h.XRP ? dayCap - window.spentLast24h.XRP : 0n;
  return {
    network: policy.network,
    maxPerTxXrp: Number(policy.maxPerTxDrops) / 1_000_000,
    maxPerDayXrp: Number(dayCap) / 1_000_000,
    spentLast24hXrp: Number(window.spentLast24h.XRP) / 1_000_000,
    remainingTodayXrp: Number(remaining) / 1_000_000,
    maxPerTxRlusd: policy.maxPerTxRlusd ?? null,
    spentLast24hRlusd: Number(window.spentLast24h.RLUSD) / 1_000_000,
    txLastHour: window.txLastHour,
    maxTxPerHour: policy.maxTxPerHour,
    allowedTxTypes: policy.allowedTxTypes,
    allowedAssets: policy.allowedAssets,
    destinationAllowlist: policy.destinationAllowlist ?? null,
    expiresAt: policy.expiresAt ?? null,
    expired: policy.expiresAt ? Date.now() > Date.parse(policy.expiresAt) : false,
  };
}
