import crypto from "node:crypto";
import {
  type Payment,
  type EscrowCreate,
  dropsToXrp,
} from "xrpl";
import {
  computeShadowLabzSplit,
  usdToXrpDrops,
  PAYMENT_HEADER,
  KYC_PROOF_HEADER,
  XRPL_AI_STARTER_KIT_SOURCE_TAG,
  XRPL_X402_SHADOWLABZ_SOURCE_TAG,
  RLUSD_CURRENCY_HEX,
  RLUSD_ISSUER_TESTNET,
  RLUSD_ISSUER_MAINNET,
  type DaoRevenueSplit,
  type PaymentRequired,
} from "@swell/shared";
import {
  kycPureCircuits,
  paymentPureCircuits,
  vaultPureCircuits,
  escrowPureCircuits,
  subscriptionPureCircuits,
  reputationPureCircuits,
} from "contracts/pure";

export type AgilitySdkConfig = {
  xrplNetwork?: "xrpl:1" | "xrpl:0";
  xrplRpcUrl?: string;
  facilitatorUrl?: string;
  merchantXrplAddress: string;
  midnightNetwork?: "preview" | "preprod" | "undeployed";
  m402VaultAddress?: string;
  kycContractAddress?: string;
  kycAuthorityId?: string;
  defaultAsset?: "XRP" | "RLUSD";
  sourceTag?: number;
  xrpUsdRate?: number;
};

export type KycAttestationInput = {
  userSecret: string;
  xrplAddress: string;
  contextId?: string;
  tier: number;
  jurisdictionCode: number;
  isSanctioned: boolean;
  issuerLabel?: string;
};

export type KycCompliancePolicy = {
  minKycTier?: number;
  blockedJurisdictions?: number[];
};

export type KycAttestationResult = {
  compliant: boolean;
  reason?: string;
  kycHeaderName: typeof KYC_PROOF_HEADER;
  kycNullifierHex?: string;
  userPkHashHex?: string;
  xrplAddressHashHex?: string;
  kycBindingHex?: string;
  issuerAuthority?: string;
  tier?: number;
  jurisdictionCode?: number;
  verifiedAt?: string;
};

export type CompliantX402RequirementConfig = {
  serviceId: string;
  description: string;
  amountUsd: number;
  asset?: "XRP" | "RLUSD";
  minKycTier?: number;
  blockedJurisdictions?: number[];
  split?: {
    organizerOrAcquirerFeeBps: number;
    organizerOrAcquirerAddress: string;
    treasuryOrMerchantAddress: string;
  };
};

function toBytes32(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    return input.length === 32
      ? input
      : crypto.createHash("sha256").update(input).digest();
  }
  const clean = input.replace(/^0x/, "");
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return Uint8Array.from(Buffer.from(clean, "hex"));
  }
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * `@agility/sdk` — Unified Compliance & Agentic Settlement SDK
 * Combines Midnight Network Zero-Knowledge KYC (`ShadowLabzKyc.compact`)
 * with XRPL X402 (`x402-xrpl`), RLUSD/XRP programmable splits, and Midnight `m402`.
 */
export class AgilitySDK {
  public readonly config: Required<AgilitySdkConfig>;

  constructor(config: AgilitySdkConfig) {
    const xrplNetwork = config.xrplNetwork ?? "xrpl:1";
    this.config = {
      xrplNetwork,
      xrplRpcUrl:
        config.xrplRpcUrl ??
        (xrplNetwork === "xrpl:0"
          ? "https://xrplcluster.com/"
          : "https://s.altnet.rippletest.net:51234/"),
      facilitatorUrl:
        config.facilitatorUrl ??
        (xrplNetwork === "xrpl:0"
          ? "https://xrpl-facilitator-mainnet.t54.ai"
          : "https://xrpl-facilitator-testnet.t54.ai"),
      merchantXrplAddress: config.merchantXrplAddress,
      midnightNetwork: config.midnightNetwork ?? "preview",
      m402VaultAddress:
        config.m402VaultAddress ??
        "17b4cf15ad768fa0e5090da960e86eaf7cc885f86eb5a6b241e2fd28d98546ae",
      kycContractAddress:
        config.kycContractAddress ??
        "c0ffee00112233445566778899aabbccddeeff00112233445566778899aabbcc",
      kycAuthorityId: config.kycAuthorityId ?? "mastercard-crypto-credential",
      defaultAsset: config.defaultAsset ?? "RLUSD",
      sourceTag: config.sourceTag ?? XRPL_X402_SHADOWLABZ_SOURCE_TAG,
      xrpUsdRate: config.xrpUsdRate ?? 2.5,
    };
  }

