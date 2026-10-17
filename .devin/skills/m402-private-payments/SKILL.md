---
name: m402-private-payments
description: >
  Architecture and implementation reference for m402 (Private Agentic Payments on Midnight) and its integration with XRPL x402 payment portals and Midnight KYC.
  Covers m402Vault.compact (registerService, deposit, pay, redeem, withdraw, creditColor, deriveReceipt, deriveServiceId), Hono 402 gateway, receipt-secret verification, SQLite replay guard, and cross-chain relayer patterns.
  Use this skill whenever building or extending m402 vaults, private 402 gateways, Midnight-to-XRPL x402 payment relays, or KYC-gated 402 payment portals.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# m402: Private Agentic Payments on Midnight + XRPL x402 Bridge

`m402` implements the HTTP 402 payment-and-retry flow on Midnight where **payments carry no payer identity**. Combined with **Midnight KYC** and **XRPL x402 (`x402-xrpl`)**, it enables a payment portal where:
1. Users/agents prove KYC compliance in zero knowledge on Midnight (selective disclosure or anonymous Merkle membership).
2. Agents pay for API/portal resources either privately via Midnight shielded credits (`m402`) or with 3–5s deterministic finality on XRPL (`x402-xrpl` in XRP or RLUSD).
3. A unified gateway/relayer can accept private Midnight `m402` payments (or KYC proofs) and settle/relay XRPL `x402` or direct XRPL payments on the backend.

## 1. Core `m402Vault.compact` Architecture

Because `NIGHT` is an unshielded token (`nativeToken()`), spending NIGHT directly reveals the sender. `m402Vault.compact` pools deposited NIGHT and mints a 1:1 **shielded credit** (`domain = pad(32, "m402:credit:v1")`):

- **`registerService(salt, price, owner)`**:
  - Derives `serviceId = deriveServiceId(owner, salt, price)` using `persistentHash<Vector<4, Bytes<32>>>([pad(32, "m402:sid:v1"), owner, salt, price as Bytes<32>])`.
  - Binding both `owner` and `price` into `serviceId` prevents front-running attacks on service registration or price manipulation.
- **`deposit(amount)`** (Public):
  - Calls `receiveUnshielded(nativeToken(), disclose(amount) as Uint<128>)`.
  - Evolves nonce via `evolveNonce(mintCounter as Field as Uint<64>, nonceSeed())` and calls `mintShieldedToken` + `sendImmediateShielded` to `ownPublicKey()`.
- **`pay(serviceId)`** (Private — no payer address on-chain):
  - Takes witness `creditCoin(sid, price)` and asserts:
    1. `coin.color == tokenType(creditDomain(), kernel.self())` (prevents paying with fake self-minted shielded tokens)
    2. `coin.value == price as Uint<128>` (exact match; wallet balancer splits larger credit coins at the Zswap layer and returns hidden change to the payer)
  - Computes `receipt = deriveReceipt(receiptSecret(), sid)` (`persistentHash([pad(32, "m402:receipt:v1"), secret, serviceId])`), asserts `!receipts.member(disclose(receipt))`, inserts `disclose(receipt)` into `receipts`, and increments `merchantBalance[owner] += price`.
- **`redeem(recipient)`** (Public):
  - Burns unspent shielded credit coin via `receiveShielded` and returns unshielded NIGHT via `sendUnshielded` to `UserAddress { bytes: disclose(recipient) }`.
- **`withdraw(serviceId, amount)`** (Public, no caller auth required):
  - Reads `owner = serviceOwner.lookup(sid)`, checks `merchantBalance[owner] >= amount`, and sends unshielded NIGHT directly to `UserAddress { bytes: owner }`.

## 2. Shared Protocol Types (`@m402/shared`)

```typescript
export type Service = {
  id: string;
  price: bigint;
  owner: string;
  type: "origin" | "relay";
  target: string; // origin: proxy here · relay: pay-and-fetch x402 here
  chain?: string; // CAIP-2, e.g. 'xrpl:1', 'xrpl:0', 'eip155:8453'
};

export type PaymentRequired = {
  serviceId: string;
  price: string;
  vaultAddress: string;
};

export const PAYMENT_HEADER = "X-Payment"; // value: 32-byte receiptSecret hex (NEVER the on-chain hash!)
```

## 3. Gateway Verification & Replay Guard

1. Client calls `GET /s/:id` without `X-Payment` -> Gateway health-checks origin, returns `402 PaymentRequired` `{ serviceId, price, vaultAddress }`.
2. Client proves `pay(serviceId)` locally, submits to Midnight, and retries `GET /s/:id` with `X-Payment: <receiptSecretHex>`.
3. Gateway computes `receiptHash = pureCircuits.deriveReceipt(fromHex(secret), fromHex(serviceId))`.
4. Gateway checks:
   - Is `receiptHash` in the on-chain `ledger(state.data).receipts` set (via `PublicDataProvider.contractStateObservable`)?
   - Is `receiptHash` NOT yet in the gateway's local SQLite `consumed_receipts` table? (Atomically marks consumed to prevent replay).
5. Gateway dispatches:
   - `type === "origin"`: proxies request to merchant target URL.
   - `type === "relay"`: pays downstream `x402` service (e.g., XRPL `x402-xrpl` or EVM `@x402/fetch`) and returns the resource.
