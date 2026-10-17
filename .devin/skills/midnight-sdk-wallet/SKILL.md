---
name: midnight-sdk-wallet
description: >
  Midnight.js SDK (v4.1.1), @midnight-ntwrk/wallet-sdk, and DApp Connector API (window.midnight / Lace v4.0.1) reference.
  Covers MidnightProviders assembly, contract deployment and circuit calls, PublicDataProvider observables, LevelDB private state gotchas, unshielded transaction signing (signRecipe), wallet sync caching, and Preview network endpoints.
  Use this skill whenever writing TypeScript integration code for Midnight contracts, wallets, indexers, or React/Vite DApp frontends.
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Midnight.js SDK (v4.1.1) & Wallet Integration Reference

## 1. Runtime & Package Rules

- **Node.js Version:** **Node 22 or 24 only** (pinned to `24` in `.nvmrc`). Node 23 and 26 break Midnight SDK ESM resolution (`ERR_PACKAGE_PATH_NOT_EXPORTED`).
- **Lockstep Versions:** Keep all `@midnight-ntwrk/midnight-js-*` packages at the exact same version (`4.1.1`), on the **public npm registry** (no custom `.npmrc` registry needed).
- **Pure Exports Pattern:** Re-export `pureCircuits` and `ledger` from `src/managed/<contract>/contract/index.js` in a lightweight `pure.ts` module so gateways, frontends, and verifiers can compute hashes and decode ledger state in ~0.20s without importing `@midnight-ntwrk/testkit-js` (~5.2s import cost) or needing the Compact compiler.

## 2. Network Endpoints (Preview & Local Devnet)

| Service | Preview Testnet | Local Undeployed |
| :--- | :--- | :--- |
| **Network ID** | `preview` (`setNetworkId("preview")`) | `undeployed` |
| **Indexer HTTP** | `https://indexer.preview.midnight.network/api/v4/graphql` | `http://127.0.0.1:8088/api/v4/graphql` |
| **Indexer WS** | `wss://indexer.preview.midnight.network/api/v4/graphql/ws` | `ws://127.0.0.1:8088/api/v4/graphql/ws` |
| **Node RPC** | `https://rpc.preview.midnight.network` | `http://127.0.0.1:9944` |
| **Faucet** | `https://faucet.preview.midnight.network` | Pre-funded genesis wallet |
| **Proof Server** | `http://127.0.0.1:6300` (always local Docker) | `http://127.0.0.1:6300` |

- Always call `setNetworkId(networkId)` once at startup before constructing any providers.
- Keep the proof server bound to `127.0.0.1:6300` — proof requests contain private witness inputs and the service has no authentication.

## 3. Critical SDK & Wallet Traps (Verified on Preview)

### Trap 1: Unshielded Inputs MUST Be Signed (`signRecipe`)
Any circuit touching unshielded tokens (`receiveUnshielded` / NIGHT deposits) pulls a NIGHT UTXO into the transaction. Balancing alone does NOT sign UTXO inputs — omitting `signRecipe` causes node rejection `1010 Invalid Transaction: Custom error: 192` (`InputsSignaturesLengthMismatch`):

```typescript
const recipe = await wallet.balanceUnboundTransaction(tx, keys, { ttl });
const signed = await wallet.signRecipe(recipe, (p) => keystore.signData(p)); // REQUIRED for unshielded!
return wallet.finalizeRecipe(signed);
```

### Trap 2: `levelPrivateStateProvider` Configuration
- `midnightDbName` is the **LevelDB directory on disk** (default `midnight-level-db`). `privateStateStoreName` is only an object store *inside* that DB. Two concurrent processes MUST use distinct `midnightDbName` values or they fail with `LEVEL_LOCKED`.
- Before calling a circuit on a fresh store:
  1. Call `provider.setContractAddress(contractAddress)`
  2. Seed initial private state: `await provider.set(privateStateId, initialPrivateState)`
- Never pass `{ midnightDbName: undefined }` (it overwrites the default with `undefined`); only spread `midnightDbName` when defined.

### Trap 3: One Wallet Cannot Submit Two Transactions Concurrently
Concurrent submissions from the same wallet fail with `1010 Invalid Transaction: Custom error: 170` (`InvalidDustSpendProof`). Always serialize wallet transactions with a file/process lock.

### Trap 4: Wallet Sync Caching
Cold wallet sync from seed replays from index 0 and takes minutes. Persist the three sub-wallet states (`shielded`, `unshielded`, `dust`) via `serializeState()` after sync completes (sharing a single `txHistoryStorage`) and restore via `restore()` on subsequent runs (12.8x speedup).

### Trap 5: Wallet Mnemonic Hygiene
Never pass mnemonics/seeds via CLI `argv` or raw env vars (visible in `ps` and shell history). Store mnemonics in a `0600` gitignored file and pass the file path via `MIDNIGHT_PREVIEW_MNEMONIC_FILE`.

## 4. Browser Wallet Integration (DApp Connector API v4.0.1 / Lace)

- Enumerate injected wallets via `Object.values(window.midnight ?? {}).filter(w => w != null && typeof w.connect === "function")` (or `window.midnight?.mnLace`).
- Connect via `const api = await wallet.connect("preview")` and read network endpoints from `await api.getConfiguration()`.
- Check errors via `error.type === "DAppConnectorAPIError"` (never `instanceof`).
