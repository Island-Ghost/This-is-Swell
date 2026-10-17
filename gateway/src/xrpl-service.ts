import {
  type Payment,
  type EscrowCreate,
  dropsToXrp,
} from "xrpl";
import {
  computeShadowLabzSplit,
  XRPL_AI_STARTER_KIT_SOURCE_TAG,
  XRPL_X402_SHADOWLABZ_SOURCE_TAG,
  RLUSD_CURRENCY_HEX,
  RLUSD_ISSUER_TESTNET,
  type DaoRevenueSplit,
} from "@swell/shared";

export const RIPPLE_EPOCH_OFFSET = 946_684_800;

export function unixToRippleTime(unixSeconds: number): number {
  return Math.floor(unixSeconds) - RIPPLE_EPOCH_OFFSET;
}

export type ShadowLabzMemoPayload = {
  app: "shadowlabz-agility-core";
  action: string;
  dao_id?: string;
  plan_tier?: string;
  kyc_nullifier: string;
  ts: string;
};

export function buildXrplMemo(payload: ShadowLabzMemoPayload) {
  const json = JSON.stringify(payload);
  return {
    Memo: {
      MemoType: Buffer.from("shadowlabz/agility-kyc", "utf8").toString("hex").toUpperCase(),
      MemoData: Buffer.from(json, "utf8").toString("hex").toUpperCase(),
    },
  };
}

/**
 * Constructs an unsigned XRPL Payment object following the `xrpl-payments` and `xrpl-agent-wallet` skills.
 * Does NOT set Fee, Sequence, or LastLedgerSequence (populated by `client.autofill(tx)` in the Wallet skill).
 */
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
  const {
    account,
    destination,
    amountDrops,
    kycNullifierHex,
    action,
    daoId,
    planTier,
    destinationTag,
    isX402 = true,
  } = params;

  const tx: Payment = {
    TransactionType: "Payment",
    Account: account,
    Destination: destination,
    Amount: amountDrops.toString(),
    SourceTag: isX402 ? XRPL_X402_SHADOWLABZ_SOURCE_TAG : XRPL_AI_STARTER_KIT_SOURCE_TAG,
    Memos: [
      buildXrplMemo({
        app: "shadowlabz-agility-core",
        action,
        dao_id: daoId,
        plan_tier: planTier,
        kyc_nullifier: kycNullifierHex,
        ts: new Date().toISOString(),
      }),
    ],
  };

  if (destinationTag !== undefined) {
    tx.DestinationTag = destinationTag;
  }

  return tx;
}

/**
 * Constructs an unsigned RLUSD Payment on XRPL for dollar-stable DAO subscriptions.
 */
export function buildKycVerifiedRlusdPayment(params: {
  account: string;
  destination: string;
  usdValue: string;
  kycNullifierHex: string;
  action: string;
  issuer?: string;
  daoId?: string;
  planTier?: string;
}): Payment {
  const {
    account,
    destination,
    usdValue,
    kycNullifierHex,
    action,
    issuer = RLUSD_ISSUER_TESTNET,
    daoId,
    planTier,
  } = params;

  return {
    TransactionType: "Payment",
    Account: account,
    Destination: destination,
    Amount: {
      currency: RLUSD_CURRENCY_HEX,
      issuer,
      value: usdValue,
    },
    SourceTag: XRPL_X402_SHADOWLABZ_SOURCE_TAG,
    Memos: [
      buildXrplMemo({
        app: "shadowlabz-agility-core",
        action,
        dao_id: daoId,
        plan_tier: planTier,
        kyc_nullifier: kycNullifierHex,
        ts: new Date().toISOString(),
      }),
    ],
  };
}

