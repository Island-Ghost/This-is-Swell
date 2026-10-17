---
name: midnight-tooling
description: >
  Midnight Network toolchain management: Compact CLI (compact 0.5.x, compiler 0.31.1, language 0.23), contract compilation, formatting, fixup, and local Proof Server Docker container (midnightntwrk/proof-server on port 6300).
  Use this skill whenever installing/updating Midnight tools, compiling .compact contracts, starting/checking the Docker proof server, or debugging toolchain errors.
allowed-tools:
  - read
  - grep
  - glob
  - exec
triggers:
  - user
  - model
---

# Midnight Toolchain & Proof Server Management

## 1. Environment Paths (macOS)

Ensure `~/.local/bin` (for `compact` and `uv`) and NVM Node 24 are on `PATH`:

```bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 24
```

## 2. Compact CLI & Compiler Commands

- **Check CLI version:** `compact --version` (installed at `~/.local/bin/compact`)
- **Check compiler version:** `compact compile --version` (pinned to **`0.31.1`** for Midnight Preview / public networks)
- **Check language version:** `compact compile --language-version` (`0.23.0`)
- **Switch/install compiler version:** `compact update 0.31.1` (Do NOT run bare `compact update` for Preview deployment, as newer compilers like 0.35.0 target ledger versions not yet deployed on Preview)
- **Compile contract (full ZK keys):**
  ```bash
  compact compile contracts/src/MyContract.compact contracts/src/managed/myContract
  ```
- **Compile contract (fast typecheck / skip ZK key generation):**
  ```bash
  compact compile --skip-zk contracts/src/MyContract.compact contracts/src/managed/myContract
  ```
- **Format `.compact` files:** `compact format` (or `compact format --check` in CI)
- **Apply syntax migrations:** `compact fixup`

## 3. Managed Output Structure & Git Tracking

Compiling produces `src/managed/<name>/`:
- `contract/index.js`, `contract/index.d.ts`, `contract/index.js.map` — **Commit these to git** so consumers (`gateway`, `web`, `agent`) can import `pureCircuits` and `ledger` without running the compiler.
- `keys/` (~23 MB proving/verifying keys) and `zkir/` — **Gitignore these** (regenerate with `compact compile` when proving).

## 4. Midnight Proof Server (Docker on `127.0.0.1:6300`)

The proof server generates ZK proofs locally and **must stay bound to `127.0.0.1:6300`** because proof requests carry private witness data.

### Start via Docker Compose
```bash
docker compose up -d proof-server
```

### Start Standalone Container
```bash
docker rm -f midnight-proof-server 2>/dev/null || true
docker run -d --name midnight-proof-server -p 127.0.0.1:6300:6300 midnightntwrk/proof-server:8.1.0 -- midnight-proof-server -v
```

### Verify Proof Server Health
```bash
curl -sf http://127.0.0.1:6300/health
curl -sf http://127.0.0.1:6300/version
curl -sf http://127.0.0.1:6300/ready
```
