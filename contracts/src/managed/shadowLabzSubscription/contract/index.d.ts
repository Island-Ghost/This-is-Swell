import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum PlanTier { Free = 0,
                       Starter = 1,
                       Community = 2,
                       Growth = 3,
                       Corporate = 4
}

export type Witnesses<PS> = {
  subscriberSecret(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  subscriptionSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  configureDaoSubscriptionSplit(context: __compactRuntime.CircuitContext<PS>,
                                daoId_0: Uint8Array,
                                organizerBps_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  createSubscription(context: __compactRuntime.CircuitContext<PS>,
                     daoOrPlanId_0: Uint8Array,
                     tier_0: PlanTier,
                     xrplPaymentReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  renewSubscription(context: __compactRuntime.CircuitContext<PS>,
                    daoOrPlanId_0: Uint8Array,
                    tier_0: PlanTier,
                    xrplRenewalReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type ProvableCircuits<PS> = {
  configureDaoSubscriptionSplit(context: __compactRuntime.CircuitContext<PS>,
                                daoId_0: Uint8Array,
                                organizerBps_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  createSubscription(context: __compactRuntime.CircuitContext<PS>,
                     daoOrPlanId_0: Uint8Array,
                     tier_0: PlanTier,
                     xrplPaymentReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  renewSubscription(context: __compactRuntime.CircuitContext<PS>,
                    daoOrPlanId_0: Uint8Array,
                    tier_0: PlanTier,
                    xrplRenewalReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type PureCircuits = {
  deriveSubscriptionId(subscriberSecretKey_0: Uint8Array,
                       daoOrPlanId_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveSubscriptionId(context: __compactRuntime.CircuitContext<PS>,
                       subscriberSecretKey_0: Uint8Array,
                       daoOrPlanId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  configureDaoSubscriptionSplit(context: __compactRuntime.CircuitContext<PS>,
                                daoId_0: Uint8Array,
                                organizerBps_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  createSubscription(context: __compactRuntime.CircuitContext<PS>,
                     daoOrPlanId_0: Uint8Array,
                     tier_0: PlanTier,
                     xrplPaymentReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  renewSubscription(context: __compactRuntime.CircuitContext<PS>,
                    daoOrPlanId_0: Uint8Array,
                    tier_0: PlanTier,
                    xrplRenewalReceipt_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly subscriptionCount: bigint;
  readonly renewalCount: bigint;
  daoOrganizerFeeBps: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  activeSubscriptionCommitments: {
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
