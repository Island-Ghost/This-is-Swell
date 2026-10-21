import { isValidClassicAddress } from "xrpl";
import { PAYMENT_HEADER } from "@swell/shared";
import type { XrplNetwork } from "./policy.js";
import { buildXrpPayment } from "./builders.js";
import { executeTransaction, type CeremonyContext, type ExecuteResult } from "./ceremony.js";

/** Normalised view of a 402 challenge. Everything here came from a remote server and is untrusted. */
export type PaymentChallenge = {
  payTo: string;
  amountDrops: bigint;
  network: XrplNetwork;
  asset: string;
  sourceTag?: number;
  serviceId?: string;
  description?: string;
  raw: unknown;
};

export type PayForResourceResult = {
  status: "ok" | "no_payment_required" | "payment_denied" | "needs_approval" | "payment_failed" | "challenge_rejected" | "resource_error";
  httpStatus: number;
  body: unknown;
  challenge?: PaymentChallenge;
  payment?: ExecuteResult;
  reason?: string;
};

const CAIP2: Record<string, XrplNetwork> = { "xrpl:1": "testnet", "xrpl:0": "mainnet", testnet: "testnet", mainnet: "mainnet" };

/** Accepts the Swell gateway shape (`paymentRequired.xrpl`) and the generic x402 `accepts[]` shape. */
export function parseChallenge(body: unknown, headers: Headers): PaymentChallenge | undefined {
  let b = body as Record<string, unknown> | undefined;
  const hdr = headers.get("payment-required");
  if (!b && hdr) {
    try { b = JSON.parse(Buffer.from(hdr, "base64").toString("utf8")); } catch { /* ignore */ }
  }
  if (!b || typeof b !== "object") return undefined;

  const pr = (b.paymentRequired as Record<string, unknown> | undefined) ?? b;
  const x = pr?.xrpl as Record<string, unknown> | undefined;
  if (x && typeof x.payToAddress === "string" && typeof x.priceDrops === "string") {
    const network = CAIP2[String(x.network)];
    if (!network) return undefined;
    return {
      payTo: x.payToAddress,
      amountDrops: BigInt(x.priceDrops),
      network,
      asset: String(x.asset ?? "XRP"),
      sourceTag: typeof x.sourceTag === "number" ? x.sourceTag : undefined,
      serviceId: typeof pr.serviceId === "string" ? pr.serviceId : undefined,
      description: typeof pr.description === "string" ? pr.description : undefined,
      raw: body,
    };
  }

  const accepts = b.accepts as Record<string, unknown>[] | undefined;
  const a = accepts?.find((o) => String(o.network).startsWith("xrpl"));
  if (a && typeof a.payTo === "string" && a.maxAmountRequired !== undefined) {
    const network = CAIP2[String(a.network)];
    if (!network) return undefined;
    const extra = (a.extra as Record<string, unknown> | undefined) ?? {};
    return {
      payTo: a.payTo,
      amountDrops: BigInt(String(a.maxAmountRequired)),
      network,
      asset: String(a.asset ?? "XRP"),
      sourceTag: typeof extra.sourceTag === "number" ? extra.sourceTag : undefined,
      description: typeof a.description === "string" ? a.description : undefined,
      raw: body,
    };
  }
  return undefined;
}

export type PayForResourceOptions = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  /** Hard ceiling on what this call may pay regardless of the server's ask or the policy. */
  maxPriceDrops?: bigint;
  fetchImpl?: typeof fetch;
  paymentHeader?: string;
};

/**
 * Autonomous HTTP 402 loop: request → challenge → policy-checked XRPL payment → retry with the
 * validated tx hash as the receipt. The server's declared price/destination never reaches a signed
 * transaction unless it passes the local policy and (optionally) the caller's ceiling.
 */
export async function payForResource(ctx: CeremonyContext, url: string, opts: PayForResourceOptions = {}): Promise<PayForResourceResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const headerName = opts.paymentHeader ?? PAYMENT_HEADER;
  const init: RequestInit = { method: opts.method ?? "GET", headers: { ...opts.headers }, body: opts.body };

  const first = await doFetch(url, init);
  const firstBody = await readBody(first);
  if (first.status !== 402) {
    return { status: first.ok ? "no_payment_required" : "resource_error", httpStatus: first.status, body: firstBody };
  }

  const challenge = parseChallenge(firstBody, first.headers);
  if (!challenge) return { status: "challenge_rejected", httpStatus: 402, body: firstBody, reason: "Unrecognised 402 challenge format" };
  if (!isValidClassicAddress(challenge.payTo)) return { status: "challenge_rejected", httpStatus: 402, body: firstBody, challenge, reason: `Invalid payTo address ${challenge.payTo}` };
  if (challenge.asset !== "XRP") return { status: "challenge_rejected", httpStatus: 402, body: firstBody, challenge, reason: `Only XRP challenges are supported by this payer (got ${challenge.asset})` };
  if (challenge.network !== ctx.network) return { status: "challenge_rejected", httpStatus: 402, body: firstBody, challenge, reason: `Challenge network ${challenge.network} differs from wallet network ${ctx.network}` };
  if (opts.maxPriceDrops !== undefined && challenge.amountDrops > opts.maxPriceDrops) {
    return { status: "challenge_rejected", httpStatus: 402, body: firstBody, challenge, reason: `Price ${challenge.amountDrops} drops exceeds caller ceiling ${opts.maxPriceDrops}` };
  }

  const tx = buildXrpPayment({
    account: ctx.signer.address,
    destination: challenge.payTo,
    amountDrops: challenge.amountDrops,
    sourceTag: challenge.sourceTag,
    memo: { app: "swell/agent", action: "x402_pay", url, service_id: challenge.serviceId },
  });

  const payment = await executeTransaction({ ...ctx, source: `${ctx.source}:x402` }, tx);
  if (payment.status === "denied") return { status: "payment_denied", httpStatus: 402, body: firstBody, challenge, payment, reason: payment.decision.reasons.join("; ") };
  if (payment.status === "needs_approval" || payment.status === "rejected_by_human") return { status: "needs_approval", httpStatus: 402, body: firstBody, challenge, payment, reason: payment.decision.reasons.join("; ") || "human declined" };
  if (payment.status !== "validated" || !payment.hash) return { status: "payment_failed", httpStatus: 402, body: firstBody, challenge, payment, reason: payment.resultSummary };

  const second = await doFetch(url, { ...init, headers: { ...opts.headers, [headerName]: payment.hash, "X-Payment-Network": challenge.network } });
  const secondBody = await readBody(second);
  return { status: second.ok ? "ok" : "resource_error", httpStatus: second.status, body: secondBody, challenge, payment };
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}
