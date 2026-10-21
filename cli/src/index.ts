#!/usr/bin/env tsx
import "dotenv/config";
import { parseArgs } from "node:util";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";
import {
  AgentWallet, EnvSeedSigner, loadPolicy, savePolicy, validatePolicy, redactSecrets,
  type SpendingPolicy, type IntentStatus, type ExecuteResult,
} from "@swell/agent-wallet";

const HELP = `swell — XRPL agent wallet supervision CLI

Usage: swell <command> [options]

  wallet create [--buyer]            Generate a testnet wallet (seed → .env, never printed) and fund it
  wallet status                      Address, balance, reserve, spendable, policy headroom
  quote <dest> <xrp>                 Dry-run: autofill, simulate, policy verdict, preview. Nothing signed.
  pay <dest> <amount> [--rlusd] [--tag N] [--memo TEXT]
  pay-for <url> [--max-xrp N] [--header K=V ...] [--method M]
  trust rlusd [--limit N]            Create the RLUSD trust line
  escrow create <dest> <xrp> --finish-in <dur> [--cancel-in <dur>]   (dur: 90s, 10m, 2h, 14d)
  escrow finish <owner> <seq>
  escrow cancel <owner> <seq>
  policy show
  policy set <key=value> ...         e.g. maxPerTxDrops=2000000 expiresAt=2026-11-01T00:00:00Z
  audit [--status S] [--limit N]
  reconcile                          Resolve signed/submitted intents against the ledger

Global options:
  --yes        Autonomous mode: sign without asking when the policy allows; otherwise refuse.
               Default is interactive: every signature is previewed and confirmed.
  --json       Machine-readable output
  -h, --help
`;

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    yes: { type: "boolean", default: false },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    rlusd: { type: "boolean", default: false },
    buyer: { type: "boolean", default: false },
    tag: { type: "string" },
    memo: { type: "string" },
    "max-xrp": { type: "string" },
    header: { type: "string", multiple: true },
    method: { type: "string" },
    limit: { type: "string" },
    status: { type: "string" },
    "finish-in": { type: "string" },
    "cancel-in": { type: "string" },
  },
});

const out = (data: unknown, human?: () => void) => {
  if (flags.json || !human) console.log(JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  else human();
};

async function askHuman(preview: string, reasons: string[]): Promise<boolean> {
  console.log(preview);
  if (reasons.length) console.log(`⚠ Outside policy: ${reasons.join("; ")}`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question("Sign and submit? (yes / no) ")).trim().toLowerCase();
  rl.close();
  return answer === "yes" || answer === "y";
}

function parseDuration(s: string): number {
  const m = s.match(/^(\d+)([smhd])$/);
  if (!m) throw new Error(`Bad duration "${s}" (use e.g. 90s, 10m, 2h, 14d)`);
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as "s" | "m" | "h" | "d"];
}

function printResult(r: ExecuteResult) {
  out(r, () => {
    if (!flags.yes || r.status !== "validated") console.log(r.preview);
    const line: Record<string, string> = {
      validated: `✓ ${r.resultCode} — hash ${r.hash} in ledger ${r.ledgerIndex}`,
      failed: `✗ ${r.resultCode}: ${r.resultSummary} (hash ${r.hash})`,
      unknown: `? ${r.resultSummary} — run \`swell reconcile\` (hash ${r.hash})`,
      denied: `✗ DENIED by policy: ${r.decision.reasons.join("; ")}`,
      needs_approval: `⏸ needs human approval: ${r.decision.reasons.join("; ")} (re-run without --yes)`,
      rejected_by_human: "✗ cancelled",
    };
    console.log(line[r.status]);
  });
}

async function withWallet<T>(fn: (w: AgentWallet) => Promise<T>): Promise<T> {
  if (!EnvSeedSigner.isConfigured()) {
    console.error("XRPL_SEED is not set. Run `swell wallet create` first.");
    process.exit(2);
  }
  const wallet = new AgentWallet({ source: "cli", confirm: flags.yes ? undefined : askHuman0 });
  await wallet.connect();
  try {
    return await fn(wallet);
  } finally {
    await wallet.close();
  }
}
const askHuman0 = (preview: string, d: { reasons: string[] }) => askHuman(preview, d.reasons);

