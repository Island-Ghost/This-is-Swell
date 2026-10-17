import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type Witnesses<PS> = {
  memberSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerDaoAlias(context: __compactRuntime.CircuitContext<PS>,
                   daoId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  awardGovernanceXp(context: __compactRuntime.CircuitContext<PS>,
                    daoId_0: Uint8Array,
                    actionId_0: Uint8Array,
                    xpPoints_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  proveMinimumXp(context: __compactRuntime.CircuitContext<PS>,
                 daoId_0: Uint8Array,
                 minXp_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
}

export type ProvableCircuits<PS> = {
  registerDaoAlias(context: __compactRuntime.CircuitContext<PS>,
                   daoId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  awardGovernanceXp(context: __compactRuntime.CircuitContext<PS>,
                    daoId_0: Uint8Array,
                    actionId_0: Uint8Array,
                    xpPoints_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  proveMinimumXp(context: __compactRuntime.CircuitContext<PS>,
                 daoId_0: Uint8Array,
                 minXp_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
}

export type PureCircuits = {
  deriveAliasHash(memberSk_0: Uint8Array, daoId_0: Uint8Array): Uint8Array;
  deriveXpActionNullifier(memberSk_0: Uint8Array, actionId_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveAliasHash(context: __compactRuntime.CircuitContext<PS>,
                  memberSk_0: Uint8Array,
                  daoId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveXpActionNullifier(context: __compactRuntime.CircuitContext<PS>,
                          memberSk_0: Uint8Array,
                          actionId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerDaoAlias(context: __compactRuntime.CircuitContext<PS>,
                   daoId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  awardGovernanceXp(context: __compactRuntime.CircuitContext<PS>,
                    daoId_0: Uint8Array,
                    actionId_0: Uint8Array,
                    xpPoints_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  proveMinimumXp(context: __compactRuntime.CircuitContext<PS>,
                 daoId_0: Uint8Array,
                 minXp_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
}

export type Ledger = {
  readonly activeMemberCount: bigint;
  readonly totalXpAwarded: bigint;
  aliasXp: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): bigint;
    [Symbol.iterator](): Iterator<[Uint8Array, bigint]>
  };
  claimedActionNullifiers: {
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
