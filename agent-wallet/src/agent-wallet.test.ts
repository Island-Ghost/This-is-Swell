import { describe, it, expect, beforeEach } from "vitest";
import { Wallet, type Client, type SubmittableTransaction } from "xrpl";
import {
  evaluatePolicy, DEFAULT_POLICY, type SpendingPolicy,
  IntentStore, ExternalSigner, redactSecrets,
  executeTransaction, quoteTransaction, reconcilePending, type CeremonyContext,
  buildXrpPayment, buildSplitPayments, formatXrplTransactionPreview,
  payForResource, parseChallenge, classifyResult,
} from "./index.js";

// --- Test doubles -------------------------------------------------------------------------------

const agent = Wallet.fromSeed("sEdTM1uX8pu2do5XvTnutH6HsouMaM2"); // well-known xrpl.js docs test seed, testnet only
const DEST = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

type MockBehaviour = {
  submitResult?: string;
  submitThrows?: string;
  txLookup?: Record<string, { validated: boolean; code: string; ledger: number }>;
};

function mockClient(b: MockBehaviour = {}) {
  const calls: string[] = [];
  const client = {
    calls,
    isConnected: () => true,
    connect: async () => {},
    disconnect: async () => {},
    getLedgerIndex: async () => 1_000_000,
    autofill: async (tx: SubmittableTransaction) => ({ ...tx, Fee: "12", Sequence: 42, LastLedgerSequence: 1_000_020 }),
    submitAndWait: async (_blob: string) => {
      calls.push("submitAndWait");
      if (b.submitThrows) throw new Error(b.submitThrows);
      return { result: { ledger_index: 1_000_005, meta: { TransactionResult: b.submitResult ?? "tesSUCCESS", delivered_amount: "1000000" } } };
    },
    request: async (req: { command: string; transaction?: string }) => {
      calls.push(req.command);
      if (req.command === "simulate") return { result: { engine_result: "tesSUCCESS", engine_result_message: "ok" } };
      if (req.command === "tx") {
        const t = b.txLookup?.[req.transaction!];
        if (!t) throw Object.assign(new Error("txnNotFound"), { data: { error: "txnNotFound" } });
        return { result: { validated: t.validated, ledger_index: t.ledger, meta: { TransactionResult: t.code } } };
      }
      throw new Error(`unmocked ${req.command}`);
    },
  };
  return client as unknown as Client & { calls: string[] };
}

const signer = new ExternalSigner(agent.classicAddress, async (tx) => {
  const { tx_blob, hash } = agent.sign(tx);
  return { tx_blob, hash };
});

function ctx(over: Partial<CeremonyContext> & { behaviour?: MockBehaviour } = {}): CeremonyContext & { client: Client & { calls: string[] } } {
  const { behaviour, ...rest } = over;
  return {
    client: mockClient(behaviour),
    signer,
    policy: { ...DEFAULT_POLICY },
    store: new IntentStore(":memory:"),
    network: "testnet",
    source: "test",
    ...rest,
  } as CeremonyContext & { client: Client & { calls: string[] } };
}

const payment = (drops: bigint, dest = DEST) => buildXrpPayment({ account: agent.classicAddress, destination: dest, amountDrops: drops, memo: { app: "test", action: "t" } });
const emptyWindow = { spentLast24h: { XRP: 0n, RLUSD: 0n }, txLastHour: 0 };

// --- Policy engine -------------------------------------------------------------------------------

