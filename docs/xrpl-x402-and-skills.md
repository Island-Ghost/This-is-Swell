# XRPL Agentic Payments (X402) & XRPL Skills Reference

Source references:
- Agentic Payments with X402 on XRPL: <https://xrpl.org/docs/agents/agentic-payments-x402>
- Getting Started with Agentic Transactions: <https://xrpl.org/docs/agents/getting-started-with-agentic-transactions>
- The XRPL Agent Wallet Skill: <https://xrpl.org/docs/agents/xrpl-agent-wallet-skill>
- The XRPL Payments Skill: <https://xrpl.org/docs/agents/xrpl-payments-skill>
- The XRPL Trading Skill: <https://xrpl.org/docs/agents/xrpl-trading-skill>
- Track and Measure Agent Behavior: <https://xrpl.org/docs/agents/track-agent-behavior>

## Installed Python & JS Packages

- **Python (`3.12.15` in `.venv` via `uv`):**
  - `x402-xrpl` (T54 reference X402 implementation for XRPL)
  - `xrpl-py` (Python XRPL SDK)
  - `fastapi`, `uvicorn`, `requests`, `python-dotenv`, `websockets`
- **TypeScript / Node.js (`v24.22.0`):**
  - `xrpl` (`xrpl.js` v4.x)

## Key Protocol Constants

- **XRP Ledger Networks:**
  - Testnet CAIP-2: `xrpl:1` | WS: `wss://s.altnet.rippletest.net:51233` | RPC: `https://s.altnet.rippletest.net:51234/`
  - Mainnet CAIP-2: `xrpl:0` | WS/RPC: `https://xrplcluster.com`
- **T54 X402 Facilitators:**
  - Testnet: `https://xrpl-facilitator-testnet.t54.ai`
  - Mainnet: `https://xrpl-facilitator-mainnet.t54.ai`
- **RLUSD Stablecoin:**
  - Currency Hex: `524C555344000000000000000000000000000000`
  - Testnet Issuer: `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`
  - Mainnet Issuer: `rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De`
- **SourceTag Conventions:**
  - XRPL AI Starter Kit / Agent Wallet Default: `20260530`
  - X402 Merchant Endpoint Attribution Example: `20260601`