/**
 * Builds the 3-way split payment transactions for ShadowLabz Paid DAO Membership Subscriptions:
 * 1. 5% Platform Fee -> ShadowLabz Platform Wallet
 * 2. Organizer Fee (0-95%) -> DAO Organizer Wallet (if > 0)
 * 3. Remainder (100% - 5% - organizer%) -> DAO Treasury Wallet (if > 0)
 */
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
  const split = computeShadowLabzSplit(params.totalDrops, params.organizerFeeBps);
  const transactions: Payment[] = [];

  if (split.platformDrops > 0n) {
    transactions.push(
      buildKycVerifiedXrpPayment({
        account: params.subscriberAccount,
        destination: params.platformAddress,
        amountDrops: split.platformDrops,
        kycNullifierHex: params.kycNullifierHex,
        action: "dao_membership_platform_fee_5pct",
        daoId: params.daoId,
      }),
    );
  }

  if (split.organizerDrops > 0n) {
    transactions.push(
      buildKycVerifiedXrpPayment({
        account: params.subscriberAccount,
        destination: params.organizerAddress,
        amountDrops: split.organizerDrops,
        kycNullifierHex: params.kycNullifierHex,
        action: `dao_membership_organizer_${params.organizerFeeBps}bps`,
        daoId: params.daoId,
      }),
    );
  }

  if (split.treasuryDrops > 0n) {
    transactions.push(
      buildKycVerifiedXrpPayment({
        account: params.subscriberAccount,
        destination: params.treasuryAddress,
        amountDrops: split.treasuryDrops,
        kycNullifierHex: params.kycNullifierHex,
        action: `dao_membership_treasury_${split.treasuryShareBps}bps`,
        daoId: params.daoId,
      }),
    );
  }

  return { split, transactions };
}

/**
 * Builds a 2-week ShadowLabz DAO Crowdfunding EscrowCreate transaction on XRPL.
 */
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
  const {
    contributorAccount,
    daoTreasuryAddress,
    amountDrops,
    daoId,
    kycNullifierHex,
    durationSeconds = 14 * 24 * 3600, // 2-week pool default per ShadowLabz Community plan
    cancelBufferSeconds = 7 * 24 * 3600,
    nowUnixSeconds = Math.floor(Date.now() / 1000),
  } = params;

  return {
    TransactionType: "EscrowCreate",
    Account: contributorAccount,
    Destination: daoTreasuryAddress,
    Amount: amountDrops.toString(),
    FinishAfter: unixToRippleTime(nowUnixSeconds + durationSeconds),
    CancelAfter: unixToRippleTime(nowUnixSeconds + durationSeconds + cancelBufferSeconds),
    SourceTag: XRPL_AI_STARTER_KIT_SOURCE_TAG,
    Memos: [
      buildXrplMemo({
        app: "shadowlabz-agility-core",
        action: "dao_crowdfund_escrow",
        dao_id: daoId,
        kyc_nullifier: kycNullifierHex,
        ts: new Date(nowUnixSeconds * 1000).toISOString(),
      }),
    ],
  };
}

/**
 * Produces the rigid human-confirmation preview required by the `xrpl-agent-wallet` skill.
 */
export function formatXrplTransactionPreview(
  tx: Payment | EscrowCreate,
  network: "testnet" | "mainnet" = "testnet",
): string {
  const amountField = tx.Amount;
  const amountDisplay =
    typeof amountField === "string"
      ? `${dropsToXrp(amountField)} XRP (${amountField} drops)`
      : "currency" in amountField
        ? `${amountField.value} ${amountField.currency} (issuer: ${amountField.issuer})`
        : `${amountField.value} (mpt_issuance_id: ${amountField.mpt_issuance_id})`;

  const feeDrops = tx.Fee ?? "12";
  const feeXrp = dropsToXrp(feeDrops);
  const memoHex = tx.Memos?.[0]?.Memo?.MemoData;
  const decodedMemo = memoHex ? Buffer.from(memoHex, "hex").toString("utf8") : "—";

  return [
    "─── XRPL Transaction Preview ────────────────────────────────────────",
    `Network           : ${network}`,
    `Type              : ${tx.TransactionType}`,
    `From              : ${tx.Account}`,
    `To                : ${tx.Destination ?? "—"}`,
    `Amount            : ${amountDisplay}`,
    `Fee               : ${feeXrp} XRP (${feeDrops} drops)`,
    `Sequence          : ${tx.Sequence ?? "(autofilled at sign time)"}`,
    `LastLedgerSequence: ${tx.LastLedgerSequence ?? "(autofilled at sign time)"}`,
    `Flags             : ${tx.Flags ?? 0}`,
    `Memos             : ${decodedMemo}`,
    `SourceTag         : ${tx.SourceTag ?? XRPL_AI_STARTER_KIT_SOURCE_TAG}`,
    "─────────────────────────────────────────────────────────────────────",
  ].join("\n");
}
