import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { isValidClassicAddress } from "xrpl";
import {
  SHADOWLABZ_PLANS,
  type ShadowLabzPlanTier,
  type PaymentRequired,
  PAYMENT_HEADER,
  KYC_PROOF_HEADER,
  usdToXrpDrops,
  computeShadowLabzSplit,
  XRPL_X402_SHADOWLABZ_SOURCE_TAG,
} from "@swell/shared";
import { type XrplNetwork } from "@swell/agent-wallet";
import {
  verifyMidnightKycForXrpl,
  deriveM402ReceiptHash,
  deriveShadowLabzEscrowId,
  deriveShadowLabzSubscriptionId,
  deriveShadowLabzReputationIds,
  type VerifiedKycProof,
} from "./kyc-verifier.js";
import {
  buildKycVerifiedXrpPayment,
  buildDaoMembershipSplitPayments,
  buildDaoCrowdfundingEscrow,
  formatXrplTransactionPreview,
} from "./xrpl-service.js";
import { renderShadowLabzDemoHtml } from "./demo-ui.js";
import { renderShadowLabzAdminHtml } from "./admin-ui.js";
import { GatewayStore } from "./store.js";
import { StaticPaymentVerifier, XrplPaymentVerifier, type PaymentVerifier } from "./payment-verifier.js";

export const PAYER_ADDRESS_HEADER = "X-Payer-Address";

export type AdminKycRecord = VerifiedKycProof & { label: string; revoked: boolean };

export type ManagedDaoRecord = {
  id: string;
  name: string;
  joinPolicy: string;
  monthlyPriceUsd: number;
  organizerFeePercent: number;
  organizerXrplAddress: string;
  treasuryXrplAddress: string;
  treasuryAccruedDrops: bigint;
};
type StoredDao = Omit<ManagedDaoRecord, "treasuryAccruedDrops"> & { treasuryAccruedDrops: string };

export type ManagedEscrowRecord = {
  escrowId: string;
  daoId: string;
  beneficiaryAddress: string;
  goalDrops: bigint;
  raisedDrops: bigint;
  status: "Active" | "Released" | "Refunded";
};
type StoredEscrow = Omit<ManagedEscrowRecord, "goalDrops" | "raisedDrops"> & { goalDrops: string; raisedDrops: string };

export type SettlementLedgerEntry = {
  id: string;
  timestamp: string;
  kind: "X402 Plan" | "DAO 3-Way Split" | "m402 Private";
  target: string;
  payerAddress: string;
  kycNullifier: string;
  totalDrops: string;
  platformDrops: string;
  organizerDrops: string;
  treasuryDrops: string;
  splitSummary: string;
  txHashes?: string[];
  verification?: "xrpl-ledger" | "m402-mock" | "admin-simulated";
};

export type GatewayOptions = {
  store?: GatewayStore;
  verifier?: PaymentVerifier;
  /** Bearer token for /api/admin/*. Required: without it every admin call is refused. */
  adminToken?: string;
  /** Whether paid endpoints demand a Midnight ZK-KYC header. Default false (XRPL-first). */
  requireKyc?: boolean;
  /** "xrpl": X-Payment is a validated tx hash. "m402-mock": legacy hashed-secret demo mode. */
  paymentMode?: "xrpl" | "m402-mock";
  enforceSourceTag?: boolean;
  network?: XrplNetwork;
  seedDemoData?: boolean;
};

export function gatewayOptionsFromEnv(): GatewayOptions {
  const network: XrplNetwork = process.env.XRPL_NETWORK === "mainnet" ? "mainnet" : "testnet";
  const paymentMode = process.env.PAYMENT_MODE === "m402-mock" ? "m402-mock" : "xrpl";
  return {
    store: new GatewayStore(),
    verifier: paymentMode === "xrpl" ? new XrplPaymentVerifier(network) : new StaticPaymentVerifier(network),
    adminToken: process.env.ADMIN_API_TOKEN,
    requireKyc: process.env.REQUIRE_MIDNIGHT_KYC === "true",
    paymentMode,
    enforceSourceTag: process.env.ENFORCE_SOURCE_TAG === "true",
    network,
    seedDemoData: process.env.SEED_DEMO_DATA !== "false",
  };
}

