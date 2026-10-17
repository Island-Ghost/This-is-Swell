import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum EscrowStatus { Active = 0, Released = 1, Refunded = 2 }

export type Witnesses<PS> = {
  contributorSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  createCrowdfundingPool(context: __compactRuntime.CircuitContext<PS>,
                         daoId_0: Uint8Array,
                         beneficiary_0: Uint8Array,
                         goalAmount_0: bigint,
                         deadlineTimestamp_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  contributeToPool(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array,
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  releasePoolToTreasury(context: __compactRuntime.CircuitContext<PS>,
                        escrowId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  refundContribution(context: __compactRuntime.CircuitContext<PS>,
                     escrowId_0: Uint8Array,
                     amount_0: bigint,
                     refundRecipient_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  createCrowdfundingPool(context: __compactRuntime.CircuitContext<PS>,
                         daoId_0: Uint8Array,
                         beneficiary_0: Uint8Array,
                         goalAmount_0: bigint,
                         deadlineTimestamp_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  contributeToPool(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array,
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  releasePoolToTreasury(context: __compactRuntime.CircuitContext<PS>,
                        escrowId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  refundContribution(context: __compactRuntime.CircuitContext<PS>,
                     escrowId_0: Uint8Array,
                     amount_0: bigint,
                     refundRecipient_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
  deriveEscrowId(daoId_0: Uint8Array,
                 beneficiary_0: Uint8Array,
                 goalAmount_0: bigint): Uint8Array;
  deriveContributionReceipt(escrowId_0: Uint8Array,
                            secret_0: Uint8Array,
                            amount_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  deriveEscrowId(context: __compactRuntime.CircuitContext<PS>,
                 daoId_0: Uint8Array,
                 beneficiary_0: Uint8Array,
                 goalAmount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveContributionReceipt(context: __compactRuntime.CircuitContext<PS>,
                            escrowId_0: Uint8Array,
                            secret_0: Uint8Array,
                            amount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  createCrowdfundingPool(context: __compactRuntime.CircuitContext<PS>,
                         daoId_0: Uint8Array,
                         beneficiary_0: Uint8Array,
                         goalAmount_0: bigint,
                         deadlineTimestamp_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  contributeToPool(context: __compactRuntime.CircuitContext<PS>,
                   escrowId_0: Uint8Array,
                   amount_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  releasePoolToTreasury(context: __compactRuntime.CircuitContext<PS>,
                        escrowId_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  refundContribution(context: __compactRuntime.CircuitContext<PS>,
                     escrowId_0: Uint8Array,
                     amount_0: bigint,
                     refundRecipient_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  readonly escrowCount: bigint;
  escrowGoal: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  escrowRaised: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  escrowDeadline: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  escrowBeneficiary: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  escrowStatus: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): EscrowStatus;
    [Symbol.iterator](): Iterator<[Uint8Array, EscrowStatus]>
  };
  contributionReceipts: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
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
