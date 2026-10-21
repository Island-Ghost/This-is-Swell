import "dotenv/config";
import crypto from "node:crypto";
import { serve } from "@hono/node-server";
import { createApp, gatewayOptionsFromEnv } from "./app.js";

const port = Number(process.env.M402_GATEWAY_PORT || 8787);
const opts = gatewayOptionsFromEnv();

if (!opts.adminToken) {
  opts.adminToken = crypto.randomBytes(24).toString("hex");
  console.log(`ADMIN_API_TOKEN not set — generated a session token for /admin: ${opts.adminToken}`);
  console.log("Open http://127.0.0.1:%d/admin?token=%s or set ADMIN_API_TOKEN in .env", port, opts.adminToken);
}

console.log(`Swell / ShadowLabz AgilityCore gateway on http://127.0.0.1:${port}  [network=${opts.network} payments=${opts.paymentMode} kyc=${opts.requireKyc ? "required" : "optional"}]`);
serve({ fetch: createApp(opts).fetch, port });
