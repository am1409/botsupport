import { useState, useEffect, useCallback } from "react";

const API = "http://localhost:8000"; // Change to your deployed API URL

// ─── API helpers ───────────────────────────────────────────────
const apiFetch = async (path, opts = {}, token = null) => {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  if (!res.ok) throw await res.json();
  return res.json();
};

// ─── Auth Screen ───────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", company_name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(""); setLoading(true);
    try {
      const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
      const body = mode === "login"
        ? new URLSearchParams({ username: form.email, password: form.password })
        : JSON.stringify(form);
      const contentType = mode === "login" ? "application/x-www-form-urlencoded" : "application/json";
      const res = await fetch(API + endpoint, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail); }
      const data = await res.json();
      localStorage.setItem("sb_token", data.access_token);
      onLogin(data.access_token);
    } catch (e) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.authWrap}>
      <div style={styles.authCard}>
        <div style={styles.logo}>✦ Nomi</div>
        <h2 style={styles.authTitle}>{mode === "login" ? "Welcome back" : "Start free trial"}</h2>
        {mode === "register" && (
          <input style={styles.input} placeholder="Company name"
            value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
        )}
        <input style={styles.input} placeholder="Email" type="email"
          value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        <input style={styles.input} placeholder="Password" type="password"
          value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
          onKeyDown={e => e.key === "Enter" && submit()} />
        {error && <div style={styles.error}>{error}</div>}
        <button style={styles.primaryBtn} onClick={submit} disabled={loading}>
          {loading ? "Loading..." : mode === "login" ? "Sign In" : "Create Account — 14 days free"}
        </button>
        <p style={styles.authSwitch}>
          {mode === "login" ? "No account? " : "Already have one? "}
          <span style={styles.link} onClick={() => setMode(m => m === "login" ? "register" : "login")}>
            {mode === "login" ? "Start free trial" : "Sign in"}
          </span>
        </p>
      </div>
    </div>
  );
}

