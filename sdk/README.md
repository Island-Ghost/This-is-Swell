# `@agility/sdk` — AgilityCore Compliance & Agentic Settlement SDK

**Zero-Knowledge KYC Compliance (Midnight Network) + 3–5s Deterministic XRP & RLUSD Settlement (XRPL X402 & m402).**

## Why `@agility/sdk`?

Financial institutions, payment networks (such as **Mastercard Crypto Credential** & **Multi-Token Network**), and Web3 platforms (such as **ShadowLabz / Shadow DAOs**) face a fundamental tension on public blockchains:
1. **Regulators require verifiable KYC, OFAC sanctions screening, and jurisdiction enforcement** before settling payments.
2. **Enterprises and consumers cannot expose PII, cardholder identity, or B2B supplier graphs** on a transparent public ledger.

`@agility/sdk` bridges **Midnight Network** (`Compact 0.31.1`) and the **XRP Ledger** (`x402-xrpl` + `RLUSD` + `XRP`) in a single TypeScript SDK:

```typescript
import { AgilitySDK } from "@agility/sdk";

const agility = new AgilitySDK({
  xrplNetwork: "xrpl:1", // or "xrpl:0" for Mainnet
  merchantXrplAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  kycAuthorityId: "mastercard-crypto-credential",
  defaultAsset: "RLUSD", // or "XRP"
});

// 1. Prove KYC, OFAC non-sanctioned status, and XRPL wallet binding in Zero Knowledge:
const attestation = agility.kyc.proveCompliance(
  {
    userSecret: "customer-blinded-zk-secret",
    xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    tier: 2,
    jurisdictionCode: 840, // USA
    isSanctioned: false,
  },
  { minKycTier: 2, blockedJurisdictions: [408, 364] },
);

// 2. Build an RLUSD or XRP X402 payment stamped with the Midnight ZK KYC nullifier:
if (attestation.compliant && attestation.kycNullifierHex) {
  const tx = agility.settlement.buildCompliantPaymentTx({
    payerXrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
    amountUsd: 50.0,
    asset: "RLUSD",
    kycNullifierHex: attestation.kycNullifierHex,
    action: "merchant_checkout_x402",
  });
}
```
