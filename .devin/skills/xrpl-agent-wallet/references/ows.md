# OWS — Open Wallet Standard: XRPL Integration Reference

> **Audience:** Developers integrating AI agents with XRPL signing via OWS.  
> **OWS version:** `@open-wallet-standard/core` v1.x  
> **Scope:** SDK-level integration. Time-based and network-based policy enforcement are available today. Amount and destination enforcement land in OWS v3.

---

## 1. What OWS is

The Open Wallet Standard (OWS) is a local, policy-gated signing standard for AI agents and developer tools. It provides a single interface for key management, policy enforcement, and transaction signing across multiple chains. XRPL is a first-class supported chain: wallets derive XRPL addresses at `m/44'/144'/0'/0/0` (secp256k1), and `signTransaction` applies XRPL's canonical signing algorithm internally.

```
AI Agent
    │  constructs unsigned tx (xrpl.js / xrpl-py)
    │  applies source tag
    ▼
XRPL Agent Wallet skill
    │  autofill → human preview → confirm
    ▼
OWS signTransaction("xrpl", txHex)        ← tx must NOT contain SigningPubKey
    │
    ├── Policy Engine  ← declarative rules + any custom executables
    │       │
    │       ├── PASS → decrypt key → sign → wipe key → return { signature }
    │       └── FAIL → throw (key never decrypted)
    │
    ▼
Wallet skill applies SigningPubKey + TxnSignature → encodes → submitAndWait
```

Install:

```bash
npm install @open-wallet-standard/core
```

---

## 2. SDK Reference

```typescript
import {
  createWallet, getWallet, listWallets,
  importWalletMnemonic, importWalletPrivateKey,
  signTransaction, signHash,
  createPolicy, listPolicies, deletePolicy,
  createApiKey,
} from "@open-wallet-standard/core";
```

**Important chain allowlist rule:** `AccountInfo` reports `xrpl:mainnet`. Allowlist `xrpl:mainnet` in `allowed_chains` and pass `"xrpl"` when calling `signTransaction`.

---

## 3. XRPL Signing Flow & Public Key Recovery

XRPL requires both `TxnSignature` and `SigningPubKey`. OWS throws if `SigningPubKey` is included before signing, and returns only `{ signature }`. Never call `exportWallet()` — instead recover the compressed secp256k1 public key from a deterministic probe signature once and cache it:

```typescript
import { getWallet, signHash, signTransaction } from "@open-wallet-standard/core";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { deriveAddress } from "ripple-keypairs";
import { Client, encode, hashes, xrpToDrops } from "xrpl";

const OWS_CREDENTIAL = process.env.OWS_AGENT_TOKEN ?? process.env.OWS_PASSPHRASE ?? "";
const PUBKEY_PROBE = "6f77732d7872706c2d7075626b65792d70726f62652d76310000000000000000";

const hexToBytes = (hex: string) =>
  Uint8Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"));

export function resolvePublicKey(walletName: string, address: string): string {
  const cached = process.env.OWS_XRPL_PUBLIC_KEY;
  if (cached) return cached.toUpperCase();

  const { signature } = signHash(walletName, "xrpl", PUBKEY_PROBE, OWS_CREDENTIAL);
  const sig = secp256k1.Signature.fromBytes(hexToBytes(signature), "der");

  for (let bit = 0; bit < 4; bit++) {
    try {
      const point = sig.addRecoveryBit(bit).recoverPublicKey(hexToBytes(PUBKEY_PROBE));
      const candidate = Buffer.from(point.toBytes(true)).toString("hex").toUpperCase();
      if (deriveAddress(candidate) === address) return candidate;
    } catch {
      // try next recovery bit
    }
  }
  throw new Error(`could not recover a public key matching ${address}`);
}
```

---

## 4. Access Modes: Passphrase vs API Token

| Feature | Passphrase (owner) | API token (`ows_key_...`, agent) |
| :---- | :---- | :---- |
| Policy evaluation | **None** | All policies on the key, AND semantics |
| Scope | Every wallet, every chain | Only the key's `wallet_ids` |
| Revocation | Change passphrase, re-encrypt | Delete the key file — token decrypts nothing |
| Recommended for | Local operator setup only | **All agent deployments** |
