#!/usr/bin/env tsx
/**
 * swell-mcp — exposes the policy-guarded XRPL agent wallet to any MCP-capable LLM agent.
 *
 * There is no human in the loop here, so the ceremony runs in autonomous mode: only transactions
 * fully inside `agent-policy.json` are signed. Anything outside a soft cap comes back as
 * `needs_approval` with the full preview so the agent can hand it to its operator.
 */
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { isValidClassicAddress } from "xrpl";
import {
  AgentWallet, EnvSeedSigner, buildXrpPayment, buildRlusdPayment, toDrops, redactSecrets,
  type IntentStatus,
} from "@swell/agent-wallet";

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2) }],
});
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: redactSecrets(message) }] });

const address = z.string().refine(isValidClassicAddress, "must be a classic XRPL address (r...)");
const xrpAmount = z.union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,6})?$/)]).describe("Amount in XRP (not drops)");

let wallet: AgentWallet | undefined;
async function getWallet() {
  if (!EnvSeedSigner.isConfigured()) throw new Error("XRPL_SEED is not configured for this server. Run `npm run wallet:create` on the host.");
  if (!wallet) wallet = await new AgentWallet({ source: "mcp", log: (l) => console.error(l) }).connect();
  return wallet;
}

const server = new McpServer({ name: "swell-xrpl-agent-wallet", version: "0.1.0" });

