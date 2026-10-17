# Midnight KYC, Credential & Privacy Patterns in Compact

Verified against Compact compiler `0.31.1` and `pragma language_version 0.23`.

---

## 1. Zero-Knowledge KYC Credential & Selective Disclosure

Commit a user's KYC attributes (e.g., jurisdiction, accreditation, age, risk score, XRPL account binding) on-chain using `persistentCommit`, and prove compliance predicates in zero knowledge while disclosing **only** the boolean verdict:

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export struct KycCredential {
  userPkHash: Bytes<32>;
  xrplAddressHash: Bytes<32>;
  birthYear: Uint<64>;
  jurisdictionCode: Uint<16>;
  isSanctioned: Boolean;
  tier: Uint<8>;
}

export ledger kycCommitments: Map<Bytes<32>, Bytes<32>>; // userPkHash -> commitment
export ledger revokedUsers: Set<Bytes<32>>;
export sealed ledger kycIssuer: Bytes<32>;

witness issuerSecretKey(): Bytes<32>;
witness userSecretKey(): Bytes<32>;
witness getKycCredential(): KycCredential;
witness getKycSalt(): Bytes<32>;

export pure circuit derivePublicKey(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "swell:kyc:pk:v1"), sk]);
}

constructor() {
  kycIssuer = disclose(derivePublicKey(issuerSecretKey()));
}

// Issuer registers a user's KYC credential commitment
export circuit registerKycCommitment(userPkHash: Bytes<32>, commitment: Bytes<32>): [] {
  const issuerPk = derivePublicKey(issuerSecretKey());
  assert(disclose(issuerPk == kycIssuer), "Only KYC issuer can register");
  assert(!revokedUsers.member(disclose(userPkHash)), "User is revoked");
  kycCommitments.insert(disclose(userPkHash), disclose(commitment));
}

// User proves KYC compliance for an XRPL payment portal action without revealing PII
export circuit proveKycForPayment(
  minTier: Uint<8>,
  maxBirthYear: Uint<64>,
  blockedJurisdiction: Uint<16>
): Boolean {
  const sk = userSecretKey();
  const pkHash = derivePublicKey(sk);
  const cred = getKycCredential();
  const salt = getKycSalt();

  assert(cred.userPkHash == pkHash, "Credential does not belong to caller");
  assert(kycCommitments.member(disclose(pkHash)), "No KYC commitment found");
  assert(!revokedUsers.member(disclose(pkHash)), "KYC revoked");

  const expectedCommitment = persistentCommit<KycCredential>(cred, salt);
  const storedCommitment = kycCommitments.lookup(disclose(pkHash));
  assert(disclose(expectedCommitment == storedCommitment), "Invalid KYC credential opening");

  const compliant =
    !cred.isSanctioned &&
    cred.tier >= minTier &&
    cred.birthYear <= maxBirthYear &&
    cred.jurisdictionCode != blockedJurisdiction;

  return disclose(compliant);
}
```

---

## 2. Anonymous KYC Membership (`HistoricMerkleTree` + Nullifiers)

When the payment portal must verify that *a* KYC-approved user authorized a transaction **without revealing which KYC-approved user** it was (unlinkable KYC):

```compact
pragma language_version 0.23;
import CompactStandardLibrary;

export ledger kycTree: HistoricMerkleTree<16, Bytes<32>>;
export ledger paymentNullifiers: Set<Bytes<32>>;
export sealed ledger kycAdmin: Bytes<32>;

witness localSecretKey(): Bytes<32>;
witness getKycMerklePath(leaf: Bytes<32>): MerkleTreePath<16, Bytes<32>>;

export pure circuit deriveMemberLeaf(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<2, Bytes<32>>>([pad(32, "swell:kyc:leaf:v1"), sk]);
}

export pure circuit derivePaymentNullifier(sk: Bytes<32>, paymentContextId: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "swell:kyc:nul:v1"),
    sk,
    paymentContextId
  ]);
}

constructor() {
  kycAdmin = disclose(deriveMemberLeaf(localSecretKey()));
}

export circuit addVerifiedMember(memberLeaf: Bytes<32>): [] {
  const caller = deriveMemberLeaf(localSecretKey());
  assert(disclose(caller == kycAdmin), "Not KYC admin");
  kycTree.insert(disclose(memberLeaf));
}

export circuit proveAnonymousKyc(paymentContextId: Bytes<32>): [] {
  const sk = localSecretKey();
  const leaf = deriveMemberLeaf(sk);
  const path = getKycMerklePath(leaf);

  // CRITICAL: Bind path.leaf to caller's derived leaf!
  assert(path.leaf == leaf, "Merkle path leaf mismatch");

  // CRITICAL: Assert immediately on checkRoot so the public transcript bit is constant
  const rootDigest = merkleTreePathRoot<16, Bytes<32>>(path);
  assert(kycTree.checkRoot(disclose(rootDigest)), "Not in KYC Merkle tree");

  // Prevent replay for the same paymentContextId
  const nul = disclose(derivePaymentNullifier(sk, disclose(paymentContextId)));
  assert(!paymentNullifiers.member(nul), "Payment context already authorized");
  paymentNullifiers.insert(nul);
}
```

### Critical Security Invariants for Merkle Proofs in Compact
1. **Always assert `path.leaf == leaf`** before calling `merkleTreePathRoot`. `merkleTreePathRoot` hashes `path.leaf` from the unconstrained witness; without this equality check, any valid path for *any* member passes the check.
2. **Always `assert(tree.checkRoot(disclose(digest)))` immediately.** Never store the boolean result of `checkRoot` to branch on later across multiple trees (`inTreeA || inTreeB`), because `checkRoot` writes its boolean outcome to the public transcript.
3. **Always use `HistoricMerkleTree`** instead of `MerkleTree` when new KYC users are onboarded over time, so proofs generated against recent roots do not invalidate when another user joins.
