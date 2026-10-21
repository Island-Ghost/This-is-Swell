import { Client, type SubmittableTransaction } from "xrpl";
import { RLUSD_CURRENCY_HEX } from "@swell/shared";
import { loadPolicy, describePolicy, type SpendingPolicy, type XrplNetwork } from "./policy.js";
import { IntentStore, type IntentStatus } from "./store.js";
import { EnvSeedSigner, type Signer } from "./signer.js";
import { WS_URLS, getAccountState, hasTrustLine, destinationRequiresTag } from "./account.js";
import { executeTransaction, quoteTransaction, reconcilePending, type CeremonyContext, type ConfirmFn } from "./ceremony.js";
import { payForResource, type PayForResourceOptions } from "./x402-payer.js";
import {
  buildXrpPayment, buildRlusdPayment, buildRlusdTrustSet, buildEscrowCreate, buildEscrowFinish, buildEscrowCancel,
  buildSplitPayments, rlusdIssuer, toDrops, type MemoPayload,
} from "./builders.js";

export * from "./policy.js";
export * from "./store.js";
export * from "./signer.js";
export * from "./account.js";
export * from "./preview.js";
export * from "./builders.js";
export * from "./ceremony.js";
export * from "./x402-payer.js";

export type AgentWalletConfig = {
  signer?: Signer;
  policy?: SpendingPolicy;
  policyPath?: string;
  dbPath?: string;
  wsUrl?: string;
  source?: string;
  confirm?: ConfirmFn;
  log?: (line: string) => void;
};

/**
 * One object an agent runtime (CLI, MCP server, payer) holds. Wraps a connected xrpl Client, the
 * signer, the spending policy and the audit store, and exposes intent-level operations.
 */
export class AgentWallet {
  readonly client: Client;
  readonly signer: Signer;
  readonly policy: SpendingPolicy;
  readonly store: IntentStore;
  readonly network: XrplNetwork;
  readonly source: string;
  confirm?: ConfirmFn;
  log?: (line: string) => void;

  constructor(cfg: AgentWalletConfig = {}) {
    this.policy = cfg.policy ?? loadPolicy(cfg.policyPath);
    this.network = this.policy.network;
    this.signer = cfg.signer ?? new EnvSeedSigner();
    this.store = new IntentStore(cfg.dbPath);
    this.client = new Client(cfg.wsUrl ?? process.env.XRPL_WS_URL ?? WS_URLS[this.network]);
    this.source = cfg.source ?? "agent-wallet";
    this.confirm = cfg.confirm;
    this.log = cfg.log;
  }

  get address() {
    return this.signer.address;
  }

  async connect() {
    if (!this.client.isConnected()) await this.client.connect();
    return this;
  }

  async close() {
    if (this.client.isConnected()) await this.client.disconnect();
    this.store.close();
  }

  private ctx(): CeremonyContext {
    return { client: this.client, signer: this.signer, policy: this.policy, store: this.store, network: this.network, source: this.source, confirm: this.confirm, log: this.log };
  }

  account() {
    return getAccountState(this.client, this.address);
  }

  policyStatus() {
    return describePolicy(this.policy, this.store.spendWindow(this.address));
  }

  audit(opts: { status?: IntentStatus; limit?: number } = {}) {
    return this.store.list(opts);
  }

  reconcile() {
    return reconcilePending(this.ctx());
  }

  quote(tx: SubmittableTransaction) {
    return quoteTransaction(this.ctx(), tx);
  }

  execute(tx: SubmittableTransaction) {
    return executeTransaction(this.ctx(), tx);
  }

  async pay(p: { to: string; xrp?: number | string; rlusd?: string; destinationTag?: number; memo?: MemoPayload; sourceTag?: number }) {
    if ((p.xrp === undefined) === (p.rlusd === undefined)) throw new Error("Specify exactly one of xrp or rlusd");
    if (p.destinationTag === undefined && (await destinationRequiresTag(this.client, p.to))) {
      throw new Error(`Destination ${p.to} requires a DestinationTag (lsfRequireDestTag); payment would fail with tecDST_TAG_NEEDED.`);
    }
    const memo = p.memo ?? { app: "swell/agent", action: p.xrp !== undefined ? "pay_xrp" : "pay_rlusd" };
    if (p.xrp !== undefined) {
      return this.execute(buildXrpPayment({ account: this.address, destination: p.to, amountDrops: toDrops(p.xrp), destinationTag: p.destinationTag, sourceTag: p.sourceTag, memo }));
    }
    const issuer = rlusdIssuer(this.network);
    if (!(await hasTrustLine(this.client, this.address, RLUSD_CURRENCY_HEX, issuer))) {
      throw new Error(`No RLUSD trust line on ${this.address} for issuer ${issuer}. Run trustRlusd() first.`);
    }
    return this.execute(buildRlusdPayment({ account: this.address, destination: p.to, value: p.rlusd!, network: this.network, destinationTag: p.destinationTag, sourceTag: p.sourceTag, memo }));
  }

  trustRlusd(limit?: string) {
    return this.execute(buildRlusdTrustSet({ account: this.address, network: this.network, limit }));
  }

  createEscrow(p: { to: string; xrp: number | string; finishAfterUnix: number; cancelAfterUnix?: number; memo?: MemoPayload }) {
    return this.execute(buildEscrowCreate({ account: this.address, destination: p.to, amountDrops: toDrops(p.xrp), finishAfterUnix: p.finishAfterUnix, cancelAfterUnix: p.cancelAfterUnix, memo: p.memo ?? { app: "swell/agent", action: "escrow_create" } }));
  }

  finishEscrow(p: { owner: string; offerSequence: number }) {
    return this.execute(buildEscrowFinish({ account: this.address, owner: p.owner, offerSequence: p.offerSequence, memo: { app: "swell/agent", action: "escrow_finish" } }));
  }

  cancelEscrow(p: { owner: string; offerSequence: number }) {
    return this.execute(buildEscrowCancel({ account: this.address, owner: p.owner, offerSequence: p.offerSequence, memo: { app: "swell/agent", action: "escrow_cancel" } }));
  }

  /** Executes each leg of a 3-way split in order; stops at the first leg that does not validate. */
  async split(p: { totalXrp: number | string; platformAddress: string; organizerAddress: string; treasuryAddress: string; organizerFeeBps: number; memo?: Omit<MemoPayload, "action"> }) {
    const { split, transactions } = buildSplitPayments({ account: this.address, totalDrops: toDrops(p.totalXrp), ...p });
    const legs = [];
    for (const tx of transactions) {
      const r = await this.execute(tx);
      legs.push(r);
      if (r.status !== "validated") break;
    }
    return { split, legs, complete: legs.length === transactions.length && legs.every((l) => l.status === "validated") };
  }

  payForResource(url: string, opts?: PayForResourceOptions) {
    return payForResource(this.ctx(), url, opts);
  }
}

export async function createAgentWallet(cfg: AgentWalletConfig = {}) {
  return new AgentWallet(cfg).connect();
}
