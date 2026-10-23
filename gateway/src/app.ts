import { Hono } from "hono";
import { cors } from "hono/cors";
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
import { AgilitySDK } from "@agility/sdk";

export type AdminKycRecord = VerifiedKycProof & {
  label: string;
  revoked: boolean;
};

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

export type ManagedEscrowRecord = {
  escrowId: string;
  daoId: string;
  beneficiaryAddress: string;
  goalDrops: bigint;
  raisedDrops: bigint;
  status: "Active" | "Released" | "Refunded";
};

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
};

const verifiedKycStore = new Map<string, AdminKycRecord>();
const consumedPaymentReceipts = new Set<string>();
const managedDaos = new Map<string, ManagedDaoRecord>();
const managedEscrows = new Map<string, ManagedEscrowRecord>();
const settlementLedger: SettlementLedgerEntry[] = [];

const adminConfig = {
  platformXrplAddress:
    process.env.XRPL_PAY_TO || "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  facilitatorUrl:
    process.env.XRPL_FACILITATOR_URL || "https://xrpl-facilitator-testnet.t54.ai",
  sourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
  m402VaultAddress:
    process.env.M402_VAULT_ADDRESS ||
    "17b4cf15ad768fa0e5090da960e86eaf7cc885f86eb5a6b241e2fd28d98546ae",
  shadowLabzKycAddress:
    process.env.SHADOWLABZ_KYC_CONTRACT_ADDRESS ||
    "c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc",
};

// Seed initial demo state for the Admin Landing Page
function seedInitialAdminState() {
  if (managedDaos.size > 0) return;

  const initialKyc = verifyMidnightKycForXrpl({
    userSecretHexOrSeed: "nightshade-founder-initial-seed",
    xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    contextId: "shadowlabz:admin:seed",
    tier: 3,
    jurisdictionCode: 840,
    isSanctioned: false,
  });
  if (initialKyc.valid && initialKyc.proof) {
    verifiedKycStore.set(initialKyc.proof.kycNullifierHex, {
      ...initialKyc.proof,
      label: "Nightshade Founder (Corporate Tier 3)",
      revoked: false,
    });
  }

  managedDaos.set("nightshade-collective", {
    id: "nightshade-collective",
    name: "Nightshade Collective",
    joinPolicy: "zk-kyc-gated",
    monthlyPriceUsd: 50,
    organizerFeePercent: 20,
    organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
    treasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
    treasuryAccruedDrops: 15_000_000n,
  });

  const escrowId = deriveShadowLabzEscrowId(
    "nightshade-collective",
    "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
    1_800_000_000n,
  );
  managedEscrows.set(escrowId, {
    escrowId,
    daoId: "nightshade-collective",
    beneficiaryAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
    goalDrops: 1_800_000_000n,
    raisedDrops: 1_800_000_000n,
    status: "Active",
  });

  if (initialKyc.proof) {
    settlementLedger.push({
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
    });
  }
}

seedInitialAdminState();

export const app = new Hono();

app.use("*", cors());

// Primary landing page is now the Admin Control Room; /portal serves the Member Payer Demo
app.get("/", (c) => c.html(renderShadowLabzAdminHtml()));
app.get("/admin", (c) => c.html(renderShadowLabzAdminHtml()));
app.get("/portal", (c) => c.html(renderShadowLabzDemoHtml()));

/**
 * 1. Health & Dashboard Status Endpoint
 */
app.get("/health", (c) => c.json({ status: "ok", service: "shadowlabz-agility-core" }));

app.get("/api/agility-core/status", (c) => {
  return c.json({
    agilityCoreExecutionLayer: {
      status: "operational",
      version: "0.1.0",
      compactCompiler: "0.31.1",
      languageVersion: "0.23.0",
      midnightSdk: "4.1.1",
      protocols: ["x402-xrpl", "m402-midnight", "midnight-zk-kyc"],
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
      {
        chain: "Midnight",
        networkId: process.env.MIDNIGHT_NETWORK || "preview",
        status: "connected",
        walletSupport: "Lace (window.midnight)",
        indexerUrl:
          process.env.MIDNIGHT_INDEXER_HTTP ||
          "https://indexer.preview.midnight.network/api/v4/graphql",
      },
      {
        chain: "XRP Ledger",
        networkId: "xrpl:1",
        status: "connected",
        walletSupport: "Xaman (XUMM) + XRPL Agent Wallet (OWS)",
        rpcUrl: process.env.XRPL_RPC_URL || "https://s.altnet.rippletest.net:51234/",
        facilitatorUrl: adminConfig.facilitatorUrl,
      },
      {
        chain: "Cardano",
        networkId: "preprod",
        status: "connected",
        walletSupport: "CIP-30 (Eternl / Lace)",
      },
      {
        chain: "Xahau",
        networkId: "xahau-testnet",
        status: "connected",
        walletSupport: "Xaman (XUMM)",
      },
    ],
  });
});

