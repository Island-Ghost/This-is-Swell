"use client";
import React, { useState, useEffect, useCallback } from "react";

const AGILITY_CORE_URL =
  process.env.NEXT_PUBLIC_AGILITY_CORE_URL || "http://127.0.0.1:8787";

/**
 * Drop-in Next.js Admin Landing Page for ShadowLabz (app/admin/page.tsx)
 * Connects directly to the AgilityCore Gateway (/api/admin/*) for:
 * 1. Midnight ZK KYC Credential Issuance & Revocation (ShadowLabzKyc.compact)
 * 2. DAO Paid Membership 3-Way XRP Split Configuration (5% Platform / Organizer% / Treasury%)
 * 3. 2-Week DAO Crowdfunding Escrow Pool Release (AgilityEscrow.compact + XRPL EscrowCreate)
 * 4. Real-Time X402 + m402 Revenue & Settlement Ledger
 */
export default function ShadowLabzAdminLandingPage() {
  const [overview, setOverview] = useState<any>(null);
  const [label, setLabel] = useState("Verified DAO Founder");
  const [xrplAddress, setXrplAddress] = useState("rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe");
  const [userSecret, setUserSecret] = useState("member-zk-secret-seed");
  const [tier, setTier] = useState(2);
  const [organizerFeePercent, setOrganizerFeePercent] = useState(20);
  const [monthlyPriceUsd, setMonthlyPriceUsd] = useState(50);

  const loadOverview = useCallback(async () => {
    const res = await fetch(`${AGILITY_CORE_URL}/api/admin/overview`);
    const data = await res.json();
    setOverview(data);
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const handleIssueKyc = async () => {
    await fetch(`${AGILITY_CORE_URL}/api/admin/kyc/issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label,
        xrplAddress,
        userSecret: `${userSecret}-${Date.now()}`,
        tier,
        jurisdictionCode: 840,
      }),
    });
    await loadOverview();
  };

  const handleToggleRevoke = async (kycNullifier: string, revoke: boolean) => {
    await fetch(`${AGILITY_CORE_URL}/api/admin/kyc/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kycNullifier, revoke }),
    });
    await loadOverview();
  };

  const handleReleaseEscrow = async (escrowId: string) => {
    await fetch(`${AGILITY_CORE_URL}/api/admin/escrow/${escrowId}/release`, {
      method: "POST",
    });
    await loadOverview();
  };

  if (!overview) {
    return <div style={{ padding: 32, color: "#949bb0" }}>Loading ShadowLabz Admin Control Room…</div>;
  }

  const treasurySharePercent = 95 - organizerFeePercent;

  return (
    <div style={{ padding: 32, maxWidth: 1280, margin: "0 auto", color: "#f4f5f9", background: "#07080d" }}>
      <h1>Shadow DAOs · Admin Control Room</h1>
      <p style={{ color: "#939ab2", marginTop: 6 }}>
        Midnight ZK KYC Authority · XRPL X402 Revenue Ledger · 3-Way DAO Membership Splits · 2-Week Escrow Pools
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 24 }}>
        <div style={{ background: "#10121b", padding: 18, borderRadius: 12, border: "1px solid #252a3f" }}>
          <div style={{ fontSize: 12, color: "#939ab2" }}>TOTAL X402 &amp; DAO VOLUME</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{overview.metrics.totalVolumeXrp} XRP</div>
        </div>
        <div style={{ background: "#10121b", padding: 18, borderRadius: 12, border: "1px solid #252a3f" }}>
          <div style={{ fontSize: 12, color: "#939ab2" }}>PLATFORM REVENUE (5% + PLANS)</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{overview.metrics.platformRevenueXrp} XRP</div>
        </div>
        <div style={{ background: "#10121b", padding: 18, borderRadius: 12, border: "1px solid #252a3f" }}>
          <div style={{ fontSize: 12, color: "#939ab2" }}>VERIFIED ZK KYC MEMBERS</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{overview.metrics.activeKycCount}</div>
        </div>
        <div style={{ background: "#10121b", padding: 18, borderRadius: 12, border: "1px solid #252a3f" }}>
          <div style={{ fontSize: 12, color: "#939ab2" }}>MANAGED DAOS &amp; ESCROWS</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {overview.daos.length} DAOs · {overview.escrows.length} Pools
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }}>
        <section style={{ background: "#10121b", padding: 22, borderRadius: 14, border: "1px solid #252a3f" }}>
          <h3>Issue Midnight ZK KYC Credential (ShadowLabzKyc.compact)</h3>
          <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
            <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Member Label" />
            <input value={xrplAddress} onChange={(e) => setXrplAddress(e.target.value)} placeholder="XRPL r... Address" />
            <input value={userSecret} onChange={(e) => setUserSecret(e.target.value)} placeholder="Secret Witness" />
            <select value={tier} onChange={(e) => setTier(Number(e.target.value))}>
              <option value={1}>Tier 1 — Starter / Community</option>
              <option value={2}>Tier 2 — Growth</option>
              <option value={3}>Tier 3 — Corporate Audit</option>
            </select>
            <button onClick={handleIssueKyc}>Issue ZK Credential &amp; Add to HistoricMerkleTree</button>
          </div>
        </section>

        <section style={{ background: "#10121b", padding: 22, borderRadius: 14, border: "1px solid #252a3f" }}>
          <h3>DAO Paid Membership 3-Way XRP Split ($ {monthlyPriceUsd}/mo)</h3>
          <p style={{ fontSize: 13, color: "#939ab2", marginTop: 6 }}>
            5% Platform (Fixed) · {organizerFeePercent}% Organizer · {treasurySharePercent}% DAO Treasury
          </p>
          <input
            type="range"
            min={0}
            max={95}
            value={organizerFeePercent}
            onChange={(e) => setOrganizerFeePercent(Number(e.target.value))}
            style={{ width: "100%", marginTop: 12 }}
          />
          <input
            type="number"
            value={monthlyPriceUsd}
            onChange={(e) => setMonthlyPriceUsd(Number(e.target.value))}
            style={{ marginTop: 10 }}
          />
        </section>
      </div>

      <section style={{ background: "#10121b", padding: 22, borderRadius: 14, border: "1px solid #252a3f", marginTop: 24 }}>
        <h3>Verified KYC Registry &amp; Revocation Controls</h3>
        <ul>
          {overview.kycRegistry.map((k: any) => (
            <li key={k.kycNullifierHex} style={{ marginTop: 8 }}>
              <strong>{k.label}</strong> ({k.xrplAddress}) — Tier {k.tier} —{" "}
              {k.revoked ? "REVOKED" : "ACTIVE"}{" "}
              <button onClick={() => handleToggleRevoke(k.kycNullifierHex, !k.revoked)}>
                {k.revoked ? "Restore" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section style={{ background: "#10121b", padding: 22, borderRadius: 14, border: "1px solid #252a3f", marginTop: 24 }}>
        <h3>2-Week Crowdfunding Escrow Pools (AgilityEscrow.compact)</h3>
        <ul>
          {overview.escrows.map((e: any) => (
            <li key={e.escrowId} style={{ marginTop: 8 }}>
              <strong>{e.daoId}</strong> — Status: {e.status}{" "}
              {e.status === "Active" && (
                <button onClick={() => handleReleaseEscrow(e.escrowId)}>Release Pool to Treasury</button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
