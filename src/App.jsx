import { useState, useEffect } from "react";

const BUCKETS = [
  { key: "tithe",    label: "Tithe",         pct: 10, color: "#c8a96e", icon: "✝" },
  { key: "giving",   label: "Generosity",    pct: 5,  color: "#7ec8a9", icon: "♡" },
  { key: "invest",   label: "Investing",     pct: 25, color: "#6ea8c8", icon: "↗" },
  { key: "business", label: "Business",      pct: 25, color: "#a96ec8", icon: "⚙" },
  { key: "skills",   label: "Skills",        pct: 15, color: "#c86e7e", icon: "◈" },
  { key: "fun",      label: "Fun",           pct: 20, color: "#c8b96e", icon: "★" },
];

const SOURCES = ["Welding", "FindingFreedom", "Other"];

const fmt = (n) => "$" + Number(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const TXNS_STORAGE_KEY = "ff_budget_txns";

function getResponsiveLayout(viewportWidth) {
  if (viewportWidth >= 1400) {
    return { panelWidth: "1120px", fabRight: "max(calc((100vw - 1120px) / 2 + 20px), 20px)" };
  }
  if (viewportWidth >= 1024) {
    return { panelWidth: "min(96vw, 1040px)", fabRight: "24px" };
  }
  if (viewportWidth >= 768) {
    return { panelWidth: "min(98vw, 920px)", fabRight: "20px" };
  }
  return { panelWidth: "calc(100vw - 12px)", fabRight: "16px" };
}

async function loadTransactionsFromStorage() {
  try {
    if (window.storage?.get) {
      const result = await window.storage.get(TXNS_STORAGE_KEY);
      return result?.value ? JSON.parse(result.value) : [];
    }

    const value = window.localStorage.getItem(TXNS_STORAGE_KEY);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

async function saveTransactionsToStorage(transactions) {
  try {
    if (window.storage?.set) {
      await window.storage.set(TXNS_STORAGE_KEY, JSON.stringify(transactions));
      return;
    }

    window.localStorage.setItem(TXNS_STORAGE_KEY, JSON.stringify(transactions));
  } catch {
    // Ignore storage failures to keep UI responsive.
  }
}

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [view, setView] = useState("dashboard"); // dashboard | log | add
  const [form, setForm] = useState({ type: "income", source: "Welding", bucket: "fun", amount: "", note: "", date: new Date().toISOString().slice(0, 10) });
  const [loaded, setLoaded] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    (async () => {
      const txns = await loadTransactionsFromStorage();
      setTransactions(txns);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveTransactionsToStorage(transactions);
  }, [transactions, loaded]);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const totalIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const bucketTotals = Object.fromEntries(BUCKETS.map(b => [b.key, 0]));
  transactions.forEach(t => {
    if (t.type === "expense") bucketTotals[t.bucket] = (bucketTotals[t.bucket] || 0) + t.amount;
  });
  const bucketAllocated = Object.fromEntries(BUCKETS.map(b => [b.key, totalIncome * b.pct / 100]));
  const bucketRemaining = Object.fromEntries(BUCKETS.map(b => [b.key, bucketAllocated[b.key] - (bucketTotals[b.key] || 0)]));
  const { panelWidth, fabRight } = getResponsiveLayout(viewportWidth);

  function addTransaction() {
    if (!form.amount || isNaN(form.amount) || Number(form.amount) <= 0) return;
    setTransactions(prev => [{
      id: Date.now(),
      type: form.type,
      source: form.source,
      bucket: form.type === "expense" ? form.bucket : null,
      amount: parseFloat(form.amount),
      note: form.note,
      date: form.date,
    }, ...prev]);
    setForm(f => ({ ...f, amount: "", note: "" }));
    setView("dashboard");
  }

  function deleteTransaction(id) {
    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  const recentTxns = transactions.slice(0, 10);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0f",
      color: "#e8e4dc",
      fontFamily: "'Georgia', serif",
      width: panelWidth,
      margin: "0 auto",
      padding: "0 0 80px 0",
      position: "relative",
    }}>
      {/* Header */}
      <div style={{ padding: "32px 24px 0", borderBottom: "1px solid #1e1e22" }}>
        <div style={{ fontSize: 11, letterSpacing: 4, color: "#555", textTransform: "uppercase", marginBottom: 4 }}>FindingFreedom</div>
        <div style={{ fontSize: 28, fontWeight: "normal", letterSpacing: -0.5, color: "#e8e4dc" }}>Budget</div>
        <div style={{ fontSize: 13, color: "#666", marginTop: 2, marginBottom: 20 }}>
          Total earned: <span style={{ color: "#c8a96e" }}>{fmt(totalIncome)}</span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e1e22" }}>
        {["dashboard", "log"].map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            flex: 1, padding: "12px 0", background: "none", border: "none",
            color: view === v ? "#e8e4dc" : "#444", cursor: "pointer",
            fontSize: 12, letterSpacing: 3, textTransform: "uppercase",
            borderBottom: view === v ? "2px solid #c8a96e" : "2px solid transparent",
            transition: "all 0.2s",
          }}>{v}</button>
        ))}
      </div>

      {/* Dashboard */}
      {view === "dashboard" && (
        <div style={{ padding: "24px 20px 0" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>Allocation</div>
          {BUCKETS.map(b => {
            const allocated = bucketAllocated[b.key];
            const spent = bucketTotals[b.key] || 0;
            const pct = allocated > 0 ? Math.min(spent / allocated, 1) : 0;
            const remaining = bucketRemaining[b.key];
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
                  <div style={{
                    height: "100%", borderRadius: 2,
                    width: `${pct * 100}%`,
                    background: pct >= 1 ? "#c86e7e" : b.color,
                    transition: "width 0.4s ease",
                  }} />
                </div>
                <div style={{ fontSize: 11, color: "#444", marginTop: 4 }}>
                  {fmt(spent)} spent of {fmt(allocated)}
                </div>
              </div>
            );
          })}

          {/* Recent */}
          {recentTxns.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 12 }}>Recent</div>
              {recentTxns.map(t => (
                <div key={t.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: "1px solid #161618",
                }}>
                  <div>
                    <div style={{ fontSize: 13 }}>{t.type === "income" ? (t.source || "Income") : (BUCKETS.find(b => b.key === t.bucket)?.label || t.bucket)}</div>
                    {t.note && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{t.note}</div>}
                    <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{t.date}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, color: t.type === "income" ? "#7ec8a9" : "#e8e4dc" }}>
                      {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {transactions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>
              No transactions yet.<br />Hit + to add your first one.
            </div>
          )}
        </div>
      )}

      {/* Log */}
      {view === "log" && (
        <div style={{ padding: "24px 20px 0" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 16 }}>All Transactions</div>
          {transactions.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#333", fontSize: 13 }}>No transactions yet.</div>
          )}
          {transactions.map(t => (
            <div key={t.id} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "12px 0", borderBottom: "1px solid #161618",
            }}>
              <div>
                <div style={{ fontSize: 13 }}>
                  {t.type === "income" ? (t.source || "Income") : (BUCKETS.find(b => b.key === t.bucket)?.label || t.bucket)}
                  <span style={{ fontSize: 10, color: "#444", marginLeft: 8, letterSpacing: 2, textTransform: "uppercase" }}>{t.type}</span>
                </div>
                {t.note && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{t.note}</div>}
                <div style={{ fontSize: 11, color: "#444", marginTop: 1 }}>{t.date}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 14, color: t.type === "income" ? "#7ec8a9" : "#c86e7e" }}>
                  {t.type === "income" ? "+" : "-"}{fmt(t.amount)}
                </div>
                <button onClick={() => deleteTransaction(t.id)} style={{
                  background: "none", border: "none", color: "#333", cursor: "pointer",
                  fontSize: 16, padding: "0 4px", lineHeight: 1,
                }}>×</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Modal */}
      {view === "add" && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          display: "flex", alignItems: "flex-end", zIndex: 100,
        }} onClick={() => setView("dashboard")}>
          <div style={{
            width: panelWidth, margin: "0 auto",
            background: "#111113", borderRadius: "16px 16px 0 0",
            padding: "28px 24px 40px",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#444", textTransform: "uppercase", marginBottom: 20 }}>Add Transaction</div>

            {/* Type */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["income", "expense"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                  flex: 1, padding: "10px 0", border: "1px solid",
                  borderColor: form.type === t ? "#c8a96e" : "#222",
                  background: form.type === t ? "rgba(200,169,110,0.1)" : "none",
                  color: form.type === t ? "#c8a96e" : "#555",
                  borderRadius: 6, cursor: "pointer", fontSize: 12,
                  letterSpacing: 2, textTransform: "uppercase",
                }}>{t}</button>
              ))}
            </div>

            {/* Amount */}
            <input
              type="number" placeholder="Amount" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              style={{
                width: "100%", background: "#0d0d0f", border: "1px solid #222",
                color: "#e8e4dc", padding: "12px 14px", borderRadius: 6,
                fontSize: 20, marginBottom: 12, boxSizing: "border-box",
                fontFamily: "Georgia, serif",
              }}
            />

            {/* Source or Bucket */}
            {form.type === "income" ? (
              <select value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))} style={selectStyle}>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <select value={form.bucket} onChange={e => setForm(f => ({ ...f, bucket: e.target.value }))} style={selectStyle}>
                {BUCKETS.map(b => <option key={b.key} value={b.key}>{b.label} ({b.pct}%)</option>)}
              </select>
            )}

            {/* Note */}
            <input
              type="text" placeholder="Note (optional)" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              style={{ ...selectStyle, marginTop: 8 }}
            />

            {/* Date */}
            <input
              type="date" value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              style={{ ...selectStyle, marginTop: 8 }}
            />

            <button onClick={addTransaction} style={{
              width: "100%", marginTop: 16, padding: "14px 0",
              background: "#c8a96e", border: "none", borderRadius: 6,
              color: "#0d0d0f", fontSize: 13, letterSpacing: 3,
              textTransform: "uppercase", cursor: "pointer", fontFamily: "Georgia, serif",
            }}>Add</button>
          </div>
        </div>
      )}

      {/* FAB */}
      {view !== "add" && (
        <button onClick={() => setView("add")} style={{
          position: "fixed", bottom: 28, right: fabRight,
          width: 52, height: 52, borderRadius: "50%",
          background: "#c8a96e", border: "none",
          color: "#0d0d0f", fontSize: 26, cursor: "pointer",
          boxShadow: "0 4px 20px rgba(200,169,110,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          lineHeight: 1,
        }}>+</button>
      )}
    </div>
  );
}

const selectStyle = {
  width: "100%", background: "#0d0d0f", border: "1px solid #222",
  color: "#e8e4dc", padding: "12px 14px", borderRadius: 6,
  fontSize: 14, boxSizing: "border-box", fontFamily: "Georgia, serif",
};