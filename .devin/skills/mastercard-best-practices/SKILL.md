---
name: mastercard-best-practices
description: >-
  Official Mastercard Developers integration guidance and MCP toolkit usage (@mastercard/developers-agent-toolkit / @mastercard/developers-mcp).
  Covers resolving a Mastercard service's ID from its name, confirming a service's auth type (OAuth 1.0a, OAuth 2.0 FAPI, OpenBanking, mTLS), routing to the right authentication guide, finding operation schemas, sandbox vs production base URLs, and interpreting Mastercard ReasonCode error responses.
  Trigger phrases: "add Mastercard", "Mastercard API", "call a Mastercard endpoint", "OAuth 1.0a signing", "getAuthorizationHeader", "Mastercard sandbox", "Open Finance", "Mastercard MCP", "@mastercard/developers-agent-toolkit".
allowed-tools:
  - read
  - grep
  - glob
triggers:
  - user
  - model
---

# Mastercard APIs Integration Guide (`@mastercard/developers-agent-toolkit`)

## Source of truth

The Mastercard Developers MCP server (`@mastercard/developers-mcp`, hosted at `https://developer.mcp.mastercard.com` and configured in `.devin/mcp_config.json`, or embedded via `@mastercard/developers-agent-toolkit/mcp`) is authoritative for which services exist, what an endpoint accepts, and what the integration guides say.

If the MCP server is unavailable, the public service index is published at `https://developer.mastercard.com/llms.txt` and per-service docs at `https://developer.mastercard.com/{serviceId}/documentation/llms-full.txt`.

## 1. Resolve the Service & Confirm `authType` First

1. **Resolve the service:** Call `get-services-list` (or check `https://developer.mastercard.com/llms.txt`) to obtain `serviceId` and `authType`. Never guess or construct a `serviceId` from the display name.
2. **Confirm `authType`:** Never default to `OAuth1.0a`. Check the table below:

| `authType` | Tool / Guide | Fallback URL |
| :--- | :--- | :--- |
| `OAuth1.0a` | `get-oauth10a-integration-guide` | `https://developer.mastercard.com/platform/documentation/authentication/using-oauth-1a-to-access-mastercard-apis/index.md` |
| `OAuth2` / `OAuth1.0a and OAuth2 (FAPI 2.0)` | `get-oauth20-integration-guide` | `https://developer.mastercard.com/platform/documentation/authentication/using-oauth-2-to-access-mastercard-apis/index.md` |
| `OpenBanking*` | `get-openfinance-integration-guide` | Service's own token exchange documentation |
| `MTLS` | Direct URL | `https://developer.mastercard.com/platform/documentation/authentication/using-mtls-to-access-mastercard-apis/index.md` |

## 2. Building Integration Code in Order

1. `get-services-list` -> `serviceId` + `authType`
2. `get-documentation(serviceId)` -> page list + `api_specification(s)` YAML paths
3. `get-api-operation-list(apiSpecificationPath)` -> methods, paths, operation IDs
4. `get-api-operation-details(apiSpecificationPath, method, path)` -> exact request/response schema
5. Resolve base URL from the service's *API Basics* / *Environments* page or `servers` block (e.g., `https://sandbox.api.mastercard.com/...` or `https://sandbox.idv.mastercard.com/...`)
6. Follow the language-specific auth guide (`OAuth 1.0a` signs every request individually over the exact serialized body bytes; never cache `Authorization` headers).

## 3. Embedding `@mastercard/developers-agent-toolkit` in TypeScript

```typescript
import { MastercardDevelopersAgentToolkit } from "@mastercard/developers-agent-toolkit/mcp";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new MastercardDevelopersAgentToolkit({
  configuration: {
    // Optional: scope to a specific Mastercard service or swagger spec
    // service: "https://developer.mastercard.com/open-finance-us/documentation",
  },
});
```