// ─── Dashboard ─────────────────────────────────────────────────
function Dashboard({ token, onLogout }) {
  const [tab, setTab] = useState("overview");
  const [profile, setProfile] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadStatus, setUploadStatus] = useState("");
  const [urlInput, setUrlInput] = useState({ url: "", name: "" });
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, d] = await Promise.all([
        apiFetch("/clients/me", {}, token),
        apiFetch("/clients/analytics", {}, token),
        apiFetch("/ingest/documents", {}, token),
      ]);
      setProfile(p); setAnalytics(a); setDocuments(d);
    } catch (e) {
      if (e.status === 401) onLogout();
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const copyEmbed = () => {
    navigator.clipboard.writeText(profile.embed_code);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const uploadPdf = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    setUploadStatus("Uploading...");
    const fd = new FormData(); fd.append("file", file);
    try {
      await fetch(API + "/ingest/upload", {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
      });
      setUploadStatus("✓ Uploaded — processing in background");
      setTimeout(() => { setUploadStatus(""); load(); }, 3000);
    } catch { setUploadStatus("Upload failed"); }
  };

  const ingestUrl = async () => {
    if (!urlInput.url || !urlInput.name) return;
    setUploadStatus("Ingesting URL...");
    try {
      await apiFetch("/ingest/url", { method: "POST", body: JSON.stringify(urlInput) }, token);
      setUploadStatus("✓ URL queued for processing");
      setUrlInput({ url: "", name: "" });
      setTimeout(() => { setUploadStatus(""); load(); }, 3000);
    } catch (e) { setUploadStatus(e.detail || "Failed"); }
  };

  const deleteDoc = async (id) => {
    await apiFetch(`/ingest/documents/${id}`, { method: "DELETE" }, token);
    load();
  };

  const upgrade = async (plan) => {
    const data = await apiFetch("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) }, token);
    window.location.href = data.checkout_url;
  };

  const openPortal = async () => {
    const data = await apiFetch("/billing/portal", { method: "POST" }, token);
    window.open(data.portal_url, "_blank");
  };

  if (loading) return <div style={styles.loadingWrap}><div style={styles.spinner} />Loading...</div>;

  const planLimits = { starter: 500, pro: 2000, enterprise: 99999 };
  const chatUsed = analytics?.chat_count_this_month || 0;
  const chatLimit = planLimits[profile?.plan] || 500;
  const usagePct = Math.min((chatUsed / chatLimit) * 100, 100);

  return (
    <div style={styles.dashWrap}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>✦ Nomi</div>
        <nav style={styles.nav}>
          {[
            ["overview", "📊", "Overview"],
            ["documents", "📄", "Documents"],
            ["embed", "🔌", "Embed Code"],
            ["guide", "📖", "Setup Guide"],
            ["billing", "💳", "Billing"],
          ].map(([id, icon, label]) => (
            <button key={id} style={{ ...styles.navBtn, ...(tab === id ? styles.navBtnActive : {}) }}
              onClick={() => setTab(id)}>
              <span>{icon}</span> {label}
            </button>
          ))}
        </nav>
        <button style={styles.logoutBtn} onClick={onLogout}>Sign out</button>
      </aside>

      {/* Main */}
      <main style={styles.main}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.pageTitle}>
              {tab === "overview" && "Overview"}
              {tab === "documents" && "Knowledge Base"}
              {tab === "embed" && "Embed Your Bot"}
              {tab === "guide" && "Setup Guide"}
              {tab === "billing" && "Billing & Plan"}
            </h1>
            <p style={styles.pageSubtitle}>{profile?.company_name}</p>
          </div>
          <div style={styles.planBadge}>{profile?.plan?.toUpperCase()}</div>
        </div>

        {/* Overview Tab */}
        {tab === "overview" && (
          <div style={styles.tabContent}>
            <div style={styles.statsGrid}>
              {[
                ["💬", "Total Sessions", analytics?.total_sessions],
                ["📨", "Total Messages", analytics?.total_messages],
                ["📅", "Chats This Month", chatUsed],
                ["📄", "Documents", documents.length],
              ].map(([icon, label, val]) => (
                <div key={label} style={styles.statCard}>
                  <div style={styles.statIcon}>{icon}</div>
                  <div style={styles.statVal}>{val ?? "—"}</div>
                  <div style={styles.statLabel}>{label}</div>
                </div>
              ))}
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Monthly Usage</h3>
              <div style={styles.usageBar}>
                <div style={{ ...styles.usageFill, width: usagePct + "%" }} />
              </div>
              <p style={styles.usageText}>{chatUsed} / {chatLimit === 99999 ? "∞" : chatLimit} chats</p>
              {usagePct > 80 && <p style={styles.usageWarning}>⚠️ Approaching limit — consider upgrading</p>}
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Recent Conversations</h3>
              {analytics?.recent_sessions?.length === 0 && (
                <p style={styles.emptyText}>No conversations yet. Embed your bot to get started.</p>
              )}
              {analytics?.recent_sessions?.map(s => (
                <div key={s.session_id} style={styles.sessionRow}>
                  <div style={styles.sessionPreview}>{s.preview || "(empty)"}</div>
                  <div style={styles.sessionMeta}>{new Date(s.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documents Tab */}
        {tab === "documents" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Upload PDF</h3>
              <p style={styles.helpText}>Upload your FAQ docs, product manuals, or policies.</p>
              <label style={styles.uploadBtn}>
                📎 Choose PDF
                <input type="file" accept=".pdf" style={{ display: "none" }} onChange={uploadPdf} />
              </label>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Ingest from URL</h3>
              <p style={styles.helpText}>Crawl a webpage (FAQ page, help center, product page).</p>
              <input style={styles.input} placeholder="https://yoursite.com/faq"
                value={urlInput.url} onChange={e => setUrlInput(u => ({ ...u, url: e.target.value }))} />
              <input style={{ ...styles.input, marginTop: 8 }} placeholder="Name (e.g. FAQ Page)"
                value={urlInput.name} onChange={e => setUrlInput(u => ({ ...u, name: e.target.value }))} />
              <button style={styles.primaryBtn} onClick={ingestUrl}>Ingest URL</button>
            </div>

            {uploadStatus && <div style={styles.statusMsg}>{uploadStatus}</div>}

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Your Documents ({documents.length})</h3>
              {documents.length === 0 && <p style={styles.emptyText}>No documents yet.</p>}
              {documents.map(d => (
                <div key={d.id} style={styles.docRow}>
                  <div>
                    <div style={styles.docName}>{d.name}</div>
                    <div style={styles.docMeta}>{d.chunk_count} chunks · {d.status}</div>
                  </div>
                  <div style={styles.docStatus(d.status)}>{d.status}</div>
                  <button style={styles.deleteBtn} onClick={() => deleteDoc(d.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Embed Tab */}
        {tab === "embed" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Your Embed Code</h3>
              <p style={styles.helpText}>Paste this single line before the closing &lt;/body&gt; tag on your website.</p>
              <div style={styles.codeBlock}>{profile?.embed_code}</div>
              <button style={styles.primaryBtn} onClick={copyEmbed}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Customisation Options</h3>
              <p style={styles.helpText}>Add optional attributes to personalise the widget:</p>
              <div style={styles.codeBlock}>{`<script
  src="https://api.yourdomain.com/widget.js"
  data-client-id="${profile?.id}"
  data-color="#2563EB"
  data-name="Support"
  data-position="right"
></script>`}</div>
            </div>
          </div>
        )}

        {/* Guide Tab */}
        {tab === "guide" && (
          <div style={styles.tabContent}>

            <div style={styles.card}>
              <p style={{ fontSize: 15, color: "#64748b", lineHeight: 1.7, margin: 0 }}>
                Follow these four steps to get your Nomi bot live on your website. The whole process takes about 10 minutes. You do not need any technical knowledge — if you can copy and paste, you can do this.
              </p>
            </div>

            {/* Step 1 */}
            <div style={styles.guideStep}>
              <div style={styles.guideStepHeader}>
                <div style={styles.guideStepNum}>1</div>
                <div>
                  <div style={styles.guideStepTitle}>Add your content</div>
                  <div style={styles.guideStepSub}>Teach the bot about your business</div>
                </div>
              </div>
              <div style={styles.guideStepBody}>
                <p style={styles.guideText}>The bot can only answer questions based on content you provide. Think of it like giving the bot a manual to read. You can add content in two ways:</p>
                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>📎 Upload a PDF</div>
                  <p style={styles.guideText}>Go to the <strong>Documents</strong> tab and click "Choose PDF". Upload any document that describes your business — your FAQ, product information, pricing, return policy, opening hours, or anything customers typically ask about.</p>
                </div>
                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>🔗 Add a URL</div>
                  <p style={styles.guideText}>Go to the <strong>Documents</strong> tab and paste a link to any page on your website — your FAQ page, about page, or product pages. The bot will read and learn from that page automatically.</p>
                </div>
                <div style={styles.guideTip}>
                  💡 <strong>Tip:</strong> The more information you add, the better your bot will answer. Start with your most frequently asked questions.
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div style={styles.guideStep}>
              <div style={styles.guideStepHeader}>
                <div style={styles.guideStepNum}>2</div>
                <div>
                  <div style={styles.guideStepTitle}>Wait for processing</div>
                  <div style={styles.guideStepSub}>Usually takes less than a minute</div>
                </div>
              </div>
              <div style={styles.guideStepBody}>
                <p style={styles.guideText}>After uploading a document or URL, go back to the <strong>Documents</strong> tab and check the status next to your document. It will say one of the following:</p>
                <div style={styles.guideStatusList}>
                  <div style={styles.guideStatus}><span style={{ ...styles.guideStatusBadge, background: "#fef9c3", color: "#ca8a04" }}>processing</span> — the bot is reading your content, wait a moment and refresh</div>
                  <div style={styles.guideStatus}><span style={{ ...styles.guideStatusBadge, background: "#dcfce7", color: "#16a34a" }}>ready</span> — your content has been added, the bot can now answer from it</div>
                  <div style={styles.guideStatus}><span style={{ ...styles.guideStatusBadge, background: "#fee2e2", color: "#dc2626" }}>failed</span> — something went wrong, try deleting and uploading again</div>
                </div>
                <p style={styles.guideText}>Only continue to the next step once your document shows <strong>ready</strong>.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div style={styles.guideStep}>
              <div style={styles.guideStepHeader}>
                <div style={styles.guideStepNum}>3</div>
                <div>
                  <div style={styles.guideStepTitle}>Copy your embed code</div>
                  <div style={styles.guideStepSub}>One line of code unique to your account</div>
                </div>
              </div>
              <div style={styles.guideStepBody}>
                <p style={styles.guideText}>Go to the <strong>Embed Code</strong> tab in the left menu. You will see a line of code that starts with <code style={styles.inlineCode}>&lt;script</code>. This is your personal embed code — it is unique to your account.</p>
                <p style={styles.guideText}>Click the <strong>"Copy to Clipboard"</strong> button to copy it. Keep it somewhere handy as you will need it in the next step.</p>
                <div style={styles.guideTip}>
                  💡 <strong>Tip:</strong> You can customise the colour and name of the chat bubble by changing the <code style={styles.inlineCode}>data-color</code> and <code style={styles.inlineCode}>data-name</code> values in the code. The Embed Code tab shows you exactly how to do this.
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div style={styles.guideStep}>
              <div style={styles.guideStepHeader}>
                <div style={styles.guideStepNum}>4</div>
                <div>
                  <div style={styles.guideStepTitle}>Add the code to your website</div>
                  <div style={styles.guideStepSub}>Works on any website platform</div>
                </div>
              </div>
              <div style={styles.guideStepBody}>
                <p style={styles.guideText}>Paste your embed code into your website just before the closing <code style={styles.inlineCode}>&lt;/body&gt;</code> tag. Here is how to do it on the most common platforms:</p>

                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>🛍️ Shopify</div>
                  <p style={styles.guideText}>Go to your Shopify admin → Online Store → Themes → click the three dots next to your theme → Edit code → find the file called <strong>theme.liquid</strong> → scroll to the very bottom → paste your code just before <code style={styles.inlineCode}>&lt;/body&gt;</code> → click Save.</p>
                </div>

                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>🌐 WordPress</div>
                  <p style={styles.guideText}>Go to your WordPress dashboard → Appearance → Theme Editor → find the file called <strong>footer.php</strong> → paste your code just before <code style={styles.inlineCode}>&lt;/body&gt;</code> → click Update File. Alternatively install the free plugin "Insert Headers and Footers" and paste the code there.</p>
                </div>

                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>🎨 Webflow</div>
                  <p style={styles.guideText}>Go to your Webflow project → Project Settings → Custom Code → scroll to the <strong>Footer Code</strong> section → paste your code there → click Save → publish your site.</p>
                </div>

                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>🟦 Wix</div>
                  <p style={styles.guideText}>Go to your Wix dashboard → Settings → Custom Code → click <strong>+ Add Custom Code</strong> → paste your code → set it to load in the Body - end → click Apply.</p>
                </div>

                <div style={styles.guideOption}>
                  <div style={styles.guideOptionTitle}>📄 Any other website</div>
                  <p style={styles.guideText}>Open your website's main HTML file → find the line that says <code style={styles.inlineCode}>&lt;/body&gt;</code> near the very end → paste your embed code on the line just above it → save the file.</p>
                </div>

                <div style={styles.guideTip}>
                  💡 <strong>Not sure how to do this?</strong> Simply send your embed code and these instructions to whoever built your website — it takes them less than 2 minutes to add.
                </div>
              </div>
            </div>

            {/* Done */}
            <div style={{ ...styles.card, background: "#f0fdf4", border: "1px solid #bbf7d0", textAlign: "center", padding: "32px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🎉</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#15803d", marginBottom: 8 }}>You are all set!</div>
              <p style={{ color: "#16a34a", margin: 0, fontSize: 14 }}>Once the code is on your site, a chat bubble will appear automatically. Your customers can start getting answers instantly — 24 hours a day, 7 days a week.</p>
            </div>

            {/* Help */}
            <div style={{ ...styles.card, textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
                Need help? Contact us at <a href="mailto:a.moradi1409@gmail.com" style={{ color: "#2563EB", fontWeight: 600 }}>a.moradi1409@gmail.com</a> and we will get you set up.
              </p>
            </div>

          </div>
        )}

        {/* Billing Tab */}
        {tab === "billing" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Current Plan</h3>
              <div style={styles.currentPlan}>
                <span style={styles.planName}>{profile?.plan?.toUpperCase()}</span>
                <span style={styles.planStatus(profile?.subscription_status)}>
                  {profile?.subscription_status}
                </span>
              </div>
              {profile?.subscription_status === "active" && (
                <button style={styles.secondaryBtn} onClick={openPortal}>Manage Billing ↗</button>
              )}
            </div>

            <div style={styles.plansGrid}>
              {[
                { plan: "starter", price: "€99", chats: "500 chats/mo", features: ["1 bot", "PDF + URL ingestion", "Analytics dashboard", "Email support"] },
                { plan: "pro", price: "€299", chats: "2,000 chats/mo", features: ["5 bots", "Priority processing", "Advanced analytics", "Priority support"] },
                { plan: "enterprise", price: "€599", chats: "Unlimited chats", features: ["Unlimited bots", "Custom branding", "SLA guarantee", "Dedicated support"] },
              ].map(p => (
                <div key={p.plan} style={{ ...styles.planCard, ...(profile?.plan === p.plan ? styles.planCardActive : {}) }}>
                  <div style={styles.planCardName}>{p.plan.charAt(0).toUpperCase() + p.plan.slice(1)}</div>
                  <div style={styles.planCardPrice}>{p.price}<span style={styles.planCardMo}>/mo</span></div>
                  <div style={styles.planCardChats}>{p.chats}</div>
                  <ul style={styles.planFeatures}>
                    {p.features.map(f => <li key={f} style={styles.planFeature}>✓ {f}</li>)}
                  </ul>
                  {profile?.plan !== p.plan && (
                    <button style={styles.primaryBtn} onClick={() => upgrade(p.plan)}>
                      {profile?.subscription_status === "trialing" ? "Start Plan" : "Switch to " + p.plan}
                    </button>
                  )}
                  {profile?.plan === p.plan && <div style={styles.currentBadge}>Current Plan</div>}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── App Root ──────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("sb_token"));

  const handleLogin = (t) => { localStorage.setItem("sb_token", t); setToken(t); };
  const handleLogout = () => { localStorage.removeItem("sb_token"); setToken(null); };

  return token
    ? <Dashboard token={token} onLogout={handleLogout} />
    : <AuthScreen onLogin={handleLogin} />;
}

// ─── Styles ────────────────────────────────────────────────────
const C = { blue: "#2563EB", blueDark: "#1d4ed8", bg: "#f8fafc", card: "#fff", border: "#e2e8f0", text: "#0f172a", muted: "#64748b" };

const styles = {
  authWrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  authCard: { background: "#fff", borderRadius: 20, padding: "40px 36px", width: 380, boxShadow: "0 8px 48px rgba(0,0,0,0.1)", display: "flex", flexDirection: "column", gap: 14 },
  logo: { fontSize: 22, fontWeight: 800, color: C.blue, marginBottom: 4 },
  authTitle: { margin: "0 0 8px", fontSize: 22, fontWeight: 700, color: C.text },
  input: { padding: "11px 14px", border: `1px solid ${C.border}`, borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit", width: "100%", boxSizing: "border-box" },
  primaryBtn: { padding: "12px 20px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 4 },
  secondaryBtn: { padding: "10px 18px", background: "transparent", color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer" },
  error: { color: "#ef4444", fontSize: 13, background: "#fef2f2", padding: "8px 12px", borderRadius: 8 },
  authSwitch: { textAlign: "center", fontSize: 13, color: C.muted, margin: 0 },
  link: { color: C.blue, cursor: "pointer", fontWeight: 600 },

  dashWrap: { display: "flex", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: C.bg },
  sidebar: { width: 220, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 0", position: "fixed", height: "100vh" },
  sidebarLogo: { color: "#fff", fontWeight: 800, fontSize: 18, padding: "0 24px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
  nav: { display: "flex", flexDirection: "column", gap: 4, padding: "16px 12px", flex: 1 },
  navBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.65)", padding: "10px 14px", borderRadius: 8, textAlign: "left", cursor: "pointer", fontSize: 14, display: "flex", gap: 10, alignItems: "center" },
  navBtnActive: { background: "rgba(255,255,255,0.1)", color: "#fff" },
  logoutBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", padding: "12px 24px", textAlign: "left", cursor: "pointer", fontSize: 13 },

  main: { flex: 1, marginLeft: 220, padding: "32px 36px", maxWidth: "100%" },
  topBar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 },
  pageTitle: { margin: 0, fontSize: 24, fontWeight: 700, color: C.text },
  pageSubtitle: { margin: "4px 0 0", color: C.muted, fontSize: 14 },
  planBadge: { background: C.blue, color: "#fff", fontSize: 12, fontWeight: 700, padding: "4px 12px", borderRadius: 20 },

  tabContent: { display: "flex", flexDirection: "column", gap: 20 },
  card: { background: C.card, borderRadius: 14, padding: "22px 24px", border: `1px solid ${C.border}` },
  cardTitle: { margin: "0 0 14px", fontSize: 16, fontWeight: 700, color: C.text },
  helpText: { margin: "0 0 14px", color: C.muted, fontSize: 14, lineHeight: 1.6 },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 },
  statCard: { background: C.card, borderRadius: 14, padding: "20px", border: `1px solid ${C.border}`, textAlign: "center" },
  statIcon: { fontSize: 24, marginBottom: 8 },
  statVal: { fontSize: 28, fontWeight: 800, color: C.text },
  statLabel: { fontSize: 13, color: C.muted, marginTop: 4 },

  usageBar: { height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", margin: "12px 0 6px" },
  usageFill: { height: "100%", background: C.blue, borderRadius: 4, transition: "width 0.4s" },
  usageText: { margin: 0, fontSize: 13, color: C.muted },
  usageWarning: { margin: "8px 0 0", fontSize: 13, color: "#f59e0b", fontWeight: 600 },

  sessionRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${C.border}` },
  sessionPreview: { fontSize: 14, color: C.text, flex: 1, marginRight: 16, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sessionMeta: { fontSize: 12, color: C.muted, flexShrink: 0 },
  emptyText: { color: C.muted, fontSize: 14 },

  docRow: { display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: `1px solid ${C.border}` },
  docName: { fontSize: 14, fontWeight: 600, color: C.text },
  docMeta: { fontSize: 12, color: C.muted, marginTop: 2 },
  docStatus: (s) => ({ fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 20, marginLeft: "auto", background: s === "ready" ? "#dcfce7" : s === "processing" ? "#fef9c3" : s === "failed" ? "#fee2e2" : "#f1f5f9", color: s === "ready" ? "#16a34a" : s === "processing" ? "#ca8a04" : s === "failed" ? "#dc2626" : C.muted }),
  deleteBtn: { background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "4px 8px" },

  uploadBtn: { display: "inline-block", padding: "10px 18px", background: "#f1f5f9", border: `1px dashed ${C.border}`, borderRadius: 10, cursor: "pointer", fontSize: 14, color: C.muted, fontWeight: 600 },
  statusMsg: { background: "#f0fdf4", color: "#16a34a", padding: "12px 16px", borderRadius: 10, fontSize: 14, fontWeight: 600, border: "1px solid #bbf7d0" },

  codeBlock: { background: "#0f172a", color: "#a5f3fc", padding: "16px 20px", borderRadius: 10, fontSize: 13, fontFamily: "monospace", marginBottom: 14, wordBreak: "break-all", whiteSpace: "pre-wrap", lineHeight: 1.7 },

  currentPlan: { display: "flex", alignItems: "center", gap: 14, marginBottom: 16 },
  planName: { fontSize: 20, fontWeight: 800, color: C.text },
  planStatus: (s) => ({ fontSize: 13, padding: "4px 12px", borderRadius: 20, fontWeight: 600, background: s === "active" ? "#dcfce7" : s === "trialing" ? "#eff6ff" : "#fee2e2", color: s === "active" ? "#16a34a" : s === "trialing" ? C.blue : "#dc2626" }),

  plansGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18 },
  planCard: { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "24px", display: "flex", flexDirection: "column", gap: 10 },
  planCardActive: { border: `2px solid ${C.blue}`, boxShadow: `0 0 0 4px ${C.blue}18` },
  planCardName: { fontWeight: 700, fontSize: 16, color: C.text, textTransform: "capitalize" },
  planCardPrice: { fontSize: 32, fontWeight: 800, color: C.text },
  planCardMo: { fontSize: 16, fontWeight: 400, color: C.muted },
  planCardChats: { fontSize: 13, color: C.muted },
  planFeatures: { listStyle: "none", padding: 0, margin: "8px 0", display: "flex", flexDirection: "column", gap: 6 },
  planFeature: { fontSize: 13, color: C.text },
  currentBadge: { textAlign: "center", color: C.blue, fontWeight: 700, fontSize: 13, padding: "10px", background: "#eff6ff", borderRadius: 10 },

  loadingWrap: { display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", gap: 12, color: C.muted, fontSize: 16 },
  spinner: { width: 20, height: 20, border: `2px solid ${C.border}`, borderTopColor: C.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" },

  guideStep: { background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: "hidden" },
  guideStepHeader: { display: "flex", alignItems: "center", gap: 16, padding: "20px 24px", borderBottom: `1px solid ${C.border}`, background: "#f8fafc" },
  guideStepNum: { width: 36, height: 36, background: C.blue, color: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 16, flexShrink: 0 },
  guideStepTitle: { fontSize: 16, fontWeight: 700, color: C.text },
  guideStepSub: { fontSize: 13, color: C.muted, marginTop: 2 },
  guideStepBody: { padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 },
  guideText: { fontSize: 14, color: "#334155", lineHeight: 1.7, margin: 0 },
  guideOption: { background: "#f8fafc", borderRadius: 10, padding: "16px 18px", border: `1px solid ${C.border}` },
  guideOptionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8 },
  guideTip: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e", lineHeight: 1.6 },
  guideStatusList: { display: "flex", flexDirection: "column", gap: 10 },
  guideStatus: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#334155" },
  guideStatusBadge: { fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0 },
  inlineCode: { background: "#f1f5f9", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px", fontSize: 12, fontFamily: "monospace", color: "#0f172a" },
};
