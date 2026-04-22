import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://zfxtezvchyswqoeolyim.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpmeHRlenZjaHlzd3FvZW9seWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkwNDcsImV4cCI6MjA5MjQzNTA0N30.9a4U7Yh9ohxQAUFOuaWcue9OBsb-e-oOqPOXV9yoJzQ";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_BUCKETS = [
  { key: "tithe",    label: "Tithe",      pct: 10, color: "#c8a96e", icon: "✝" },
  { key: "giving",   label: "Generosity", pct: 5,  color: "#7ec8a9", icon: "♡" },
  { key: "invest",   label: "Investing",  pct: 25, color: "#6ea8c8", icon: "↗" },
  { key: "business", label: "Business",   pct: 25, color: "#a96ec8", icon: "⚙" },
  { key: "skills",   label: "Skills",     pct: 15, color: "#c86e7e", icon: "◈" },
  { key: "fun",      label: "Fun",        pct: 20, color: "#c8b96e", icon: "★" },
];

const SOURCES = ["Welding", "FindingFreedom", "Other"];
const fmt = (n) => "$" + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const inp = {
  width: "100%", background: "#0d0d0f", border: "1px solid #222",
  color: "#e8e4dc", padding: "12px 14px", borderRadius: 6,
  fontSize: 14, boxSizing: "border-box", fontFamily: "Georgia, serif",
  marginBottom: 10,
};

