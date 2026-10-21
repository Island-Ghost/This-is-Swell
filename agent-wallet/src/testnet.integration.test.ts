/**
 * Live XRPL Testnet integration. Skipped unless XRPL_TESTNET_LIVE=1 and XRPL_SEED is set.
 *   npm run test:testnet
 * Spends ~2 XRP of testnet funds per run from the agent wallet.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "xrpl";
import { AgentWallet, EnvSeedSigner, IntentStore, buildXrpPayment, executeTransaction, reconcilePending, DEFAULT_POLICY } from "./index.js";

const LIVE = process.env.XRPL_TESTNET_LIVE === "1" && EnvSeedSigner.isConfigured();
const DEST = "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe";

describe.skipIf(!LIVE)("XRPL testnet (live)", () => {
  let wallet: AgentWallet;

  beforeAll(async () => {
    wallet = await new AgentWallet({ policy: { ...DEFAULT_POLICY, network: "testnet" }, dbPath: ":memory:", source: "integration" }).connect();
  }, 30_000);

  afterAll(async () => { await wallet?.close(); });

  it("has a funded account above reserve", async () => {
    const acct = await wallet.account();
    expect(acct.exists).toBe(true);
    expect(acct.spendableDrops).toBeGreaterThan(2_000_000n);
  });

  it("quote simulates tesSUCCESS without signing", async () => {
    const q = await wallet.quote(buildXrpPayment({ account: wallet.address, destination: DEST, amountDrops: 1_000_000n, memo: { app: "swell/test", action: "quote" } }));
    expect(q.simulation.engineResult).toBe("tesSUCCESS");
    expect(q.decision.allowed).toBe(true);
    expect(wallet.store.list({ status: "quoted" })).toHaveLength(1);
  }, 30_000);

  it("executes a 1 XRP payment: hash persisted before submit, validated with delivered_amount", async () => {
    let hashBeforeSubmit: string | null | undefined;
    const orig = wallet.client.submitAndWait.bind(wallet.client);
    (wallet.client as { submitAndWait: Client["submitAndWait"] }).submitAndWait = (async (blob: string) => {
      hashBeforeSubmit = wallet.store.pending()[0]?.hash;
      return orig(blob);
    }) as Client["submitAndWait"];

    const r = await wallet.pay({ to: DEST, xrp: 1, memo: { app: "swell/test", action: "integration_pay" } });
    expect(r.status).toBe("validated");
    expect(r.resultCode).toBe("tesSUCCESS");
    expect(hashBeforeSubmit).toBe(r.hash);
    expect(r.deliveredAmount).toBe("1000000");
    expect(r.ledgerIndex).toBeGreaterThan(0);
  }, 60_000);

  it("recovers a crash between sign and submit by reconciling against the ledger", async () => {
    // Simulate: sign, persist hash, submit, then 'crash' before the result is recorded.
    const store = new IntentStore(":memory:");
    const crashedClient = new Client(wallet.client.url);
    await crashedClient.connect();
    const ctx = { client: crashedClient, signer: wallet.signer, policy: wallet.policy, store, network: "testnet" as const, source: "crash-test" };
    const origSubmit = crashedClient.submitAndWait.bind(crashedClient);
    (crashedClient as { submitAndWait: Client["submitAndWait"] }).submitAndWait = (async (blob: string) => {
      await origSubmit(blob); // the ledger applied it…
      throw new Error("process crashed before result was persisted"); // …but we never heard back
    }) as Client["submitAndWait"];

    const r = await executeTransaction(ctx, buildXrpPayment({ account: wallet.address, destination: DEST, amountDrops: 1_000_000n, memo: { app: "swell/test", action: "crash" } }));
    expect(r.status).toBe("unknown");
    expect(r.hash).toBeDefined();
    expect(store.get(r.intentId)!.status).toBe("unknown");

    // Reconcile does not resubmit; it looks the hash up and finalizes.
    store.setStatus(r.intentId, "submitted");
    const out = await reconcilePending({ client: crashedClient, store });
    expect(out[0].outcome).toBe("tesSUCCESS");
    expect(store.get(r.intentId)!.status).toBe("validated");
    await crashedClient.disconnect();
  }, 90_000);

  it("never signs for a different account", async () => {
    await expect(wallet.execute(buildXrpPayment({ account: DEST, destination: wallet.address, amountDrops: 1n }))).rejects.toThrow(/does not match/);
  });
});
