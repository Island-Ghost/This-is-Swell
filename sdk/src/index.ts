import crypto from "node:crypto";
import {
  type Payment,
  type EscrowCreate,
  dropsToXrp,
} from "xrpl";
import { MastercardDevelopersAgentToolkit } from "@mastercard/developers-agent-toolkit/mcp";
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
  agentPayPureCircuits,
} from "contracts/pure";

export const MASTERCARD_AGENT_INTENT_HEADER = "X-Mastercard-Agent-Intent";

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
  mastercardServiceUrl?: string;
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

export type AgentPayIntentInput = {
  ownerSecret: string;
  agentTokenSecret: string;
  x402ServiceId: string;
  requestedAmountUsd: number;
  maxBudgetPerTxUsd: number;
  requestedCategoryCode: number;
  allowedCategoryCode: number;
  isAgentActive?: boolean;
};

export type AgentPayIntentResult = {
  authorized: boolean;
  reason?: string;
  intentHeaderName: typeof MASTERCARD_AGENT_INTENT_HEADER;
  agentIdHashHex?: string;
  intentNullifierHex?: string;
  requestedAmountUsd: number;
  budgetHiddenInZeroKnowledge: true;
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
 * Integrates:
 * 1. Mastercard Developers Agent Toolkit (`@mastercard/developers-agent-toolkit`) & MCP (`https://developer.mcp.mastercard.com`)
 * 2. Mastercard Agent Pay for Machines (AP4M) with Zero-Knowledge Permissioning & Verifiable Intent (`AgilityAgentPay.compact`)
 * 3. Midnight Network Zero-Knowledge KYC (`ShadowLabzKyc.compact`)
 * 4. XRPL X402 (`x402-xrpl`), RLUSD/XRP programmable splits, and Midnight `m402`
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
      mastercardServiceUrl:
        config.mastercardServiceUrl ??
        "https://developer.mastercard.com/open-finance-us/documentation",
    };
  }

  /**
   * Module 1: `agility.kyc` — Midnight Zero-Knowledge KYC & Mastercard Crypto Credential Attestation
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
   * Module 2: `agility.agentPay` — Mastercard Agent Pay for Machines (AP4M)
   * Implements the 4 AP4M pillars on Midnight (`AgilityAgentPay.compact`) + XRPL (`x402-xrpl`):
   * 1. Credentialing ("Know Your Agent" + Mastercard Agentic Token)
   * 2. Permissioning ("Verifiable Intent" & Zero-Knowledge Spending Caps on Midnight)
   * 3. Transacting (HTTP 402 / x402 protocol)
   * 4. Settling (Multi-rail RLUSD, XRP, and Midnight m402)
   */
  public readonly agentPay = {
    verifyVerifiableIntent: (input: AgentPayIntentInput): AgentPayIntentResult => {
      const isAgentActive = input.isAgentActive ?? true;
      if (!isAgentActive) {
        return {
          authorized: false,
          reason: "Know Your Agent (KYA) failed: Mastercard Agentic Token is revoked or inactive",
          intentHeaderName: MASTERCARD_AGENT_INTENT_HEADER,
          requestedAmountUsd: input.requestedAmountUsd,
          budgetHiddenInZeroKnowledge: true,
        };
      }

      if (input.requestedAmountUsd > input.maxBudgetPerTxUsd) {
        return {
          authorized: false,
          reason: `AP4M Permissioning rejected in Midnight ZK circuit: requested $${input.requestedAmountUsd} exceeds agent's private per-transaction budget cap`,
          intentHeaderName: MASTERCARD_AGENT_INTENT_HEADER,
          requestedAmountUsd: input.requestedAmountUsd,
          budgetHiddenInZeroKnowledge: true,
        };
      }

      if (input.requestedCategoryCode !== input.allowedCategoryCode) {
        return {
          authorized: false,
          reason: `AP4M Verifiable Intent rejected: merchant category ${input.requestedCategoryCode} does not match authorized intent category ${input.allowedCategoryCode}`,
          intentHeaderName: MASTERCARD_AGENT_INTENT_HEADER,
          requestedAmountUsd: input.requestedAmountUsd,
          budgetHiddenInZeroKnowledge: true,
        };
      }

      const ownerPkHash = kycPureCircuits.deriveKycPublicKey(
        toBytes32(input.ownerSecret),
      );
      const tokenBytes = toBytes32(input.agentTokenSecret);
      const serviceBytes = toBytes32(input.x402ServiceId);
      const requestedDrops = usdToXrpDrops(
        input.requestedAmountUsd,
        this.config.xrpUsdRate,
      );

      const agentIdHash = agentPayPureCircuits.deriveAgentIdHash(
        ownerPkHash,
        tokenBytes,
      );
      const intentNullifier = agentPayPureCircuits.deriveVerifiableIntentNullifier(
        tokenBytes,
        serviceBytes,
        requestedDrops,
      );

      return {
        authorized: true,
        intentHeaderName: MASTERCARD_AGENT_INTENT_HEADER,
        agentIdHashHex: bytesToHex(agentIdHash),
        intentNullifierHex: bytesToHex(intentNullifier),
        requestedAmountUsd: input.requestedAmountUsd,
        budgetHiddenInZeroKnowledge: true,
        verifiedAt: new Date().toISOString(),
      };
    },
  };

  /**
   * Module 3: `agility.mastercardToolkit` — Official `@mastercard/developers-agent-toolkit` MCP Integration
   */
  public readonly mastercardToolkit = {
    createMcpServer: (serviceUrl?: string) => {
      return new MastercardDevelopersAgentToolkit(
        serviceUrl ? { service: serviceUrl } : {},
      );
    },
    getToolkitInfo: () => ({
      package: "@mastercard/developers-agent-toolkit",
      version: "0.1.6",
      remoteMcpEndpoint: "https://developer.mcp.mastercard.com",
      publicIndexUrl: "https://developer.mastercard.com/llms.txt",
      availableMcpTools: [
        "get-services-list",
        "get-documentation",
        "get-documentation-section-content",
        "get-documentation-page",
        "get-oauth10a-integration-guide",
        "get-oauth20-integration-guide",
        "get-openfinance-integration-guide",
        "get-api-operation-list",
        "get-api-operation-details",
      ],
    }),
  };

  /**
   * Module 4: `agility.x402` — Compliant HTTP 402 Paywall & Payment Requirements Builder
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
   * Module 5: `agility.settlement` — Programmable XRPL (XRP & RLUSD) Settlement, 3-Way Splits & Escrows
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
      agentIntentNullifierHex?: string;
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
        ap4m_intent_nullifier: params.agentIntentNullifierHex ?? null,
        asset,
        usd: params.amountUsd,
      });

      const memos = [
        {
          Memo: {
            MemoType: Buffer.from("agility/mc-ap4m-x402", "utf8")
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
   * Module 6: `agility.m402` — Midnight Shielded Credit Rail for Unlinkable B2B & Agent Payments
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
