---
name: midnight-compact
description: >
  Midnight Network Compact smart contract language reference, stdlib signatures, privacy/disclosure rules, Zswap shielded/unshielded tokens, TypeScript witness implementation, and zero-knowledge KYC / credential / anonymous membership patterns.
  Verified against Compact compiler 0.31.1 and pragma language_version 0.23.
  Use this skill whenever writing, reviewing, compiling, or testing .compact smart contracts, witnesses, or Midnight KYC circuits.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Midnight Compact Smart Contract Reference (Compiler 0.31.1 / Language 0.23)

Every `.compact` file begins with:

```compact
pragma language_version 0.23;

import CompactStandardLibrary;
```

## 1. Types & Casts

| Category | Type | TypeScript Mapping | Notes |
| :--- | :--- | :--- | :--- |
| Primitive | `Field` | `bigint` | Scalar field element; no `<, <=, >, >=` (cast to `Uint` first) |
| Primitive | `Boolean` | `boolean` | `true` / `false` |
| Primitive | `Bytes<N>` | `Uint8Array` | Fixed N-byte array; `pad(32, "literal")` creates `Bytes<32>` |
| Primitive | `Uint<N>` / `Uint<0..MAX>` | `bigint` | Unsigned integer; arithmetic `+` and `*` widen types, so cast back: `(a + b) as Uint<64>` |
| Collection | `Vector<N, T>` | `T[]` | Fixed-size homogeneous array |
| Collection | `Maybe<T>` | `{ is_some: boolean; value: T }` | Construct via `some<T>(v)` / `none<T>()` |
| Collection | `Either<L, R>` | `{ is_left: boolean; left: L; right: R }` | Construct via `left<L, R>(v)` / `right<L, R>(v)` |
| Unit | `[]` | `void` / `[]` | Circuits returning nothing return `[]` (NOT `Void`) |

- **No `let`/`var`, `while`, `switch`, `try/catch`, `break/continue`, division `/`, or modulo `%`.** Use `const`, bounded `for (const i of 0..N)`, `if/else`, ternary `c ? a : b`, and `assert(cond, "msg")`.

## 2. Ledger ADTs (Public On-Chain State)

- `Counter`: `increment(step)`, `decrement(step)`, `read()`, `lessThan(n)` (NOT `.value()`)
- `Map<K, V>`: `insert(k, v)`, `lookup(k)`, `member(k)`, `remove(k)`, `size()`, `isEmpty()` (NO `.get()`, `.has()`, `.set()`, or `lookupOrDefault` — always guard `m.member(k) ? m.lookup(k) : defaultVal`)
- `Set<T>`: `insert(elem)`, `member(elem)`, `remove(elem)`, `size()`, `isEmpty()`
- `MerkleTree<N, T>` & `HistoricMerkleTree<N, T>`: `insert(leaf)`, `insertHash(hash)`, `checkRoot(digest)`, `isFull()`. Prefer `HistoricMerkleTree` when members/credentials are added over time so existing proofs remain valid.

## 3. Privacy, `disclose()`, and Commitments

- All witness returns and exported circuit parameters carry **witness taint** (PLONK private inputs by default).
- Crossing a public boundary (ledger write, ADT argument, `if` branch containing ledger writes, exported circuit return) requires `disclose(...)` unless taint was cleared by a commitment.
- `persistentCommit<T>(value, rand: Bytes<32>): Bytes<32>` and `transientCommit<T>(value, rand: Field): Field` cryptographically hide inputs and **clear witness taint**.
- `persistentHash<T>(value): Bytes<32>` and `transientHash<T>(value): Field` do **NOT** clear taint (require `disclose()` before ledger storage).
- **Selective Disclosure Rule:** For KYC/credential checks, never `return disclose(value)`. Only disclose the boolean predicate: `return disclose(value >= threshold);`.
- **Caller Identity Rule:** Midnight has NO `msg.sender`. `ownPublicKey()` is an unconstrained witness (sound as a *recipient destination*, never as an authorization gate). Authenticate callers via hash-of-secret (`persistentHash<Vector<2, Bytes<32>>>([pad(32, "domain:pk:"), secretKey()])`) or Merkle membership proofs.

## 4. Shielded & Unshielded Token Signatures

### Shielded (Zswap UTXO)

```compact
struct ShieldedCoinInfo          { nonce: Bytes<32>; color: Bytes<32>; value: Uint<128>; }
struct QualifiedShieldedCoinInfo { nonce: Bytes<32>; color: Bytes<32>; value: Uint<128>; mtIndex: Uint<64>; }
struct ShieldedSendResult        { change: Maybe<ShieldedCoinInfo>; sent: ShieldedCoinInfo; }

circuit receiveShielded(coin: ShieldedCoinInfo): [];
circuit sendShielded(input: QualifiedShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>): ShieldedSendResult;
circuit sendImmediateShielded(input: ShieldedCoinInfo, recipient: Either<ZswapCoinPublicKey, ContractAddress>, value: Uint<128>): ShieldedSendResult;
circuit mintShieldedToken(domainSep: Bytes<32>, value: Uint<64>, nonce: Bytes<32>, recipient: Either<ZswapCoinPublicKey, ContractAddress>): ShieldedCoinInfo;
circuit tokenType(domainSep: Bytes<32>, contract: ContractAddress): Bytes<32>;
circuit nativeToken(): Bytes<32>;
```

- **CRITICAL:** `receiveShielded(disclose(coin))` does NOT check `coin.color`! Always assert `assert(coin.color == tokenType(domain, kernel.self()), "wrong token color");`.
- **CRITICAL:** Never store `QualifiedShieldedCoinInfo` in public ledger state if amount privacy matters (ledger state exposes `.value`).

### Unshielded (NIGHT & Transparent Tokens)

```compact
circuit receiveUnshielded(color: Bytes<32>, amount: Uint<128>): [];
circuit sendUnshielded(color: Bytes<32>, value: Uint<128>, recipient: Either<ContractAddress, UserAddress>): [];
```

- **NIGHT is an unshielded token** (`nativeToken()`). To pay a user's unshielded Lace address: `right<ContractAddress, UserAddress>(UserAddress { bytes: owner })`.

## 5. TypeScript Witness Implementation

```typescript
import { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { Ledger } from "./managed/mycontract/contract/index.js";

export const witnesses = {
  myWitness: (
    { privateState }: WitnessContext<Ledger, MyPrivateState>,
    arg1: bigint,
  ): [MyPrivateState, Uint8Array] => {
    return [privateState, computeBytes(arg1)];
  },
};
```

- Any witness providing randomness (`nonceSeed`, `receiptSecret`, `credentialSalt`) **MUST** use `crypto.getRandomValues(new Uint8Array(32))` and persist secrets to private state *before* submitting transactions.

## Reference Files

- [`references/kyc-privacy-patterns.md`](references/kyc-privacy-patterns.md) — Complete Compact patterns for KYC Credential Verification, Selective Disclosure, Anonymous Merkle Membership (`HistoricMerkleTree`), Nullifiers, and Allowlists.
