import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  SHADOWLABZ_PLANS,
  type ShadowLabzPlanTier,
  type PaymentRequired,
  PAYMENT_HEADER,
  KYC_PROOF_HEADER,
  usdToXrpDrops,
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

const verifiedKycStore = new Map<string, VerifiedKycProof>();
const consumedPaymentReceipts = new Set<string>();

export const app = new Hono();

app.use("*", cors());

app.get("/", (c) => c.html(renderShadowLabzDemoHtml()));

const PLATFORM_XRPL_ADDRESS =
  process.env.XRPL_PAY_TO || "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
const FACILITATOR_URL =
  process.env.XRPL_FACILITATOR_URL || "https://xrpl-facilitator-testnet.t54.ai";
const M402_VAULT_ADDRESS =
  process.env.M402_VAULT_ADDRESS ||
  "17b4cf15ad768fa0e5090da960e86eaf7cc885f86eb5a6b241e2fd28d98546ae";
const SHADOWLABZ_KYC_ADDRESS =
  process.env.SHADOWLABZ_KYC_CONTRACT_ADDRESS ||
  "c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc";

/**
 * 1. Health & Dashboard Status Endpoint
 * Directly feeds the "Network status" & "AgilityCore execution layer" panel on https://www.shadowlabz.io/dashboard
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
        m402Vault: M402_VAULT_ADDRESS,
        shadowLabzKyc: SHADOWLABZ_KYC_ADDRESS,
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
        facilitatorUrl: FACILITATOR_URL,
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
 * 2. ShadowLabz Plans Endpoint (Replaces PayPal with XRP X402 + Midnight m402 + ZK KYC)
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

  verifiedKycStore.set(verification.proof.kycNullifierHex, verification.proof);

  return c.json({
    verified: true,
    kycHeaderName: KYC_PROOF_HEADER,
    kycToken: verification.proof.kycNullifierHex,
    proof: verification.proof,
  });
});

/**
 * 4. Dual-Rail HTTP 402 Endpoint for ShadowLabz Platform Plan Subscriptions
 *    - Checks Midnight KYC proof header (`X-Midnight-Kyc`)
 *    - Returns `402 Payment Required` with both XRPL X402 and Midnight m402 requirements if `X-Payment` is absent
 *    - Settles and returns subscription commitment when `X-Payment` is provided
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
        payToAddress: PLATFORM_XRPL_ADDRESS,
        facilitatorUrl: FACILITATOR_URL,
        sourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
      },
      midnight: {
        network: "preview",
        vaultAddress: M402_VAULT_ADDRESS,
        kycContractAddress: SHADOWLABZ_KYC_ADDRESS,
        priceStar: (plan.monthlyUsd * 50_000).toString(),
        requiresKyc: true,
        minKycTier: plan.minKycTier,
      },
    };

    const unsignedXrplTx = buildKycVerifiedXrpPayment({
      account: kycProof.xrplAddress,
      destination: PLATFORM_XRPL_ADDRESS,
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
 *    Replaces the PayPal USD billing with on-chain XRP 3-way split:
 *    - 5% Platform Fee
 *    - 0%..95% Organizer Fee
 *    - Remainder (100% - 5% - organizer%) to DAO Treasury
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
  const body = await c.req.json<{
    monthlyPriceUsd: number;
    organizerFeePercent: number; // 0 to 95
    organizerXrplAddress: string;
    daoTreasuryXrplAddress: string;
  }>();

  const organizerFeeBps = Math.round(body.organizerFeePercent * 100);
  const totalDrops = usdToXrpDrops(body.monthlyPriceUsd);

  const { split, transactions } = buildDaoMembershipSplitPayments({
    subscriberAccount: kycProof.xrplAddress,
    platformAddress: PLATFORM_XRPL_ADDRESS,
    organizerAddress: body.organizerXrplAddress,
    treasuryAddress: body.daoTreasuryXrplAddress,
    totalDrops,
    organizerFeeBps,
    daoId,
    kycNullifierHex: kycProof.kycNullifierHex,
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
 * 6. ShadowLabz DAO 2-Week Crowdfunding Escrow (AgilityEscrow on Midnight + EscrowCreate on XRPL)
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
 * 7. ShadowLabz Privacy-Preserving Reputation / XP (Replaces KedasBrewLoyalty)
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
