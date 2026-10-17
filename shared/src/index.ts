export type Service = {
  id: string;
  price: bigint;
  owner: string;
  type: "origin" | "relay";
  target: string;
  chain?: "xrpl:1" | "xrpl:0" | "eip155:8453" | "eip155:84532" | string;
  requiresKyc?: boolean;
  minKycTier?: number;
};

export type PaymentRequired = {
  protocol: "x402-xrpl" | "m402-midnight" | "dual-402";
  serviceId: string;
  description: string;
  xrpl: {
    network: "xrpl:1" | "xrpl:0";
    asset: "XRP" | "RLUSD";
    priceDrops: string;
    priceUsd: number;
    payToAddress: string;
    facilitatorUrl: string;
    sourceTag: number;
  };
  midnight: {
    network: "preview" | "preprod" | "undeployed";
    vaultAddress: string;
    kycContractAddress: string;
    priceStar: string;
    requiresKyc: boolean;
    minKycTier: number;
  };
};

export type ShadowLabzPlanTier = "free" | "starter" | "community" | "growth" | "corporate";

export type ShadowLabzPlanConfig = {
  tier: ShadowLabzPlanTier;
  name: string;
  monthlyUsd: number;
  maxDaos: number | "unlimited";
  features: string[];
  minKycTier: number;
};

export const SHADOWLABZ_PLANS: Record<ShadowLabzPlanTier, ShadowLabzPlanConfig> = {
  free: {
    tier: "free",
    name: "Free",
    monthlyUsd: 0,
    maxDaos: 1,
    features: [
      "Join unlimited DAOs",
      "Vote on proposals (public & private ZK ballots)",
      "Delegate vote weight",
      "Create 1 DAO",
    ],
    minKycTier: 0,
  },
  starter: {
    tier: "starter",
    name: "Starter",
    monthlyUsd: 10,
    maxDaos: 2,
    features: [
      "Everything in Free",
      "Create up to 2 DAOs",
      "DAO smart-contract deployment",
      "Discord bot access (/propose, /vote, /tally)",
      "DAO calendar & event scheduling",
    ],
    minKycTier: 1,
  },
  community: {
    tier: "community",
    name: "Community",
    monthlyUsd: 50,
    maxDaos: 5,
    features: [
      "Everything in Starter",
      "Create up to 5 DAOs",
      "On-chain treasury management",
      "Crowdfunding for treasury (2-week escrow pools)",
      "NFT, token, and Midnight ZK proof-gated membership",
      "Paid DAO membership subscriptions (5% platform / organizer% / treasury%)",
    ],
    minKycTier: 1,
  },
  growth: {
    tier: "growth",
    name: "Growth",
    monthlyUsd: 250,
    maxDaos: "unlimited",
    features: [
      "Everything in Community",
      "Unlimited DAOs",
      "Multichain treasury (XRPL + Cardano + Midnight)",
      "Confidential treasury management",
      "Priority support",
    ],
    minKycTier: 2,
  },
  corporate: {
    tier: "corporate",
    name: "Corporate",
    monthlyUsd: 1000,
    maxDaos: "unlimited",
    features: [
      "Everything in Growth",
      "Compliance-ready ZK treasury audits (selective disclosure)",
      "Microsoft Teams & Discord enterprise integration",
      "Dedicated onboarding and support",
    ],
    minKycTier: 3,
  },
};

export type DaoRevenueSplit = {
  totalDrops: bigint;
  platformFeeBps: 500;
  organizerFeeBps: number;
  treasuryShareBps: number;
  platformDrops: bigint;
  organizerDrops: bigint;
  treasuryDrops: bigint;
};

/**
 * Computes the exact ShadowLabz 3-way paid DAO membership split:
 * - 5% fixed platform fee (500 bps)
 * - 0% to 95% organizer fee (0..9500 bps)
 * - Remainder (100% - 5% - organizer%) to DAO treasury
 * Treasury share is derived as totalDrops - platformDrops - organizerDrops so the split never loses a drop.
 */
export function computeShadowLabzSplit(
  totalDrops: bigint,
  organizerFeeBps: number,
): DaoRevenueSplit {
  if (totalDrops <= 0n) {
    throw new Error("totalDrops must be positive");
  }
  if (!Number.isInteger(organizerFeeBps) || organizerFeeBps < 0 || organizerFeeBps > 9500) {
    throw new Error("organizerFeeBps must be an integer between 0 and 9500 (0% to 95%)");
  }
  const platformFeeBps = 500 as const;
  const treasuryShareBps = 10000 - platformFeeBps - organizerFeeBps;
  const platformDrops = (totalDrops * 500n) / 10000n;
  const organizerDrops = (totalDrops * BigInt(organizerFeeBps)) / 10000n;
  const treasuryDrops = totalDrops - platformDrops - organizerDrops;

  return {
    totalDrops,
    platformFeeBps,
    organizerFeeBps,
    treasuryShareBps,
    platformDrops,
    organizerDrops,
    treasuryDrops,
  };
}

export function usdToXrpDrops(usdAmount: number, xrpUsdPrice = 2.5): bigint {
  if (usdAmount <= 0) return 0n;
  const xrp = usdAmount / xrpUsdPrice;
  return BigInt(Math.round(xrp * 1_000_000));
}

export const PAYMENT_HEADER = "X-Payment";
export const KYC_PROOF_HEADER = "X-Midnight-Kyc";

export const XRPL_AI_STARTER_KIT_SOURCE_TAG = 20260530;
export const XRPL_X402_SHADOWLABZ_SOURCE_TAG = 20260601;

export const RLUSD_CURRENCY_HEX = "524C555344000000000000000000000000000000";
export const RLUSD_ISSUER_TESTNET = "rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV";
export const RLUSD_ISSUER_MAINNET = "rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De";
