# Midnight Network Installation & Reference

Source references:
- GitHub Organization: <https://github.com/midnightntwrk>
- Toolchain Installation: <https://docs.midnight.network/getting-started/installation>
- Midnight Expert Skills & Plugins: <https://github.com/midnightntwrk/midnight-expert>

## Installed Toolchain Versions

| Component | Version | Binary / Path | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v24.22.0` | `~/.nvm/versions/node/v24.22.0/bin/node` | Pinned in `.nvmrc` (`22.x \|\| 24.x` required by Midnight SDK) |
| **Compact CLI** | `0.5.3` | `~/.local/bin/compact` | Installed via official `compact-installer.sh` |
| **Compact Compiler** | `0.31.1` | `~/.compact` | Default compiler pinned for Midnight Preview & public networks |
| **Compact Language** | `0.23.0` | `pragma language_version 0.23;` | Runtime `@midnight-ntwrk/compact-runtime` `0.16.0` |
| **Midnight.js SDK** | `4.1.1` | `node_modules/@midnight-ntwrk/*` | Lockstep version across all `midnight-js-*` packages |
| **Proof Server** | `8.1.0` | `midnightntwrk/proof-server:8.1.0` | Configured in `docker-compose.yml` on `127.0.0.1:6300` |

## Network Endpoints (Preview)

- **Indexer HTTP:** `https://indexer.preview.midnight.network/api/v4/graphql`
- **Indexer WS:** `wss://indexer.preview.midnight.network/api/v4/graphql/ws`
- **Node RPC:** `https://rpc.preview.midnight.network`
- **Faucet:** `https://faucet.preview.midnight.network`
- **Proof Server:** `http://127.0.0.1:6300` (must remain bound to loopback)
