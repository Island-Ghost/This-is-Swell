# m402 Private Agentic Payments & Midnight KYC Portal Architecture

Source references:
- m402 Repository: <https://github.com/julianariel/m402>
- m402 Portal: <https://m402.tech/>

## How m402 + Midnight KYC + XRPL x402 Fit Together

1. **Midnight Zero-Knowledge KYC (`contracts/src/swellKyc.compact`):**
   - Users receive a KYC credential commitment (`persistentCommit<KycCredential>(cred, salt)`) issued by `kycAuthority` and are inserted into `kycMembers` (`HistoricMerkleTree<16, Bytes<32>>`).
   - Users can prove selective compliance (`verifySelectiveKyc(minTier, blockedJurisdiction)`) or unlinkable anonymous membership (`authorizeAnonymousPayment(contextId)`) without exposing PII on-chain.
2. **Midnight Private 402 Vault (`contracts/src/m402Vault.compact`):**
   - Pools unshielded NIGHT (`deposit`) and mints 1:1 shielded credits (`m402:credit:v1`).
   - `pay(serviceId)` spends a shielded credit coin of exact `price` and records `deriveReceipt(receiptSecret(), serviceId)` in the on-chain `receipts` set with **no payer address** in the transaction.
   - Exported pure circuits (`creditColor`, `deriveReceipt`, `deriveServiceId`) allow off-chain gateways and clients to compute IDs and verify receipts in ~0.20s without a proof server.
3. **XRPL Payment Portal (`x402-xrpl` & `xrpl.js`):**
   - Accepts direct XRP / RLUSD X402 payments (`require_payment` middleware) or acts as a settlement/relay target (`chain: "xrpl:1"` / `"xrpl:0"`) gated by Midnight ZK KYC proofs.