const xrp = (drops: bigint | string) => (Number(drops) / 1_000_000).toFixed(2);
const reviveDao = (d: StoredDao): ManagedDaoRecord => ({ ...d, treasuryAccruedDrops: BigInt(d.treasuryAccruedDrops) });
const reviveEscrow = (e: StoredEscrow): ManagedEscrowRecord => ({ ...e, goalDrops: BigInt(e.goalDrops), raisedDrops: BigInt(e.raisedDrops) });
const bigToStr = <T extends object>(o: T) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as Record<string, unknown>;

export function createApp(opts: GatewayOptions = {}) {
  const store = opts.store ?? new GatewayStore(":memory:");
  const verifier = opts.verifier ?? new StaticPaymentVerifier(opts.network ?? "testnet");
  const requireKyc = opts.requireKyc ?? false;
  const paymentMode = opts.paymentMode ?? "xrpl";
  const network = opts.network ?? verifier.network;

  const adminConfig = {
    platformXrplAddress: process.env.XRPL_PAY_TO || "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
    facilitatorUrl: process.env.XRPL_FACILITATOR_URL || "https://xrpl-facilitator-testnet.t54.ai",
    sourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
    m402VaultAddress: process.env.M402_VAULT_ADDRESS || "17b4cf15ad768fa0e5090da960e86eaf7cc885f86eb5a6b241e2fd28d98546ae",
    shadowLabzKycAddress: process.env.SHADOWLABZ_KYC_CONTRACT_ADDRESS || "c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc",
    network,
    paymentMode,
    requireKyc,
  };

  const daos = {
    get: (id: string) => { const d = store.getDao<StoredDao>(id); return d && reviveDao(d); },
    all: () => store.allDaos<StoredDao>().map(reviveDao),
    put: (d: ManagedDaoRecord) => store.putDao(d.id, bigToStr(d)),
  };
  const escrows = {
    get: (id: string) => { const e = store.getEscrow<StoredEscrow>(id); return e && reviveEscrow(e); },
    all: () => store.allEscrows<StoredEscrow>().map(reviveEscrow),
    put: (e: ManagedEscrowRecord) => store.putEscrow(e.escrowId, bigToStr(e)),
  };

  if (opts.seedDemoData !== false && store.daoCount() === 0) seedInitialAdminState();

  function seedInitialAdminState() {
    const initialKyc = verifyMidnightKycForXrpl({
      userSecretHexOrSeed: "nightshade-founder-initial-seed",
      xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
      contextId: "shadowlabz:admin:seed",
      tier: 3,
      jurisdictionCode: 840,
      isSanctioned: false,
    });
    if (initialKyc.valid && initialKyc.proof) {
      store.putKyc<AdminKycRecord>(initialKyc.proof.kycNullifierHex, { ...initialKyc.proof, label: "Nightshade Founder (Corporate Tier 3)", revoked: false });
    }
    daos.put({
      id: "nightshade-collective",
      name: "Nightshade Collective",
      joinPolicy: "zk-kyc-gated",
      monthlyPriceUsd: 50,
      organizerFeePercent: 20,
      organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
      treasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
      treasuryAccruedDrops: 15_000_000n,
    });
    const escrowId = deriveShadowLabzEscrowId("nightshade-collective", "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv", 1_800_000_000n);
    escrows.put({ escrowId, daoId: "nightshade-collective", beneficiaryAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv", goalDrops: 1_800_000_000n, raisedDrops: 1_800_000_000n, status: "Active" });
    if (initialKyc.proof) {
      store.addSettlement<SettlementLedgerEntry>({
        id: "tx-seed-1",
        timestamp: new Date().toISOString(),
        kind: "DAO 3-Way Split",
        target: "nightshade-collective",
        payerAddress: initialKyc.proof.xrplAddress,
        kycNullifier: initialKyc.proof.kycNullifierHex,
        totalDrops: "20000000",
        platformDrops: "1000000",
        organizerDrops: "4000000",
        treasuryDrops: "15000000",
        splitSummary: "1.0 XRP (5%) / 4.0 XRP (20%) / 15.0 XRP (75%)",
        verification: "admin-simulated",
      });
    }
  }

  /**
   * Resolves who is paying. With KYC required (or a KYC header present) the record must exist, be
   * unrevoked and meet the tier. Otherwise the payer may self-declare an address via X-Payer-Address;
   * the ledger is the source of truth once a payment hash is verified.
   */
  function resolvePayer(c: Context, minKycTier = 0): { ok: true; kyc?: AdminKycRecord; address?: string } | { ok: false; status: 403; body: Record<string, unknown> } {
    const nul = c.req.header(KYC_PROOF_HEADER);
    if (nul) {
      const rec = store.getKyc<AdminKycRecord>(nul);
      if (!rec) return { ok: false, status: 403, body: { error: "Unknown Midnight ZK KYC nullifier", requiredHeader: KYC_PROOF_HEADER, verifyEndpoint: "/api/kyc/verify" } };
      if (rec.revoked) return { ok: false, status: 403, body: { error: "KYC credential has been revoked by ShadowLabz Admin" } };
      if (rec.tier < minKycTier) return { ok: false, status: 403, body: { error: `Requires KYC tier >= ${minKycTier} (current: ${rec.tier})` } };
      return { ok: true, kyc: rec, address: rec.xrplAddress };
    }
    if (requireKyc) {
      return { ok: false, status: 403, body: { error: "Midnight ZK KYC verification required", requiredHeader: KYC_PROOF_HEADER, minKycTier, verifyEndpoint: "/api/kyc/verify" } };
    }
    const addr = c.req.header(PAYER_ADDRESS_HEADER);
    return { ok: true, address: addr && isValidClassicAddress(addr) ? addr : undefined };
  }

  /** Verifies an X-Payment value for `expectedDrops` to `destination`, consuming it against replay. */
  async function settlePayment(paymentValue: string, serviceId: string, destination: string, expectedDrops: bigint) {
    if (paymentMode === "m402-mock") {
      const receipt = deriveM402ReceiptHash(paymentValue, serviceId);
      if (!store.consumeReceipt(receipt, serviceId)) return { ok: false as const, status: 402 as const, error: "receipt-already-used" };
      return { ok: true as const, receipt, payer: undefined as string | undefined, verification: "m402-mock" as const, deliveredDrops: expectedDrops, ledgerIndex: undefined as number | undefined };
    }
    const v = await verifier.verify(paymentValue, { destination, minDrops: expectedDrops, sourceTag: opts.enforceSourceTag ? adminConfig.sourceTag : undefined });
    if (!v.ok) return { ok: false as const, status: 402 as const, error: `payment-not-verified: ${v.reason}` };
    if (!store.consumeReceipt(paymentValue, serviceId, v.payer)) return { ok: false as const, status: 402 as const, error: "receipt-already-used" };
    return { ok: true as const, receipt: paymentValue.toUpperCase(), payer: v.payer, verification: "xrpl-ledger" as const, deliveredDrops: v.deliveredDrops, ledgerIndex: v.ledgerIndex };
  }

  const app = new Hono();
  app.use("*", cors());

  app.get("/", (c) => c.html(renderShadowLabzAdminHtml()));
  app.get("/admin", (c) => c.html(renderShadowLabzAdminHtml()));
  app.get("/portal", (c) => c.html(renderShadowLabzDemoHtml()));

  app.get("/health", (c) => c.json({ status: "ok", service: "shadowlabz-agility-core", network, paymentMode, requireKyc }));

  app.get("/api/agility-core/status", (c) =>
    c.json({
      agilityCoreExecutionLayer: {
        status: "operational",
        version: "0.2.0",
        compactCompiler: "0.31.1",
        languageVersion: "0.23.0",
        midnightSdk: "4.1.1",
        protocols: ["x402-xrpl", "m402-midnight", "midnight-zk-kyc"],
        paymentMode,
        requireKyc,
        contracts: {
          m402Vault: adminConfig.m402VaultAddress,
          shadowLabzKyc: adminConfig.shadowLabzKycAddress,
          agilityPayment: "compiled:AgilityPayment.compact",
          agilityEscrow: "compiled:AgilityEscrow.compact",
          shadowLabzSubscription: "compiled:ShadowLabzSubscription.compact",
          shadowLabzReputation: "compiled:ShadowLabzReputation.compact",
        },
      },
      connectedNetworks: [
        { chain: "XRP Ledger", networkId: network === "mainnet" ? "xrpl:0" : "xrpl:1", status: "verifying-payments", walletSupport: "Swell Agent Wallet (policy-gated) · Xaman · OWS", rpcUrl: process.env.XRPL_RPC_URL || "https://s.altnet.rippletest.net:51234/", facilitatorUrl: adminConfig.facilitatorUrl },
        { chain: "Midnight", networkId: process.env.MIDNIGHT_NETWORK || "preview", status: requireKyc ? "kyc-required" : "kyc-optional", walletSupport: "Lace (window.midnight)", indexerUrl: process.env.MIDNIGHT_INDEXER_HTTP || "https://indexer.preview.midnight.network/api/v4/graphql" },
        { chain: "Cardano", networkId: "preprod", status: "planned", walletSupport: "CIP-30 (Eternl / Lace)" },
        { chain: "Xahau", networkId: "xahau-testnet", status: "planned", walletSupport: "Xaman (XUMM)" },
      ],
    }),
  );

  // ---------------------------------------------------------------- Admin (bearer-token protected)

  app.use("/api/admin/*", async (c, next) => {
    if (!opts.adminToken) return c.json({ error: "ADMIN_API_TOKEN is not configured on this gateway; admin API disabled" }, 503);
    const auth = c.req.header("Authorization") ?? "";
    if (auth !== `Bearer ${opts.adminToken}`) return c.json({ error: "unauthorized" }, 401);
    await next();
  });

  app.get("/api/admin/overview", (c) => {
    const kycRegistry = store.allKyc<AdminKycRecord>();
    const ledger = store.settlements<SettlementLedgerEntry>();
    let totalVolumeDrops = 0n, platformRevenueDrops = 0n;
    for (const e of ledger) { totalVolumeDrops += BigInt(e.totalDrops); platformRevenueDrops += BigInt(e.platformDrops); }
    return c.json({
      config: adminConfig,
      metrics: {
        totalVolumeDrops: totalVolumeDrops.toString(),
        totalVolumeXrp: xrp(totalVolumeDrops),
        platformRevenueDrops: platformRevenueDrops.toString(),
        platformRevenueXrp: xrp(platformRevenueDrops),
        activeKycCount: kycRegistry.filter((k) => !k.revoked).length,
        revokedKycCount: kycRegistry.filter((k) => k.revoked).length,
      },
      kycRegistry,
      daos: daos.all().map(bigToStr),
      escrows: escrows.all().map(bigToStr),
      settlementLedger: ledger,
    });
  });

  app.post("/api/admin/kyc/issue", async (c) => {
    const body = await c.req.json<{ label?: string; userSecret: string; xrplAddress: string; tier?: number; jurisdictionCode?: number }>();
    const v = verifyMidnightKycForXrpl({ userSecretHexOrSeed: body.userSecret, xrplAddress: body.xrplAddress, contextId: `shadowlabz:admin:issue:${Date.now()}`, tier: body.tier ?? 2, jurisdictionCode: body.jurisdictionCode ?? 840, isSanctioned: false, minRequiredTier: 1 });
    if (!v.valid || !v.proof) return c.json({ issued: false, error: v.reason }, 400);
    const record: AdminKycRecord = { ...v.proof, label: body.label || "ShadowLabz Verified Member", revoked: false };
    store.putKyc(record.kycNullifierHex, record);
    return c.json({ issued: true, circuit: "ShadowLabzKyc.issueKycCredential", merkleTreeInserted: true, record });
  });

  app.post("/api/admin/kyc/revoke", async (c) => {
    const body = await c.req.json<{ kycNullifier: string; revoke: boolean }>();
    const existing = store.getKyc<AdminKycRecord>(body.kycNullifier);
    if (!existing) return c.json({ error: "KYC record not found" }, 404);
    existing.revoked = body.revoke;
    store.putKyc(body.kycNullifier, existing);
    return c.json({ updated: true, record: existing });
  });

  app.post("/api/admin/dao/create", async (c) => {
    const body = await c.req.json<Omit<ManagedDaoRecord, "treasuryAccruedDrops">>();
    for (const a of [body.organizerXrplAddress, body.treasuryXrplAddress]) if (!isValidClassicAddress(a)) return c.json({ error: `invalid XRPL address ${a}` }, 400);
    const record: ManagedDaoRecord = { ...body, organizerFeePercent: Math.min(95, Math.max(0, body.organizerFeePercent)), treasuryAccruedDrops: daos.get(body.id)?.treasuryAccruedDrops ?? 0n };
    daos.put(record);
    return c.json({ saved: true, circuit: "ShadowLabzSubscription.configureDaoSubscriptionSplit", dao: bigToStr(record) });
  });

  app.post("/api/admin/escrow/:escrowId/release", (c) => {
    const escrow = escrows.get(c.req.param("escrowId"));
    if (!escrow) return c.json({ error: "Escrow pool not found" }, 404);
    escrow.status = "Released";
    escrows.put(escrow);
    const dao = daos.get(escrow.daoId);
    if (dao) { dao.treasuryAccruedDrops += escrow.raisedDrops; daos.put(dao); }
    return c.json({ released: true, circuit: "AgilityEscrow.releasePoolToTreasury", escrow: bigToStr(escrow) });
  });

  app.post("/api/admin/config", async (c) => {
    const body = await c.req.json<{ platformXrplAddress?: string; facilitatorUrl?: string; sourceTag?: number }>();
    if (body.platformXrplAddress) {
      if (!isValidClassicAddress(body.platformXrplAddress)) return c.json({ error: "invalid platformXrplAddress" }, 400);
      adminConfig.platformXrplAddress = body.platformXrplAddress;
    }
    if (body.facilitatorUrl) adminConfig.facilitatorUrl = body.facilitatorUrl;
    if (body.sourceTag) adminConfig.sourceTag = body.sourceTag;
    return c.json({ updated: true, config: adminConfig });
  });

  app.post("/api/admin/simulate-settlement", async (c) => {
    const body = await c.req.json<{ type: "plan_x402" | "dao_membership"; tier?: ShadowLabzPlanTier; daoId?: string }>();
    const firstActiveKyc = store.allKyc<AdminKycRecord>().find((k) => !k.revoked);
    const payerAddress = firstActiveKyc?.xrplAddress || "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
    const kycNullifier = firstActiveKyc?.kycNullifierHex || "a".repeat(64);
    let entry: SettlementLedgerEntry;
    if (body.type === "plan_x402") {
      const plan = SHADOWLABZ_PLANS[body.tier || "community"];
      const drops = usdToXrpDrops(plan.monthlyUsd);
      entry = { id: `sim-${Date.now()}`, timestamp: new Date().toISOString(), kind: "X402 Plan", target: `${plan.name} ($${plan.monthlyUsd}/mo)`, payerAddress, kycNullifier, totalDrops: drops.toString(), platformDrops: drops.toString(), organizerDrops: "0", treasuryDrops: "0", splitSummary: `${xrp(drops)} XRP (100% Platform X402)`, verification: "admin-simulated" };
    } else {
      const dao = daos.get(body.daoId || "nightshade-collective") ?? daos.all()[0];
      if (!dao) return c.json({ error: "no DAO configured" }, 404);
      const split = computeShadowLabzSplit(usdToXrpDrops(dao.monthlyPriceUsd), dao.organizerFeePercent * 100);
      dao.treasuryAccruedDrops += split.treasuryDrops;
      daos.put(dao);
      entry = { id: `sim-${Date.now()}`, timestamp: new Date().toISOString(), kind: "DAO 3-Way Split", target: dao.id, payerAddress, kycNullifier, totalDrops: split.totalDrops.toString(), platformDrops: split.platformDrops.toString(), organizerDrops: split.organizerDrops.toString(), treasuryDrops: split.treasuryDrops.toString(), splitSummary: `${xrp(split.platformDrops)} XRP (5%) / ${xrp(split.organizerDrops)} XRP (${dao.organizerFeePercent}%) / ${xrp(split.treasuryDrops)} XRP (${95 - dao.organizerFeePercent}%)`, verification: "admin-simulated" };
    }
    store.addSettlement(entry);
    return c.json({ settled: true, entry });
  });

  // ---------------------------------------------------------------- Public API

  app.get("/api/plans", (c) => {
    const xrpPriceUsd = Number(c.req.query("xrpUsd") || "2.5");
    return c.json({
      plans: Object.values(SHADOWLABZ_PLANS).map((plan) => {
        const drops = usdToXrpDrops(plan.monthlyUsd, xrpPriceUsd);
        return { ...plan, pricing: { usd: plan.monthlyUsd, xrpDrops: drops.toString(), xrpFormatted: `${Number(drops) / 1_000_000} XRP`, rlusd: plan.monthlyUsd.toFixed(2), m402Star: (plan.monthlyUsd * 50_000).toString() } };
      }),
    });
  });

  app.post("/api/kyc/verify", async (c) => {
    const body = await c.req.json<{ userSecret: string; xrplAddress: string; contextId?: string; tier?: number; jurisdictionCode?: number; isSanctioned?: boolean; minRequiredTier?: number }>();
    const v = verifyMidnightKycForXrpl({ userSecretHexOrSeed: body.userSecret, xrplAddress: body.xrplAddress, contextId: body.contextId || "shadowlabz:portal:default", tier: body.tier ?? 1, jurisdictionCode: body.jurisdictionCode ?? 840, isSanctioned: body.isSanctioned ?? false, minRequiredTier: body.minRequiredTier ?? 1 });
    if (!v.valid || !v.proof) return c.json({ verified: false, error: v.reason }, 403);
    store.putKyc<AdminKycRecord>(v.proof.kycNullifierHex, { ...v.proof, label: "Self-Verified Portal User", revoked: false });
    return c.json({ verified: true, kycHeaderName: KYC_PROOF_HEADER, kycToken: v.proof.kycNullifierHex, proof: v.proof });
  });

  /** Dual-rail HTTP 402 for platform plans. Payment proof = validated XRPL tx hash in X-Payment. */
  app.get("/api/x402/plan/:tier", async (c) => {
    const tierParam = c.req.param("tier").toLowerCase() as ShadowLabzPlanTier;
    const plan = SHADOWLABZ_PLANS[tierParam];
    if (!plan) return c.json({ error: `Unknown plan tier: ${tierParam}` }, 404);
    if (plan.monthlyUsd === 0) return c.json({ status: "active", tier: plan.tier, message: "Free tier activated — 1 DAO included." });

    const payer = resolvePayer(c, plan.minKycTier);
    if (!payer.ok) return c.json(payer.body, payer.status);

    const priceDrops = usdToXrpDrops(plan.monthlyUsd);
    const serviceId = deriveShadowLabzSubscriptionId("shadowlabz:service", `plan:${plan.tier}`);
    const paymentValue = c.req.header(PAYMENT_HEADER);

    if (!paymentValue) {
      const paymentRequired: PaymentRequired = {
        protocol: "dual-402",
        serviceId,
        description: `ShadowLabz ${plan.name} Plan ($${plan.monthlyUsd}/month)`,
        xrpl: { network: network === "mainnet" ? "xrpl:0" : "xrpl:1", asset: "XRP", priceDrops: priceDrops.toString(), priceUsd: plan.monthlyUsd, payToAddress: adminConfig.platformXrplAddress, facilitatorUrl: adminConfig.facilitatorUrl, sourceTag: adminConfig.sourceTag },
        midnight: { network: "preview", vaultAddress: adminConfig.m402VaultAddress, kycContractAddress: adminConfig.shadowLabzKycAddress, priceStar: (plan.monthlyUsd * 50_000).toString(), requiresKyc: requireKyc, minKycTier: plan.minKycTier },
      };
      const unsignedXrplTx = payer.address
        ? buildKycVerifiedXrpPayment({ account: payer.address, destination: adminConfig.platformXrplAddress, amountDrops: priceDrops, kycNullifierHex: payer.kyc?.kycNullifierHex ?? "", action: `subscribe_plan_${plan.tier}`, planTier: plan.tier, isX402: true })
        : undefined;
      return c.json({ paymentRequired, paymentHeader: PAYMENT_HEADER, paymentProof: paymentMode === "xrpl" ? "validated XRPL Payment tx hash" : "m402 receipt secret", unsignedXrplTx, walletCeremonyPreview: unsignedXrplTx && formatXrplTransactionPreview(unsignedXrplTx, network) }, 402);
    }

    const settled = await settlePayment(paymentValue, serviceId, adminConfig.platformXrplAddress, priceDrops);
    if (!settled.ok) return c.json({ error: settled.error }, settled.status);

    const payerAddress = settled.payer ?? payer.address ?? "unknown";
    const subscriptionId = deriveShadowLabzSubscriptionId(payer.kyc?.userPkHashHex ?? payerAddress, `plan:${plan.tier}`);
    store.addSettlement<SettlementLedgerEntry>({
      id: `tx-${Date.now()}-${settled.receipt.slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      kind: "X402 Plan",
      target: `${plan.name} ($${plan.monthlyUsd}/mo)`,
      payerAddress,
      kycNullifier: payer.kyc?.kycNullifierHex ?? "",
      totalDrops: settled.deliveredDrops.toString(),
      platformDrops: settled.deliveredDrops.toString(),
      organizerDrops: "0",
      treasuryDrops: "0",
      splitSummary: `${xrp(settled.deliveredDrops)} XRP (100% Platform X402)`,
      txHashes: paymentMode === "xrpl" ? [settled.receipt] : undefined,
      verification: settled.verification,
    });
    return c.json({ status: "settled", tier: plan.tier, maxDaos: plan.maxDaos, subscriberXrplAddress: payerAddress, kycNullifier: payer.kyc?.kycNullifierHex, subscriptionId, receiptHash: settled.receipt, verification: settled.verification, ledgerIndex: settled.ledgerIndex });
  });

  /** Quote a paid DAO membership: returns the 3 unsigned split legs. Nothing is recorded as settled. */
  app.post("/api/dao/:daoId/membership/checkout", async (c) => {
    const daoId = c.req.param("daoId");
    const payer = resolvePayer(c);
    if (!payer.ok) return c.json(payer.body, payer.status);
    const body = await c.req.json<{ monthlyPriceUsd: number; organizerFeePercent: number; organizerXrplAddress: string; daoTreasuryXrplAddress: string; subscriberXrplAddress?: string }>();
    const subscriber = payer.address ?? body.subscriberXrplAddress;
    if (!subscriber || !isValidClassicAddress(subscriber)) return c.json({ error: `Provide the subscriber's XRPL address via ${PAYER_ADDRESS_HEADER}, body.subscriberXrplAddress, or a KYC record` }, 400);

    const { split, transactions } = buildDaoMembershipSplitPayments({ subscriberAccount: subscriber, platformAddress: adminConfig.platformXrplAddress, organizerAddress: body.organizerXrplAddress, treasuryAddress: body.daoTreasuryXrplAddress, totalDrops: usdToXrpDrops(body.monthlyPriceUsd), organizerFeeBps: Math.round(body.organizerFeePercent * 100), daoId, kycNullifierHex: payer.kyc?.kycNullifierHex ?? "" });
    return c.json({ daoId, settled: false, settleEndpoint: `/api/dao/${daoId}/membership/settle`, subscriberXrplAddress: subscriber, kycNullifier: payer.kyc?.kycNullifierHex, split: bigToStr(split), transactions, previews: transactions.map((tx) => formatXrplTransactionPreview(tx, network)) });
  });

  /** Settle a DAO membership: every leg's tx hash is verified against the ledger before recording. */
  app.post("/api/dao/:daoId/membership/settle", async (c) => {
    const daoId = c.req.param("daoId");
    const payer = resolvePayer(c);
    if (!payer.ok) return c.json(payer.body, payer.status);
    const body = await c.req.json<{ monthlyPriceUsd: number; organizerFeePercent: number; organizerXrplAddress: string; daoTreasuryXrplAddress: string; txHashes: string[] }>();
    const split = computeShadowLabzSplit(usdToXrpDrops(body.monthlyPriceUsd), Math.round(body.organizerFeePercent * 100));
    const legs = [
      { to: adminConfig.platformXrplAddress, drops: split.platformDrops },
      { to: body.organizerXrplAddress, drops: split.organizerDrops },
      { to: body.daoTreasuryXrplAddress, drops: split.treasuryDrops },
    ].filter((l) => l.drops > 0n);
    if (!Array.isArray(body.txHashes) || body.txHashes.length !== legs.length) return c.json({ error: `expected ${legs.length} tx hashes (one per non-zero leg)` }, 400);

    const verified: string[] = [];
    let payerAddress = payer.address;
    for (let i = 0; i < legs.length; i++) {
      const s = await settlePayment(body.txHashes[i], `dao:${daoId}:leg:${i}`, legs[i].to, legs[i].drops);
      if (!s.ok) return c.json({ error: `leg ${i} to ${legs[i].to}: ${s.error}`, verifiedLegs: verified }, s.status);
      verified.push(s.receipt);
      payerAddress ??= s.payer;
    }
    const dao = daos.get(daoId);
    if (dao) { dao.treasuryAccruedDrops += split.treasuryDrops; daos.put(dao); }
    const entry: SettlementLedgerEntry = {
      id: `tx-${Date.now()}-${verified[0].slice(0, 8)}`,
      timestamp: new Date().toISOString(),
      kind: "DAO 3-Way Split",
      target: daoId,
      payerAddress: payerAddress ?? "unknown",
      kycNullifier: payer.kyc?.kycNullifierHex ?? "",
      totalDrops: split.totalDrops.toString(),
      platformDrops: split.platformDrops.toString(),
      organizerDrops: split.organizerDrops.toString(),
      treasuryDrops: split.treasuryDrops.toString(),
      splitSummary: `${xrp(split.platformDrops)} XRP (5%) / ${xrp(split.organizerDrops)} XRP (${body.organizerFeePercent}%) / ${xrp(split.treasuryDrops)} XRP (${95 - body.organizerFeePercent}%)`,
      txHashes: verified,
      verification: paymentMode === "xrpl" ? "xrpl-ledger" : "m402-mock",
    };
    store.addSettlement(entry);
    return c.json({ settled: true, entry });
  });

  app.post("/api/dao/:daoId/crowdfund/escrow", async (c) => {
    const daoId = c.req.param("daoId");
    const payer = resolvePayer(c);
    if (!payer.ok) return c.json(payer.body, payer.status);
    const body = await c.req.json<{ daoTreasuryXrplAddress: string; contributionUsd: number; goalUsd: number; durationDays?: number; contributorXrplAddress?: string }>();
    const contributor = payer.address ?? body.contributorXrplAddress;
    if (!contributor || !isValidClassicAddress(contributor)) return c.json({ error: `Provide the contributor's XRPL address via ${PAYER_ADDRESS_HEADER} or body.contributorXrplAddress` }, 400);

    const contributionDrops = usdToXrpDrops(body.contributionUsd);
    const goalDrops = usdToXrpDrops(body.goalUsd);
    const midnightEscrowId = deriveShadowLabzEscrowId(daoId, body.daoTreasuryXrplAddress, goalDrops);
    const existing = escrows.get(midnightEscrowId);
    escrows.put({ escrowId: midnightEscrowId, daoId, beneficiaryAddress: body.daoTreasuryXrplAddress, goalDrops, raisedDrops: (existing?.raisedDrops ?? 0n) + contributionDrops, status: existing?.status ?? "Active" });

    const xrplEscrowTx = buildDaoCrowdfundingEscrow({ contributorAccount: contributor, daoTreasuryAddress: body.daoTreasuryXrplAddress, amountDrops: contributionDrops, daoId, kycNullifierHex: payer.kyc?.kycNullifierHex ?? "", durationSeconds: (body.durationDays ?? 14) * 86400 });
    return c.json({ daoId, midnightEscrowId, xrplEscrowTx, walletCeremonyPreview: formatXrplTransactionPreview(xrplEscrowTx, network) });
  });

  app.post("/api/dao/:daoId/reputation/xp", async (c) => {
    const daoId = c.req.param("daoId");
    const body = await c.req.json<{ memberSecret: string; actionId: string; xpPoints: number }>();
    const ids = deriveShadowLabzReputationIds(body.memberSecret, daoId, body.actionId);
    return c.json({ daoId, aliasHash: ids.aliasHashHex, actionNullifier: ids.actionNullifierHex, xpAwarded: body.xpPoints });
  });

  return app;
}
