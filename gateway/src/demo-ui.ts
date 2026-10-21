export function renderShadowLabzDemoHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shadow DAOs · AgilityCore Payment & Midnight ZK KYC Portal</title>
  <style>
    :root {
      --bg: #090a0f;
      --panel: #11131c;
      --panel-alt: #161926;
      --border: #252a3d;
      --text: #f3f4f8;
      --muted: #949bb0;
      --accent: #7c5cff;
      --accent-hover: #9277ff;
      --emerald: #10b981;
      --amber: #f59e0b;
      --danger: #ef4444;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 20% 0%, #171532 0%, var(--bg) 45%);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.5;
      min-height: 100vh;
      padding-bottom: 60px;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(17, 19, 28, 0.85);
      backdrop-filter: blur(10px);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .nav {
      max-width: 1240px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 1.05rem;
      letter-spacing: -0.02em;
    }
    .brand-badge {
      background: linear-gradient(135deg, #7c5cff, #3b82f6);
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 0.82rem;
      padding: 6px 12px;
      border-radius: 999px;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.35);
      color: #6ee7b7;
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
    }
    .container {
      max-width: 1240px;
      margin: 28px auto;
      padding: 0 24px;
      display: grid;
      gap: 24px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(124, 92, 255, 0.14), rgba(16, 185, 129, 0.07));
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
    }
    .hero h1 {
      font-size: 1.65rem;
      letter-spacing: -0.02em;
      margin-bottom: 6px;
    }
    .hero p { color: var(--muted); font-size: 0.95rem; max-width: 760px; }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(520px, 1fr));
      gap: 24px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .card-title {
      font-size: 1.05rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .step-tag {
      font-family: var(--mono);
      font-size: 0.72rem;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(124, 92, 255, 0.18);
      color: #c4b5fd;
      border: 1px solid rgba(124, 92, 255, 0.35);
    }
    .field-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.82rem;
      color: var(--muted);
    }
    input, select {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 0.88rem;
      font-family: var(--mono);
    }
    input[type="range"] { padding: 0; accent-color: var(--accent); }
    .btn-row { display: flex; flex-wrap: wrap; gap: 10px; }
    button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 10px 16px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    button:hover { background: var(--accent-hover); }
    button.secondary {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      color: var(--text);
    }
    button.secondary:hover { border-color: var(--accent); }
    button.emerald { background: var(--emerald); color: #042f2e; }
    button.emerald:hover { background: #34d399; }
    .network-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
    }
    .net-box {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      font-size: 0.84rem;
    }
    .net-box strong { display: block; margin-bottom: 4px; color: var(--text); }
    .net-box span { color: var(--muted); font-size: 0.78rem; display: block; }
    pre {
      background: #06070b;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      font-family: var(--mono);
      font-size: 0.78rem;
      color: #a7f3d0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 310px;
    }
    .split-bars {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .split-stat {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
    }
    .split-stat .pct { font-size: 1.2rem; font-weight: 700; color: #c4b5fd; }
    .split-stat .lbl { font-size: 0.76rem; color: var(--muted); }
    .split-stat .drops { font-family: var(--mono); font-size: 0.8rem; margin-top: 4px; color: #6ee7b7; }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <div class="brand">
        <span>Shadow DAOs</span>
        <span class="brand-badge">AgilityCore Execution Layer</span>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <a href="/admin" style="text-decoration:none; background:#161926; border:1px solid #252a3d; color:#c4b5fd; padding:6px 12px; border-radius:8px; font-size:0.82rem; font-weight:600;">&larr; Admin Control Room</a>
        <div class="status-pill" id="topStatus">
          <span class="dot"></span>
          <span>AgilityCore: Operational (Compact 0.31.1 · XRPL X402 · Midnight m402)</span>
        </div>
      </div>
    </div>
  </header>

  <main class="container">
    <section class="hero">
      <div>
        <h1>ShadowLabz Payment Portal & Midnight ZK KYC Control Room</h1>
        <p>
          Live interactive demo of the upgraded <strong>Agility-Summit</strong> architecture for
          <strong>shadowlabz.io/dashboard</strong>: Zero-Knowledge KYC credential binding on Midnight
          (<code>ShadowLabzKyc.compact</code>) + HTTP 402 XRP settlement (<code>x402-xrpl</code> &amp; <code>m402Vault.compact</code>)
          + 3-way DAO membership split + 2-week crowdfunding escrow.
        </p>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div class="card-title">
          <span class="step-tag">DASHBOARD WIDGET</span>
          Connected Networks &amp; AgilityCore Execution Layer
        </div>
        <button class="secondary" onclick="loadStatus()">Refresh Status</button>
      </div>
      <div class="network-grid" id="networkGrid">Loading networks...</div>
    </section>

    <div class="grid-2">
      <!-- STEP 1: MIDNIGHT ZK KYC -->
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="step-tag">STEP 1 · ShadowLabzKyc.compact</span>
            Midnight ZK KYC + XRPL Wallet Binding
          </div>
        </div>
        <p style="color: var(--muted); font-size: 0.86rem;">
          Proves KYC tier, non-sanctioned status, and binds your XRPL wallet (Xaman) in zero knowledge using
          <code>kycPureCircuits.deriveKycPublicKey</code> &amp; <code>deriveKycNullifier</code>.
        </p>
        <div class="field-row">
          <label>
            Connected XRPL Wallet (Xaman)
            <input id="kycXrplAddr" value="rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" />
          </label>
          <label>
            Midnight User Secret Witness
            <input id="kycSecret" value="shadowlabz-founder-zk-secret-key" />
          </label>
        </div>
        <div class="field-row">
          <label>
            KYC Tier (1=Starter/Comm, 2=Growth, 3=Corp)
            <select id="kycTier">
              <option value="1">Tier 1 — Basic Verified</option>
              <option value="2" selected>Tier 2 — Growth / Multi-DAO</option>
              <option value="3">Tier 3 — Corporate Audit Verified</option>
            </select>
          </label>
          <label>
            Jurisdiction Code (ISO)
            <input id="kycJurisdiction" type="number" value="840" />
          </label>
        </div>
        <div class="btn-row">
          <button onclick="runKycVerify()">Generate Midnight ZK KYC Proof</button>
        </div>
        <pre id="kycOutput">// Click "Generate Midnight ZK KYC Proof" to compute X-Midnight-Kyc nullifier...</pre>
      </section>

      <!-- STEP 2: X402 + M402 PLAN CHECKOUT -->
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="step-tag">STEP 2 · HTTP 402 (x402-xrpl + m402)</span>
            ShadowLabz Plan Checkout in XRP
          </div>
        </div>
        <p style="color: var(--muted); font-size: 0.86rem;">
          Replaces PayPal on <code>/pricing</code> with HTTP 402 Payment Required in XRP (or Midnight shielded credits), gated by <code>X-Midnight-Kyc</code>.
        </p>
        <div class="field-row">
          <label>
            Select ShadowLabz Plan Tier
            <select id="planTier">
              <option value="starter">Starter — $10/mo (4 XRP · Up to 2 DAOs + Discord Bot)</option>
              <option value="community" selected>Community — $50/mo (20 XRP · Up to 5 DAOs + Treasury &amp; Crowdfunding)</option>
              <option value="growth">Growth — $250/mo (100 XRP · Unlimited DAOs + Confidential Treasury)</option>
              <option value="corporate">Corporate — $1,000/mo (400 XRP · Compliance-Ready ZK Audits)</option>
            </select>
          </label>
        </div>
        <div class="btn-row">
          <button class="secondary" onclick="requestPlan402()">1. Request Plan (Trigger 402 Challenge)</button>
          <button class="emerald" onclick="settlePlan402()">2. Sign &amp; Settle XRP / m402 Receipt</button>
        </div>
        <pre id="planOutput">// Step 1: Generate KYC proof on the left, then click "1. Request Plan" to inspect the 402 Payment Required response &amp; XRPL Agent Wallet Preview.</pre>
      </section>
    </div>

    <div class="grid-2">
      <!-- STEP 3: 3-WAY DAO MEMBERSHIP SPLIT -->
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="step-tag">STEP 3 · ShadowLabzSubscription.compact</span>
            Paid DAO Membership 3-Way XRP Split
          </div>
        </div>
        <p style="color: var(--muted); font-size: 0.86rem;">
          Replaces PayPal on <code>/docs#paid-membership</code>. Adjust the Organizer Fee slider (0%–95%);
          Platform Fee is fixed at 5% and DAO Treasury receives the exact remainder.
        </p>
        <div class="field-row">
          <label>
            DAO ID
            <input id="splitDaoId" value="nightshade-collective" />
          </label>
          <label>
            Monthly Membership Price (USD)
            <input id="splitPriceUsd" type="number" value="50" />
          </label>
        </div>
        <label>
          Organizer Fee Slider: <strong id="orgPctLabel" style="color: var(--text);">20%</strong>
          (Platform: 5% fixed · DAO Treasury: <strong id="treasuryPctLabel" style="color: #6ee7b7;">75%</strong>)
          <input id="orgSlider" type="range" min="0" max="95" value="20" oninput="updateSliderLabels()" />
        </label>
        <div class="split-bars" id="splitSummaryBars">
          <div class="split-stat">
            <div class="pct">5%</div>
            <div class="lbl">Platform Fee (Fixed)</div>
            <div class="drops" id="barPlatform">1.0 XRP</div>
          </div>
          <div class="split-stat">
            <div class="pct" id="barOrgPct">20%</div>
            <div class="lbl">DAO Organizer Fee</div>
            <div class="drops" id="barOrg">4.0 XRP</div>
          </div>
          <div class="split-stat">
            <div class="pct" id="barTreasuryPct">75%</div>
            <div class="lbl">DAO Treasury Share</div>
            <div class="drops" id="barTreasury">15.0 XRP</div>
          </div>
        </div>
        <div class="btn-row">
          <button onclick="runDaoSplitCheckout()">Build 3-Way Split XRPL Transactions</button>
        </div>
        <pre id="splitOutput">// Click "Build 3-Way Split XRPL Transactions" to construct the unsigned XRPL Payment objects...</pre>
      </section>

      <!-- STEP 4: 2-WEEK CROWDFUNDING ESCROW -->
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="step-tag">STEP 4 · AgilityEscrow.compact + XRPL EscrowCreate</span>
            2-Week DAO Treasury Crowdfunding Pool
          </div>
        </div>
        <p style="color: var(--muted); font-size: 0.86rem;">
          Creates a time-locked 14-day crowdfunding escrow on XRPL (<code>EscrowCreate</code>) paired with a
          deterministic Midnight <code>AgilityEscrow.compact</code> pool ID.
        </p>
        <div class="field-row">
          <label>
            Contribution (USD)
            <input id="escrowContribUsd" type="number" value="100" />
          </label>
          <label>
            DAO Pool Goal (USD)
            <input id="escrowGoalUsd" type="number" value="4500" />
          </label>
          <label>
            Pool Duration (Days)
            <input id="escrowDays" type="number" value="14" />
          </label>
        </div>
        <div class="btn-row">
          <button onclick="runCrowdfundEscrow()">Build 2-Week Escrow (Midnight + XRPL)</button>
        </div>
        <pre id="escrowOutput">// Click "Build 2-Week Escrow" to generate the Midnight Escrow ID &amp; XRPL EscrowCreate preview...</pre>
      </section>
    </div>
  </main>

  <script>
    let currentKycToken = null;

    async function loadStatus() {
      const res = await fetch('/api/agility-core/status');
      const data = await res.json();
      const grid = document.getElementById('networkGrid');
      grid.innerHTML = data.connectedNetworks.map(n => \`
        <div class="net-box">
          <strong>\${n.chain} (\${n.networkId})</strong>
          <span style="color:#6ee7b7;">● \${n.status.toUpperCase()}</span>
          <span>Wallet: \${n.walletSupport}</span>
        </div>
      \`).join('');
    }

    async function runKycVerify() {
      const xrplAddress = document.getElementById('kycXrplAddr').value;
      const userSecret = document.getElementById('kycSecret').value;
      const tier = Number(document.getElementById('kycTier').value);
      const jurisdictionCode = Number(document.getElementById('kycJurisdiction').value);

      const res = await fetch('/api/kyc/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xrplAddress, userSecret, tier, jurisdictionCode, isSanctioned: false })
      });
      const data = await res.json();
      if (data.verified) {
        currentKycToken = data.kycToken;
      }
      document.getElementById('kycOutput').textContent = JSON.stringify(data, null, 2);
    }

    async function requestPlan402() {
      if (!currentKycToken) {
        await runKycVerify();
      }
      const tier = document.getElementById('planTier').value;
      const res = await fetch('/api/x402/plan/' + tier, {
        headers: { 'X-Midnight-Kyc': currentKycToken }
      });
      const data = await res.json();
      document.getElementById('planOutput').textContent =
        'HTTP Status: ' + res.status + ' Payment Required\\n\\n' +
        (data.walletCeremonyPreview ? data.walletCeremonyPreview + '\\n\\n' : '') +
        JSON.stringify(data.paymentRequired || data, null, 2);
    }

    async function settlePlan402() {
      if (!currentKycToken) {
        await runKycVerify();
      }
      const tier = document.getElementById('planTier').value;
      // Payment proof is the hash of a validated XRPL Payment to the platform address
      // (e.g. from: swell pay-for http://127.0.0.1:8787/api/x402/plan/<tier>).
      const txHash = (prompt('Paste the validated XRPL Payment tx hash for this plan (or leave blank for m402-mock mode)') || Array.from(crypto.getRandomValues(new Uint8Array(32)))
        .map(b => b.toString(16).padStart(2, '0')).join('')).trim();
      const res = await fetch('/api/x402/plan/' + tier, {
        headers: {
          'X-Midnight-Kyc': currentKycToken,
          'X-Payment': txHash
        }
      });
      const data = await res.json();
      document.getElementById('planOutput').textContent =
        'HTTP Status: ' + res.status + ' OK (X402 / m402 Payment Settled!)\\n\\n' +
        JSON.stringify(data, null, 2);
    }

    function updateSliderLabels() {
      const orgPct = Number(document.getElementById('orgSlider').value);
      const treasuryPct = 95 - orgPct;
      const usd = Number(document.getElementById('splitPriceUsd').value || 50);
      const totalXrp = usd / 2.5;
      document.getElementById('orgPctLabel').textContent = orgPct + '%';
      document.getElementById('treasuryPctLabel').textContent = treasuryPct + '%';
      document.getElementById('barOrgPct').textContent = orgPct + '%';
      document.getElementById('barTreasuryPct').textContent = treasuryPct + '%';
      document.getElementById('barPlatform').textContent = (totalXrp * 0.05).toFixed(2) + ' XRP';
      document.getElementById('barOrg').textContent = (totalXrp * (orgPct / 100)).toFixed(2) + ' XRP';
      document.getElementById('barTreasury').textContent = (totalXrp * (treasuryPct / 100)).toFixed(2) + ' XRP';
    }

    async function runDaoSplitCheckout() {
      if (!currentKycToken) {
        await runKycVerify();
      }
      const daoId = document.getElementById('splitDaoId').value;
      const monthlyPriceUsd = Number(document.getElementById('splitPriceUsd').value);
      const organizerFeePercent = Number(document.getElementById('orgSlider').value);

      const res = await fetch('/api/dao/' + daoId + '/membership/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Midnight-Kyc': currentKycToken
        },
        body: JSON.stringify({
          monthlyPriceUsd,
          organizerFeePercent,
          organizerXrplAddress: 'rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH',
          daoTreasuryXrplAddress: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv'
        })
      });
      const data = await res.json();
      document.getElementById('splitOutput').textContent =
        (data.previews ? data.previews.join('\\n\\n') + '\\n\\n' : '') +
        JSON.stringify(data.split, null, 2);
    }

    async function runCrowdfundEscrow() {
      if (!currentKycToken) {
        await runKycVerify();
      }
      const daoId = document.getElementById('splitDaoId').value;
      const contributionUsd = Number(document.getElementById('escrowContribUsd').value);
      const goalUsd = Number(document.getElementById('escrowGoalUsd').value);
      const durationDays = Number(document.getElementById('escrowDays').value);

      const res = await fetch('/api/dao/' + daoId + '/crowdfund/escrow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Midnight-Kyc': currentKycToken
        },
        body: JSON.stringify({
          daoTreasuryXrplAddress: 'rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv',
          contributionUsd,
          goalUsd,
          durationDays
        })
      });
      const data = await res.json();
      document.getElementById('escrowOutput').textContent =
        'Midnight AgilityEscrow Pool ID: ' + data.midnightEscrowId + '\\n\\n' +
        data.walletCeremonyPreview + '\\n\\n' +
        JSON.stringify(data.xrplEscrowTx, null, 2);
    }

    loadStatus();
    runKycVerify();
  </script>
</body>
</html>`;
}