async function main() {
  const [cmd, sub, ...rest] = positionals;
  if (flags.help || !cmd) return console.log(HELP);

  switch (cmd) {
    case "wallet": {
      if (sub === "create") {
        const r = spawnSync("npx", ["tsx", "scripts/create-agent-wallet.ts", ...(flags.buyer ? ["--buyer"] : [])], { stdio: "inherit" });
        process.exit(r.status ?? 1);
      }
      return withWallet(async (w) => {
        const [account, policy] = [await w.account(), w.policyStatus()];
        out({ account, policy }, () => {
          console.log(`Address    : ${account.address} (${w.network})`);
          console.log(`Balance    : ${account.balanceXrp} XRP   Reserve: ${Number(account.reserveDrops) / 1e6} XRP   Spendable: ${account.spendableXrp} XRP`);
          console.log(`Policy     : ≤${policy.maxPerTxXrp} XRP/tx, ${policy.remainingTodayXrp}/${policy.maxPerDayXrp} XRP left today, ${policy.txLastHour}/${policy.maxTxPerHour} tx this hour${policy.expired ? "  ⚠ EXPIRED" : ""}`);
          console.log(`Signer     : ${w.signer.kind}`);
        });
      });
    }

    case "quote": {
      const [dest, xrp] = [sub, rest[0]];
      if (!dest || !xrp) throw new Error("usage: swell quote <dest> <xrp>");
      return withWallet(async (w) => {
        const { buildXrpPayment, toDrops } = await import("@swell/agent-wallet");
        const q = await w.quote(buildXrpPayment({ account: w.address, destination: dest, amountDrops: toDrops(xrp), memo: { app: "swell/cli", action: "quote" } }));
        out(q, () => {
          console.log(q.preview);
          console.log(`Simulation : ${q.simulation.engineResult} — ${q.simulation.engineResultMessage}`);
          console.log(`Policy     : ${q.decision.allowed ? "allowed" : q.decision.denied ? "DENIED" : "needs human"} ${q.decision.reasons.join("; ")}`);
        });
      });
    }

    case "pay": {
      const [dest, amount] = [sub, rest[0]];
      if (!dest || !amount) throw new Error("usage: swell pay <dest> <amount> [--rlusd]");
      return withWallet(async (w) => {
        const memo = flags.memo ? { app: "swell/cli", action: "pay", note: flags.memo } : undefined;
        const r = await w.pay({ to: dest, ...(flags.rlusd ? { rlusd: amount } : { xrp: amount }), destinationTag: flags.tag ? Number(flags.tag) : undefined, memo });
        printResult(r);
      });
    }

    case "pay-for": {
      if (!sub) throw new Error("usage: swell pay-for <url>");
      return withWallet(async (w) => {
        const headers = Object.fromEntries((flags.header ?? []).map((h) => { const i = h.indexOf("="); return [h.slice(0, i), h.slice(i + 1)]; }));
        const r = await w.payForResource(sub, { headers, method: flags.method, maxPriceDrops: flags["max-xrp"] ? BigInt(Math.round(Number(flags["max-xrp"]) * 1e6)) : undefined });
        out(r, () => {
          if (r.challenge) console.log(`402 challenge: ${Number(r.challenge.amountDrops) / 1e6} XRP → ${r.challenge.payTo} (${r.challenge.network})${r.challenge.description ? ` — ${r.challenge.description}` : ""}`);
          if (r.payment) console.log(`payment: ${r.payment.status}${r.payment.hash ? ` ${r.payment.hash}` : ""}`);
          console.log(`result : ${r.status} (HTTP ${r.httpStatus})${r.reason ? ` — ${r.reason}` : ""}`);
          console.log(typeof r.body === "string" ? r.body : JSON.stringify(r.body, null, 2));
        });
      });
    }

    case "trust":
      if (sub !== "rlusd") throw new Error("usage: swell trust rlusd");
      return withWallet(async (w) => printResult(await w.trustRlusd(flags.limit)));

    case "escrow": {
      return withWallet(async (w) => {
        if (sub === "create") {
          const [dest, xrp] = rest;
          if (!dest || !xrp || !flags["finish-in"]) throw new Error("usage: swell escrow create <dest> <xrp> --finish-in <dur> [--cancel-in <dur>]");
          const now = Math.floor(Date.now() / 1000);
          return printResult(await w.createEscrow({ to: dest, xrp, finishAfterUnix: now + parseDuration(flags["finish-in"]), cancelAfterUnix: flags["cancel-in"] ? now + parseDuration(flags["cancel-in"]) : undefined }));
        }
        const [owner, seq] = rest;
        if (!owner || !seq) throw new Error(`usage: swell escrow ${sub} <owner> <offerSequence>`);
        if (sub === "finish") return printResult(await w.finishEscrow({ owner, offerSequence: Number(seq) }));
        if (sub === "cancel") return printResult(await w.cancelEscrow({ owner, offerSequence: Number(seq) }));
        throw new Error("usage: swell escrow create|finish|cancel");
      });
    }

    case "policy": {
      const policy = loadPolicy();
      if (sub === "show" || !sub) return out(policy, () => console.log(JSON.stringify(policy, null, 2)));
      if (sub === "set") {
        const next: Record<string, unknown> = { ...policy };
        for (const kv of rest) {
          const i = kv.indexOf("=");
          const [k, v] = [kv.slice(0, i), kv.slice(i + 1)];
          next[k] = v.startsWith("[") || v === "null" ? JSON.parse(v) : /^\d+$/.test(v) && k === "maxTxPerHour" ? Number(v) : v;
        }
        savePolicy(validatePolicy(next as SpendingPolicy));
        return out(next, () => console.log(`✓ policy updated\n${JSON.stringify(next, null, 2)}`));
      }
      throw new Error("usage: swell policy show|set");
    }

    case "audit":
      return withWallet(async (w) => {
        const rows = w.audit({ status: flags.status as IntentStatus | undefined, limit: flags.limit ? Number(flags.limit) : 20 });
        out(rows, () => {
          for (const r of rows) console.log(`#${r.id} ${r.createdAt} ${r.status.padEnd(14)} ${r.txType.padEnd(12)} ${r.asset} ${r.asset === "XRP" ? Number(r.amount) / 1e6 : Number(r.amount) / 1e6} → ${r.destination ?? "—"} ${r.hash ?? ""} ${r.resultCode ?? ""} [${r.source}]`);
          if (!rows.length) console.log("(no intents)");
        });
      });

    case "reconcile":
      return withWallet(async (w) => {
        const res = await w.reconcile();
        out(res, () => { for (const r of res) console.log(`#${r.intentId} ${r.hash} → ${r.outcome}`); if (!res.length) console.log("nothing pending"); });
      });

    default:
      console.log(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`error: ${redactSecrets((err as Error).message ?? String(err))}`);
  process.exit(1);
});