/**
 * 1b. Admin Control Room Endpoints
 */
app.get("/api/admin/overview", (c) => {
  const kycRegistry = Array.from(verifiedKycStore.values());
  const activeKycCount = kycRegistry.filter((k) => !k.revoked).length;
  const revokedKycCount = kycRegistry.filter((k) => k.revoked).length;

  let totalVolumeDrops = 0n;
  let platformRevenueDrops = 0n;
  for (const entry of settlementLedger) {
    totalVolumeDrops += BigInt(entry.totalDrops);
    platformRevenueDrops += BigInt(entry.platformDrops);
  }

  return c.json({
    config: adminConfig,
    metrics: {
      totalVolumeDrops: totalVolumeDrops.toString(),
      totalVolumeXrp: (Number(totalVolumeDrops) / 1_000_000).toFixed(2),
      platformRevenueDrops: platformRevenueDrops.toString(),
      platformRevenueXrp: (Number(platformRevenueDrops) / 1_000_000).toFixed(2),
      activeKycCount,
      revokedKycCount,
    },
    kycRegistry,
    daos: Array.from(managedDaos.values()).map((d) => ({
      ...d,
      treasuryAccruedDrops: d.treasuryAccruedDrops.toString(),
    })),
    escrows: Array.from(managedEscrows.values()).map((e) => ({
      ...e,
      goalDrops: e.goalDrops.toString(),
      raisedDrops: e.raisedDrops.toString(),
    })),
    settlementLedger,
  });
});

app.post("/api/admin/kyc/issue", async (c) => {
  const body = await c.req.json<{
    label?: string;
    userSecret: string;
    xrplAddress: string;
    tier?: number;
    jurisdictionCode?: number;
  }>();

  const verification = verifyMidnightKycForXrpl({
    userSecretHexOrSeed: body.userSecret,
    xrplAddress: body.xrplAddress,
    contextId: `shadowlabz:admin:issue:${Date.now()}`,
    tier: body.tier ?? 2,
    jurisdictionCode: body.jurisdictionCode ?? 840,
    isSanctioned: false,
    minRequiredTier: 1,
  });

  if (!verification.valid || !verification.proof) {
    return c.json({ issued: false, error: verification.reason }, 400);
  }

  const record: AdminKycRecord = {
    ...verification.proof,
    label: body.label || "ShadowLabz Verified Member",
    revoked: false,
  };
  verifiedKycStore.set(record.kycNullifierHex, record);

  return c.json({
    issued: true,
    circuit: "ShadowLabzKyc.issueKycCredential",
    merkleTreeInserted: true,
    record,
  });
});

app.post("/api/admin/kyc/revoke", async (c) => {
  const body = await c.req.json<{ kycNullifier: string; revoke: boolean }>();
  const existing = verifiedKycStore.get(body.kycNullifier);
  if (!existing) {
    return c.json({ error: "KYC record not found" }, 404);
  }
  existing.revoked = body.revoke;
  verifiedKycStore.set(body.kycNullifier, existing);
  return c.json({ updated: true, record: existing });
});

app.post("/api/admin/dao/create", async (c) => {
  const body = await c.req.json<{
    id: string;
    name: string;
    joinPolicy: string;
    monthlyPriceUsd: number;
    organizerFeePercent: number;
    organizerXrplAddress: string;
    treasuryXrplAddress: string;
  }>();

  const existing = managedDaos.get(body.id);
  const record: ManagedDaoRecord = {
    id: body.id,
    name: body.name,
    joinPolicy: body.joinPolicy,
    monthlyPriceUsd: body.monthlyPriceUsd,
    organizerFeePercent: Math.min(95, Math.max(0, body.organizerFeePercent)),
    organizerXrplAddress: body.organizerXrplAddress,
    treasuryXrplAddress: body.treasuryXrplAddress,
    treasuryAccruedDrops: existing?.treasuryAccruedDrops ?? 0n,
  };
  managedDaos.set(record.id, record);

  return c.json({
    saved: true,
    circuit: "ShadowLabzSubscription.configureDaoSubscriptionSplit",
    dao: {
      ...record,
      treasuryAccruedDrops: record.treasuryAccruedDrops.toString(),
    },
  });
});