describe("PolicyEngine", () => {
  const policy: SpendingPolicy = { ...DEFAULT_POLICY, maxPerTxDrops: "5000000", maxPerDayDrops: "10000000", maxTxPerHour: 3 };

  it("allows an in-policy payment", () => {
    const d = evaluatePolicy(policy, payment(1_000_000n), emptyWindow, "testnet");
    expect(d).toEqual({ allowed: true, requiresHuman: false, denied: false, reasons: [] });
  });

  it("escalates (not denies) when the per-tx cap is exceeded", () => {
    const d = evaluatePolicy(policy, payment(5_000_001n), emptyWindow, "testnet");
    expect(d.requiresHuman).toBe(true);
    expect(d.denied).toBe(false);
    expect(d.reasons[0]).toMatch(/maxPerTxDrops/);
  });

  it("escalates when the 24h window would be exceeded", () => {
    const d = evaluatePolicy(policy, payment(2_000_000n), { ...emptyWindow, spentLast24h: { XRP: 9_000_000n, RLUSD: 0n } }, "testnet");
    expect(d.requiresHuman).toBe(true);
    expect(d.reasons[0]).toMatch(/maxPerDayDrops/);
  });

  it("escalates at the hourly tx rate limit", () => {
    const d = evaluatePolicy(policy, payment(1n), { ...emptyWindow, txLastHour: 3 }, "testnet");
    expect(d.requiresHuman).toBe(true);
  });

  it("hard-denies wrong network, expired policy, disallowed type, allowlist miss", () => {
    expect(evaluatePolicy(policy, payment(1n), emptyWindow, "mainnet").denied).toBe(true);
    expect(evaluatePolicy({ ...policy, expiresAt: "2020-01-01T00:00:00Z" }, payment(1n), emptyWindow, "testnet").denied).toBe(true);
    expect(evaluatePolicy({ ...policy, allowedTxTypes: ["TrustSet"] }, payment(1n), emptyWindow, "testnet").denied).toBe(true);
    expect(evaluatePolicy({ ...policy, destinationAllowlist: ["rOther"] }, payment(1n), emptyWindow, "testnet").denied).toBe(true);
    expect(evaluatePolicy({ ...policy, destinationAllowlist: [DEST] }, payment(1n), emptyWindow, "testnet").allowed).toBe(true);
  });

  it("hard-denies unknown IOU assets and respects RLUSD caps", () => {
    const iou = { ...payment(0n), Amount: { currency: "USD", issuer: DEST, value: "1" } } as SubmittableTransaction;
    expect(evaluatePolicy(policy, iou, emptyWindow, "testnet").denied).toBe(true);
    const rl = { ...payment(0n), Amount: { currency: "524C555344000000000000000000000000000000", issuer: DEST, value: "10.000001" } } as SubmittableTransaction;
    expect(evaluatePolicy({ ...policy, maxPerTxRlusd: "10" }, rl, emptyWindow, "testnet").requiresHuman).toBe(true);
  });
});

// --- Store -----------------------------------------------------------------------------------------

describe("IntentStore", () => {
  let store: IntentStore;
  beforeEach(() => { store = new IntentStore(":memory:"); });

  it("counts only committed statuses in the spend window", () => {
    const mk = (status: Parameters<IntentStore["createIntent"]>[0]["status"], amount: bigint) =>
      store.createIntent({ network: "testnet", account: "rA", txType: "Payment", asset: "XRP", amount, status, policyDecision: {}, preview: "", source: "t" });
    mk("validated", 100n); mk("signed", 50n); mk("denied", 1_000n); mk("quoted", 1_000n); mk("needs_approval", 1_000n);
    const w = store.spendWindow("rA");
    expect(w.spentLast24h.XRP).toBe(150n);
    expect(w.txLastHour).toBe(2);
  });

  it("replay guard consumes a receipt exactly once", () => {
    expect(store.consumeReceipt("h1", "svc")).toBe(true);
    expect(store.consumeReceipt("h1", "svc")).toBe(false);
    expect(store.hasReceipt("h1")).toBe(true);
  });
});

// --- Ceremony -------------------------------------------------------------------------------------