  /**
   * Module 1: `agility.kyc` — Midnight Zero-Knowledge KYC & Crypto Credential Attestation
   */
  public readonly kyc = {
    proveCompliance: (
      input: KycAttestationInput,
      policy: KycCompliancePolicy = {},
    ): KycAttestationResult => {
      const minKycTier = policy.minKycTier ?? 1;
      const blockedJurisdictions = policy.blockedJurisdictions ?? [408, 364, 760];

      if (!input.xrplAddress.startsWith("r") || input.xrplAddress.length < 25) {
        return {
          compliant: false,
          reason: "Invalid XRPL classic address",
          kycHeaderName: KYC_PROOF_HEADER,
        };
      }
      if (input.isSanctioned) {
        return {
          compliant: false,
          reason: "Blocked by OFAC / Sanctions screening inside Midnight ZK circuit",
          kycHeaderName: KYC_PROOF_HEADER,
        };
      }
      if (input.tier < minKycTier) {
        return {
          compliant: false,
          reason: `Insufficient KYC Tier: credential is Tier ${input.tier}, endpoint requires Tier >= ${minKycTier}`,
          kycHeaderName: KYC_PROOF_HEADER,
        };
      }
      if (blockedJurisdictions.includes(input.jurisdictionCode)) {
        return {
          compliant: false,
          reason: `Restricted jurisdiction (${input.jurisdictionCode}) blocked by Midnight ZK circuit`,
          kycHeaderName: KYC_PROOF_HEADER,
        };
      }

      const skBytes = toBytes32(input.userSecret);
      const xrplHashBytes = toBytes32(input.xrplAddress);
      const contextBytes = toBytes32(input.contextId ?? "agility:sdk:default");

      const userPkHash = kycPureCircuits.deriveKycPublicKey(skBytes);
      const kycNullifier = kycPureCircuits.deriveKycNullifier(skBytes, contextBytes);
      const kycBinding = paymentPureCircuits.deriveKycPaymentBinding(
        skBytes,
        xrplHashBytes,
      );

      return {
        compliant: true,
        kycHeaderName: KYC_PROOF_HEADER,
        kycNullifierHex: bytesToHex(kycNullifier),
        userPkHashHex: bytesToHex(userPkHash),
        xrplAddressHashHex: bytesToHex(xrplHashBytes),
        kycBindingHex: bytesToHex(kycBinding),
        issuerAuthority: input.issuerLabel ?? this.config.kycAuthorityId,
        tier: input.tier,
        jurisdictionCode: input.jurisdictionCode,
        verifiedAt: new Date().toISOString(),
      };
    },
  };

  /**
   * Module 2: `agility.x402` — Compliant HTTP 402 Paywall & Payment Requirements Builder
   */
  public readonly x402 = {
    buildPaymentRequired: (
      reqConfig: CompliantX402RequirementConfig,
    ): PaymentRequired => {
      const drops = usdToXrpDrops(reqConfig.amountUsd, this.config.xrpUsdRate);
      return {
        protocol: "dual-402",
        serviceId: bytesToHex(
          subscriptionPureCircuits.deriveSubscriptionId(
            toBytes32(this.config.kycAuthorityId),
            toBytes32(reqConfig.serviceId),
          ),
        ),
        description: reqConfig.description,
        xrpl: {
          network: this.config.xrplNetwork,
          asset: reqConfig.asset ?? this.config.defaultAsset,
          priceDrops: drops.toString(),
          priceUsd: reqConfig.amountUsd,
          payToAddress: this.config.merchantXrplAddress,
          facilitatorUrl: this.config.facilitatorUrl,
          sourceTag: this.config.sourceTag,
        },
        midnight: {
          network: this.config.midnightNetwork,
          vaultAddress: this.config.m402VaultAddress,
          kycContractAddress: this.config.kycContractAddress,
          priceStar: Math.round(reqConfig.amountUsd * 50_000).toString(),
          requiresKyc: true,
          minKycTier: reqConfig.minKycTier ?? 1,
        },
      };
    },
  };

