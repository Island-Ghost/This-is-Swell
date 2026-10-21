import type { Client, SubmittableTransaction } from "xrpl";
import { XRPL_AI_STARTER_KIT_SOURCE_TAG } from "@swell/shared";
import { evaluatePolicy, transactionValue, type PolicyDecision, type SpendingPolicy, type XrplNetwork } from "./policy.js";
import type { IntentStore } from "./store.js";
import type { Signer } from "./signer.js";
import { redactSecrets } from "./signer.js";
import { formatXrplTransactionPreview } from "./preview.js";
import { classifyResult, simulateTransaction, type SimulationResult } from "./account.js";

export type ConfirmFn = (preview: string, decision: PolicyDecision) => Promise<boolean>;

export type CeremonyContext = {
  client: Client;
  signer: Signer;
  policy: SpendingPolicy;
  store: IntentStore;
  network: XrplNetwork;
  /** Who initiated this (cli, mcp, x402-payer, gateway) — recorded in the audit trail. */
  source: string;
  /**
   * If provided, the ceremony is interactive: the human is shown the preview and asked on every
   * signature. If omitted, the ceremony is autonomous: only policy-allowed transactions are signed and
   * anything requiring a human comes back as `needs_approval` without signing.
   */
  confirm?: ConfirmFn;
  log?: (line: string) => void;
};

export type ExecuteStatus = "validated" | "failed" | "unknown" | "denied" | "needs_approval" | "rejected_by_human";

export type ExecuteResult = {
  status: ExecuteStatus;
  intentId: number;
  hash?: string;
  resultCode?: string;
  resultSummary?: string;
  ledgerIndex?: number;
  deliveredAmount?: unknown;
  feeDrops?: string;
  preview: string;
  decision: PolicyDecision;
  prepared: SubmittableTransaction;
};

export type QuoteResult = {
  intentId: number;
  preview: string;
  decision: PolicyDecision;
  simulation: SimulationResult | { ok: false; engineResult: "simulate_unavailable"; engineResultMessage: string };
  prepared: SubmittableTransaction;
};

/** Step 1: receive — validate ownership, apply the default SourceTag, never touch semantic fields. */
function receive(tx: SubmittableTransaction, signer: Signer): SubmittableTransaction {
  if (!tx.Account) throw new Error("SubmittableTransaction is missing Account; cannot determine which key should sign it.");
  if (tx.Account !== signer.address) {
    throw new Error(`tx.Account ${tx.Account} does not match the agent wallet ${signer.address}; refusing to sign for another account.`);
  }
  const copy = { ...tx } as SubmittableTransaction;
  if (copy.SourceTag === undefined) copy.SourceTag = XRPL_AI_STARTER_KIT_SOURCE_TAG;
  return copy;
}

async function prepare(ctx: CeremonyContext, tx: SubmittableTransaction) {
  const received = receive(tx, ctx.signer);
  let prepared: SubmittableTransaction;
  try {
    prepared = await ctx.client.autofill(received);
  } catch (err) {
    throw new Error(`autofill failed: ${redactSecrets((err as Error).message)}`);
  }
  const currentLedger = await ctx.client.getLedgerIndex().catch(() => undefined);
  const window = ctx.store.spendWindow(ctx.signer.address);
  const decision = evaluatePolicy(ctx.policy, prepared, window, ctx.network);
  const scope = decision.allowed && !ctx.confirm
    ? `${ctx.policy.network}, ≤${Number(ctx.policy.maxPerTxDrops) / 1e6} XRP/tx, ≤${Number(ctx.policy.maxPerDayDrops) / 1e6} XRP/day`
    : undefined;
  const preview = formatXrplTransactionPreview(prepared, ctx.network, { currentLedger, autoSignScope: scope });
  return { prepared, decision, preview };
}

function recordIntent(ctx: CeremonyContext, prepared: SubmittableTransaction, decision: PolicyDecision, preview: string, status: "quoted" | "denied" | "needs_approval") {
  const value = transactionValue(prepared);
  return ctx.store.createIntent({
    network: ctx.network,
    account: prepared.Account,
    txType: prepared.TransactionType,
    destination: (prepared as { Destination?: string }).Destination,
    asset: value.asset,
    amount: value.amount,
    status,
    policyDecision: decision,
    preview,
    source: ctx.source,
  });
}

/** Dry run: autofill, preview, policy verdict and node simulation. Nothing is signed. */
export async function quoteTransaction(ctx: CeremonyContext, tx: SubmittableTransaction): Promise<QuoteResult> {
  const { prepared, decision, preview } = await prepare(ctx, tx);
  const simulation = await simulateTransaction(ctx.client, prepared).catch((err: Error) => ({
    ok: false as const,
    engineResult: "simulate_unavailable" as const,
    engineResultMessage: redactSecrets(err.message),
  }));
  const intentId = recordIntent(ctx, prepared, decision, preview, "quoted");
  return { intentId, preview, decision, simulation, prepared };
}