app.post("/api/admin/escrow/:escrowId/release", (c) => {
  const escrowId = c.req.param("escrowId");
  const escrow = managedEscrows.get(escrowId);
  if (!escrow) {
    return c.json({ error: "Escrow pool not found" }, 404);
  }
  escrow.status = "Released";
  managedEscrows.set(escrowId, escrow);

  const dao = managedDaos.get(escrow.daoId);
  if (dao) {
    dao.treasuryAccruedDrops += escrow.raisedDrops;
    managedDaos.set(dao.id, dao);
  }

  return c.json({
    released: true,
    circuit: "AgilityEscrow.releasePoolToTreasury",
    escrow: {
      ...escrow,
      goalDrops: escrow.goalDrops.toString(),
      raisedDrops: escrow.raisedDrops.toString(),
    },
  });
});

app.post("/api/admin/config", async (c) => {
  const body = await c.req.json<{
    platformXrplAddress?: string;
    facilitatorUrl?: string;
    sourceTag?: number;
  }>();
  if (body.platformXrplAddress) adminConfig.platformXrplAddress = body.platformXrplAddress;
  if (body.facilitatorUrl) adminConfig.facilitatorUrl = body.facilitatorUrl;
  if (body.sourceTag) adminConfig.sourceTag = body.sourceTag;

  return c.json({ updated: true, config: adminConfig });
});

app.post("/api/admin/simulate-settlement", async (c) => {
  const body = await c.req.json<{
    type: "plan_x402" | "dao_membership";
    tier?: ShadowLabzPlanTier;
    daoId?: string;
  }>();

  const firstActiveKyc = Array.from(verifiedKycStore.values()).find((k) => !k.revoked);
  const payerAddress =
    firstActiveKyc?.xrplAddress || "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";
  const kycNullifier = firstActiveKyc?.kycNullifierHex || "a".repeat(64);

  if (body.type === "plan_x402") {
    const plan = SHADOWLABZ_PLANS[body.tier || "community"];
    const drops = usdToXrpDrops(plan.monthlyUsd);
    const entry: SettlementLedgerEntry = {
      id: `tx-${Date.now()}`,
      timestamp: new Date().toISOString(),
      kind: "X402 Plan",
      target: `${plan.name} ($${plan.monthlyUsd}/mo)`,
      payerAddress,
      kycNullifier,
      totalDrops: drops.toString(),
      platformDrops: drops.toString(),
      organizerDrops: "0",
      treasuryDrops: "0",
      splitSummary: `${(Number(drops) / 1_000_000).toFixed(2)} XRP (100% Platform X402)`,
    };
    settlementLedger.unshift(entry);
    return c.json({ settled: true, entry });
  }

  const dao =
    managedDaos.get(body.daoId || "nightshade-collective") ||
    Array.from(managedDaos.values())[0];
  const totalDrops = usdToXrpDrops(dao.monthlyPriceUsd);
  const split = computeShadowLabzSplit(totalDrops, dao.organizerFeePercent * 100);
  dao.treasuryAccruedDrops += split.treasuryDrops;
  managedDaos.set(dao.id, dao);

  const entry: SettlementLedgerEntry = {
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "DAO 3-Way Split",
    target: dao.id,
    payerAddress,
    kycNullifier,
    totalDrops: split.totalDrops.toString(),
    platformDrops: split.platformDrops.toString(),
    organizerDrops: split.organizerDrops.toString(),
    treasuryDrops: split.treasuryDrops.toString(),
    splitSummary: `${(Number(split.platformDrops) / 1_000_000).toFixed(2)} XRP (5%) / ${(Number(split.organizerDrops) / 1_000_000).toFixed(2)} XRP (${dao.organizerFeePercent}%) / ${(Number(split.treasuryDrops) / 1_000_000).toFixed(2)} XRP (${95 - dao.organizerFeePercent}%)`,
  };
  settlementLedger.unshift(entry);
  return c.json({ settled: true, entry });
});