describe("Signing ceremony", () => {
  it("autonomous mode: signs an allowed tx, persists the hash before submit, finalizes validated", async () => {
    const c = ctx();
    const store = c.store;
    const origSubmit = c.client.submitAndWait.bind(c.client);
    let hashAtSubmitTime: string | null | undefined;
    (c.client as { submitAndWait: Client["submitAndWait"] }).submitAndWait = (async (blob: string) => {
      hashAtSubmitTime = store.pending()[0]?.hash;
      return origSubmit(blob);
    }) as Client["submitAndWait"];

    const r = await executeTransaction(c, payment(1_000_000n));
    expect(r.status).toBe("validated");
    expect(r.hash).toHaveLength(64);
    expect(hashAtSubmitTime).toBe(r.hash);
    expect(r.preview).toContain("[auto-signed under policy");
    expect(r.prepared.SourceTag).toBe(20260530);
    const intent = store.get(r.intentId)!;
    expect(intent.status).toBe("validated");
    expect(intent.resultCode).toBe("tesSUCCESS");
    expect(intent.ledgerIndex).toBe(1_000_005);
  });

  it("autonomous mode: over-cap tx returns needs_approval without signing", async () => {
    const c = ctx();
    const r = await executeTransaction(c, payment(50_000_000n));
    expect(r.status).toBe("needs_approval");
    expect(r.hash).toBeUndefined();
    expect(c.client.calls).not.toContain("submitAndWait");
    expect(c.store.get(r.intentId)!.status).toBe("needs_approval");
  });

  it("hard violation is denied even when a human would say yes", async () => {
    const c = ctx({ network: "mainnet", confirm: async () => true });
    const r = await executeTransaction(c, payment(1n));
    expect(r.status).toBe("denied");
    expect(c.client.calls).not.toContain("submitAndWait");
  });

  it("interactive mode: human approval lets a soft-cap tx through; refusal stops it", async () => {
    const yes = ctx({ confirm: async () => true });
    expect((await executeTransaction(yes, payment(50_000_000n))).status).toBe("validated");
    const no = ctx({ confirm: async () => false });
    const r = await executeTransaction(no, payment(1n));
    expect(r.status).toBe("rejected_by_human");
    expect(no.client.calls).not.toContain("submitAndWait");
  });

  it("refuses to sign for a different account", async () => {
    const c = ctx();
    await expect(executeTransaction(c, { ...payment(1n), Account: DEST })).rejects.toThrow(/does not match the agent wallet/);
  });

  it("tec result is recorded as failed with fee charged; no resubmit", async () => {
    const c = ctx({ behaviour: { submitResult: "tecNO_DST" } });
    const r = await executeTransaction(c, payment(1n));
    expect(r.status).toBe("failed");
    expect(classifyResult(r.resultCode).feeCharged).toBe(true);
    expect(c.client.calls.filter((x) => x === "submitAndWait")).toHaveLength(1);
  });

  it("submitAndWait throwing leaves intent as unknown with hash for reconciliation", async () => {
    const c = ctx({ behaviour: { submitThrows: "Timeout waiting for validation" } });
    const r = await executeTransaction(c, payment(1n));
    expect(r.status).toBe("unknown");
    expect(r.hash).toBeDefined();
    expect(c.store.get(r.intentId)!.status).toBe("unknown");
  });

  it("reconcile resolves a signed-but-crashed intent from the ledger", async () => {
    const c = ctx();
    const id = c.store.createIntent({ network: "testnet", account: agent.classicAddress, txType: "Payment", asset: "XRP", amount: 1n, status: "quoted", policyDecision: {}, preview: "", source: "t" });
    c.store.markSigned(id, "ABC123");
    const c2 = ctx({ behaviour: { txLookup: { ABC123: { validated: true, code: "tesSUCCESS", ledger: 7 } } } });
    (c2 as { store: IntentStore }).store = c.store;
    const out = await reconcilePending(c2);
    expect(out[0].outcome).toBe("tesSUCCESS");
    expect(c.store.get(id)!.status).toBe("validated");
  });

  it("quote records an intent and never submits", async () => {
    const c = ctx();
    const q = await quoteTransaction(c, payment(1n));
    expect(q.simulation.ok).toBe(true);
    expect(q.decision.allowed).toBe(true);
    expect(c.client.calls).toContain("simulate");
    expect(c.client.calls).not.toContain("submitAndWait");
    expect(c.store.get(q.intentId)!.status).toBe("quoted");
  });
});

// --- Preview / builders / redaction ----------------------------------------------------------------