/**
 * The six-step signing ceremony from the xrpl-agent-wallet skill:
 * receive → load key → autofill → preview → (policy / human) sign → submitAndWait.
 * The hash is persisted before submission so a crash can be reconciled, never blindly resubmitted.
 */
export async function executeTransaction(ctx: CeremonyContext, tx: SubmittableTransaction): Promise<ExecuteResult> {
  const log = ctx.log ?? (() => {});
  const { prepared, decision, preview } = await prepare(ctx, tx);
  log(preview);

  if (decision.denied) {
    const intentId = recordIntent(ctx, prepared, decision, preview, "denied");
    log(`DENIED by policy: ${decision.reasons.join("; ")}`);
    return { status: "denied", intentId, preview, decision, prepared };
  }

  if (ctx.confirm) {
    const ok = await ctx.confirm(preview, decision);
    if (!ok) {
      const intentId = recordIntent(ctx, prepared, decision, preview, "needs_approval");
      ctx.store.setStatus(intentId, "needs_approval", "rejected by human");
      return { status: "rejected_by_human", intentId, preview, decision, prepared };
    }
  } else if (decision.requiresHuman) {
    const intentId = recordIntent(ctx, prepared, decision, preview, "needs_approval");
    log(`NEEDS APPROVAL: ${decision.reasons.join("; ")}`);
    return { status: "needs_approval", intentId, preview, decision, prepared };
  }

  const intentId = recordIntent(ctx, prepared, decision, preview, "quoted");
  if (decision.requiresHuman) ctx.store.setStatus(intentId, "quoted", `human-approved despite: ${decision.reasons.join("; ")}`);

  const signed = await ctx.signer.sign(prepared);
  ctx.store.markSigned(intentId, signed.hash);
  log(`signed; hash ${signed.hash} persisted (intent #${intentId})`);

  ctx.store.markSubmitted(intentId);
  try {
    const res = await ctx.client.submitAndWait(signed.tx_blob);
    const meta = res.result.meta;
    const code = typeof meta === "object" && meta ? meta.TransactionResult : undefined;
    const delivered = typeof meta === "object" && meta ? meta.delivered_amount : undefined;
    const cls = classifyResult(code);
    const status: ExecuteStatus = cls.cls === "success" ? "validated" : cls.cls === "unknown" ? "unknown" : "failed";
    ctx.store.finalize(intentId, status, code ?? null, res.result.ledger_index ?? null, cls.summary);
    log(`${code} in ledger ${res.result.ledger_index}`);
    return {
      status,
      intentId,
      hash: signed.hash,
      resultCode: code,
      resultSummary: cls.summary,
      ledgerIndex: res.result.ledger_index,
      deliveredAmount: delivered,
      feeDrops: prepared.Fee,
      preview,
      decision,
      prepared,
    };
  } catch (err) {
    const msg = redactSecrets((err as Error).message);
    const cls = classifyResult(extractResultCode(msg));
    const status: ExecuteStatus = cls.cls === "not_applied" ? "failed" : "unknown";
    ctx.store.finalize(intentId, status, extractResultCode(msg) ?? null, null, `submitAndWait: ${msg}`);
    log(`submitAndWait did not return a validated result (${msg}). NOT resubmitting; reconcile hash ${signed.hash}.`);
    return { status, intentId, hash: signed.hash, resultCode: extractResultCode(msg), resultSummary: msg, preview, decision, prepared };
  }
}

function extractResultCode(message: string): string | undefined {
  return message.match(/\b(te[cfmlrs][A-Z_]+)\b/)?.[1];
}

/** Resolve signed/submitted intents against the ledger after a crash. Never resubmits. */
export async function reconcilePending(ctx: Pick<CeremonyContext, "client" | "store">) {
  const results: { intentId: number; hash: string; outcome: string }[] = [];
  for (const intent of ctx.store.pending()) {
    if (!intent.hash) continue;
    try {
      const res = await ctx.client.request({ command: "tx", transaction: intent.hash });
      const r = res.result as { validated?: boolean; ledger_index?: number; meta?: { TransactionResult?: string } | string };
      const code = typeof r.meta === "object" && r.meta ? r.meta.TransactionResult : undefined;
      if (r.validated && code) {
        const cls = classifyResult(code);
        ctx.store.finalize(intent.id, cls.cls === "success" ? "validated" : "failed", code, r.ledger_index ?? null, `reconciled: ${cls.summary}`);
        results.push({ intentId: intent.id, hash: intent.hash, outcome: code });
      } else {
        results.push({ intentId: intent.id, hash: intent.hash, outcome: "found but not yet validated" });
      }
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      if (e.data?.error === "txnNotFound") {
        results.push({ intentId: intent.id, hash: intent.hash, outcome: "txnNotFound (may still be pending or expired)" });
      } else {
        results.push({ intentId: intent.id, hash: intent.hash, outcome: `lookup error: ${redactSecrets(e.message ?? String(err))}` });
      }
    }
  }
  return results;
}