/**
 * 2. ShadowLabz Plans Endpoint
 */
app.get("/api/plans", (c) => {
  const xrpPriceUsd = Number(c.req.query("xrpUsd") || "2.5");
  const plans = Object.values(SHADOWLABZ_PLANS).map((plan) => {
    const drops = usdToXrpDrops(plan.monthlyUsd, xrpPriceUsd);
    return {
      ...plan,
      pricing: {
        usd: plan.monthlyUsd,
        xrpDrops: drops.toString(),
        xrpFormatted: `${Number(drops) / 1_000_000} XRP`,
        rlusd: plan.monthlyUsd.toFixed(2),
        m402Star: (plan.monthlyUsd * 50_000).toString(),
      },
    };
  });
  return c.json({ plans });
});

/**
 * 3. Midnight Zero-Knowledge KYC Verification & XRPL Wallet Binding
 */
app.post("/api/kyc/verify", async (c) => {
  const body = await c.req.json<{
    userSecret: string;
    xrplAddress: string;
    contextId?: string;
    tier?: number;
    jurisdictionCode?: number;
    isSanctioned?: boolean;
    minRequiredTier?: number;
  }>();

  const verification = verifyMidnightKycForXrpl({
    userSecretHexOrSeed: body.userSecret,
    xrplAddress: body.xrplAddress,
    contextId: body.contextId || "shadowlabz:portal:default",
    tier: body.tier ?? 1,
    jurisdictionCode: body.jurisdictionCode ?? 840,
    isSanctioned: body.isSanctioned ?? false,
    minRequiredTier: body.minRequiredTier ?? 1,
  });

  if (!verification.valid || !verification.proof) {
    return c.json({ verified: false, error: verification.reason }, 403);
  }

  verifiedKycStore.set(verification.proof.kycNullifierHex, {
    ...verification.proof,
    label: "Self-Verified Portal User",
    revoked: false,
  });

  return c.json({
    verified: true,
    kycHeaderName: KYC_PROOF_HEADER,
    kycToken: verification.proof.kycNullifierHex,
    proof: verification.proof,
  });
});

/**
 * 4. Dual-Rail HTTP 402 Endpoint for ShadowLabz Platform Plan Subscriptions
 */
