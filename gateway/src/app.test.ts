import { describe, it, expect } from "vitest";
import { createApp, PAYER_ADDRESS_HEADER } from "./app.js";
import { GatewayStore } from "./store.js";
import { StaticPaymentVerifier, checkTxResponse } from "./payment-verifier.js";
import { computeShadowLabzSplit } from "@swell/shared";

const PLATFORM = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const PAYER = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
const ADMIN = "test-admin-token";
const HASH_A = "A".repeat(64);
const HASH_B = "B".repeat(64);
const HASH_C = "C".repeat(64);
const HASH_D = "D".repeat(64);

function build(over: Parameters<typeof createApp>[0] = {}) {
  const verifier = new StaticPaymentVerifier("testnet");
  const app = createApp({ store: new GatewayStore(":memory:"), verifier, adminToken: ADMIN, ...over });
  return { app, verifier };
}
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const admin = { Authorization: `Bearer ${ADMIN}` };

describe("Gateway status & plans", () => {
  it("serves /api/agility-core/status honestly about what is live", async () => {
    const { app } = build();
    const res = await app.request("/api/agility-core/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.agilityCoreExecutionLayer.paymentMode).toBe("xrpl");
    expect(body.connectedNetworks.find((n: any) => n.chain === "XRP Ledger").status).toBe("verifying-payments");
    expect(body.connectedNetworks.find((n: any) => n.chain === "Cardano").status).toBe("planned");
  });

  it("computes the exact 3-way split without rounding loss", () => {
    const split = computeShadowLabzSplit(20_000_000n, 2500);
    expect(split.platformDrops + split.organizerDrops + split.treasuryDrops).toBe(split.totalDrops);
    expect([split.platformDrops, split.organizerDrops, split.treasuryDrops]).toEqual([1_000_000n, 5_000_000n, 14_000_000n]);
  });
});

describe("HTTP 402 plan purchase with real-ledger verification", () => {
  it("KYC optional: challenge → pay with validated tx hash → settled; replay and short payments rejected", async () => {
    const { app, verifier } = build();

    const challenge = await app.request("/api/x402/plan/starter", { headers: { [PAYER_ADDRESS_HEADER]: PAYER } });
    expect(challenge.status).toBe(402);
    const ch = (await challenge.json()) as any;
    expect(ch.paymentRequired.xrpl.priceDrops).toBe("4000000");
    expect(ch.paymentRequired.xrpl.payToAddress).toBe(PLATFORM);
    expect(ch.paymentProof).toMatch(/tx hash/);
    expect(ch.unsignedXrplTx.Account).toBe(PAYER);
    expect(ch.walletCeremonyPreview).toContain("XRPL Transaction Preview");

    // unknown hash → not verified
    const bogus = await app.request("/api/x402/plan/starter", { headers: { "X-Payment": HASH_D } });
    expect(bogus.status).toBe(402);
    expect(((await bogus.json()) as any).error).toMatch(/payment-not-verified/);

    // underpaid
    verifier.accept(HASH_B, { payer: PAYER, deliveredDrops: 3_999_999n });
    const short = await app.request("/api/x402/plan/starter", { headers: { "X-Payment": HASH_B } });
    expect(short.status).toBe(402);

    // exact payment, payer learned from the ledger
    verifier.accept(HASH_A, { payer: PAYER, deliveredDrops: 4_000_000n, ledgerIndex: 123 });
    const paid = await app.request("/api/x402/plan/starter", { headers: { "X-Payment": HASH_A } });
    expect(paid.status).toBe(200);
    const body = (await paid.json()) as any;
    expect(body.status).toBe("settled");
    expect(body.subscriberXrplAddress).toBe(PAYER);
    expect(body.verification).toBe("xrpl-ledger");
    expect(body.receiptHash).toBe(HASH_A);

    // replay
    const replay = await app.request("/api/x402/plan/starter", { headers: { "X-Payment": HASH_A } });
    expect(replay.status).toBe(402);
    expect(((await replay.json()) as any).error).toBe("receipt-already-used");
  });

  it("requireKyc=true demands a verified, unrevoked nullifier of sufficient tier", async () => {
    const { app } = build({ requireKyc: true });
    expect((await app.request("/api/x402/plan/starter")).status).toBe(403);

    const kyc = await app.request("/api/kyc/verify", json({ userSecret: "member-001", xrplAddress: PAYER, tier: 1 }));
    const { kycToken } = (await kyc.json()) as any;
    expect(kycToken).toHaveLength(64);
    expect((await app.request("/api/x402/plan/starter", { headers: { "X-Midnight-Kyc": kycToken } })).status).toBe(402);
    // Growth needs tier 2
    expect((await app.request("/api/x402/plan/growth", { headers: { "X-Midnight-Kyc": kycToken } })).status).toBe(403);

    await app.request("/api/admin/kyc/revoke", json({ kycNullifier: kycToken, revoke: true }, admin));
    expect((await app.request("/api/x402/plan/starter", { headers: { "X-Midnight-Kyc": kycToken } })).status).toBe(403);
  });

  it("m402-mock mode keeps the hashed-secret demo path with replay guard", async () => {
    const { app } = build({ paymentMode: "m402-mock" });
    const secret = "01".repeat(32);
    expect((await app.request("/api/x402/plan/starter", { headers: { "X-Payment": secret } })).status).toBe(200);
    expect((await app.request("/api/x402/plan/starter", { headers: { "X-Payment": secret } })).status).toBe(402);
  });
});

describe("DAO membership split: quote then settle each leg against the ledger", () => {
  const dao = { monthlyPriceUsd: 25, organizerFeePercent: 20, organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH", daoTreasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv" };

  it("checkout returns unsigned legs and is not recorded as a settlement", async () => {
    const { app } = build();
    const res = await app.request("/api/dao/nightshade-collective/membership/checkout", json(dao, { [PAYER_ADDRESS_HEADER]: PAYER }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.settled).toBe(false);
    expect(body.transactions).toHaveLength(3);
    expect(body.transactions.every((t: any) => t.Account === PAYER && t.Fee === undefined)).toBe(true);
    const overview = (await (await app.request("/api/admin/overview", { headers: admin })).json()) as any;
    expect(overview.settlementLedger.filter((e: any) => e.kind === "DAO 3-Way Split" && e.verification !== "admin-simulated")).toHaveLength(0);
  });

  it("settle verifies every leg to the right destination and credits the DAO treasury", async () => {
    const { app, verifier } = build();
    const split = computeShadowLabzSplit(10_000_000n, 2000); // $25 → 10 XRP
    verifier.accept(HASH_A, { payer: PAYER, deliveredDrops: split.platformDrops });
    verifier.accept(HASH_B, { payer: PAYER, deliveredDrops: split.organizerDrops });
    // wrong amount on treasury leg first
    verifier.accept(HASH_C, { payer: PAYER, deliveredDrops: split.treasuryDrops - 1n });
    const bad = await app.request("/api/dao/nightshade-collective/membership/settle", json({ ...dao, txHashes: [HASH_A, HASH_B, HASH_C] }));
    expect(bad.status).toBe(402);
    expect(((await bad.json()) as any).error).toMatch(/leg 2/);

    verifier.accept(HASH_D, { payer: PAYER, deliveredDrops: split.treasuryDrops });
    // HASH_A/B were consumed by the failed attempt? No — legs are consumed only as they verify, so A and B are now spent.
    const replayed = await app.request("/api/dao/nightshade-collective/membership/settle", json({ ...dao, txHashes: [HASH_A, HASH_B, HASH_D] }));
    expect(replayed.status).toBe(402);
    expect(((await replayed.json()) as any).error).toMatch(/receipt-already-used/);

    const { app: app2, verifier: v2 } = build();
    v2.accept(HASH_A, { payer: PAYER, deliveredDrops: split.platformDrops });
    v2.accept(HASH_B, { payer: PAYER, deliveredDrops: split.organizerDrops });
    v2.accept(HASH_D, { payer: PAYER, deliveredDrops: split.treasuryDrops });
    const before = (await (await app2.request("/api/admin/overview", { headers: admin })).json()) as any;
    const ok = await app2.request("/api/dao/nightshade-collective/membership/settle", json({ ...dao, txHashes: [HASH_A, HASH_B, HASH_D] }));
    expect(ok.status).toBe(200);
    const entry = ((await ok.json()) as any).entry;
    expect(entry.txHashes).toEqual([HASH_A, HASH_B, HASH_D]);
    expect(entry.payerAddress).toBe(PAYER);
    const after = (await (await app2.request("/api/admin/overview", { headers: admin })).json()) as any;
    const d0 = before.daos.find((d: any) => d.id === "nightshade-collective"), d1 = after.daos.find((d: any) => d.id === "nightshade-collective");
    expect(BigInt(d1.treasuryAccruedDrops) - BigInt(d0.treasuryAccruedDrops)).toBe(split.treasuryDrops);
  });

  it("crowdfund escrow returns an EscrowCreate for the contributor", async () => {
    const { app } = build();
    const res = await app.request("/api/dao/nightshade-collective/crowdfund/escrow", json({ daoTreasuryXrplAddress: dao.daoTreasuryXrplAddress, contributionUsd: 100, goalUsd: 4500, durationDays: 14 }, { [PAYER_ADDRESS_HEADER]: PAYER }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.midnightEscrowId).toHaveLength(64);
    expect(body.xrplEscrowTx.TransactionType).toBe("EscrowCreate");
    expect(body.xrplEscrowTx.Account).toBe(PAYER);
  });
});

describe("Admin API", () => {
  it("is refused without the bearer token and disabled entirely when none is configured", async () => {
    const { app } = build();
    expect((await app.request("/api/admin/overview")).status).toBe(401);
    expect((await app.request("/api/admin/overview", { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
    expect((await app.request("/admin")).status).toBe(200); // HTML shell is public; it prompts for the token
    const { app: noToken } = build({ adminToken: undefined });
    expect((await noToken.request("/api/admin/overview")).status).toBe(503);
  });

  it("issues/revokes KYC, creates DAOs, releases escrows, and persists across app instances on the same store", async () => {
    const store = new GatewayStore(":memory:");
    const { app } = build({ store });
    const issue = await app.request("/api/admin/kyc/issue", json({ label: "Treasurer", xrplAddress: PAYER, userSecret: "treasurer-999", tier: 3 }, admin));
    expect(issue.status).toBe(200);
    const nul = ((await issue.json()) as any).record.kycNullifierHex;
    expect((await app.request("/api/admin/dao/create", json({ id: "agility-governance-dao", name: "Agility Governance DAO", joinPolicy: "zk-kyc-gated", monthlyPriceUsd: 100, organizerFeePercent: 15, organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH", treasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv" }, admin))).status).toBe(200);
    expect((await app.request("/api/admin/dao/create", json({ id: "bad", name: "x", joinPolicy: "", monthlyPriceUsd: 1, organizerFeePercent: 1, organizerXrplAddress: "not-an-address", treasuryXrplAddress: PAYER }, admin))).status).toBe(400);

    const app2 = createApp({ store, verifier: new StaticPaymentVerifier(), adminToken: ADMIN });
    const overview = (await (await app2.request("/api/admin/overview", { headers: admin })).json()) as any;
    expect(overview.daos.some((d: any) => d.id === "agility-governance-dao")).toBe(true);
    expect(overview.kycRegistry.some((k: any) => k.kycNullifierHex === nul)).toBe(true);

    const escrowId = overview.escrows[0].escrowId;
    const rel = await app2.request(`/api/admin/escrow/${escrowId}/release`, { method: "POST", headers: admin });
    expect(((await rel.json()) as any).escrow.status).toBe("Released");
  });
});

describe("checkTxResponse (ledger response → verdict)", () => {
  const base = { validated: true, ledger_index: 100, tx_json: { TransactionType: "Payment", Account: PAYER, Destination: PLATFORM, Amount: "4000000", SourceTag: 20260601 }, meta: { TransactionResult: "tesSUCCESS", delivered_amount: "4000000" } };
  const exp = { destination: PLATFORM, minDrops: 4_000_000n };
  it("accepts a validated exact payment and reads delivered_amount, not Amount", () => {
    const r = checkTxResponse({ ...base, tx_json: { ...base.tx_json, Amount: "999999999" } }, exp);
    expect(r.ok && r.deliveredDrops === 4_000_000n && r.payer === PAYER).toBe(true);
  });
  it("rejects unvalidated, failed, wrong-type, wrong-destination, IOU, stale, and wrong-tag payments", () => {
    expect(checkTxResponse({ ...base, validated: false }, exp).ok).toBe(false);
    expect(checkTxResponse({ ...base, meta: { ...base.meta, TransactionResult: "tecPATH_DRY" } }, exp).ok).toBe(false);
    expect(checkTxResponse({ ...base, tx_json: { ...base.tx_json, TransactionType: "OfferCreate" } }, exp).ok).toBe(false);
    expect(checkTxResponse({ ...base, tx_json: { ...base.tx_json, Destination: PAYER } }, exp).ok).toBe(false);
    expect(checkTxResponse({ ...base, meta: { ...base.meta, delivered_amount: { currency: "USD", issuer: PAYER, value: "4" } } }, exp).ok).toBe(false);
    expect(checkTxResponse(base, { ...exp, maxAgeLedgers: 10 }, 200).ok).toBe(false);
    expect(checkTxResponse(base, { ...exp, sourceTag: 1 }).ok).toBe(false);
    expect(checkTxResponse(base, { ...exp, sourceTag: 20260601 }).ok).toBe(true);
  });
});
