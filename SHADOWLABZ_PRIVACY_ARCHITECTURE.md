# ShadowLabz Privacy & Zero-Knowledge KYC Architecture
*(Replaces `KEDAS_BREW_PRIVACY_ARCHITECTURE.md` from `Island-Ghost/Agility-Summit`)*

---

## 1. Core Privacy Principle

In ShadowLabz (`shadowlabz.io`), **a wallet is the user's identity**, ballots must remain secret, and enterprise/compliance-ready DAOs must prove regulatory compliance (non-sanctioned status, minimum KYC tier, allowed jurisdiction, and XRPL wallet ownership) **without storing personal data on-chain or on ShadowLabz servers**.

## 2. Two Zero-Knowledge KYC Modes in `ShadowLabzKyc.compact`

### Mode 1: Selective Disclosure for XRP Payments & Corporate Treasury Audits (`verifySelectiveKycForXrpPayment`)
- **On-chain state:** `kycCommitments: Map<Bytes<32>, Bytes<32>>` holds `persistentCommit<KycCredential>(cred, salt)`. Because `persistentCommit` uses a 32-byte CSPRNG blinding factor (`salt`), the commitment is cryptographically hiding.
- **What the circuit checks in zero knowledge:**
  1. Caller knows `userSecretKey()` matching `cred.userPkHash`.
  2. Caller is not in `revokedUsers`.
  3. `persistentCommit<KycCredential>(cred, salt) == kycCommitments.lookup(pkHash)`.
  4. `!cred.isSanctioned && cred.xrplAddressHash == expectedXrplAddressHash && cred.tier >= minTier && cred.jurisdictionCode != blockedJurisdiction`.
- **What is disclosed on-chain:** `return disclose(passed)` — **only a single boolean (`true`/`false`)**. The user's PII, exact tier, and jurisdiction code remain private PLONK witness inputs.

### Mode 2: Unlinkable Anonymous Membership (`authorizeAnonymousDaoAction`)
- **On-chain state:** `kycMembers: HistoricMerkleTree<16, Bytes<32>>` (supports up to 65,536 verified members per tree) and `verifiedNullifiers: Set<Bytes<32>>`.
- **What the circuit proves:**
  1. `assert(path.leaf == leaf)` binds the Merkle path to the caller's secret key (`deriveKycPublicKey(sk)`).
  2. `assert(kycMembers.checkRoot(disclose(merkleTreePathRoot<16, Bytes<32>>(path))))` proves the caller is in the KYC tree against any valid historical root.
  3. Computes a context-scoped nullifier `deriveKycNullifier(sk, contextId)` and inserts it into `verifiedNullifiers` so the member can vote or join once per context without revealing *which* leaf in `kycMembers` they are.

## 3. Private Agentic Payments (`m402Vault.compact`) vs. Deterministic XRP Settlement (`x402-xrpl`)

ShadowLabz supports both payment rails under a unified HTTP 402 interface:
- **XRP / RLUSD via `x402-xrpl`:** 3–5 second deterministic finality on the XRP Ledger, carrying the `X-Midnight-Kyc` nullifier in the transaction memo and `SourceTag: 20260601` for endpoint revenue attribution.
- **Shielded Credits via `m402Vault.compact`:** Users deposit unshielded NIGHT once to mint 1:1 shielded credits, then call `pay(serviceId)` with **zero payer address in the transaction** and redeem access via the `X-Payment: <receiptSecret>` header.