app.get("/api/x402/plan/:tier", (c) => {
  const tierParam = c.req.param("tier").toLowerCase() as ShadowLabzPlanTier;
  const plan = SHADOWLABZ_PLANS[tierParam];
  if (!plan) {
    return c.json({ error: `Unknown plan tier: ${tierParam}` }, 404);
  }

  if (plan.monthlyUsd === 0) {
    return c.json({
      status: "active",
      tier: plan.tier,
      message: "Free tier activated — 1 DAO included.",
    });
  }

  const kycNullifier = c.req.header(KYC_PROOF_HEADER);
  if (!kycNullifier || !verifiedKycStore.has(kycNullifier)) {
    return c.json(
      {
        error: "Midnight ZK KYC verification required before purchasing a paid plan",
        requiredHeader: KYC_PROOF_HEADER,
        minKycTier: plan.minKycTier,
        verifyEndpoint: "/api/kyc/verify",
      },
      403,
    );
  }

  const kycProof = verifiedKycStore.get(kycNullifier)!;
  if (kycProof.revoked) {
    return c.json({ error: "KYC credential has been revoked by ShadowLabz Admin" }, 403);
  }
  if (kycProof.tier < plan.minKycTier) {
    return c.json(
      {
        error: `Plan '${plan.name}' requires KYC tier >= ${plan.minKycTier} (current: ${kycProof.tier})`,
      },
      403,
    );
  }

  const priceDrops = usdToXrpDrops(plan.monthlyUsd);
  const serviceId = deriveShadowLabzSubscriptionId("shadowlabz:service", `plan:${plan.tier}`);
  const paymentSecretOrReceipt = c.req.header(PAYMENT_HEADER);

  if (!paymentSecretOrReceipt) {
    const paymentRequired: PaymentRequired = {
      protocol: "dual-402",
      serviceId,
      description: `ShadowLabz ${plan.name} Plan ($${plan.monthlyUsd}/month)`,
      xrpl: {
        network: "xrpl:1",
        asset: "XRP",
        priceDrops: priceDrops.toString(),
        priceUsd: plan.monthlyUsd,
        payToAddress: adminConfig.platformXrplAddress,
        facilitatorUrl: adminConfig.facilitatorUrl,
        sourceTag: adminConfig.sourceTag,
      },
      midnight: {
        network: "preview",
        vaultAddress: adminConfig.m402VaultAddress,
        kycContractAddress: adminConfig.shadowLabzKycAddress,
        priceStar: (plan.monthlyUsd * 50_000).toString(),
        requiresKyc: true,
        minKycTier: plan.minKycTier,
      },
    };

    const unsignedXrplTx = buildKycVerifiedXrpPayment({
      account: kycProof.xrplAddress,
      destination: adminConfig.platformXrplAddress,
      amountDrops: priceDrops,
      kycNullifierHex: kycProof.kycNullifierHex,
      action: `subscribe_plan_${plan.tier}`,
      planTier: plan.tier,
      isX402: true,
    });

    return c.json(
      {
        paymentRequired,
        unsignedXrplTx,
        walletCeremonyPreview: formatXrplTransactionPreview(unsignedXrplTx, "testnet"),
      },
      402,
    );
  }

  const m402ReceiptHash = deriveM402ReceiptHash(paymentSecretOrReceipt, serviceId);
  if (consumedPaymentReceipts.has(m402ReceiptHash)) {
    return c.json({ error: "receipt-already-used" }, 402);
  }
  consumedPaymentReceipts.add(m402ReceiptHash);

  const subscriptionId = deriveShadowLabzSubscriptionId(
    kycProof.userPkHashHex,
    `plan:${plan.tier}`,
  );

  settlementLedger.unshift({
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "X402 Plan",
    target: `${plan.name} ($${plan.monthlyUsd}/mo)`,
    payerAddress: kycProof.xrplAddress,
    kycNullifier: kycProof.kycNullifierHex,
    totalDrops: priceDrops.toString(),
    platformDrops: priceDrops.toString(),
    organizerDrops: "0",
    treasuryDrops: "0",
    splitSummary: `${(Number(priceDrops) / 1_000_000).toFixed(2)} XRP (100% Platform X402)`,
  });

  return c.json({
    status: "settled",
    tier: plan.tier,
    maxDaos: plan.maxDaos,
    subscriberXrplAddress: kycProof.xrplAddress,
    kycNullifier: kycProof.kycNullifierHex,
    subscriptionId,
    receiptHash: m402ReceiptHash,
  });
});

/**
 * 5. ShadowLabz Paid DAO Membership Subscription Checkout (3-Way Split in XRP + Midnight KYC)
 */
