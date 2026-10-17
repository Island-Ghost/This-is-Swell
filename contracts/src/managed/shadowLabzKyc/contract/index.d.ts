import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export type KycCredential = { userPkHash: Uint8Array;
                              xrplAddressHash: Uint8Array;
                              tier: bigint;
                              jurisdictionCode: bigint;
                              isSanctioned: boolean
                            };

export type Witnesses<PS> = {
  authoritySecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  userSecretKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getKycCredential(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, KycCredential];
  getKycSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  getKycMerklePath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                   leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                               path: { sibling: { field: bigint
                                                                },
                                                       goes_left: boolean
                                                     }[]
                                             }];
}

export type ImpureCircuits<PS> = {
  issueKycCredential(context: __compactRuntime.CircuitContext<PS>,
                     userPkHash_0: Uint8Array,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeKycUser(context: __compactRuntime.CircuitContext<PS>,
                userPkHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifySelectiveKycForXrpPayment(context: __compactRuntime.CircuitContext<PS>,
                                  expectedXrplAddressHash_0: Uint8Array,
                                  minTier_0: bigint,
                                  blockedJurisdiction_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  authorizeAnonymousDaoAction(context: __compactRuntime.CircuitContext<PS>,
                              contextId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type ProvableCircuits<PS> = {
  issueKycCredential(context: __compactRuntime.CircuitContext<PS>,
                     userPkHash_0: Uint8Array,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeKycUser(context: __compactRuntime.CircuitContext<PS>,
                userPkHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifySelectiveKycForXrpPayment(context: __compactRuntime.CircuitContext<PS>,
                                  expectedXrplAddressHash_0: Uint8Array,
                                  minTier_0: bigint,
                                  blockedJurisdiction_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  authorizeAnonymousDaoAction(context: __compactRuntime.CircuitContext<PS>,
                              contextId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type PureCircuits = {
  deriveKycPublicKey(sk_0: Uint8Array): Uint8Array;
  deriveKycNullifier(sk_0: Uint8Array, contextId_0: Uint8Array): Uint8Array;
}

export type Circuits<PS> = {
  deriveKycPublicKey(context: __compactRuntime.CircuitContext<PS>,
                     sk_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  deriveKycNullifier(context: __compactRuntime.CircuitContext<PS>,
                     sk_0: Uint8Array,
                     contextId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
  issueKycCredential(context: __compactRuntime.CircuitContext<PS>,
                     userPkHash_0: Uint8Array,
                     commitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  revokeKycUser(context: __compactRuntime.CircuitContext<PS>,
                userPkHash_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  verifySelectiveKycForXrpPayment(context: __compactRuntime.CircuitContext<PS>,
                                  expectedXrplAddressHash_0: Uint8Array,
                                  minTier_0: bigint,
                                  blockedJurisdiction_0: bigint): __compactRuntime.CircuitResults<PS, boolean>;
  authorizeAnonymousDaoAction(context: __compactRuntime.CircuitContext<PS>,
                              contextId_0: Uint8Array): __compactRuntime.CircuitResults<PS, Uint8Array>;
}

export type Ledger = {
  readonly verifiedCustomerCount: bigint;
  kycCommitments: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Uint8Array;
    [Symbol.iterator](): Iterator<[Uint8Array, Uint8Array]>
  };
  kycMembers: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined;
    history(): Iterator<__compactRuntime.MerkleTreeDigest>
  };
  verifiedNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  revokedUsers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly kycAuthority: Uint8Array;
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
