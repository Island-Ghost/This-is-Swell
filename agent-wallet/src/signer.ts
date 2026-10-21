import { Wallet, type SubmittableTransaction } from "xrpl";

export type SignedTx = { tx_blob: string; hash: string };

/**
 * The only thing the ceremony needs from a key holder. `EnvSeedSigner` is for development;
 * production should implement this against an HSM/KMS/OWS so the key never enters this process.
 */
export interface Signer {
  readonly address: string;
  readonly kind: string;
  sign(prepared: SubmittableTransaction): Promise<SignedTx>;
}

const SECRET_KEYS = ["seed", "privateKey", "publicKey", "secret", "mnemonic", "XRPL_SEED"];

/** Strips key material from anything about to be logged or thrown. */
export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    return value.replace(/\bs[1-9A-HJ-NP-Za-km-z]{25,}\b/g, "[REDACTED_SEED]") as T;
  }
  if (Array.isArray(value)) return value.map(redactSecrets) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEYS.includes(k) ? "[REDACTED]" : redactSecrets(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Loads the seed from XRPL_SEED on every sign call and lets the Wallet go out of scope immediately.
 * Only the public address is kept on the instance.
 */
export class EnvSeedSigner implements Signer {
  readonly kind = "env-seed";
  readonly address: string;
  private readonly envVar: string;

  constructor(envVar = "XRPL_SEED") {
    this.envVar = envVar;
    this.address = EnvSeedSigner.withWallet(envVar, (w) => w.classicAddress);
  }

  static isConfigured(envVar = "XRPL_SEED"): boolean {
    return !!process.env[envVar];
  }

  private static withWallet<T>(envVar: string, fn: (w: Wallet) => T): T {
    const seed = process.env[envVar];
    if (!seed) throw new Error(`${envVar} is not set. Run \`npm run wallet:create\` to generate one.`);
    try {
      return fn(Wallet.fromSeed(seed));
    } catch (err) {
      throw new Error(`Failed to load wallet from ${envVar}: ${redactSecrets((err as Error).message)}`);
    }
  }

  async sign(prepared: SubmittableTransaction): Promise<SignedTx> {
    return EnvSeedSigner.withWallet(this.envVar, (w) => {
      if (w.classicAddress !== prepared.Account) {
        throw new Error(`Signer address ${w.classicAddress} does not match tx.Account ${prepared.Account}`);
      }
      const { tx_blob, hash } = w.sign(prepared);
      return { tx_blob, hash };
    });
  }
}

/** Adapter for an externally held key (HSM, KMS, OWS agent token, hardware wallet). */
export class ExternalSigner implements Signer {
  readonly kind = "external";
  constructor(
    readonly address: string,
    private readonly impl: (tx: SubmittableTransaction) => Promise<SignedTx>,
  ) {}

  async sign(prepared: SubmittableTransaction): Promise<SignedTx> {
    if (this.address !== prepared.Account) {
      throw new Error(`Signer address ${this.address} does not match tx.Account ${prepared.Account}`);
    }
    return this.impl(prepared);
  }
}
