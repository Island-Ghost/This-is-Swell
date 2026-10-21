import type { Client, SubmittableTransaction } from "xrpl";
import { dropsToXrp, parseAccountRootFlags } from "xrpl";
import type { XrplNetwork } from "./policy.js";

export const WS_URLS: Record<XrplNetwork, string> = {
  testnet: "wss://s.altnet.rippletest.net:51233",
  mainnet: "wss://xrplcluster.com",
};

export const BASE_RESERVE_DROPS = 1_000_000n;
export const OWNER_RESERVE_DROPS = 200_000n;

export type AccountState = {
  address: string;
  exists: boolean;
  balanceDrops: bigint;
  balanceXrp: number;
  ownerCount: number;
  reserveDrops: bigint;
  spendableDrops: bigint;
  spendableXrp: number;
  sequence: number | null;
  requireDestTag: boolean;
  ledgerIndex: number | null;
};

export async function getAccountState(client: Client, address: string): Promise<AccountState> {
  try {
    const res = await client.request({ command: "account_info", account: address, ledger_index: "validated" });
    const root = res.result.account_data;
    const balance = BigInt(root.Balance);
    const ownerCount = root.OwnerCount;
    const reserve = BASE_RESERVE_DROPS + BigInt(ownerCount) * OWNER_RESERVE_DROPS;
    const spendable = balance > reserve ? balance - reserve : 0n;
    return {
      address,
      exists: true,
      balanceDrops: balance,
      balanceXrp: Number(dropsToXrp(root.Balance)),
      ownerCount,
      reserveDrops: reserve,
      spendableDrops: spendable,
      spendableXrp: Number(spendable) / 1_000_000,
      sequence: root.Sequence,
      requireDestTag: !!parseAccountRootFlags(root.Flags ?? 0).lsfRequireDestTag,
      ledgerIndex: res.result.ledger_index ?? null,
    };
  } catch (err) {
    if ((err as { data?: { error?: string } }).data?.error === "actNotFound") {
      return {
        address,
        exists: false,
        balanceDrops: 0n,
        balanceXrp: 0,
        ownerCount: 0,
        reserveDrops: BASE_RESERVE_DROPS,
        spendableDrops: 0n,
        spendableXrp: 0,
        sequence: null,
        requireDestTag: false,
        ledgerIndex: null,
      };
    }
    throw err;
  }
}

export async function destinationRequiresTag(client: Client, address: string): Promise<boolean> {
  return (await getAccountState(client, address)).requireDestTag;
}

export async function hasTrustLine(client: Client, address: string, currency: string, issuer: string): Promise<boolean> {
  const res = await client.request({ command: "account_lines", account: address, peer: issuer, ledger_index: "validated" });
  return res.result.lines.some((l) => l.currency === currency);
}

export type SimulationResult = {
  ok: boolean;
  engineResult: string;
  engineResultMessage: string;
  deliveredAmount?: unknown;
};

/** Dry-run the transaction against the node before anything is signed. */
export async function simulateTransaction(client: Client, tx: SubmittableTransaction): Promise<SimulationResult> {
  const res = await client.request({ command: "simulate", tx_json: tx as never });
  const r = res.result as { engine_result: string; engine_result_message: string; meta?: { delivered_amount?: unknown } };
  return {
    ok: r.engine_result === "tesSUCCESS",
    engineResult: r.engine_result,
    engineResultMessage: r.engine_result_message,
    deliveredAmount: r.meta?.delivered_amount,
  };
}

export type ResultClass = "success" | "claimed_fee" | "not_applied" | "retry" | "unknown";

/** Maps an XRPL engine result code to what the agent should do about it. */
export function classifyResult(code: string | undefined): { cls: ResultClass; feeCharged: boolean; resubmitSafe: boolean; summary: string } {
  if (!code) return { cls: "unknown", feeCharged: false, resubmitSafe: false, summary: "No result code — check the ledger by hash before doing anything else." };
  if (code === "tesSUCCESS") return { cls: "success", feeCharged: true, resubmitSafe: false, summary: "Validated and applied." };
  if (code.startsWith("tec")) return { cls: "claimed_fee", feeCharged: true, resubmitSafe: false, summary: `Included in a validated ledger but failed (${code}); fee was charged. Do not resubmit.` };
  if (code.startsWith("ter")) return { cls: "retry", feeCharged: false, resubmitSafe: false, summary: `Provisional retry (${code}); may still validate before LastLedgerSequence.` };
  return { cls: "not_applied", feeCharged: false, resubmitSafe: true, summary: `Rejected before ledger inclusion (${code}); nothing charged. Fix the cause before resubmitting.` };
}