describe("Preview and builders", () => {
  it("renders full addresses, decoded amount, memo and expiry; flags high fee", () => {
    const tx = { ...payment(12_500_000n), Fee: "5000", Sequence: 1, LastLedgerSequence: 1_000_020 } as SubmittableTransaction;
    const p = formatXrplTransactionPreview(tx, "testnet", { currentLedger: 1_000_000 });
    expect(p).toContain(`From              : ${agent.classicAddress}`);
    expect(p).toContain("12.5 XRP (12500000 drops)");
    expect(p).toContain("expires in ~20 ledgers, ~80s");
    expect(p).toContain("⚠ fee");
    expect(p).toContain('"action":"t"');
  });

  it("split legs sum exactly to the total", () => {
    const { split, transactions } = buildSplitPayments({ account: agent.classicAddress, platformAddress: "rP", organizerAddress: "rO", treasuryAddress: "rT", totalDrops: 20_000_001n, organizerFeeBps: 2500 });
    const sum = transactions.reduce((s, t) => s + BigInt(t.Amount as string), 0n);
    expect(sum).toBe(20_000_001n);
    expect(split.platformDrops + split.organizerDrops + split.treasuryDrops).toBe(20_000_001n);
  });

  it("redacts seeds and key fields", () => {
    const out = redactSecrets({ seed: "sEdTM1uX8pu2do5XvTnutH6HsouMaM2", msg: "wallet sEdTM1uX8pu2do5XvTnutH6HsouMaM2 failed", address: DEST });
    expect(out.seed).toBe("[REDACTED]");
    expect(out.msg).toBe("wallet [REDACTED_SEED] failed");
    expect(out.address).toBe(DEST);
  });
});

// --- x402 payer -----------------------------------------------------------------------------------

describe("x402 payer", () => {
  const challengeBody = {
    paymentRequired: {
      protocol: "dual-402", serviceId: "svc1", description: "thing",
      xrpl: { network: "xrpl:1", asset: "XRP", priceDrops: "4000000", payToAddress: DEST, sourceTag: 20260601 },
    },
  };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  it("parses both the gateway and generic accepts[] shapes", () => {
    expect(parseChallenge(challengeBody, new Headers())?.amountDrops).toBe(4_000_000n);
    const generic = { accepts: [{ scheme: "exact", network: "xrpl:1", maxAmountRequired: "1000", payTo: DEST, asset: "XRP", extra: { sourceTag: 7 } }] };
    const c = parseChallenge(generic, new Headers());
    expect(c?.network).toBe("testnet");
    expect(c?.sourceTag).toBe(7);
  });

  it("pays a 402 challenge and retries with the tx hash; merchant SourceTag is preserved", async () => {
    const seen: Record<string, string>[] = [];
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      const h = Object.fromEntries(new Headers(init?.headers).entries());
      seen.push(h);
      return h["x-payment"] ? json(200, { secret: "resource" }) : json(402, challengeBody);
    }) as typeof fetch;
    const c = ctx();
    const r = await payForResource(c, "http://merchant/api", { fetchImpl });
    expect(r.status).toBe("ok");
    expect(r.body).toEqual({ secret: "resource" });
    expect(seen[1]["x-payment"]).toBe(r.payment!.hash);
    expect(r.payment!.prepared.SourceTag).toBe(20260601);
    expect((r.payment!.prepared as { Destination: string }).Destination).toBe(DEST);
  });

  it("refuses a challenge above the caller ceiling or on another network, and escalates over-policy prices", async () => {
    const fetchImpl = (async () => json(402, challengeBody)) as typeof fetch;
    expect((await payForResource(ctx(), "u", { fetchImpl, maxPriceDrops: 1_000n })).status).toBe("challenge_rejected");
    expect((await payForResource(ctx({ network: "mainnet", policy: { ...DEFAULT_POLICY, network: "mainnet" } }), "u", { fetchImpl })).status).toBe("challenge_rejected");
    const strict = ctx({ policy: { ...DEFAULT_POLICY, maxPerTxDrops: "1000" } });
    const r = await payForResource(strict, "u", { fetchImpl });
    expect(r.status).toBe("needs_approval");
    expect(strict.client.calls).not.toContain("submitAndWait");
  });
});
