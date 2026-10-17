import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type PaymentSplit = { platformAmount: bigint;
                             organizerAmount: bigint;
                             treasuryAmount: bigint
                           };

export type Witnesses<PS> = {
  payerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  paymentMetadataSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  kycProofSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  recordKycVerifiedPayment(context: __compactRuntime.CircuitContext<PS>,
                           daoId_0: Uint8Array,
                           paymentId_0: Uint8Array,
                           xrplTxHash_0: Uint8Array,
                           amountDrops_0: bigint,
                           kycBindingCommitment_0: Uint8Array,
                           xrplAccountHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  payUnshieldedNight(context: __compactRuntime.CircuitContext<PS>,
                     recipient_0: Uint8Array,
                     amount_0: bigint,
                     paymentId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type ProvableCircuits<PS> = {
  recordKycVerifiedPayment(context: __compactRuntime.CircuitContext<PS>,
                           daoId_0: Uint8Array,
                           paymentId_0: Uint8Array,
                           xrplTxHash_0: Uint8Array,
                           amountDrops_0: bigint,
                           kycBindingCommitment_0: Uint8Array,
                           xrplAccountHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  payUnshieldedNight(context: __compactRuntime.CircuitContext<PS>,
                     recipient_0: Uint8Array,
                     amount_0: bigint,
                     paymentId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type PureCircuits = {
  derivePaymentReceipt(paymentId_0: Uint8Array,
                       xrplTxHash_0: Uint8Array,
                       kycNullifier_0: Uint8Array): Uint8Array;
  deriveKycPaymentBinding(userSk_0: Uint8Array, xrplAccountHash_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  derivePaymentReceipt(context: __compactRuntime.CircuitContext<PS>,
                       paymentId_0: Uint8Array,
                       xrplTxHash_0: Uint8Array,
                       kycNullifier_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveKycPaymentBinding(context: __compactRuntime.CircuitContext<PS>,
                          userSk_0: Uint8Array,
                          xrplAccountHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  recordKycVerifiedPayment(context: __compactRuntime.CircuitContext<PS>,
                           daoId_0: Uint8Array,
                           paymentId_0: Uint8Array,
                           xrplTxHash_0: Uint8Array,
                           amountDrops_0: bigint,
                           kycBindingCommitment_0: Uint8Array,
                           xrplAccountHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  payUnshieldedNight(context: __compactRuntime.CircuitContext<PS>,
                     recipient_0: Uint8Array,
                     amount_0: bigint,
                     paymentId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly paymentCount: bigint;
  verifiedPaymentReceipts: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  daoTreasuryVolume: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