  /**
   * Module 3: `agility.settlement` — Programmable XRPL (XRP & RLUSD) Settlement, 3-Way Splits & Escrows
   */
  public readonly settlement = {
    computeSplit: (totalDrops: bigint, organizerOrAcquirerBps: number): DaoRevenueSplit => {
      return computeShadowLabzSplit(totalDrops, organizerOrAcquirerBps);
    },

    buildCompliantPaymentTx: (params: {
      payerXrplAddress: string;
      destinationXrplAddress?: string;
      amountUsd: number;
      asset?: "XRP" | "RLUSD";
      kycNullifierHex: string;
      action: string;
    }): Payment => {
      const asset = params.asset ?? this.config.defaultAsset;
      const destination =
        params.destinationXrplAddress ?? this.config.merchantXrplAddress;
      const memoPayload = JSON.stringify({
        sdk: "@agility/sdk",
        authority: this.config.kycAuthorityId,
        action: params.action,
        kyc_nullifier: params.kycNullifierHex,
        asset,
        usd: params.amountUsd,
      });

      const memos = [
        {
          Memo: {
            MemoType: Buffer.from("agility/zk-kyc-x402", "utf8")
              .toString("hex")
              .toUpperCase(),
            MemoData: Buffer.from(memoPayload, "utf8").toString("hex").toUpperCase(),
          },
        },
      ];

      if (asset === "RLUSD") {
        const issuer =
          this.config.xrplNetwork === "xrpl:0"
            ? RLUSD_ISSUER_MAINNET
            : RLUSD_ISSUER_TESTNET;
        return {
          TransactionType: "Payment",
          Account: params.payerXrplAddress,
          Destination: destination,
          Amount: {
            currency: RLUSD_CURRENCY_HEX,
            issuer,
            value: params.amountUsd.toFixed(2),
          },
          SourceTag: this.config.sourceTag,
          Memos: memos,
        };
      }

      const drops = usdToXrpDrops(params.amountUsd, this.config.xrpUsdRate);
      return {
        TransactionType: "Payment",
        Account: params.payerXrplAddress,
        Destination: destination,
        Amount: drops.toString(),
        SourceTag: this.config.sourceTag,
        Memos: memos,
      };
    },

    buildEscrowPair: (params: {
      daoOrProjectId: string;
      contributorXrplAddress: string;
      beneficiaryXrplAddress: string;
      contributionUsd: number;
      goalUsd: number;
      kycNullifierHex: string;
      durationDays?: number;
    }): { midnightEscrowId: string; xrplEscrowTx: EscrowCreate } => {
      const contributionDrops = usdToXrpDrops(
        params.contributionUsd,
        this.config.xrpUsdRate,
      );
      const goalDrops = usdToXrpDrops(params.goalUsd, this.config.xrpUsdRate);
      const midnightEscrowId = bytesToHex(
        escrowPureCircuits.deriveEscrowId(
          toBytes32(params.daoOrProjectId),
          toBytes32(params.beneficiaryXrplAddress),
          goalDrops,
        ),
      );
      const nowSec = Math.floor(Date.now() / 1000);
      const durationSec = (params.durationDays ?? 14) * 86400;
      const rippleEpochOffset = 946_684_800;

      const xrplEscrowTx: EscrowCreate = {
        TransactionType: "EscrowCreate",
        Account: params.contributorXrplAddress,
        Destination: params.beneficiaryXrplAddress,
        Amount: contributionDrops.toString(),
        FinishAfter: nowSec + durationSec - rippleEpochOffset,
        CancelAfter: nowSec + durationSec + 7 * 86400 - rippleEpochOffset,
        SourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
      };

      return { midnightEscrowId, xrplEscrowTx };
    },
  };

  /**
   * Module 4: `agility.m402` — Midnight Shielded Credit Rail for Unlinkable B2B & Agent Payments
   */
  public readonly m402 = {
    deriveReceiptHash: (receiptSecretHex: string, serviceIdHex: string): string => {
      return bytesToHex(
        vaultPureCircuits.deriveReceipt(
          toBytes32(receiptSecretHex),
          toBytes32(serviceIdHex),
        ),
      );
    },
    deriveCreditColor: (vaultAddressHex?: string): string => {
      const addr = vaultAddressHex ?? this.config.m402VaultAddress;
      return bytesToHex(
        vaultPureCircuits.creditColor({ bytes: toBytes32(addr) }),
      );
    },
    deriveAnonymousAlias: (memberSecret: string, scopeId: string): string => {
      return bytesToHex(
        reputationPureCircuits.deriveAliasHash(
          toBytes32(memberSecret),
          toBytes32(scopeId),
        ),
      );
    },
  };
}

export {
  PAYMENT_HEADER,
  KYC_PROOF_HEADER,
  RLUSD_CURRENCY_HEX,
  RLUSD_ISSUER_TESTNET,
  RLUSD_ISSUER_MAINNET,
  computeShadowLabzSplit,
  usdToXrpDrops,
  dropsToXrp,
};
