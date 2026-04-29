import { useState, useEffect, useCallback } from "react";

const API = "https://botsupport-production.up.railway.app";

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

// ─── Widget Preview ────────────────────────────────────────────
function WidgetPreview({ config }) {
  const { color, name, greeting, position } = config;
  return (
    <div style={{ position: "relative", height: 320, background: "#f1f5f9", borderRadius: 12, overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{ position: "absolute", top: 16, left: 16, right: 16 }}>
        <div style={{ background: "#fff", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#94a3b8" }}>yourwebsite.com</div>
      </div>
      <div style={{ position: "absolute", bottom: 16, [position === "left" ? "left" : "right"]: 16, width: 280 }}>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(0,0,0,0.15)", overflow: "hidden" }}>
          <div style={{ background: color, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, background: "rgba(255,255,255,0.25)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>💬</div>
            <div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{name || "Support"}</div>
              <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 11 }}>Online now</div>
            </div>
          </div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ background: "#f1f5f9", borderRadius: "10px 10px 10px 2px", padding: "8px 12px", fontSize: 12, color: "#1e293b", maxWidth: "85%" }}>
              {greeting || "Hi there! How can I help you today? 👋"}
            </div>
          </div>
          <div style={{ display: "flex", borderTop: "1px solid #e2e8f0", padding: "8px 10px", gap: 6, alignItems: "center" }}>
            <div style={{ flex: 1, fontSize: 11, color: "#94a3b8" }}>Type a message...</div>
            <div style={{ width: 24, height: 24, background: color, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2z"/></svg>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: position === "left" ? "flex-start" : "flex-end", marginTop: 10 }}>
          <div style={{ width: 48, height: 48, background: color, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
        </div>
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

  const [widgetConfig, setWidgetConfig] = useState(() => {
    const saved = localStorage.getItem("nomi_widget_config");
    return saved ? JSON.parse(saved) : {
      color: "#2563EB",
      name: "Support",
      greeting: "Hi there! How can I help you today? 👋",
      position: "right",
      language: "en",
      responseStyle: "balanced",
      showBranding: true,
      offlineMessage: "We are currently offline. Please email us and we will get back to you shortly.",
      placeholder: "Type a message...",
    };
  });
  const [configSaved, setConfigSaved] = useState(false);

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
    const embedCode = buildEmbedCode(profile, widgetConfig);
    navigator.clipboard.writeText(embedCode);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const buildEmbedCode = (p, cfg) => {
    if (!p) return "";
    return `<script
  src="${API}/widget.js"
  data-client-id="${p.id}"
  data-color="${cfg.color}"
  data-name="${cfg.name}"
  data-position="${cfg.position}"
  data-greeting="${cfg.greeting}"
  data-placeholder="${cfg.placeholder}"
  data-language="${cfg.language}"
  data-offline="${cfg.offlineMessage}"
  data-style="${cfg.responseStyle}"
></script>`;
  };

  const saveConfig = () => {
    localStorage.setItem("nomi_widget_config", JSON.stringify(widgetConfig));
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
  };

  const updateConfig = (key, val) => setWidgetConfig(c => ({ ...c, [key]: val }));

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

  const colorPresets = ["#2563EB","#7c3aed","#db2777","#059669","#d97706","#dc2626","#0891b2","#0f172a"];
  const languages = [
    { value: "en", label: "🇬🇧 English" },
    { value: "nl", label: "🇳🇱 Nederlands" },
    { value: "de", label: "🇩🇪 Deutsch" },
    { value: "fr", label: "🇫🇷 Français" },
    { value: "es", label: "🇪🇸 Español" },
    { value: "it", label: "🇮🇹 Italiano" },
    { value: "pt", label: "🇵🇹 Português" },
    { value: "ar", label: "🇸🇦 العربية" },
  ];

  return (
    <div style={styles.dashWrap}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>✦ Nomi</div>
        <nav style={styles.nav}>
          {[
            ["overview",  "📊", "Overview"],
            ["documents", "📄", "Documents"],
            ["customise", "🎨", "Customise"],
            ["embed",     "🔌", "Embed Code"],
            ["guide",     "📖", "Setup Guide"],
            ["billing",   "💳", "Billing"],
          ].map(([id, icon, label]) => (
            <button key={id} style={{ ...styles.navBtn, ...(tab === id ? styles.navBtnActive : {}) }}
              onClick={() => setTab(id)}>
              <span>{icon}</span> {label}
            </button>
          ))}
        </nav>
        <button style={styles.logoutBtn} onClick={onLogout}>Sign out</button>
      </aside>

      <main style={styles.main}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.pageTitle}>
              {tab === "overview"  && "Overview"}
              {tab === "documents" && "Knowledge Base"}
              {tab === "customise" && "Customise Your Bot"}
              {tab === "embed"     && "Embed Your Bot"}
              {tab === "guide"     && "Setup Guide"}
              {tab === "billing"   && "Billing & Plan"}
            </h1>
            <p style={styles.pageSubtitle}>{profile?.company_name}</p>
          </div>
          <div style={styles.planBadge}>{profile?.plan?.toUpperCase()}</div>
        </div>

        {/* ── Overview ── */}
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
              {analytics?.recent_sessions?.length === 0 && <p style={styles.emptyText}>No conversations yet. Embed your bot to get started.</p>}
              {analytics?.recent_sessions?.map(s => (
                <div key={s.session_id} style={styles.sessionRow}>
                  <div style={styles.sessionPreview}>{s.preview || "(empty)"}</div>
                  <div style={styles.sessionMeta}>{new Date(s.created_at).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Documents ── */}
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

        {/* ── Customise ── */}
        {tab === "customise" && (
          <div style={styles.tabContent}>

            {/* Live Preview */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Live Preview</h3>
              <p style={styles.helpText}>This is exactly how your chat widget will look on your website.</p>
              <WidgetPreview config={widgetConfig} />
            </div>

            {/* Bot Identity */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Bot Identity</h3>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Bot name</div>
                  <div style={styles.configLabelSub}>The name shown in the chat header</div>
                </div>
                <input
                  style={{ ...styles.input, maxWidth: 220 }}
                  value={widgetConfig.name}
                  onChange={e => updateConfig("name", e.target.value)}
                  placeholder="e.g. Support, Nomi, Lisa"
                  maxLength={20}
                />
              </div>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Opening message</div>
                  <div style={styles.configLabelSub}>First thing the bot says when the chat opens</div>
                </div>
                <textarea
                  style={{ ...styles.input, maxWidth: 320, height: 72, resize: "none" }}
                  value={widgetConfig.greeting}
                  onChange={e => updateConfig("greeting", e.target.value)}
                  placeholder="Hi there! How can I help you today? 👋"
                  maxLength={120}
                />
              </div>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Input placeholder</div>
                  <div style={styles.configLabelSub}>Text shown inside the message box</div>
                </div>
                <input
                  style={{ ...styles.input, maxWidth: 220 }}
                  value={widgetConfig.placeholder}
                  onChange={e => updateConfig("placeholder", e.target.value)}
                  placeholder="Type a message..."
                  maxLength={40}
                />
              </div>
            </div>

            {/* Appearance */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Appearance</h3>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Theme colour</div>
                  <div style={styles.configLabelSub}>Used for the chat button, header, and sent messages</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {colorPresets.map(c => (
                      <div key={c} onClick={() => updateConfig("color", c)} style={{
                        width: 32, height: 32, borderRadius: "50%", background: c, cursor: "pointer",
                        border: widgetConfig.color === c ? "3px solid #0f172a" : "3px solid transparent",
                        boxShadow: widgetConfig.color === c ? "0 0 0 2px #fff, 0 0 0 4px #0f172a" : "none",
                        transition: "all 0.15s"
                      }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="color" value={widgetConfig.color}
                      onChange={e => updateConfig("color", e.target.value)}
                      style={{ width: 36, height: 36, border: "none", borderRadius: 8, cursor: "pointer", background: "none" }} />
                    <span style={{ fontSize: 13, color: "#64748b" }}>Custom colour</span>
                    <span style={{ fontSize: 13, fontFamily: "monospace", color: "#0f172a", background: "#f1f5f9", padding: "3px 8px", borderRadius: 6 }}>{widgetConfig.color}</span>
                  </div>
                </div>
              </div>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Widget position</div>
                  <div style={styles.configLabelSub}>Where the chat bubble appears on the page</div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {["right", "left"].map(p => (
                    <button key={p} onClick={() => updateConfig("position", p)} style={{
                      padding: "8px 20px", borderRadius: 8, border: "1px solid",
                      borderColor: widgetConfig.position === p ? C.blue : C.border,
                      background: widgetConfig.position === p ? C.blue : "#fff",
                      color: widgetConfig.position === p ? "#fff" : C.muted,
                      fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit"
                    }}>
                      {p === "right" ? "Bottom right" : "Bottom left"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Language */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Language</h3>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Interface language</div>
                  <div style={styles.configLabelSub}>The language of the widget's own text and buttons. The AI automatically responds in whatever language your customer writes in.</div>
                </div>
                <select
                  value={widgetConfig.language}
                  onChange={e => updateConfig("language", e.target.value)}
                  style={{ ...styles.input, maxWidth: 200, cursor: "pointer" }}
                >
                  {languages.map(l => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Response Style */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Response Style</h3>
              <p style={styles.helpText}>Control how long and detailed the bot's answers are.</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {[
                  { value: 'concise', label: '⚡ Concise', desc: 'Short and to the point. Max 2 sentences.' },
                  { value: 'balanced', label: '✦ Balanced', desc: 'Clear and friendly. 2–4 sentences.' },
                  { value: 'detailed', label: '📖 Detailed', desc: 'Full explanations with context.' },
                ].map(s => (
                  <div key={s.value} onClick={() => updateConfig('responseStyle', s.value)} style={{
                    flex: 1, minWidth: 140, padding: '16px', borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${widgetConfig.responseStyle === s.value ? C.blue : C.border}`,
                    background: widgetConfig.responseStyle === s.value ? '#eff6ff' : '#fff',
                    transition: 'all 0.15s',
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: widgetConfig.responseStyle === s.value ? C.blue : C.text, marginBottom: 6 }}>{s.label}</div>
                    <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Offline Message */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Offline & Limit Message</h3>
              <p style={styles.helpText}>Shown to customers when your monthly chat limit is reached.</p>
              <textarea
                style={{ ...styles.input, height: 80, resize: "none", width: "100%" }}
                value={widgetConfig.offlineMessage}
                onChange={e => updateConfig("offlineMessage", e.target.value)}
                placeholder="We are currently unavailable. Please email us..."
                maxLength={200}
              />
            </div>

            {/* Branding */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Branding</h3>
              <div style={styles.configRow}>
                <div style={styles.configLabel}>
                  <div style={styles.configLabelTitle}>Show "Powered by Nomi"</div>
                  <div style={styles.configLabelSub}>Remove this on the Enterprise plan to fully white-label your bot</div>
                </div>
                <div
                  onClick={() => profile?.plan === "enterprise" && updateConfig("showBranding", !widgetConfig.showBranding)}
                  style={{
                    width: 44, height: 24, borderRadius: 12, cursor: profile?.plan === "enterprise" ? "pointer" : "not-allowed",
                    background: widgetConfig.showBranding ? "#e2e8f0" : C.blue,
                    position: "relative", transition: "background 0.2s", opacity: profile?.plan !== "enterprise" ? 0.5 : 1
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    position: "absolute", top: 3, left: widgetConfig.showBranding ? 3 : 23, transition: "left 0.2s"
                  }} />
                </div>
              </div>
              {profile?.plan !== "enterprise" && (
                <p style={{ fontSize: 12, color: "#f59e0b", marginTop: 8 }}>⚠️ White-labelling requires the Enterprise plan</p>
              )}
            </div>

            {/* Save */}
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button style={{ ...styles.primaryBtn, width: "auto", padding: "12px 32px" }} onClick={saveConfig}>
                Save Changes
              </button>
              {configSaved && (
                <div style={{ fontSize: 14, color: "#16a34a", fontWeight: 600 }}>✓ Saved! Regenerate your embed code to apply changes.</div>
              )}
            </div>

          </div>
        )}

        {/* ── Embed ── */}
        {tab === "embed" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Your Embed Code</h3>
              <p style={styles.helpText}>Paste this single line before the closing &lt;/body&gt; tag on your website. Customise your bot first in the <strong>Customise</strong> tab to update the colours and settings.</p>
              <div style={styles.codeBlock}>{buildEmbedCode(profile, widgetConfig)}</div>
              <button style={styles.primaryBtn} onClick={copyEmbed}>
                {copied ? "✓ Copied!" : "Copy to Clipboard"}
              </button>
            </div>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Platform Instructions</h3>
              <p style={styles.helpText}>Not sure where to paste the code? Check the <strong>Setup Guide</strong> tab for step-by-step instructions for Shopify, WordPress, Webflow, Wix and more.</p>
            </div>
          </div>
        )}

        {/* ── Guide ── */}
        {tab === "guide" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <p style={{ fontSize: 15, color: "#64748b", lineHeight: 1.7, margin: 0 }}>
                Follow these four steps to get your Nomi bot live on your website. The whole process takes about 10 minutes. You do not need any technical knowledge — if you can copy and paste, you can do this.
              </p>
            </div>
            {[
              {
                n: 1, title: "Add your content", sub: "Teach the bot about your business",
                body: <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={styles.guideText}>Go to the <strong>Documents</strong> tab and upload a PDF or paste a URL from your website. The bot will read and learn from whatever you add.</p>
                  <div style={styles.guideTip}>💡 <strong>Tip:</strong> Start with your FAQ page or a document covering your most common customer questions.</div>
                </div>
              },
              {
                n: 2, title: "Wait for processing", sub: "Usually takes less than a minute",
                body: <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={styles.guideText}>Check the status in the Documents tab. Only continue when it shows <strong>ready</strong>.</p>
                  <div style={styles.guideStatusList}>
                    {[["processing","#fef9c3","#ca8a04"],["ready","#dcfce7","#16a34a"],["failed","#fee2e2","#dc2626"]].map(([s,bg,c]) => (
                      <div key={s} style={styles.guideStatus}><span style={{ ...styles.guideStatusBadge, background: bg, color: c }}>{s}</span>{s === "processing" ? "wait a moment" : s === "ready" ? "you are good to go" : "delete and try again"}</div>
                    ))}
                  </div>
                </div>
              },
              {
                n: 3, title: "Customise your bot", sub: "Make it match your brand",
                body: <p style={styles.guideText}>Go to the <strong>Customise</strong> tab to set your bot's name, colour, opening message, language, and position. You can see a live preview as you make changes.</p>
              },
              {
                n: 4, title: "Add the code to your website", sub: "Works on any platform",
                body: <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <p style={styles.guideText}>Go to the <strong>Embed Code</strong> tab, copy your code, and paste it just before the closing <code style={styles.inlineCode}>&lt;/body&gt;</code> tag on your site.</p>
                  {[["🛍️ Shopify","Online Store → Themes → Edit code → theme.liquid → paste before </body> → Save"],["🌐 WordPress","Appearance → Theme Editor → footer.php → paste before </body> → Update File"],["🎨 Webflow","Project Settings → Custom Code → Footer Code → paste → Publish"],["🟦 Wix","Settings → Custom Code → Add Custom Code → paste → Body end → Apply"]].map(([title, text]) => (
                    <div key={title} style={styles.guideOption}><div style={styles.guideOptionTitle}>{title}</div><p style={styles.guideText}>{text}</p></div>
                  ))}
                  <div style={styles.guideTip}>💡 <strong>Not sure?</strong> Forward your embed code to whoever built your website — it takes them under 2 minutes.</div>
                </div>
              }
            ].map(step => (
              <div key={step.n} style={styles.guideStep}>
                <div style={styles.guideStepHeader}>
                  <div style={styles.guideStepNum}>{step.n}</div>
                  <div><div style={styles.guideStepTitle}>{step.title}</div><div style={styles.guideStepSub}>{step.sub}</div></div>
                </div>
                <div style={styles.guideStepBody}>{step.body}</div>
              </div>
            ))}
            <div style={{ ...styles.card, background: "#f0fdf4", border: "1px solid #bbf7d0", textAlign: "center", padding: "32px" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#15803d", marginBottom: 6 }}>You are all set!</div>
              <p style={{ color: "#16a34a", margin: 0, fontSize: 14 }}>Your bot is live and answering questions 24/7.</p>
            </div>
            <div style={{ ...styles.card, textAlign: "center" }}>
              <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>Need help? <a href="mailto:a.moradi1409@gmail.com" style={{ color: "#2563EB", fontWeight: 600 }}>a.moradi1409@gmail.com</a></p>
            </div>
          </div>
        )}

        {/* ── Billing ── */}
        {tab === "billing" && (
          <div style={styles.tabContent}>
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Current Plan</h3>
              <div style={styles.currentPlan}>
                <span style={styles.planName}>{profile?.plan?.toUpperCase()}</span>
                <span style={styles.planStatus(profile?.subscription_status)}>{profile?.subscription_status}</span>
              </div>
              {profile?.subscription_status === "active" && (
                <button style={styles.secondaryBtn} onClick={openPortal}>Manage Billing ↗</button>
              )}
            </div>
            <div style={styles.plansGrid}>
              {[
                { plan: "starter", price: "€99", chats: "500 chats/mo", features: ["1 bot", "PDF + URL ingestion", "Analytics dashboard", "Email support"] },
                { plan: "pro", price: "€299", chats: "2,000 chats/mo", features: ["5 bots", "Priority processing", "Advanced analytics", "Priority support"] },
                { plan: "enterprise", price: "€599", chats: "Unlimited chats", features: ["Unlimited bots", "Remove Nomi branding", "SLA guarantee", "Dedicated support"] },
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
  primaryBtn: { padding: "12px 20px", background: C.blue, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%", marginTop: 4, fontFamily: "inherit" },
  secondaryBtn: { padding: "10px 18px", background: "transparent", color: C.blue, border: `1px solid ${C.blue}`, borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" },
  error: { color: "#ef4444", fontSize: 13, background: "#fef2f2", padding: "8px 12px", borderRadius: 8 },
  authSwitch: { textAlign: "center", fontSize: 13, color: C.muted, margin: 0 },
  link: { color: C.blue, cursor: "pointer", fontWeight: 600 },
  dashWrap: { display: "flex", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", background: C.bg },
  sidebar: { width: 220, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 0", position: "fixed", height: "100vh" },
  sidebarLogo: { color: "#fff", fontWeight: 800, fontSize: 18, padding: "0 24px 24px", borderBottom: "1px solid rgba(255,255,255,0.1)" },
  nav: { display: "flex", flexDirection: "column", gap: 4, padding: "16px 12px", flex: 1 },
  navBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.65)", padding: "10px 14px", borderRadius: 8, textAlign: "left", cursor: "pointer", fontSize: 14, display: "flex", gap: 10, alignItems: "center", fontFamily: "inherit" },
  navBtnActive: { background: "rgba(255,255,255,0.1)", color: "#fff" },
  logoutBtn: { background: "none", border: "none", color: "rgba(255,255,255,0.4)", padding: "12px 24px", textAlign: "left", cursor: "pointer", fontSize: 13, fontFamily: "inherit" },
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
  codeBlock: { background: "#0f172a", color: "#a5f3fc", padding: "16px 20px", borderRadius: 10, fontSize: 12, fontFamily: "monospace", marginBottom: 14, wordBreak: "break-all", whiteSpace: "pre-wrap", lineHeight: 1.7 },
  configRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, padding: "16px 0", borderBottom: `1px solid ${C.border}` },
  configLabel: { flex: 1 },
  configLabelTitle: { fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 },
  configLabelSub: { fontSize: 13, color: C.muted, lineHeight: 1.5 },
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
  guideOption: { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", border: `1px solid ${C.border}` },
  guideOptionTitle: { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 6 },
  guideTip: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400e", lineHeight: 1.6 },
  guideStatusList: { display: "flex", flexDirection: "column", gap: 10 },
  guideStatus: { display: "flex", alignItems: "center", gap: 10, fontSize: 14, color: "#334155" },
  guideStatusBadge: { fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20, flexShrink: 0 },
  inlineCode: { background: "#f1f5f9", border: `1px solid ${C.border}`, borderRadius: 4, padding: "1px 6px", fontSize: 12, fontFamily: "monospace", color: "#0f172a" },
};
