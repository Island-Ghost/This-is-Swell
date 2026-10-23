export function renderShadowLabzAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shadow DAOs · Admin Control Room (AgilityCore · XRPL X402 · Midnight ZK KYC)</title>
  <style>
    :root {
      --bg: #07080d;
      --panel: #10121b;
      --panel-alt: #161927;
      --panel-hover: #1c2032;
      --border: #252a3f;
      --text: #f4f5f9;
      --muted: #939ab2;
      --accent: #7c5cff;
      --accent-hover: #9378ff;
      --emerald: #10b981;
      --amber: #f59e0b;
      --danger: #ef4444;
      --cyan: #06b6d4;
      --mono: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at 15% 0%, #191638 0%, var(--bg) 48%);
      color: var(--text);
      font-family: var(--sans);
      line-height: 1.5;
      min-height: 100vh;
      padding-bottom: 64px;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: rgba(16, 18, 27, 0.88);
      backdrop-filter: blur(12px);
      position: sticky;
      top: 0;
      z-index: 20;
    }
    .nav {
      max-width: 1320px;
      margin: 0 auto;
      padding: 14px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 1.08rem;
      letter-spacing: -0.02em;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
      border-radius: 9px;
      background: linear-gradient(135deg, #7c5cff, #06b6d4);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 0.92rem;
      color: #fff;
    }
    .brand-badge {
      background: rgba(124, 92, 255, 0.18);
      border: 1px solid rgba(124, 92, 255, 0.45);
      color: #d8b4fe;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--muted);
      padding: 7px 13px;
      border-radius: 8px;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tab-btn:hover { color: var(--text); background: var(--panel-alt); }
    .tab-btn.active {
      color: #fff;
      background: rgba(124, 92, 255, 0.22);
      border-color: rgba(124, 92, 255, 0.55);
    }
    .portal-link {
      text-decoration: none;
      background: var(--panel-alt);
      border: 1px solid var(--border);
      color: #6ee7b7;
      padding: 7px 13px;
      border-radius: 8px;
      font-size: 0.82rem;
      font-weight: 600;
    }
    .portal-link:hover { border-color: var(--emerald); }
    .container {
      max-width: 1320px;
      margin: 26px auto;
      padding: 0 24px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
    .hero-banner {
      background: linear-gradient(135deg, rgba(124, 92, 255, 0.16), rgba(6, 182, 212, 0.08));
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px 28px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 20px;
    }
    .hero-banner h1 { font-size: 1.6rem; letter-spacing: -0.02em; margin-bottom: 6px; }
    .hero-banner p { color: var(--muted); font-size: 0.92rem; max-width: 780px; }
    .wallet-bar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
    }
    .wallet-chip {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 8px 14px;
      font-size: 0.8rem;
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--mono);
    }
    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--emerald);
      box-shadow: 0 0 8px var(--emerald);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
    }
    .kpi-card {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px 20px;
    }
    .kpi-label {
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 6px;
    }
    .kpi-value {
      font-size: 1.55rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text);
    }
    .kpi-sub {
      font-size: 0.78rem;
      color: #6ee7b7;
      margin-top: 4px;
      font-family: var(--mono);
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(540px, 1fr));
      gap: 22px;
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
      flex-wrap: wrap;
    }
    .card-title {
      font-size: 1.02rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .tag {
      font-family: var(--mono);
      font-size: 0.71rem;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(124, 92, 255, 0.16);
      color: #c4b5fd;
      border: 1px solid rgba(124, 92, 255, 0.35);
    }
    .tag.emerald {
      background: rgba(16, 185, 129, 0.14);
      color: #6ee7b7;
      border-color: rgba(16, 185, 129, 0.35);
    }
    .tag.amber {
      background: rgba(245, 158, 11, 0.15);
      color: #fcd34d;
      border-color: rgba(245, 158, 11, 0.35);
    }
    .tag.danger {
      background: rgba(239, 68, 68, 0.15);
      color: #fca5a5;
      border-color: rgba(239, 68, 68, 0.35);
    }
    .field-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 0.8rem;
      color: var(--muted);
    }
    input, select {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 9px 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-family: var(--mono);
    }
    input[type="range"] { padding: 0; accent-color: var(--accent); }
    button {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 9px 15px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.84rem;
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
    button.danger {
      background: rgba(239, 68, 68, 0.18);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fca5a5;
      padding: 5px 10px;
      font-size: 0.76rem;
    }
    button.danger:hover { background: rgba(239, 68, 68, 0.32); }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.83rem;
    }
    th, td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--muted);
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    td.mono { font-family: var(--mono); font-size: 0.78rem; }
    pre {
      background: #05060a;
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 13px;
      font-family: var(--mono);
      font-size: 0.77rem;
      color: #a7f3d0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 260px;
    }
    .split-preview {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
    }
    .split-box {
      background: var(--panel-alt);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
    }
    .split-box .pct { font-size: 1.15rem; font-weight: 700; color: #c4b5fd; }
    .split-box .lbl { font-size: 0.75rem; color: var(--muted); }
    .split-box .val { font-family: var(--mono); font-size: 0.8rem; color: #6ee7b7; margin-top: 4px; }
    .section-view { display: flex; flex-direction: column; gap: 22px; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <header>
    <div class="nav">
      <div class="brand">
        <span class="brand-logo">S</span>
        <span>Shadow DAOs</span>
        <span class="brand-badge">Admin Control Room</span>
      </div>
      <div class="nav-links">
        <button class="tab-btn active" onclick="switchTab('all', this)">All Controls</button>
        <button class="tab-btn" onclick="switchTab('sdk', this)">@agility/sdk · Mastercard Swell Demo</button>
        <button class="tab-btn" onclick="switchTab('kyc', this)">Midnight ZK KYC Authority</button>
        <button class="tab-btn" onclick="switchTab('daos', this)">DAOs, Splits &amp; Escrows</button>
        <button class="tab-btn" onclick="switchTab('ledger', this)">X402 Revenue Ledger</button>
        <button class="tab-btn" onclick="switchTab('settings', this)">Gateway &amp; Bot Config</button>
        <a class="portal-link" href="/portal">Open Member Payer Portal &rarr;</a>
      </div>
    </div>
  </header>

  <main class="container">
    <!-- HERO / ADMIN IDENTITY BAR -->
    <section class="hero-banner">
      <div>
        <h1>ShadowLabz Admin Landing Page &amp; AgilityCore Control Room</h1>
        <p>
          Manage Midnight Zero-Knowledge KYC credentials (<code>ShadowLabzKyc.compact</code>), configure DAO 3-way XRP
          membership revenue splits (<code>5% Platform / Organizer% / Treasury%</code>), release 2-week crowdfunding escrows,
          and audit X402 + m402 settlements in real time.
        </p>
      </div>
      <div class="wallet-bar">
        <div class="wallet-chip">
          <span class="dot"></span>
          <span>XRPL Admin: <strong id="adminXrplAddr">rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh</strong></span>
        </div>
        <div class="wallet-chip">
          <span class="dot"></span>
          <span>Midnight Authority: <strong>Lace (preview)</strong></span>
        </div>
      </div>
    </section>

    <!-- KPI SUMMARY ROW -->
    <section class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Total X402 &amp; DAO Volume</div>
        <div class="kpi-value" id="kpiTotalXrp">0 XRP</div>
        <div class="kpi-sub" id="kpiTotalDrops">0 drops settled</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Platform Revenue (5% Split + Plans)</div>
        <div class="kpi-value" id="kpiPlatformXrp">0 XRP</div>
        <div class="kpi-sub" id="kpiTxCount">0 settled transactions</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Verified Midnight ZK KYC Members</div>
        <div class="kpi-value" id="kpiKycCount">0</div>
        <div class="kpi-sub" id="kpiRevokedCount">0 revoked · HistoricMerkleTree&lt;16&gt;</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Active DAOs &amp; 2-Week Escrows</div>
        <div class="kpi-value" id="kpiDaoEscrowCount">0 DAOs · 0 Pools</div>
        <div class="kpi-sub">Midnight + XRPL Connected</div>
      </div>
    </section>

    <!-- SECTION: MIDNIGHT ZK KYC AUTHORITY CONSOLE -->
    <div id="sec-kyc" class="section-view">
      <div class="grid-2">
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">ShadowLabzKyc.compact</span>
              Issue Midnight ZK KYC Credential Commitment
            </div>
          </div>
          <p style="color: var(--muted); font-size: 0.84rem;">
            As the ShadowLabz KYC Authority, issue a blinded <code>persistentCommit&lt;KycCredential&gt;</code> commitment
            and insert the member leaf into <code>kycMembers</code> (<code>HistoricMerkleTree&lt;16, Bytes&lt;32&gt;&gt;</code>).
            Zero PII is stored on-chain.
          </p>
          <div class="field-row">
            <label>
              Member Alias / Label (Off-Chain Note)
              <input id="issueLabel" value="Nightshade Lead Founder" />
            </label>
            <label>
              Member XRPL Address (Xaman)
              <input id="issueXrpl" value="rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" />
            </label>
          </div>
          <div class="field-row">
            <label>
              Member Secret / Seed Witness
              <input id="issueSecret" value="member-zk-secret-key-2026" />
            </label>
            <label>
              Approved KYC Tier
              <select id="issueTier">
                <option value="1">Tier 1 — Starter / Community ($10–$50/mo)</option>
                <option value="2" selected>Tier 2 — Growth ($250/mo · Multi-DAO)</option>
                <option value="3">Tier 3 — Corporate ($1,000/mo · Institutional Audit)</option>
              </select>
            </label>
            <label>
              Jurisdiction (ISO Numeric)
              <input id="issueJurisdiction" type="number" value="840" />
            </label>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button onclick="adminIssueKyc()">Issue ZK KYC Credential &amp; Add to Merkle Tree</button>
            <button class="secondary" onclick="simulateQuickX402Settlement()">+ Simulate Member Plan X402 Payment</button>
          </div>
          <pre id="kycAdminOutput">// Ready to issue Midnight ZK KYC credentials...</pre>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag emerald">HistoricMerkleTree Registry</span>
              Verified KYC Credentials &amp; Revocation Control
            </div>
            <button class="secondary" onclick="loadAdminOverview()">Refresh</button>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>Member / XRPL Wallet</th>
                  <th>Tier</th>
                  <th>Midnight PK Hash / Nullifier</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody id="kycTableBody">
                <tr><td colspan="5" style="color:var(--muted);">Loading KYC registry...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- SECTION: DAO LAUNCHPAD, 3-WAY SPLITS & 2-WEEK ESCROWS -->
    <div id="sec-daos" class="section-view">
      <div class="grid-2">
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">ShadowLabzSubscription.compact</span>
              Configure DAO Paid Membership &amp; 3-Way XRP Split
            </div>
          </div>
          <p style="color: var(--muted); font-size: 0.84rem;">
            Replaces PayPal subscription plans on ShadowLabz. Configure a DAO's join policy, monthly USD price, and
            the Organizer Fee slider (0%–95%). Every XRP payment splits automatically across Platform (5%), Organizer, and DAO Treasury.
          </p>
          <div class="field-row">
            <label>
              DAO Identifier
              <input id="daoSlug" value="nightshade-collective" />
            </label>
            <label>
              DAO Display Name
              <input id="daoName" value="Nightshade Collective" />
            </label>
          </div>
          <div class="field-row">
            <label>
              Join &amp; Gate Policy
              <select id="daoJoinPolicy">
                <option value="zk-kyc-gated" selected>Gated: Midnight ZK KYC Proof + XRP Subscription</option>
                <option value="token-nft-gated">Gated: XRPL Token / NFT Holding + ZK Proof</option>
                <option value="invite-only">Invite-Only (Admin Approval)</option>
                <option value="open">Open Self-Join</option>
              </select>
            </label>
            <label>
              Monthly Membership Fee (USD)
              <input id="daoPriceUsd" type="number" value="50" oninput="updateAdminSplitPreview()" />
            </label>
          </div>
          <div class="field-row">
            <label>
              Organizer XRPL Payout Wallet
              <input id="daoOrgWallet" value="rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH" />
            </label>
            <label>
              DAO Treasury XRPL Wallet
              <input id="daoTreasuryWallet" value="rDsbeomae4FXwgQTJp9Rs64Qg9vDiTCdBv" />
            </label>
          </div>
          <label>
            Organizer Fee Slider: <strong id="adminOrgPctLbl" style="color:var(--text);">20%</strong>
            (Platform: 5% fixed · Derived DAO Treasury Share: <strong id="adminTreasuryPctLbl" style="color:#6ee7b7;">75%</strong>)
            <input id="adminOrgSlider" type="range" min="0" max="95" value="20" oninput="updateAdminSplitPreview()" />
          </label>
          <div class="split-preview">
            <div class="split-box">
              <div class="pct">5%</div>
              <div class="lbl">Platform Fee (500 bps)</div>
              <div class="val" id="prevPlatformXrp">1.00 XRP</div>
            </div>
            <div class="split-box">
              <div class="pct" id="prevOrgPct">20%</div>
              <div class="lbl">Organizer Fee</div>
              <div class="val" id="prevOrgXrp">4.00 XRP</div>
            </div>
            <div class="split-box">
              <div class="pct" id="prevTreasuryPct">75%</div>
              <div class="lbl">DAO Treasury Share</div>
              <div class="val" id="prevTreasuryXrp">15.00 XRP</div>
            </div>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button onclick="adminSaveDao()">Save DAO &amp; Split Config</button>
            <button class="emerald" onclick="adminSimulateDaoSubscription()">Simulate Member Paid Join (3-Way Split)</button>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">AgilityEscrow.compact</span>
              Managed DAOs &amp; 2-Week Crowdfunding Escrow Pools
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>DAO</th>
                  <th>Gate Policy</th>
                  <th>Monthly Fee &amp; Split</th>
                  <th>Treasury Accrued</th>
                </tr>
              </thead>
              <tbody id="daosTableBody">
                <tr><td colspan="4" style="color:var(--muted);">Loading DAOs...</td></tr>
              </tbody>
            </table>
          </div>

          <div class="card-header" style="margin-top:8px;">
            <div class="card-title" style="font-size:0.94rem;">
              <span class="tag amber">2-Week Treasury Pools</span>
              Active Crowdfunding Escrows
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table>
              <thead>
                <tr>
                  <th>DAO / Pool ID</th>
                  <th>Progress (XRP)</th>
                  <th>Status</th>
                  <th>Admin Action</th>
                </tr>
              </thead>
              <tbody id="escrowsTableBody">
                <tr><td colspan="4" style="color:var(--muted);">Loading escrow pools...</td></tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <!-- SECTION: X402 & M402 REVENUE LEDGER -->
    <div id="sec-ledger" class="section-view">
      <section class="card">
        <div class="card-header">
          <div class="card-title">
            <span class="tag emerald">AgilityPayment.compact · SourceTag 20260601</span>
            On-Chain X402 &amp; DAO Membership Revenue Settlement Ledger
          </div>
          <button class="secondary" onclick="loadAdminOverview()">Refresh Ledger</button>
        </div>
        <div style="overflow-x:auto;">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Type / Target</th>
                <th>Payer XRPL / Midnight</th>
                <th>KYC Nullifier</th>
                <th>Total (XRP)</th>
                <th>3-Way Split (Plat / Org / Treas)</th>
              </tr>
            </thead>
            <tbody id="ledgerTableBody">
              <tr><td colspan="6" style="color:var(--muted);">Loading revenue ledger...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- SECTION: GATEWAY CONFIG, DISCORD BOT & POLL UNLOCK -->
    <div id="sec-settings" class="section-view">
      <div class="grid-2">
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">X402 + m402 Config</span>
              Merchant Receiving Wallets &amp; Facilitator Settings
            </div>
          </div>
          <div class="field-row">
            <label>
              ShadowLabz Platform XRPL Wallet (Receives Plans &amp; 5% Split)
              <input id="cfgPlatformWallet" value="rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh" />
            </label>
            <label>
              T54 X402 Facilitator URL
              <input id="cfgFacilitator" value="https://xrpl-facilitator-testnet.t54.ai" />
            </label>
          </div>
          <div class="field-row">
            <label>
              X402 Endpoint SourceTag
              <input id="cfgSourceTag" type="number" value="20260601" />
            </label>
            <label>
              Midnight m402 Vault Address (Preview)
              <input id="cfgVault" value="17b4cf15ad768fa0e5090da960e86eaf7cc885f86eb5a6b241e2fd28d98546ae" />
            </label>
          </div>
          <div>
            <button onclick="saveAdminConfig()">Save Gateway Configuration</button>
          </div>
          <pre id="cfgOutput">// Active configuration loaded from AgilityCore Gateway.</pre>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">Discord Bot &amp; Shadow Polls</span>
              Discord Server Binding &amp; Poll Admin Code Unlock
            </div>
          </div>
          <p style="color: var(--muted); font-size: 0.84rem;">
            Copy the ready-made Discord slash command to bind a server to your DAO, or unlock host controls for a Shadow Poll created on another device.
          </p>
          <div class="field-row">
            <label>
              Discord Server Binding Command (Copy &amp; run in Discord)
              <input id="discordCmd" readonly value="/setup project_id:nightshade-collective" />
            </label>
          </div>
          <div class="field-row">
            <label>
              Shadow Poll ID or Link
              <input id="pollIdInput" value="poll-zk-audit-reserve-14" />
            </label>
            <label>
              Poll Admin Code
              <input id="pollAdminCode" type="password" value="SHADOW-ADMIN-2026" />
            </label>
          </div>
          <div>
            <button class="secondary" onclick="unlockPollAdmin()">Unlock Poll Host Controls &amp; ZK Tally Report</button>
          </div>
          <pre id="pollOutput">// Paste a Poll ID and Admin Code to unlock host controls and shielded tally verification.</pre>
        </section>
      </div>
    </div>

    <!-- SECTION: @agility/sdk MASTERCARD @ RIPPLE SWELL LIVE PLAYGROUND -->
    <div id="sec-sdk" class="section-view">
      <div class="grid-2">
        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag emerald">@agility/sdk · Ripple Swell Pitch</span>
              Mastercard Agent Pay for Machines (AP4M) + Crypto Credential + XRPL X402
            </div>
          </div>
          <p style="color: var(--muted); font-size: 0.84rem;">
            Demonstrates <strong>Mastercard Agent Pay for Machines (AP4M)</strong> + <code>@mastercard/developers-agent-toolkit</code>
            running on <strong>Midnight Zero-Knowledge Circuits</strong> (<code>AgilityAgentPay.compact</code> &amp; <code>ShadowLabzKyc.compact</code>)
            and settling in <strong>RLUSD</strong> or <strong>XRP</strong> over HTTP 402 on the XRP Ledger.
          </p>
          <div class="field-row">
            <label>
              KYC Credential Authority (<code>kycAuthorityId</code>)
              <select id="sdkAuthority">
                <option value="mastercard-crypto-credential" selected>mastercard-crypto-credential (Mastercard MTN / Crypto Credential)</option>
                <option value="shadowlabz-kyc-authority">shadowlabz-kyc-authority (ShadowLabz DAO Authority)</option>
                <option value="ripple-institutional-kyc">ripple-institutional-kyc (Institutional VASP Authority)</option>
              </select>
            </label>
            <label>
              Settlement Asset (<code>defaultAsset</code>)
              <select id="sdkAsset">
                <option value="RLUSD" selected>RLUSD (Ripple USD Stablecoin on XRPL)</option>
                <option value="XRP">XRP (Native Drops Settlement)</option>
              </select>
            </label>
          </div>
          <div class="field-row">
            <label>
              AI Agent / Customer XRPL Wallet
              <input id="sdkXrplAddr" value="rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe" />
            </label>
            <label>
              Requested X402 Payment (USD)
              <input id="sdkAmountUsd" type="number" value="250" />
            </label>
            <label>
              AP4M Private Agent Budget Cap (USD)
              <input id="sdkMaxBudgetUsd" type="number" value="500" />
            </label>
          </div>
          <div class="field-row">
            <label>
              Customer KYC Tier (Endpoint requires Tier &ge; 2)
              <select id="sdkTier">
                <option value="2" selected>Tier 2 — Verified Commercial / Agent</option>
                <option value="3">Tier 3 — Institutional / Corporate Audit</option>
                <option value="1">Tier 1 — Basic Retail (Will fail Tier &ge; 2 check)</option>
              </select>
            </label>
            <label>
              Jurisdiction &amp; Sanctions Simulation
              <select id="sdkSanctionSim">
                <option value="clean" selected>Compliant (USA 840 · OFAC Clear)</option>
                <option value="sanctioned">Simulate OFAC Sanctioned Entity (Blocked in ZK)</option>
                <option value="restricted_jur">Simulate Restricted Jurisdiction 408 (Blocked in ZK)</option>
              </select>
            </label>
          </div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button class="emerald" onclick="runSdkPlayground('normal')">1. Run Compliant AP4M + X402 Checkout</button>
            <button class="secondary" onclick="runSdkPlayground('budget_overrun')">2. Simulate AP4M Budget Overrun (403)</button>
            <button class="danger" style="padding:9px 14px;font-size:0.84rem;" onclick="runSdkPlayground('sanctioned')">3. Simulate Sanctions Block (403)</button>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <div class="card-title">
              <span class="tag">@mastercard/developers-agent-toolkit + @agility/sdk</span>
              Developer Integration Snippet &amp; Live Output
            </div>
          </div>
          <pre style="max-height:185px; color:#c4b5fd;">import { AgilitySDK } from "@agility/sdk";

const agility = new AgilitySDK({
  xrplNetwork: "xrpl:0",                         // XRPL Mainnet
  merchantXrplAddress: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
  kycAuthorityId: "mastercard-crypto-credential", // Mastercard Crypto Credential
  defaultAsset: "RLUSD",                         // RLUSD or XRP
});

// 1. Know Your Agent (KYA) + Mastercard Crypto Credential ZK Proof:
const kyc = agility.kyc.proveCompliance(agentOwnerInput, { minKycTier: 2 });
// 2. AP4M Zero-Knowledge Permissioning &amp; Verifiable Intent (AgilityAgentPay.compact):
const ap4m = agility.agentPay.verifyVerifiableIntent({ requestedAmountUsd: 250, maxBudgetPerTxUsd: 500, ... });
// 3. Build XRPL X402 RLUSD/XRP Settlement with both ZK Nullifiers:
const tx = agility.settlement.buildCompliantPaymentTx({ ... });</pre>
          <pre id="sdkOutput">// Click "1. Run Compliant AP4M + X402 Checkout" to inspect the Midnight ZK KYC proof, AP4M Verifiable Intent nullifier, and RLUSD/XRP transaction...</pre>
        </section>
      </div>
    </div>
  </main>

  <script>
    function switchTab(section, btn) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sections = ['sdk', 'kyc', 'daos', 'ledger', 'settings'];
      sections.forEach(s => {
        const el = document.getElementById('sec-' + s);
        if (section === 'all' || section === s) {
          el.classList.remove('hidden');
        } else {
          el.classList.add('hidden');
        }
      });
    }

    function updateAdminSplitPreview() {
      const orgPct = Number(document.getElementById('adminOrgSlider').value);
      const treasPct = 95 - orgPct;
      const priceUsd = Number(document.getElementById('daoPriceUsd').value || 50);
      const totalXrp = priceUsd / 2.5;
      document.getElementById('adminOrgPctLbl').textContent = orgPct + '%';
      document.getElementById('adminTreasuryPctLbl').textContent = treasPct + '%';
      document.getElementById('prevOrgPct').textContent = orgPct + '%';
      document.getElementById('prevTreasuryPct').textContent = treasPct + '%';
      document.getElementById('prevPlatformXrp').textContent = (totalXrp * 0.05).toFixed(2) + ' XRP';
      document.getElementById('prevOrgXrp').textContent = (totalXrp * (orgPct / 100)).toFixed(2) + ' XRP';
      document.getElementById('prevTreasuryXrp').textContent = (totalXrp * (treasPct / 100)).toFixed(2) + ' XRP';
      const slug = document.getElementById('daoSlug').value || 'nightshade-collective';
      document.getElementById('discordCmd').value = '/setup project_id:' + slug;
    }

    async function loadAdminOverview() {
      const res = await fetch('/api/admin/overview');
      const data = await res.json();

      document.getElementById('adminXrplAddr').textContent = data.config.platformXrplAddress;
      document.getElementById('cfgPlatformWallet').value = data.config.platformXrplAddress;
      document.getElementById('cfgFacilitator').value = data.config.facilitatorUrl;
      document.getElementById('cfgSourceTag').value = data.config.sourceTag;

      // KPIs
      document.getElementById('kpiTotalXrp').textContent = data.metrics.totalVolumeXrp + ' XRP';
      document.getElementById('kpiTotalDrops').textContent = data.metrics.totalVolumeDrops + ' drops settled';
      document.getElementById('kpiPlatformXrp').textContent = data.metrics.platformRevenueXrp + ' XRP';
      document.getElementById('kpiTxCount').textContent = data.settlementLedger.length + ' settled transactions';
      document.getElementById('kpiKycCount').textContent = data.metrics.activeKycCount;
      document.getElementById('kpiRevokedCount').textContent = data.metrics.revokedKycCount + ' revoked · HistoricMerkleTree<16>';
      document.getElementById('kpiDaoEscrowCount').textContent = data.daos.length + ' DAOs · ' + data.escrows.length + ' Pools';

      // KYC Table
      const kycBody = document.getElementById('kycTableBody');
      if (data.kycRegistry.length === 0) {
        kycBody.innerHTML = '<tr><td colspan="5" style="color:var(--muted);">No KYC credentials issued yet.</td></tr>';
      } else {
        kycBody.innerHTML = data.kycRegistry.map(item => \`
          <tr>
            <td>
              <strong>\${item.label || 'Verified Member'}</strong><br/>
              <span class="mono" style="color:var(--muted);">\${item.xrplAddress}</span>
            </td>
            <td><span class="tag">Tier \${item.tier}</span></td>
            <td class="mono" title="\${item.kycNullifierHex}">
              PK: \${item.userPkHashHex.slice(0, 12)}…<br/>
              Nul: \${item.kycNullifierHex.slice(0, 12)}…
            </td>
            <td>
              \${item.revoked
                ? '<span class="tag danger">REVOKED</span>'
                : '<span class="tag emerald">ACTIVE</span>'}
            </td>
            <td>
              \${item.revoked
                ? \`<button class="secondary" style="padding:4px 9px;font-size:0.75rem;" onclick="adminToggleRevoke('\${item.kycNullifierHex}', false)">Restore</button>\`
                : \`<button class="danger" onclick="adminToggleRevoke('\${item.kycNullifierHex}', true)">Revoke</button>\`}
            </td>
          </tr>
        \`).join('');
      }

      // DAOs Table
      const daosBody = document.getElementById('daosTableBody');
      daosBody.innerHTML = data.daos.map(d => \`
        <tr>
          <td><strong>\${d.name}</strong><br/><span class="mono" style="color:var(--muted);">\${d.id}</span></td>
          <td><span class="tag">\${d.joinPolicy}</span></td>
          <td class="mono">$\${d.monthlyPriceUsd}/mo · 5% / \${d.organizerFeePercent}% / \${95 - d.organizerFeePercent}%</td>
          <td class="mono" style="color:#6ee7b7;">\${(Number(d.treasuryAccruedDrops) / 1_000_000).toFixed(2)} XRP</td>
        </tr>
      \`).join('');

      // Escrows Table
      const escrowsBody = document.getElementById('escrowsTableBody');
      escrowsBody.innerHTML = data.escrows.map(e => \`
        <tr>
          <td>
            <strong>\${e.daoId}</strong><br/>
            <span class="mono" style="color:var(--muted);">\${e.escrowId.slice(0, 14)}…</span>
          </td>
          <td class="mono">\${(Number(e.raisedDrops) / 1_000_000).toFixed(0)} / \${(Number(e.goalDrops) / 1_000_000).toFixed(0)} XRP</td>
          <td>
            <span class="tag \${e.status === 'Released' ? 'emerald' : 'amber'}">\${e.status.toUpperCase()}</span>
          </td>
          <td>
            \${e.status === 'Active'
              ? \`<button class="emerald" style="padding:5px 10px;font-size:0.76rem;" onclick="adminReleaseEscrow('\${e.escrowId}')">Release to Treasury</button>\`
              : '<span style="color:var(--muted);font-size:0.78rem;">Disbursed</span>'}
          </td>
        </tr>
      \`).join('');

      // Revenue Ledger Table
      const ledgerBody = document.getElementById('ledgerTableBody');
      if (data.settlementLedger.length === 0) {
        ledgerBody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">No settlements recorded yet.</td></tr>';
      } else {
        ledgerBody.innerHTML = data.settlementLedger.map(row => \`
          <tr>
            <td class="mono" style="color:var(--muted);">\${row.timestamp.slice(11, 19)} UTC</td>
            <td><strong>\${row.kind}</strong> · <span class="tag">\${row.target}</span></td>
            <td class="mono">\${row.payerAddress}</td>
            <td class="mono">\${row.kycNullifier.slice(0, 16)}…</td>
            <td class="mono" style="color:#6ee7b7;font-weight:700;">\${(Number(row.totalDrops) / 1_000_000).toFixed(2)} XRP</td>
            <td class="mono">\${row.splitSummary}</td>
          </tr>
        \`).join('');
      }
    }

    async function adminIssueKyc() {
      const label = document.getElementById('issueLabel').value;
      const xrplAddress = document.getElementById('issueXrpl').value;
      const userSecret = document.getElementById('issueSecret').value + '-' + Date.now();
      const tier = Number(document.getElementById('issueTier').value);
      const jurisdictionCode = Number(document.getElementById('issueJurisdiction').value);

      const res = await fetch('/api/admin/kyc/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, xrplAddress, userSecret, tier, jurisdictionCode })
      });
      const data = await res.json();
      document.getElementById('kycAdminOutput').textContent = JSON.stringify(data, null, 2);
      await loadAdminOverview();
    }

    async function adminToggleRevoke(kycNullifier, revoke) {
      await fetch('/api/admin/kyc/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kycNullifier, revoke })
      });
      await loadAdminOverview();
    }

    async function adminSaveDao() {
      const id = document.getElementById('daoSlug').value;
      const name = document.getElementById('daoName').value;
      const joinPolicy = document.getElementById('daoJoinPolicy').value;
      const monthlyPriceUsd = Number(document.getElementById('daoPriceUsd').value);
      const organizerFeePercent = Number(document.getElementById('adminOrgSlider').value);
      const organizerXrplAddress = document.getElementById('daoOrgWallet').value;
      const treasuryXrplAddress = document.getElementById('daoTreasuryWallet').value;

      await fetch('/api/admin/dao/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id, name, joinPolicy, monthlyPriceUsd, organizerFeePercent, organizerXrplAddress, treasuryXrplAddress
        })
      });
      await loadAdminOverview();
    }

    async function adminSimulateDaoSubscription() {
      await adminSaveDao();
      const daoId = document.getElementById('daoSlug').value;
      await fetch('/api/admin/simulate-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dao_membership', daoId })
      });
      await loadAdminOverview();
    }

    async function simulateQuickX402Settlement() {
      await fetch('/api/admin/simulate-settlement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'plan_x402', tier: 'community' })
      });
      await loadAdminOverview();
    }

    async function adminReleaseEscrow(escrowId) {
      await fetch('/api/admin/escrow/' + escrowId + '/release', { method: 'POST' });
      await loadAdminOverview();
    }

    async function saveAdminConfig() {
      const platformXrplAddress = document.getElementById('cfgPlatformWallet').value;
      const facilitatorUrl = document.getElementById('cfgFacilitator').value;
      const sourceTag = Number(document.getElementById('cfgSourceTag').value);
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platformXrplAddress, facilitatorUrl, sourceTag })
      });
      const data = await res.json();
      document.getElementById('cfgOutput').textContent = JSON.stringify(data, null, 2);
      await loadAdminOverview();
    }

    function unlockPollAdmin() {
      const pollId = document.getElementById('pollIdInput').value;
      document.getElementById('pollOutput').textContent = JSON.stringify({
        pollId,
        hostControlsUnlocked: true,
        ballotPrivacy: "Midnight Zswap / PLONK Shielded",
        quorumStatus: "16 / 20 members voted (80% participation — Quorum Met)",
        currentTally: { aye: 14, nay: 2, abstain: 0 },
        perVoterRecordsPurgedAfterFinalize: true
      }, null, 2);
    }

    async function runSdkPlayground(mode) {
      const kycAuthorityId = document.getElementById('sdkAuthority').value;
      const asset = document.getElementById('sdkAsset').value;
      const payerXrplAddress = document.getElementById('sdkXrplAddr').value;
      const baseAmountUsd = Number(document.getElementById('sdkAmountUsd').value || 250);
      const maxAgentBudgetUsd = Number(document.getElementById('sdkMaxBudgetUsd').value || 500);
      const tier = Number(document.getElementById('sdkTier').value);
      const simMode = mode === 'sanctioned' ? 'sanctioned' : document.getElementById('sdkSanctionSim').value;

      const isSanctioned = simMode === 'sanctioned';
      const jurisdictionCode = simMode === 'restricted_jur' ? 408 : 840;
      const amountUsd = mode === 'budget_overrun' ? maxAgentBudgetUsd + 250 : baseAmountUsd;

      const res = await fetch('/api/sdk/playground', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kycAuthorityId,
          payerXrplAddress,
          userSecret: 'mastercard-swell-demo-secret',
          tier,
          jurisdictionCode,
          isSanctioned,
          amountUsd,
          maxAgentBudgetUsd,
          asset,
          acquirerFeePercent: 2
        })
      });
      const data = await res.json();
      document.getElementById('sdkOutput').textContent =
        'HTTP Status: ' + res.status + (res.status === 200 ? ' OK (Compliant AP4M + ZK KYC)' : ' Forbidden (Blocked by Midnight ZK Circuit)') + '\\n\\n' +
        (data.walletCeremonyPreview ? data.walletCeremonyPreview + '\\n\\n' : '') +
        JSON.stringify(data, null, 2);
    }

    updateAdminSplitPreview();
    loadAdminOverview();
  </script>
</body>
</html>`;
}
