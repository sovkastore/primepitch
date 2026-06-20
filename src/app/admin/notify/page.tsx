"use client";

import { useEffect, useState, useCallback, type CSSProperties, type ReactNode } from "react";

type Match = {
  id?: string | number;
  title?: string;
  date?: number;
  teams?: { home?: { name?: string }; away?: { name?: string } };
};

type Picked = { home: string; away: string; label: string };
type Filter = "all" | "live" | "upcoming";

function teamsOf(m: Match): { home: string; away: string } {
  let home = m.teams?.home?.name || "";
  let away = m.teams?.away?.name || "";
  if ((!home || !away) && m.title) {
    const parts = m.title.split(/\s+(?:vs|v|-)\s+/i);
    if (parts.length === 2) {
      home = home || parts[0].trim();
      away = away || parts[1].trim();
    }
  }
  return { home, away };
}

function kindLabel(k: string): string {
  return k === "soon5" ? "5 min" : k === "soon1" ? "1 min" : "Live now";
}

function timeOf(m: Match): string {
  if (!m.date) return "";
  try {
    return new Date(m.date).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const C = {
  bg: "#0b0f14", card: "#141a22", card2: "#1b232e", line: "#26303c",
  text: "#e5e7eb", dim: "#9ca3af", accent: "#10b981", red: "#ef4444", amber: "#f59e0b",
};

export default function AdminNotifyPage() {
  const [live, setLive] = useState<Match[]>([]);
  const [upcoming, setUpcoming] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [manualHome, setManualHome] = useState("");
  const [manualAway, setManualAway] = useState("");
  const [sending, setSending] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [lr, ur] = await Promise.all([
        fetch("/api/live-matches").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch("/api/matches?sport=football").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      const liveArr: Match[] = Array.isArray(lr) ? lr : Array.isArray(lr?.matches) ? lr.matches : [];
      const upArr: Match[] = Array.isArray(ur) ? ur : [];
      setLive(liveArr);
      const now = Date.now();
      const liveKeys = new Set(
        liveArr.map((m) => {
          const t = teamsOf(m);
          return `${t.home}|${t.away}`.toLowerCase();
        })
      );
      const up = upArr
        .filter((m) => {
          const t = teamsOf(m);
          const k = `${t.home}|${t.away}`.toLowerCase();
          if (liveKeys.has(k)) return false; // don't repeat live ones under upcoming
          return !m.date || m.date >= now - 30 * 60000;
        })
        .sort((a, b) => (a.date || 0) - (b.date || 0))
        .slice(0, 100);
      setUpcoming(up);
    } catch {
      /* ignore — sections just show empty */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function pick(m: Match) {
    const { home, away } = teamsOf(m);
    if (!home || !away) {
      setResult({ ok: false, msg: "Couldn't read both team names for that match." });
      return;
    }
    setResult(null);
    setPicked({ home, away, label: `${home} vs ${away}` });
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function pickManual() {
    const home = manualHome.trim();
    const away = manualAway.trim();
    if (!home || !away) {
      setResult({ ok: false, msg: "Type both team names." });
      return;
    }
    setResult(null);
    setPicked({ home, away, label: `${home} vs ${away}` });
  }

  async function send(kind: "soon5" | "soon1" | "live") {
    if (!picked) return;
    setSending(kind);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notify-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: picked.home, away: picked.away, kind }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setResult({ ok: true, msg: `Sent "${kindLabel(kind)}" for ${picked.label} — delivered to ${data.sent ?? 0} subscriber(s).` });
      } else {
        setResult({ ok: false, msg: `Failed: ${data.error || res.status}` });
      }
    } catch (e) {
      setResult({ ok: false, msg: "Error: " + String(e) });
    } finally {
      setSending(null);
    }
  }

  const btn = (bg: string): CSSProperties => ({
    flex: 1, padding: "14px 8px", borderRadius: 12, border: "none", color: "#fff",
    background: bg, fontSize: 15, fontWeight: 700, cursor: "pointer",
  });
  const rowStyle: CSSProperties = {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    gap: 10, padding: "12px 14px", background: C.card, border: `1px solid ${C.line}`,
    borderRadius: 12, marginBottom: 8,
  };

  const tab = (f: Filter, label: string): ReactNode => (
    <button
      onClick={() => setFilter(f)}
      style={{
        flex: 1, padding: "9px 8px", borderRadius: 9, border: "none", cursor: "pointer",
        fontSize: 14, fontWeight: 700,
        background: filter === f ? C.accent : "transparent",
        color: filter === f ? "#062019" : C.dim,
      }}
    >
      {label}
    </button>
  );

  const showLive = filter === "all" || filter === "live";
  const showUpcoming = filter === "all" || filter === "upcoming";

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif", padding: "16px 14px 60px" }}>
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: "4px 0 4px" }}>Send match notification</h1>
        <p style={{ color: C.dim, fontSize: 14, margin: "0 0 18px", lineHeight: 1.5 }}>
          Pick a match, then tap how to alert subscribers. Goes to people following that match plus your World Cup subscribers.
        </p>

        <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 16, marginBottom: 18, position: "sticky", top: 8, zIndex: 5 }}>
          {picked ? (
            <>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 4 }}>Selected match</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 14 }}>{picked.label}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={btn(C.line)} disabled={!!sending} onClick={() => send("soon5")}>{sending === "soon5" ? "…" : "5 min"}</button>
                <button style={btn(C.amber)} disabled={!!sending} onClick={() => send("soon1")}>{sending === "soon1" ? "…" : "1 min"}</button>
                <button style={btn(C.red)} disabled={!!sending} onClick={() => send("live")}>{sending === "live" ? "…" : "Live now"}</button>
              </div>
            </>
          ) : (
            <div style={{ fontSize: 14, color: C.dim }}>No match selected yet — pick one below, or type team names.</div>
          )}
          {result && (
            <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, fontSize: 14, background: result.ok ? "rgba(16,185,129,.12)" : "rgba(239,68,68,.12)", color: result.ok ? C.accent : C.red, border: `1px solid ${result.ok ? "rgba(16,185,129,.4)" : "rgba(239,68,68,.4)"}` }}>
              {result.msg}
            </div>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: C.dim, marginBottom: 8 }}>Or type a match</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={manualHome} onChange={(e) => setManualHome(e.target.value)} placeholder="Home team" style={{ flex: 1, minWidth: 0, padding: "12px 12px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 15 }} />
            <input value={manualAway} onChange={(e) => setManualAway(e.target.value)} placeholder="Away team" style={{ flex: 1, minWidth: 0, padding: "12px 12px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 15 }} />
            <button onClick={pickManual} style={{ padding: "12px 16px", borderRadius: 10, border: "none", background: C.accent, color: "#062019", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>Set</button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
          <div style={{ display: "flex", flex: 1, gap: 4, background: C.card, border: `1px solid ${C.line}`, borderRadius: 11, padding: 4 }}>
            {tab("all", "All")}
            {tab("live", live.length ? `Live (${live.length})` : "Live")}
            {tab("upcoming", "Upcoming")}
          </div>
          <button onClick={load} disabled={loading} title="Refresh" style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>
            {loading ? "…" : "↻"}
          </button>
        </div>

        {loading ? (
          <div style={{ color: C.dim, fontSize: 14, padding: "20px 0" }}>Loading matches…</div>
        ) : (
          <>
            {showLive && (
              <Section title={`Live now (${live.length})`} empty="No live matches right now.">
                {live.map((m, i) => {
                  const t = teamsOf(m);
                  return (
                    <div key={`l${i}`} style={rowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.home && t.away ? `${t.home} vs ${t.away}` : m.title || "Match"}</div>
                        <div style={{ fontSize: 12, color: C.red, marginTop: 2 }}>● Live</div>
                      </div>
                      <button onClick={() => pick(m)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.accent}`, background: "transparent", color: C.accent, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Select</button>
                    </div>
                  );
                })}
              </Section>
            )}

            {showUpcoming && (
              <Section title={`Upcoming football (${upcoming.length})`} empty="No upcoming football fixtures found.">
                {upcoming.map((m, i) => {
                  const t = teamsOf(m);
                  return (
                    <div key={`u${i}`} style={rowStyle}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.home && t.away ? `${t.home} vs ${t.away}` : m.title || "Match"}</div>
                        {timeOf(m) && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{timeOf(m)}</div>}
                      </div>
                      <button onClick={() => pick(m)} style={{ flexShrink: 0, padding: "8px 14px", borderRadius: 9, border: `1px solid ${C.line}`, background: "transparent", color: C.text, fontWeight: 600, fontSize: 14, cursor: "pointer" }}>Select</button>
                    </div>
                  );
                })}
              </Section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const isEmpty = arr.filter(Boolean).length === 0;
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>{title}</div>
      {isEmpty ? <div style={{ color: "#6b7280", fontSize: 14 }}>{empty}</div> : children}
    </div>
  );
}
