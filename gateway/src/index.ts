import "dotenv/config";
import { serve } from "@hono/node-server";
import { app } from "./app.js";

const port = Number(process.env.M402_GATEWAY_PORT || 8787);

console.log(`ShadowLabz AgilityCore Payment & KYC Gateway listening on http://127.0.0.1:${port}`);
serve({
  fetch: app.fetch,
  port,
});
