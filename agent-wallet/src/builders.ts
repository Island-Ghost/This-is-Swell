import type { Payment, EscrowCreate, EscrowFinish, EscrowCancel, TrustSet, Memo } from "xrpl";
import { xrpToDrops } from "xrpl";
import {
  computeShadowLabzSplit,
  RLUSD_CURRENCY_HEX,
  RLUSD_ISSUER_TESTNET,
  RLUSD_ISSUER_MAINNET,
  type DaoRevenueSplit,
} from "@swell/shared";
import type { XrplNetwork } from "./policy.js";

export const RIPPLE_EPOCH_OFFSET = 946_684_800;
export const unixToRippleTime = (unixSeconds: number) => Math.floor(unixSeconds) - RIPPLE_EPOCH_OFFSET;
export const rippleToUnixTime = (rippleSeconds: number) => rippleSeconds + RIPPLE_EPOCH_OFFSET;

export const rlusdIssuer = (network: XrplNetwork) => (network === "mainnet" ? RLUSD_ISSUER_MAINNET : RLUSD_ISSUER_TESTNET);

export type MemoPayload = { app: string; action: string; ts?: string } & Record<string, unknown>;

/** JSON memo so every agent action leaves an on-chain audit trail (treated as untrusted when read back). */
export function buildXrplMemo(payload: MemoPayload, memoType = "swell/agent"): Memo {
  const json = JSON.stringify({ ts: new Date().toISOString(), ...payload });
  return {
    Memo: {
      MemoType: Buffer.from(memoType, "utf8").toString("hex").toUpperCase(),
      MemoData: Buffer.from(json, "utf8").toString("hex").toUpperCase(),
    },
  };
}

export const toDrops = (xrp: number | string): bigint => BigInt(xrpToDrops(xrp));

/** Builders never set Fee/Sequence/LastLedgerSequence — the ceremony's autofill step does. */
export function buildXrpPayment(p: {
  account: string;
  destination: string;
  amountDrops: bigint;
  destinationTag?: number;
  sourceTag?: number;
  memo?: MemoPayload;
}): Payment {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: p.account,
    Destination: p.destination,
    Amount: p.amountDrops.toString(),
  };
  if (p.destinationTag !== undefined) tx.DestinationTag = p.destinationTag;
  if (p.sourceTag !== undefined) tx.SourceTag = p.sourceTag;
  if (p.memo) tx.Memos = [buildXrplMemo(p.memo)];
  return tx;
}

export function buildRlusdPayment(p: {
  account: string;
  destination: string;
  value: string;
  network: XrplNetwork;
  issuer?: string;
  destinationTag?: number;
  sourceTag?: number;
  memo?: MemoPayload;
}): Payment {
  const tx: Payment = {
    TransactionType: "Payment",
    Account: p.account,
    Destination: p.destination,
    Amount: { currency: RLUSD_CURRENCY_HEX, issuer: p.issuer ?? rlusdIssuer(p.network), value: p.value },
  };
  if (p.destinationTag !== undefined) tx.DestinationTag = p.destinationTag;
  if (p.sourceTag !== undefined) tx.SourceTag = p.sourceTag;
  if (p.memo) tx.Memos = [buildXrplMemo(p.memo)];
  return tx;
}

export function buildRlusdTrustSet(p: { account: string; network: XrplNetwork; limit?: string; issuer?: string }): TrustSet {
  return {
    TransactionType: "TrustSet",
    Account: p.account,
    LimitAmount: { currency: RLUSD_CURRENCY_HEX, issuer: p.issuer ?? rlusdIssuer(p.network), value: p.limit ?? "1000000" },
  };
}

export function buildEscrowCreate(p: {
  account: string;
  destination: string;
  amountDrops: bigint;
  finishAfterUnix: number;
  cancelAfterUnix?: number;
  destinationTag?: number;
  sourceTag?: number;
  memo?: MemoPayload;
}): EscrowCreate {
  const tx: EscrowCreate = {
    TransactionType: "EscrowCreate",
    Account: p.account,
    Destination: p.destination,
    Amount: p.amountDrops.toString(),
    FinishAfter: unixToRippleTime(p.finishAfterUnix),
  };
  if (p.cancelAfterUnix !== undefined) tx.CancelAfter = unixToRippleTime(p.cancelAfterUnix);
  if (p.destinationTag !== undefined) tx.DestinationTag = p.destinationTag;
  if (p.sourceTag !== undefined) tx.SourceTag = p.sourceTag;
  if (p.memo) tx.Memos = [buildXrplMemo(p.memo)];
  return tx;
}

export function buildEscrowFinish(p: { account: string; owner: string; offerSequence: number; memo?: MemoPayload }): EscrowFinish {
  const tx: EscrowFinish = { TransactionType: "EscrowFinish", Account: p.account, Owner: p.owner, OfferSequence: p.offerSequence };
  if (p.memo) tx.Memos = [buildXrplMemo(p.memo)];
  return tx;
}

export function buildEscrowCancel(p: { account: string; owner: string; offerSequence: number; memo?: MemoPayload }): EscrowCancel {
  const tx: EscrowCancel = { TransactionType: "EscrowCancel", Account: p.account, Owner: p.owner, OfferSequence: p.offerSequence };
  if (p.memo) tx.Memos = [buildXrplMemo(p.memo)];
  return tx;
}

/**
 * Splits one payment three ways (5% platform / organizer bps / remainder treasury) into separate
 * Payments. Zero-value legs are omitted; the sum of legs always equals totalDrops.
 */
export function buildSplitPayments(p: {
  account: string;
  platformAddress: string;
  organizerAddress: string;
  treasuryAddress: string;
  totalDrops: bigint;
  organizerFeeBps: number;
  sourceTag?: number;
  memo?: Omit<MemoPayload, "action">;
}): { split: DaoRevenueSplit; transactions: Payment[] } {
  const split = computeShadowLabzSplit(p.totalDrops, p.organizerFeeBps);
  const app = typeof p.memo?.app === "string" ? p.memo.app : "swell/agent";
  const leg = (destination: string, amountDrops: bigint, action: string) =>
    buildXrpPayment({ account: p.account, destination, amountDrops, sourceTag: p.sourceTag, memo: { ...p.memo, app, action } });
  const transactions: Payment[] = [];
  if (split.platformDrops > 0n) transactions.push(leg(p.platformAddress, split.platformDrops, "split_platform_500bps"));
  if (split.organizerDrops > 0n) transactions.push(leg(p.organizerAddress, split.organizerDrops, `split_organizer_${p.organizerFeeBps}bps`));
  if (split.treasuryDrops > 0n) transactions.push(leg(p.treasuryAddress, split.treasuryDrops, `split_treasury_${split.treasuryShareBps}bps`));
  return { split, transactions };
}
