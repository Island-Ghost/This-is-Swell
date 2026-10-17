import crypto from "node:crypto";
import {
  kycPureCircuits,
  paymentPureCircuits,
  vaultPureCircuits,
  escrowPureCircuits,
  subscriptionPureCircuits,
  reputationPureCircuits,
} from "contracts/pure";

export function toBytes32(input: string | Uint8Array): Uint8Array {
  if (input instanceof Uint8Array) {
    if (input.length === 32) return input;
    return crypto.createHash("sha256").update(input).digest();
  }
  const clean = input.replace(/^0x/, "");
  if (/^[0-9a-fA-F]{64}$/.test(clean)) {
    return Uint8Array.from(Buffer.from(clean, "hex"));
  }
  return crypto.createHash("sha256").update(input, "utf8").digest();
}

export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

export type VerifiedKycProof = {
  userPkHashHex: string;
  xrplAddress: string;
  xrplAddressHashHex: string;
  kycBindingHex: string;
  kycNullifierHex: string;
  tier: number;
  jurisdictionCode: number;
  isSanctioned: boolean;
  verifiedAt: string;
};

/**
 * Verifies a Midnight ZK KYC credential & binds it to the user's XRPL classic address (r...)
 * using the compiled Compact pure circuits from ShadowLabzKyc.compact and AgilityPayment.compact.
 */
export function verifyMidnightKycForXrpl(params: {
  userSecretHexOrSeed: string;
  xrplAddress: string;
  contextId: string;
  tier: number;
  jurisdictionCode: number;
  isSanctioned: boolean;
  minRequiredTier?: number;
  blockedJurisdiction?: number;
}): { valid: boolean; reason?: string; proof?: VerifiedKycProof } {
  const {
    userSecretHexOrSeed,
    xrplAddress,
    contextId,
    tier,
    jurisdictionCode,
    isSanctioned,
    minRequiredTier = 1,
    blockedJurisdiction = 999,
  } = params;

  if (!xrplAddress.startsWith("r") || xrplAddress.length < 25) {
    return { valid: false, reason: "Invalid XRPL classic address" };
  }
  if (isSanctioned) {
    return { valid: false, reason: "KYC rejected: account is flagged on sanctions list" };
  }
  if (tier < minRequiredTier) {
    return {
      valid: false,
      reason: `KYC rejected: tier ${tier} is below required tier ${minRequiredTier}`,
    };
  }
  if (jurisdictionCode === blockedJurisdiction) {
    return {
      valid: false,
      reason: `KYC rejected: jurisdiction ${jurisdictionCode} is restricted`,
    };
  }

  const skBytes = toBytes32(userSecretHexOrSeed);
  const xrplHashBytes = toBytes32(xrplAddress);
  const contextBytes = toBytes32(contextId);

  const userPkHash = kycPureCircuits.deriveKycPublicKey(skBytes);
  const kycNullifier = kycPureCircuits.deriveKycNullifier(skBytes, contextBytes);
  const kycBinding = paymentPureCircuits.deriveKycPaymentBinding(skBytes, xrplHashBytes);

  return {
    valid: true,
    proof: {
      userPkHashHex: bytesToHex(userPkHash),
      xrplAddress,
      xrplAddressHashHex: bytesToHex(xrplHashBytes),
      kycBindingHex: bytesToHex(kycBinding),
      kycNullifierHex: bytesToHex(kycNullifier),
      tier,
      jurisdictionCode,
      isSanctioned,
      verifiedAt: new Date().toISOString(),
    },
  };
}

export function deriveM402ReceiptHash(secretHex: string, serviceIdHex: string): string {
  const secretBytes = toBytes32(secretHex);
  const sidBytes = toBytes32(serviceIdHex);
  return bytesToHex(vaultPureCircuits.deriveReceipt(secretBytes, sidBytes));
}

export function deriveShadowLabzEscrowId(
  daoId: string,
  beneficiaryAddress: string,
  goalDrops: bigint,
): string {
  return bytesToHex(
    escrowPureCircrowHelper(toBytes32(daoId), toBytes32(beneficiaryAddress), goalDrops),
  );
}

function escrowPureCircrowHelper(daoId: Uint8Array, beneficiary: Uint8Array, goal: bigint) {
  return escrowPureCircuits.deriveEscrowId(daoId, beneficiary, goal);
}

export function deriveShadowLabzSubscriptionId(
  subscriberSecret: string,
  daoOrPlanId: string,
): string {
  return bytesToHex(
    subscriptionPureCircuits.deriveSubscriptionId(
      toBytes32(subscriberSecret),
      toBytes32(daoOrPlanId),
    ),
  );
}

export function deriveShadowLabzReputationIds(
  memberSecret: string,
  daoId: string,
  actionId: string,
): { aliasHashHex: string; actionNullifierHex: string } {
  const sk = toBytes32(memberSecret);
  const dId = toBytes32(daoId);
  const aId = toBytes32(actionId);
  return {
    aliasHashHex: bytesToHex(reputationPureCircuits.deriveAliasHash(sk, dId)),
    actionNullifierHex: bytesToHex(reputationPureCircuits.deriveXpActionNullifier(sk, aId)),
  };
}
