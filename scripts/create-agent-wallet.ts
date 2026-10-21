/**
 * Creates the agent's XRPL wallet following the xrpl-agent-wallet skill:
 *   1. generate  2. ensure .env is gitignored  3. write seed to .env  4. report address only
 * Then funds it from the Testnet faucet. The seed never reaches stdout.
 */
import fs from "node:fs";
import { Client, Wallet } from "xrpl";

const ENV_PATH = ".env";
const ENV_VAR = process.argv.includes("--buyer") ? "XRPL_BUYER_SEED" : "XRPL_SEED";
const NETWORK = process.env.XRPL_NETWORK === "mainnet" ? "mainnet" : "testnet";

function ensureGitignored() {
  const gi = fs.existsSync(".gitignore") ? fs.readFileSync(".gitignore", "utf8") : "";
  if (!gi.split("\n").map((l) => l.trim()).includes(".env")) {
    fs.appendFileSync(".gitignore", `${gi.length && !gi.endsWith("\n") ? "\n" : ""}.env\n`);
  }
}

function existingSeedPresent(): boolean {
  if (!fs.existsSync(ENV_PATH)) return false;
  return new RegExp(`^${ENV_VAR}=`, "m").test(fs.readFileSync(ENV_PATH, "utf8"));
}

async function main() {
  if (NETWORK === "mainnet") {
    console.error("Refusing to auto-generate a mainnet wallet. Use an external signer / OWS for mainnet.");
    process.exit(1);
  }
  if (existingSeedPresent() && !process.argv.includes("--force")) {
    console.error(`${ENV_VAR} is already set in ${ENV_PATH}. Pass --force to append a new wallet (the old line stays; last one wins).`);
    process.exit(1);
  }

  ensureGitignored();
  const wallet = Wallet.generate();
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  fs.appendFileSync(ENV_PATH, `${existing.length && !existing.endsWith("\n") ? "\n" : ""}${ENV_VAR}="${wallet.seed}"\n`, { mode: 0o600 });

  console.log("✓ Wallet created.");
  console.log(`Address : ${wallet.classicAddress}`);
  console.log(`Seed    : saved to ${ENV_PATH} as ${ENV_VAR} — not shown here`);

  if (process.argv.includes("--no-fund")) return;
  console.log("\nRequesting Testnet faucet funding…");
  const client = new Client(process.env.XRPL_WS_URL || "wss://s.altnet.rippletest.net:51233");
  await client.connect();
  try {
    const { balance } = await client.fundWallet(wallet);
    console.log(`✓ Funded. Balance: ${balance} XRP on testnet`);
  } catch (err) {
    console.error(`Faucet funding failed (${(err as Error).message}). Fund manually: https://xrpl.org/resources/dev-tools/xrp-faucets`);
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error(String(err?.message ?? err).replace(/\bs[1-9A-HJ-NP-Za-km-z]{25,}\b/g, "[REDACTED]"));
  process.exit(1);
});
