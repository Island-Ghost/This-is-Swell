import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type AgentPolicy = { agentIdHash: Uint8Array;
                            ownerKycPkHash: Uint8Array;
                            xrplSettlementHash: Uint8Array;
                            maxSpendPerTxDrops: bigint;
                            allowedCategoryCode: bigint;
                            isActive: boolean
                          };

export type Witnesses<PS> = {
  ownerSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  agentSecretToken(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getAgentPolicy(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, AgentPolicy];
  getPolicySalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                          agentIdHash_0: Uint8Array,
                          policyCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                        agentIdHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyAgentIntentForX402(context: __compactRuntime.CircuitContext<PS>,
                           x402ServiceId_0: Uint8Array,
                           requestedAmountDrops_0: bigint,
                           requestedCategoryCode_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type ProvableCircuits<PS> = {
  registerAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                          agentIdHash_0: Uint8Array,
                          policyCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                        agentIdHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyAgentIntentForX402(context: __compactRuntime.CircuitContext<PS>,
                           x402ServiceId_0: Uint8Array,
                           requestedAmountDrops_0: bigint,
                           requestedCategoryCode_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type PureCircuits = {
  deriveAgentIdHash(ownerPkHash_0: Uint8Array, agentToken_0: Uint8Array): Uint8Array;
  deriveVerifiableIntentNullifier(agentToken_0: Uint8Array,
                                  x402ServiceId_0: Uint8Array,
                                  amountDrops_0: bigint): Uint8Array;
}

export type Circuits<PS> = {
  deriveAgentIdHash(context: __compactRuntime.CircuitContext<PS>,
                    ownerPkHash_0: Uint8Array,
                    agentToken_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveVerifiableIntentNullifier(context: __compactRuntime.CircuitContext<PS>,
                                  agentToken_0: Uint8Array,
                                  x402ServiceId_0: Uint8Array,
                                  amountDrops_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
  registerAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                          agentIdHash_0: Uint8Array,
                          policyCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeAgentCredential(context: __compactRuntime.CircuitContext<PS>,
                        agentIdHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifyAgentIntentForX402(context: __compactRuntime.CircuitContext<PS>,
                           x402ServiceId_0: Uint8Array,
                           requestedAmountDrops_0: bigint,
                           requestedCategoryCode_0: bigint): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly registeredAgentCount: bigint;
  readonly verifiedIntentCount: bigint;
  agentPolicyCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  revokedAgents: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  executedIntentNullifiers: {
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
