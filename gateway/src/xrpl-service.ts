import type { Payment, EscrowCreate } from "xrpl";
import { XRPL_AI_STARTER_KIT_SOURCE_TAG, XRPL_X402_SHADOWLABZ_SOURCE_TAG, type DaoRevenueSplit } from "@swell/shared";
import {
  buildXrpPayment,
  buildRlusdPayment,
  buildEscrowCreate,
  buildSplitPayments,
  formatXrplTransactionPreview as formatPreview,
  type MemoPayload,
  type XrplNetwork,
} from "@swell/agent-wallet";

export { unixToRippleTime, RIPPLE_EPOCH_OFFSET, buildXrplMemo } from "@swell/agent-wallet";

/**
 * ShadowLabz-flavoured wrappers over the generic @swell/agent-wallet builders. These produce UNSIGNED
 * transactions for the payer's own wallet (Swell agent wallet, Xaman, OWS) — the gateway never signs.
 */
export type ShadowLabzMemoPayload = MemoPayload & {
  app: "shadowlabz-agility-core";
  dao_id?: string;
  plan_tier?: string;
  kyc_nullifier: string;
};

const memo = (p: { action: string; dao_id?: string; plan_tier?: string; kyc_nullifier: string }): ShadowLabzMemoPayload => ({ ...p, app: "shadowlabz-agility-core" });

export function buildKycVerifiedXrpPayment(params: {
  account: string;
  destination: string;
  amountDrops: bigint;
  kycNullifierHex: string;
  action: string;
  daoId?: string;
  planTier?: string;
  destinationTag?: number;
  isX402?: boolean;
}): Payment {
  return buildXrpPayment({
    account: params.account,
    destination: params.destination,
    amountDrops: params.amountDrops,
    destinationTag: params.destinationTag,
    sourceTag: params.isX402 === false ? XRPL_AI_STARTER_KIT_SOURCE_TAG : XRPL_X402_SHADOWLABZ_SOURCE_TAG,
    memo: memo({ action: params.action, dao_id: params.daoId, plan_tier: params.planTier, kyc_nullifier: params.kycNullifierHex }),
  });
}

export function buildKycVerifiedRlusdPayment(params: {
  account: string;
  destination: string;
  usdValue: string;
  kycNullifierHex: string;
  action: string;
  network?: XrplNetwork;
  issuer?: string;
  daoId?: string;
  planTier?: string;
}): Payment {
  return buildRlusdPayment({
    account: params.account,
    destination: params.destination,
    value: params.usdValue,
    network: params.network ?? "testnet",
    issuer: params.issuer,
    sourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
    memo: memo({ action: params.action, dao_id: params.daoId, plan_tier: params.planTier, kyc_nullifier: params.kycNullifierHex }),
  });
}

export function buildDaoMembershipSplitPayments(params: {
  subscriberAccount: string;
  platformAddress: string;
  organizerAddress: string;
  treasuryAddress: string;
  totalDrops: bigint;
  organizerFeeBps: number;
  daoId: string;
  kycNullifierHex: string;
}): { split: DaoRevenueSplit; transactions: Payment[] } {
  return buildSplitPayments({
    account: params.subscriberAccount,
    platformAddress: params.platformAddress,
    organizerAddress: params.organizerAddress,
    treasuryAddress: params.treasuryAddress,
    totalDrops: params.totalDrops,
    organizerFeeBps: params.organizerFeeBps,
    sourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
    memo: { app: "shadowlabz-agility-core", dao_id: params.daoId, kyc_nullifier: params.kycNullifierHex },
  });
}

export function buildDaoCrowdfundingEscrow(params: {
  contributorAccount: string;
  daoTreasuryAddress: string;
  amountDrops: bigint;
  daoId: string;
  kycNullifierHex: string;
  durationSeconds?: number;
  cancelBufferSeconds?: number;
  nowUnixSeconds?: number;
}): EscrowCreate {
  const { durationSeconds = 14 * 86400, cancelBufferSeconds = 7 * 86400, nowUnixSeconds = Math.floor(Date.now() / 1000) } = params;
  return buildEscrowCreate({
    account: params.contributorAccount,
    destination: params.daoTreasuryAddress,
    amountDrops: params.amountDrops,
    finishAfterUnix: nowUnixSeconds + durationSeconds,
    cancelAfterUnix: nowUnixSeconds + durationSeconds + cancelBufferSeconds,
    sourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
    memo: memo({ action: "dao_crowdfund_escrow", dao_id: params.daoId, kyc_nullifier: params.kycNullifierHex }),
  });
}

export const formatXrplTransactionPreview = (tx: Payment | EscrowCreate, network: XrplNetwork = "testnet") => formatPreview(tx, network);