app.post("/api/dao/:daoId/membership/checkout", async (c) => {
  const daoId = c.req.param("daoId");
  const kycNullifier = c.req.header(KYC_PROOF_HEADER);
  if (!kycNullifier || !verifiedKycStore.has(kycNullifier)) {
    return c.json(
      {
        error: "Midnight ZK KYC verification required to join this DAO",
        requiredHeader: KYC_PROOF_HEADER,
      },
      403,
    );
  }

  const kycProof = verifiedKycStore.get(kycNullifier)!;
  if (kycProof.revoked) {
    return c.json({ error: "KYC credential has been revoked by ShadowLabz Admin" }, 403);
  }

  const body = await c.req.json<{
    monthlyPriceUsd: number;
    organizerFeePercent: number;
    organizerXrplAddress: string;
    daoTreasuryXrplAddress: string;
  }>();

  const organizerFeeBps = Math.round(body.organizerFeePercent * 100);
  const totalDrops = usdToXrpDrops(body.monthlyPriceUsd);

  const { split, transactions } = buildDaoMembershipSplitPayments({
    subscriberAccount: kycProof.xrplAddress,
    platformAddress: adminConfig.platformXrplAddress,
    organizerAddress: body.organizerXrplAddress,
    treasuryAddress: body.daoTreasuryXrplAddress,
    totalDrops,
    organizerFeeBps,
    daoId,
    kycNullifierHex: kycProof.kycNullifierHex,
  });

  settlementLedger.unshift({
    id: `tx-${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: "DAO 3-Way Split",
    target: daoId,
    payerAddress: kycProof.xrplAddress,
    kycNullifier: kycProof.kycNullifierHex,
    totalDrops: split.totalDrops.toString(),
    platformDrops: split.platformDrops.toString(),
    organizerDrops: split.organizerDrops.toString(),
    treasuryDrops: split.treasuryDrops.toString(),
    splitSummary: `${(Number(split.platformDrops) / 1_000_000).toFixed(2)} XRP (5%) / ${(Number(split.organizerDrops) / 1_000_000).toFixed(2)} XRP (${body.organizerFeePercent}%) / ${(Number(split.treasuryDrops) / 1_000_000).toFixed(2)} XRP (${95 - body.organizerFeePercent}%)`,
  });

  return c.json({
    daoId,
    subscriberXrplAddress: kycProof.xrplAddress,
    kycNullifier: kycProof.kycNullifierHex,
    split: {
      totalDrops: split.totalDrops.toString(),
      platformFeeBps: split.platformFeeBps,
      organizerFeeBps: split.organizerFeeBps,
      treasuryShareBps: split.treasuryShareBps,
      platformDrops: split.platformDrops.toString(),
      organizerDrops: split.organizerDrops.toString(),
      treasuryDrops: split.treasuryDrops.toString(),
    },
    transactions,
    previews: transactions.map((tx) => formatXrplTransactionPreview(tx, "testnet")),
  });
});

/**
 * 6. ShadowLabz DAO 2-Week Crowdfunding Escrow
 */
app.post("/api/dao/:daoId/crowdfund/escrow", async (c) => {
  const daoId = c.req.param("daoId");
  const kycNullifier = c.req.header(KYC_PROOF_HEADER);
  if (!kycNullifier || !verifiedKycStore.has(kycNullifier)) {
    return c.json({ error: "Midnight ZK KYC verification required" }, 403);
  }

  const kycProof = verifiedKycStore.get(kycNullifier)!;
  const body = await c.req.json<{
    daoTreasuryXrplAddress: string;
    contributionUsd: number;
    goalUsd: number;
    durationDays?: number;
  }>();

  const contributionDrops = usdToXrpDrops(body.contributionUsd);
  const goalDrops = usdToXrpDrops(body.goalUsd);
  const durationSeconds = (body.durationDays ?? 14) * 24 * 3600;

  const midnightEscrowId = deriveShadowLabzEscrowId(
    daoId,
    body.daoTreasuryXrplAddress,
    goalDrops,
  );

  const existingPool = managedEscrows.get(midnightEscrowId);
  managedEscrows.set(midnightEscrowId, {
    escrowId: midnightEscrowId,
    daoId,
    beneficiaryAddress: body.daoTreasuryXrplAddress,
    goalDrops,
    raisedDrops: (existingPool?.raisedDrops ?? 0n) + contributionDrops,
    status: existingPool?.status ?? "Active",
  });

  const xrplEscrowTx = buildDaoCrowdfundingEscrow({
    contributorAccount: kycProof.xrplAddress,
    daoTreasuryAddress: body.daoTreasuryXrplAddress,
    amountDrops: contributionDrops,
    daoId,
    kycNullifierHex: kycProof.kycNullifierHex,
    durationSeconds,
  });

  return c.json({
    daoId,
    midnightEscrowId,
    xrplEscrowTx,
    walletCeremonyPreview: formatXrplTransactionPreview(xrplEscrowTx, "testnet"),
  });
});

/**
 * 7. ShadowLabz Privacy-Preserving Reputation / XP
 */
app.post("/api/dao/:daoId/reputation/xp", async (c) => {
  const daoId = c.req.param("daoId");
  const body = await c.req.json<{
    memberSecret: string;
    actionId: string;
    xpPoints: number;
  }>();

  const ids = deriveShadowLabzReputationIds(body.memberSecret, daoId, body.actionId);
  return c.json({
    daoId,
    aliasHash: ids.aliasHashHex,
    actionNullifier: ids.actionNullifierHex,
    xpAwarded: body.xpPoints,
  });
});

/**
 * 8. `@agility/sdk` Interactive Playground Endpoint (Mastercard @ Ripple Swell Live Demo)
 */
app.post("/api/sdk/playground", async (c) => {
  const body = await c.req.json<{
    kycAuthorityId?: string;
    payerXrplAddress: string;
    userSecret: string;
    tier: number;
    jurisdictionCode: number;
    isSanctioned: boolean;
    amountUsd: number;
    maxAgentBudgetUsd?: number;
    asset: "RLUSD" | "XRP";
    acquirerFeePercent?: number;
  }>();

  const sdk = new AgilitySDK({
    xrplNetwork: "xrpl:1",
    merchantXrplAddress: adminConfig.platformXrplAddress,
    kycAuthorityId: body.kycAuthorityId || "mastercard-crypto-credential",
    defaultAsset: body.asset || "RLUSD",
    sourceTag: adminConfig.sourceTag,
  });

  // 1. Verify Mastercard Crypto Credential ZK KYC (ShadowLabzKyc.compact)
  const attestation = sdk.kyc.proveCompliance(
    {
      userSecret: body.userSecret,
      xrplAddress: body.payerXrplAddress,
      contextId: `swell-demo-${Date.now()}`,
      tier: body.tier,
      jurisdictionCode: body.jurisdictionCode,
      isSanctioned: body.isSanctioned,
      issuerLabel: body.kycAuthorityId || "mastercard-crypto-credential",
    },
    { minKycTier: 2, blockedJurisdictions: [408, 364, 760] },
  );

  if (!attestation.compliant || !attestation.kycNullifierHex) {
    return c.json(
      {
        status: "blocked_by_zk_compliance",
        sdkModule: "agility.kyc.proveCompliance()",
        attestation,
      },
      403,
    );
  }

  // 2. Verify Mastercard Agent Pay for Machines (AP4M) ZK Permissioning & Verifiable Intent (AgilityAgentPay.compact)
  const ap4mIntent = sdk.agentPay.verifyVerifiableIntent({
    ownerSecret: body.userSecret,
    agentTokenSecret: `mc-agentic-token-${body.userSecret}`,
    x402ServiceId: "swell-enterprise-settlement",
    requestedAmountUsd: body.amountUsd,
    maxBudgetPerTxUsd: body.maxAgentBudgetUsd ?? 500,
    requestedCategoryCode: 5411,
    allowedCategoryCode: 5411,
    isAgentActive: true,
  });

  if (!ap4mIntent.authorized || !ap4mIntent.intentNullifierHex) {
    return c.json(
      {
        status: "blocked_by_ap4m_intent_policy",
        sdkModule: "agility.agentPay.verifyVerifiableIntent()",
        attestation,
        ap4mIntent,
      },
      403,
    );
  }

  // 3. Build x402 Payment Requirements & Compliant RLUSD / XRP Settlement Transaction
  const paymentRequired = sdk.x402.buildPaymentRequired({
    serviceId: "swell-enterprise-settlement",
    description: "Mastercard Agent Pay for Machines (AP4M) + Crypto Credential XRPL X402 Settlement",
    amountUsd: body.amountUsd,
    asset: body.asset,
    minKycTier: 2,
  });

  const tx = sdk.settlement.buildCompliantPaymentTx({
    payerXrplAddress: body.payerXrplAddress,
    amountUsd: body.amountUsd,
    asset: body.asset,
    kycNullifierHex: attestation.kycNullifierHex,
    agentIntentNullifierHex: ap4mIntent.intentNullifierHex,
    action: "mastercard_ap4m_x402_settlement",
  });

  const totalDrops = usdToXrpDrops(body.amountUsd);
  const split = sdk.settlement.computeSplit(
    totalDrops,
    Math.round((body.acquirerFeePercent ?? 2) * 100),
  );

  return c.json({
    status: "ready_for_settlement",
    sdkModulesUsed: [
      "agility.kyc",
      "agility.agentPay",
      "agility.mastercardToolkit",
      "agility.x402",
      "agility.settlement",
    ],
    mastercardToolkit: sdk.mastercardToolkit.getToolkitInfo(),
    attestation,
    ap4mIntent,
    paymentRequired,
    unsignedXrplTx: tx,
    walletCeremonyPreview: formatXrplTransactionPreview(tx, "testnet"),
    split: {
      totalDrops: split.totalDrops.toString(),
      networkFeeBps: split.platformFeeBps,
      acquirerFeeBps: split.organizerFeeBps,
      merchantShareBps: split.treasuryShareBps,
      networkDrops: split.platformDrops.toString(),
      acquirerDrops: split.organizerDrops.toString(),
      merchantDrops: split.treasuryDrops.toString(),
    },
  });
});