server.registerTool("xrpl_get_account", {
  title: "Get agent account",
  description: "Address, network, XRP balance, reserve and spendable balance of the agent wallet, plus current policy headroom.",
  inputSchema: {},
}, async () => {
  try {
    const w = await getWallet();
    return json({ account: await w.account(), network: w.network, signer: w.signer.kind, policy: w.policyStatus() });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_policy_status", {
  title: "Spending policy status",
  description: "Remaining daily budget, hourly rate usage, allowed tx types/assets, destination allowlist and expiry of the agent's spending policy.",
  inputSchema: {},
}, async () => {
  try { return json((await getWallet()).policyStatus()); } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_quote_payment", {
  title: "Quote a payment (dry run)",
  description: "Autofills, simulates against the node and evaluates the spending policy for an XRP or RLUSD payment. Nothing is signed. Use before xrpl_send_payment to know whether it will be allowed.",
  inputSchema: { destination: address, xrp: xrpAmount.optional(), rlusd: z.string().optional(), destinationTag: z.number().int().optional() },
}, async ({ destination, xrp, rlusd, destinationTag }) => {
  try {
    const w = await getWallet();
    if ((xrp === undefined) === (rlusd === undefined)) return fail("Provide exactly one of xrp or rlusd");
    const tx = xrp !== undefined
      ? buildXrpPayment({ account: w.address, destination, amountDrops: toDrops(xrp), destinationTag, memo: { app: "swell/mcp", action: "quote" } })
      : buildRlusdPayment({ account: w.address, destination, value: rlusd!, network: w.network, destinationTag, memo: { app: "swell/mcp", action: "quote" } });
    const q = await w.quote(tx);
    return json({ verdict: q.decision.allowed ? "allowed" : q.decision.denied ? "denied" : "needs_approval", reasons: q.decision.reasons, simulation: q.simulation, preview: q.preview, intentId: q.intentId });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_send_payment", {
  title: "Send XRP or RLUSD",
  description: "Signs and submits a payment through the full ceremony (autofill → preview → policy → sign → submitAndWait). Only executes if inside policy; otherwise returns needs_approval or denied with reasons. Returns the validated tx hash.",
  inputSchema: {
    destination: address,
    xrp: xrpAmount.optional(),
    rlusd: z.string().regex(/^\d+(\.\d+)?$/).optional().describe("RLUSD amount as a decimal string"),
    destinationTag: z.number().int().optional(),
    memo: z.string().max(200).optional().describe("Short human-readable purpose recorded on-chain"),
  },
}, async ({ destination, xrp, rlusd, destinationTag, memo }) => {
  try {
    const w = await getWallet();
    const r = await w.pay({ to: destination, xrp, rlusd, destinationTag, memo: memo ? { app: "swell/mcp", action: "pay", note: memo } : undefined });
    return json({ status: r.status, hash: r.hash, resultCode: r.resultCode, summary: r.resultSummary, ledgerIndex: r.ledgerIndex, deliveredAmount: r.deliveredAmount, reasons: r.decision.reasons, preview: r.preview, intentId: r.intentId });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_pay_for_resource", {
  title: "Pay for an HTTP 402 resource",
  description: "Fetches a URL; if it answers 402 Payment Required with an XRPL challenge, pays it (subject to policy and maxXrp) and retries with the tx hash as X-Payment. Returns the resource body. The server's price and address are treated as untrusted.",
  inputSchema: {
    url: z.string().url(),
    maxXrp: xrpAmount.optional().describe("Hard ceiling for this call regardless of what the server asks"),
    method: z.enum(["GET", "POST"]).optional(),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
  },
}, async ({ url, maxXrp, method, headers, body }) => {
  try {
    const w = await getWallet();
    const r = await w.payForResource(url, { method, headers, body, maxPriceDrops: maxXrp !== undefined ? toDrops(maxXrp) : undefined });
    return json({ status: r.status, httpStatus: r.httpStatus, reason: r.reason, challenge: r.challenge && { ...r.challenge, raw: undefined }, payment: r.payment && { status: r.payment.status, hash: r.payment.hash, resultCode: r.payment.resultCode, reasons: r.payment.decision.reasons }, body: r.body });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_create_escrow", {
  title: "Create time-locked escrow",
  description: "Locks XRP for a destination until finishAfterSeconds from now (optionally cancellable after cancelAfterSeconds). Policy-checked like any payment.",
  inputSchema: { destination: address, xrp: xrpAmount, finishAfterSeconds: z.number().int().positive(), cancelAfterSeconds: z.number().int().positive().optional() },
}, async ({ destination, xrp, finishAfterSeconds, cancelAfterSeconds }) => {
  try {
    const w = await getWallet();
    const now = Math.floor(Date.now() / 1000);
    const r = await w.createEscrow({ to: destination, xrp, finishAfterUnix: now + finishAfterSeconds, cancelAfterUnix: cancelAfterSeconds ? now + cancelAfterSeconds : undefined });
    return json({ status: r.status, hash: r.hash, resultCode: r.resultCode, offerSequence: r.prepared.Sequence, reasons: r.decision.reasons, preview: r.preview });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_finish_escrow", {
  title: "Finish or cancel an escrow",
  description: "Releases (finish) or reclaims (cancel) an escrow identified by its owner and the OfferSequence of the EscrowCreate.",
  inputSchema: { owner: address, offerSequence: z.number().int(), action: z.enum(["finish", "cancel"]).default("finish") },
}, async ({ owner, offerSequence, action }) => {
  try {
    const w = await getWallet();
    const r = action === "finish" ? await w.finishEscrow({ owner, offerSequence }) : await w.cancelEscrow({ owner, offerSequence });
    return json({ status: r.status, hash: r.hash, resultCode: r.resultCode, reasons: r.decision.reasons });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_split_payment", {
  title: "3-way revenue split",
  description: "Pays totalXrp split into 5% platform, organizerFeeBps to organizer, remainder to treasury as separate validated payments. Stops at the first leg that fails.",
  inputSchema: { totalXrp: xrpAmount, platformAddress: address, organizerAddress: address, treasuryAddress: address, organizerFeeBps: z.number().int().min(0).max(9500) },
}, async (args) => {
  try {
    const w = await getWallet();
    const r = await w.split(args);
    return json({ complete: r.complete, split: r.split, legs: r.legs.map((l) => ({ status: l.status, hash: l.hash, resultCode: l.resultCode, destination: (l.prepared as { Destination?: string }).Destination, reasons: l.decision.reasons })) });
  } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_audit_log", {
  title: "Audit log",
  description: "Recent transaction intents (quoted, denied, needs_approval, signed, submitted, validated, failed, unknown) with hashes and policy decisions.",
  inputSchema: { status: z.enum(["quoted", "denied", "needs_approval", "signed", "submitted", "validated", "failed", "unknown"]).optional(), limit: z.number().int().min(1).max(200).default(20) },
}, async ({ status, limit }) => {
  try { return json((await getWallet()).audit({ status: status as IntentStatus | undefined, limit })); } catch (e) { return fail((e as Error).message); }
});

server.registerTool("xrpl_reconcile", {
  title: "Reconcile pending intents",
  description: "Looks up signed/submitted-but-unfinalised intents on the ledger by hash and finalises them. Never resubmits.",
  inputSchema: {},
}, async () => {
  try { return json(await (await getWallet()).reconcile()); } catch (e) { return fail((e as Error).message); }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("swell-mcp ready (stdio). Autonomous mode: policy-allowed transactions only.");

process.on("SIGINT", async () => { await wallet?.close(); process.exit(0); });
