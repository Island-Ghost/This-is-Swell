import { describe, it, expect } from "vitest";
import { app } from "./app.js";
import { computeShadowLabzSplit } from "@swell/shared";

describe("ShadowLabz AgilityCore Payment & KYC Gateway", () => {
  it("serves /api/agility-core/status for shadowlabz.io/dashboard", async () => {
    const res = await app.request("/api/agility-core/status");
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.agilityCoreExecutionLayer.status).toBe("operational");
    expect(body.agilityCoreExecutionLayer.protocols).toContain("x402-xrpl");
    expect(body.agilityCoreExecutionLayer.protocols).toContain("m402-midnight");
    expect(body.connectedNetworks).toHaveLength(4);
  });

  it("computes the exact 3-way ShadowLabz DAO membership split without rounding loss", () => {
    // $50 Community DAO subscription = 20,000,000 drops at $2.50/XRP
    // 5% platform (500 bps), 25% organizer (2500 bps), 70% DAO treasury (7000 bps)
    const split = computeShadowLabzSplit(20_000_000n, 2500);
    expect(split.platformFeeBps).toBe(500);
    expect(split.organizerFeeBps).toBe(2500);
    expect(split.treasuryShareBps).toBe(7000);
    expect(split.platformDrops).toBe(1_000_000n);
    expect(split.organizerDrops).toBe(5_000_000n);
    expect(split.treasuryDrops).toBe(14_000_000n);
    expect(split.platformDrops + split.organizerDrops + split.treasuryDrops).toBe(
      split.totalDrops,
    );
  });

  it("verifies Midnight ZK KYC and enforces the HTTP 402 X402 + m402 payment flow on /api/x402/plan/:tier", async () => {
    // 1. Attempt to access paid Starter plan without KYC -> 403
    const unverifiedRes = await app.request("/api/x402/plan/starter");
    expect(unverifiedRes.status).toBe(403);

    // 2. Verify KYC and bind XRPL wallet (Xaman address)
    const kycRes = await app.request("/api/kyc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userSecret: "shadowlabz-member-secret-key-001",
        xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        contextId: "shadowlabz:plan:starter",
        tier: 2,
        jurisdictionCode: 840,
        isSanctioned: false,
      }),
    });
    expect(kycRes.status).toBe(200);
    const kycData = (await kycRes.json()) as any;
    expect(kycData.verified).toBe(true);
    expect(kycData.kycToken).toHaveLength(64);

    // 3. Call /api/x402/plan/starter with X-Midnight-Kyc but no X-Payment -> 402 Payment Required
    const challengeRes = await app.request("/api/x402/plan/starter", {
      headers: { "X-Midnight-Kyc": kycData.kycToken },
    });
    expect(challengeRes.status).toBe(402);
    const challengeBody = (await challengeRes.json()) as any;
    expect(challengeBody.paymentRequired.protocol).toBe("dual-402");
    expect(challengeBody.paymentRequired.xrpl.priceDrops).toBe("4000000");
    expect(challengeBody.unsignedXrplTx.TransactionType).toBe("Payment");
    expect(challengeBody.walletCeremonyPreview).toContain("XRPL Transaction Preview");

    // 4. Retry with X-Payment receipt secret -> 200 Settled
    const paidRes = await app.request("/api/x402/plan/starter", {
      headers: {
        "X-Midnight-Kyc": kycData.kycToken,
        "X-Payment": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
      },
    });
    expect(paidRes.status).toBe(200);
    const paidBody = (await paidRes.json()) as any;
    expect(paidBody.status).toBe("settled");
    expect(paidBody.tier).toBe("starter");
    expect(paidBody.subscriptionId).toHaveLength(64);

    // 5. Replay guard rejects reusing the same X-Payment secret -> 402 receipt-already-used
    const replayRes = await app.request("/api/x402/plan/starter", {
      headers: {
        "X-Midnight-Kyc": kycData.kycToken,
        "X-Payment": "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20",
      },
    });
    expect(replayRes.status).toBe(402);
  });

  it("builds 3-way XRP split transactions for Paid DAO Memberships and 2-week Crowdfunding Escrows", async () => {
    const kycRes = await app.request("/api/kyc/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userSecret: "shadowlabz-dao-backer-secret",
        xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        tier: 2,
      }),
    });
    const { kycToken } = (await kycRes.json()) as any;

    // Paid DAO membership 3-way split
    const splitRes = await app.request("/api/dao/nightshade-collective/membership/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Midnight-Kyc": kycToken,
      },
      body: JSON.stringify({
        monthlyPriceUsd: 25,
        organizerFeePercent: 20, // 5% platform, 20% organizer, 75% DAO treasury
        organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
        daoTreasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
      }),
    });
    expect(splitRes.status).toBe(200);
    const splitData = (await splitRes.json()) as any;
    expect(splitData.transactions).toHaveLength(3);
    expect(splitData.split.platformFeeBps).toBe(500);
    expect(splitData.split.organizerFeeBps).toBe(2000);
    expect(splitData.split.treasuryShareBps).toBe(7500);

    // 2-week DAO crowdfunding escrow
    const escrowRes = await app.request("/api/dao/nightshade-collective/crowdfund/escrow", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Midnight-Kyc": kycToken,
      },
      body: JSON.stringify({
        daoTreasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
        contributionUsd: 100,
        goalUsd: 4500,
        durationDays: 14,
      }),
    });
    expect(escrowRes.status).toBe(200);
    const escrowData = (await escrowRes.json()) as any;
    expect(escrowData.midnightEscrowId).toHaveLength(64);
    expect(escrowData.xrplEscrowTx.TransactionType).toBe("EscrowCreate");
  });

  it("serves the Admin Landing Page and handles KYC issuance, revocation, DAO split config, and escrow release", async () => {
    const htmlRes = await app.request("/admin");
    expect(htmlRes.status).toBe(200);
    const html = await htmlRes.text();
    expect(html).toContain("ShadowLabz Admin Landing Page");

    // 1. Admin issues a Midnight ZK KYC credential
    const issueRes = await app.request("/api/admin/kyc/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Enterprise DAO Treasurer",
        xrplAddress: "rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe",
        userSecret: "enterprise-treasurer-secret-999",
        tier: 3,
        jurisdictionCode: 840,
      }),
    });
    expect(issueRes.status).toBe(200);
    const issueBody = (await issueRes.json()) as any;
    expect(issueBody.issued).toBe(true);
    expect(issueBody.merkleTreeInserted).toBe(true);
    const kycNullifier = issueBody.record.kycNullifierHex;

    // 2. Admin revokes and restores the credential
    const revokeRes = await app.request("/api/admin/kyc/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kycNullifier, revoke: true }),
    });
    expect(revokeRes.status).toBe(200);
    const revokeBody = (await revokeRes.json()) as any;
    expect(revokeBody.record.revoked).toBe(true);

    // Verify revoked user is blocked from X402 checkout
    const blockedRes = await app.request("/api/x402/plan/starter", {
      headers: { "X-Midnight-Kyc": kycNullifier },
    });
    expect(blockedRes.status).toBe(403);

    // 3. Admin creates/updates a DAO and checks overview
    const daoRes = await app.request("/api/admin/dao/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "agility-governance-dao",
        name: "Agility Governance DAO",
        joinPolicy: "zk-kyc-gated",
        monthlyPriceUsd: 100,
        organizerFeePercent: 15,
        organizerXrplAddress: "rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH",
        treasuryXrplAddress: "rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv",
      }),
    });
    expect(daoRes.status).toBe(200);

    const overviewRes = await app.request("/api/admin/overview");
    expect(overviewRes.status).toBe(200);
    const overview = (await overviewRes.json()) as any;
    expect(overview.daos.some((d: any) => d.id === "agility-governance-dao")).toBe(true);
  });
});