export default function App() {
  const [session, setSession] = useState(null);
  const [dbUser, setDbUser] = useState(null);
  const [buckets, setBuckets] = useState(DEFAULT_BUCKETS);
  const [transactions, setTransactions] = useState([]);
  const [view, setView] = useState("dashboard");
  const [form, setForm] = useState({ type: "income", source: "Welding", bucket: "fun", amount: "", note: "", date: new Date().toISOString().slice(0, 10) });
  const [editPct, setEditPct] = useState(false);
  const [draftBuckets, setDraftBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  const loadUser = useCallback(async (sess) => {
    if (!sess) { setLoading(false); return; }
    const googleId = sess.user.user_metadata?.sub || sess.user.id;
    let { data: existing } = await supabase
      .from("budget_users")
      .select("*")
      .eq("google_id", googleId)
      .maybeSingle();

    if (!existing) {
      const { data: created } = await supabase
        .from("budget_users")
        .insert({ google_id: googleId, email: sess.user.email, name: sess.user.user_metadata?.full_name })
        .select()
        .single();
      existing = created;
    }

    if (existing) {
      setDbUser(existing);
      if (existing.buckets) setBuckets(existing.buckets);
      const { data: txns } = await supabase
        .from("budget_transactions")
        .select("*")
        .eq("user_id", existing.id)
        .order("created_at", { ascending: false });
      setTransactions(txns || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadUser(session); }, [session, loadUser]);

  const signIn = () => supabase.auth.signInWithOAuth({
    provider: "google",
  options: { redirectTo: window.location.origin }
  });

  const signOut = () => supabase.auth.signOut();

  async function addTransaction() {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0 || !dbUser) return;
    setSaving(true);
    const newTxn = {
      user_id: dbUser.id,
      type: form.type,
      source: form.type === "income" ? form.source : null,
      bucket: form.type === "expense" ? form.bucket : null,
      amount: parseFloat(form.amount),
      note: form.note || null,
      date: form.date,
    };
    const { data } = await supabase.from("budget_transactions").insert(newTxn).select().single();
    if (data) setTransactions(prev => [data, ...prev]);
    setForm(f => ({ ...f, amount: "", note: "" }));
    setView("dashboard");
    setSaving(false);
  }

  async function deleteTransaction(id) {
    await supabase.from("budget_transactions").delete().eq("id", id);
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  async function saveBuckets() {
    const total = draftBuckets.reduce((s, b) => s + Number(b.pct), 0);
    if (total !== 100) return;
    setSaving(true);
    await supabase.from("budget_users").update({ buckets: draftBuckets }).eq("id", dbUser.id);
    setBuckets(draftBuckets);
    setEditPct(false);
    setSaving(false);
  }

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const bucketSpent = Object.fromEntries(buckets.map(b => [b.key, 0]));
  transactions.filter(t => t.type === "expense").forEach(t => {
    if (t.bucket) bucketSpent[t.bucket] = (bucketSpent[t.bucket] || 0) + Number(t.amount);
  });
  const draftTotal = draftBuckets.reduce((s, b) => s + Number(b.pct || 0), 0);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#444", fontSize: 13, letterSpacing: 3, textTransform: "uppercase" }}>Loading...</div>
    </div>
  );

  if (!session) return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, padding: 24 }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#555", textTransform: "uppercase", marginBottom: 8 }}>FindingFreedom</div>
        <div style={{ fontSize: 32, color: "#e8e4dc", fontFamily: "Georgia, serif" }}>Budget</div>
        <div style={{ fontSize: 13, color: "#444", marginTop: 8 }}>Sign in to sync across all your devices</div>
      </div>
      <button onClick={signIn} style={{
        padding: "14px 32px", background: "#c8a96e", border: "none", borderRadius: 8,
        color: "#0d0d0f", fontSize: 13, letterSpacing: 2, textTransform: "uppercase",
        cursor: "pointer", fontFamily: "Georgia, serif",
      }}>Continue with Google</button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0f", color: "#e8e4dc", fontFamily: "Georgia, serif", maxWidth: 480, margin: "0 auto", padding: "0 0 80px 0" }}>

      <div style={{ padding: "32px 24px 0", borderBottom: "1px solid #1e1e22" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 4, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>FindingFreedom</div>
            <div style={{ fontSize: 28, fontWeight: "normal", letterSpacing: -0.5 }}>Budget</div>
            <div style={{ fontSize: 13, color: "#666", marginTop: 2, marginBottom: 20 }}>
              Total earned: <span style={{ color: "#c8a96e" }}>{fmt(totalIncome)}</span>
            </div>
          </div>
          <button onClick={signOut} style={{ background: "none", border: "none", color: "#444", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", cursor: "pointer", marginTop: 8 }}>Sign out</button>
        </div>
      </div>

      <div style={{ display: "flex", borderBottom: "1px solid #1e1e22" }}>
        {["dashboard", "log"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: "12px 0", background: "none", border: "none",
            color: view === v ? "#e8e4dc" : "#444", cursor: "pointer",
            fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
            borderBottom: view === v ? "2px solid #c8a96e" : "2px solid transparent",
          }}>{v}</button>
        ))}
      </div>

      {view === "dashboard" && (
        <div style={{ padding: "24px 20px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase" }}>Allocation</div>
            <button onClick={() => { setDraftBuckets(buckets.map(b => ({ ...b }))); setEditPct(true); }} style={{
              background: "none", border: "1px solid #222", color: "#666", fontSize: 11,
              letterSpacing: 2, textTransform: "uppercase", padding: "4px 10px", borderRadius: 4, cursor: "pointer",
            }}>Edit %</button>
          </div>

          {buckets.map(b => {
            const allocated = totalIncome * b.pct / 100;
            const spent = bucketSpent[b.key] || 0;
            const pct = allocated > 0 ? Math.min(spent / allocated, 1) : 0;
            const remaining = allocated - spent;
            return (
              <div key={b.key} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: b.color, fontSize: 14 }}>{b.icon}</span>
                    <span style={{ fontSize: 14 }}>{b.label}</span>
                    <span style={{ fontSize: 11, color: "#444" }}>{b.pct}%</span>
                  </div>
                  <div style={{ fontSize: 13, color: remaining >= 0 ? "#7ec8a9" : "#c86e7e" }}>
                    {fmt(Math.abs(remaining))} {remaining >= 0 ? "left" : "over"}
                  </div>
                </div>
                <div style={{ height: 3, background: "#1e1e22", borderRadius: 2 }}>
                  <div style={{ height: "100%", borderRadius: 2, width: `${pct * 100}%`, background: pct >= 1 ? "#c86e7e" : b.color, transition: "width 0.4s ease" }} />
                </div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>{fmt(spent)} spent of {fmt(allocated)}</div>
              </div>
            );
          })}

          {transactions.slice(0, 8).length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 12 }}>Recent</div>
              {transactions.slice(0, 8).map(t => (
                <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #161618" }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{t.type === "income" ? (t.source || "Income") : (buckets.find(b => b.key === t.bucket)?.label || t.bucket)}</div>
                    {t.note && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{t.note}</div>}
                    <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{t.date}</div>
                  </div>
                  <div style={{ fontSize: 14, color: t.type === "income" ? "#7ec8a9" : "#e8e4dc" }}>
                    {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {transactions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>No transactions yet.<br />Hit + to log your first one.</div>
          )}
        </div>
      )}

      {view === "log" && (
        <div style={{ padding: "24px 20px 0" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>All Transactions</div>
          {transactions.length === 0 && <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>No transactions yet.</div>}
          {transactions.map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #161618" }}>
              <div>
                <div style={{ fontSize: 13 }}>
                  {t.type === "income" ? (t.source || "Income") : (buckets.find(b => b.key === t.bucket)?.label || t.bucket)}
                  <span style={{ fontSize: 10, color: "#444", marginLeft: 8, letterSpacing: 2, textTransform: "uppercase" }}>{t.type}</span>
                </div>
                {t.note && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{t.note}</div>}
                <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{t.date}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 14, color: t.type === "income" ? "#7ec8a9" : "#c86e7e" }}>
                  {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                </div>
                <button onClick={() => deleteTransaction(t.id)} style={{ background: "none", border: "none", color: "#333", cursor: "pointer", fontSize: 18, padding: "0 4px" }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "add" && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setView("dashboard")}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#111113", borderRadius: "16px 16px 0 0", padding: "28px 24px 40px" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 20 }}>Add Transaction</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["income", "expense"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                  flex: 1, padding: "10px 0", border: "1px solid",
                  borderColor: form.type === t ? "#c8a96e" : "#222",
                  background: form.type === t ? "rgba(200,169,110,0.1)" : "none",
                  color: form.type === t ? "#c8a96e" : "#555",
                  borderRadius: 6, cursor: "pointer", fontSize: 12, letterSpacing: 2, textTransform: "uppercase",
                }}>{t}</button>
              ))}
            </div>
            <input type="number" placeholder="Amount" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, fontSize: 20 }} />
            {form.type === "income"
              ? <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={inp}>
                  {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              : <select value={form.bucket} onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))} style={inp}>
                  {buckets.map(b => <option key={b.key} value={b.key}>{b.label} ({b.pct}%)</option>)}
                </select>
            }
            <input type="text" placeholder="Note (optional)" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} style={inp} />
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inp} />
            <button onClick={addTransaction} disabled={saving} style={{
              width: "100%", marginTop: 8, padding: "14px 0", background: saving ? "#7a6540" : "#c8a96e",
              border: "none", borderRadius: 6, color: "#0d0d0f", fontSize: 13,
              letterSpacing: 3, textTransform: "uppercase", cursor: "pointer", fontFamily: "Georgia, serif",
            }}>{saving ? "Saving..." : "Add"}</button>
          </div>
        </div>
      )}

      {editPct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "flex-end", zIndex: 100 }} onClick={() => setEditPct(false)}>
          <div style={{ width: "100%", maxWidth: 480, margin: "0 auto", background: "#111113", borderRadius: "16px 16px 0 0", padding: "28px 24px 40px" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase" }}>Edit Percentages</div>
              <div style={{ fontSize: 13, color: draftTotal === 100 ? "#7ec8a9" : "#c86e7e" }}>Total: {draftTotal}%</div>
            </div>
            {draftBuckets.map((b, i) => (
              <div key={b.key} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <span style={{ color: b.color, fontSize: 16, width: 20 }}>{b.icon}</span>
                <span style={{ fontSize: 13, flex: 1 }}>{b.label}</span>
                <input type="number" min="0" max="100" value={b.pct}
                  onChange={e => {
                    const updated = [...draftBuckets];
                    updated[i] = { ...updated[i], pct: Number(e.target.value) };
                    setDraftBuckets(updated);
                  }}
                  style={{ ...inp, width: 64, marginBottom: 0, textAlign: "center", fontSize: 16 }}
                />
                <span style={{ fontSize: 12, color: "#444" }}>%</span>
              </div>
            ))}
            {draftTotal !== 100 && (
              <div style={{ fontSize: 12, color: "#c86e7e", marginBottom: 12, textAlign: "center" }}>
                Must equal exactly 100% (currently {draftTotal}%)
              </div>
            )}
            <button onClick={saveBuckets} disabled={draftTotal !== 100 || saving} style={{
              width: "100%", marginTop: 8, padding: "14px 0",
              background: draftTotal === 100 ? "#c8a96e" : "#2a2a2a",
              border: "none", borderRadius: 6,
              color: draftTotal === 100 ? "#0d0d0f" : "#444",
              fontSize: 13, letterSpacing: 3, textTransform: "uppercase",
              cursor: draftTotal === 100 ? "pointer" : "not-allowed",
              fontFamily: "Georgia, serif",
            }}>{saving ? "Saving..." : "Save"}</button>
          </div>
        </div>
      )}

      {!editPct && view !== "add" && (
        <button onClick={() => setView("add")} style={{
          position: "fixed", bottom: 28, right: "calc(50% - 240px + 20px)",
          width: 52, height: 52, borderRadius: "50%", background: "#c8a96e",
          border: "none", color: "#0d0d0f", fontSize: 26, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(200,169,110,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>+</button>
      )}
    </div>
  );
}