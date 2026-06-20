"use client";

import { useEffect, useMemo, useState } from "react";
import Analytics from "@/components/Analytics";

interface PPVEvent { id: number; name: string; category: string; poster?: string; startsAt?: number | null; endsAt?: number | null; alwaysLive?: boolean }
type PStatus = "live" | "upcoming" | "ended";
function statusOf(ev: PPVEvent): PStatus {
  if (ev.alwaysLive) return "live";
  const now = Date.now() / 1000;
  const s = ev.startsAt ?? null;
  const e = ev.endsAt ?? null;
  if (s != null && s > now + 60) return "upcoming";
  if (e != null && e > 0 && e < now - 600) return "ended";
  return "live";
}
function startLabel(ev: PPVEvent): string {
  const s = ev.startsAt;
  if (s == null) return "";
  const diff = s - Date.now() / 1000;
  if (diff > 0 && diff < 86400) {
    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    return h > 0 ? `Starts in ${h}h ${m}m` : `Starts in ${Math.max(m, 1)}m`;
  }
  return "Starts " + new Date(s * 1000).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
interface Embed { embedUrl: string; server: string }

const C = {
  bg: "#0b0f14", card: "#141a22", card2: "#1b232e", line: "#26303c",
  text: "#e5e7eb", dim: "#9ca3af", accent: "#10b981", red: "#ef4444", amber: "#f59e0b",
};

function domainOf(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}
function isFootball(cat: string): boolean {
  // PPV labels real football "Football"; keep "American Football" and
  // "Australian Football" out of this featured section (exact match only).
  const c = (cat || "").trim().toLowerCase();
  return c === "football" || c === "soccer";
}

function Card({ ev, active, onClick }: { ev: PPVEvent; active: boolean; onClick: () => void }) {
  const st = statusOf(ev);
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", padding: 0, borderRadius: 14, overflow: "hidden", cursor: "pointer",
        border: `1px solid ${active ? C.accent : C.line}`, background: C.card,
        display: "flex", flexDirection: "column",
      }}
    >
      <div style={{ position: "relative", width: "100%", paddingTop: "56%", background: "#000" }}>
        {ev.poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ev.poster} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: C.dim, fontSize: 13, padding: 8, textAlign: "center" }}>{ev.category}</div>
        )}
        {st === "upcoming" ? (
          <span style={{ position: "absolute", top: 8, left: 8, background: C.amber, color: "#1a1206", fontSize: 11, fontWeight: 800, padding: "3px 7px", borderRadius: 6, letterSpacing: 0.3 }}>UPCOMING</span>
        ) : st === "live" ? (
          <span style={{ position: "absolute", top: 8, left: 8, background: C.red, color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 7px", borderRadius: 6, letterSpacing: 0.3 }}>● LIVE</span>
        ) : null}
      </div>
      <div style={{ padding: "10px 12px" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: C.text, lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ev.name}</div>
        <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{ev.category}</div>
        {st === "upcoming" && <div style={{ fontSize: 11, color: C.amber, marginTop: 3, fontWeight: 600 }}>{startLabel(ev)}</div>}
      </div>
    </button>
  );
}

function Grid({ list, selectedId, onPick }: { list: PPVEvent[]; selectedId: number | null; onPick: (e: PPVEvent) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
      {list.map((ev) => (
        <Card key={ev.id} ev={ev} active={selectedId === ev.id} onClick={() => onPick(ev)} />
      ))}
    </div>
  );
}

export default function PpvPage() {
  const [events, setEvents] = useState<PPVEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PPVEvent | null>(null);
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  const [embedUrl, setEmbedUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "live" | "upcoming">("all");
  const [sport, setSport] = useState("Football");
  const [sportTouched, setSportTouched] = useState(false);

  useEffect(() => {
    fetch("/api/ppv")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openEvent(ev: PPVEvent) {
    setSelected(ev); setEmbeds([]); setEmbedUrl(""); setResolving(true);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
    try {
      const r = await fetch(`/api/ppv?id=${ev.id}`);
      const d = await r.json();
      const list: Embed[] = Array.isArray(d.embeds) ? d.embeds : [];
      setEmbeds(list);
      if (list[0]) setEmbedUrl(list[0].embedUrl);
    } catch {}
    setResolving(false);
  }

  function close() {
    setSelected(null); setEmbeds([]); setEmbedUrl("");
  }

  useEffect(() => {
    if (sportTouched || events.length === 0) return;
    const fb = events.find((e) => isFootball(e.category))?.category;
    setSport(fb ?? "all");
  }, [events, sportTouched]);

  const sports = useMemo(() => {
    const set = new Set<string>();
    for (const e of events) if (e.category) set.add(e.category);
    return [...set].sort((a, b) => {
      const fa = isFootball(a) ? 0 : 1, fb = isFootball(b) ? 0 : 1;
      return fa !== fb ? fa - fb : a.localeCompare(b);
    });
  }, [events]);

  const filtered = useMemo(
    () => (q ? events.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())) : events),
    [q, events]
  );
  const counts = useMemo(() => {
    let live = 0, upcoming = 0;
    for (const e of filtered) {
      const st = statusOf(e);
      if (st === "live") live++; else if (st === "upcoming") upcoming++;
    }
    return { live, upcoming, all: live + upcoming };
  }, [filtered]);
  const visible = useMemo(
    () => filtered.filter((e) => {
      const st = statusOf(e);
      if (st === "ended") return false;
      return filter === "all" ? true : st === filter;
    }),
    [filtered, filter]
  );
  const football = useMemo(() => visible.filter((e) => isFootball(e.category)), [visible]);
  const groups = useMemo(() => {
    const m = new Map<string, PPVEvent[]>();
    for (const e of visible) {
      if (isFootball(e.category)) continue;
      const k = e.category || "Live";
      const arr = m.get(k);
      if (arr) arr.push(e); else m.set(k, [e]);
    }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [visible]);
  const sportList = useMemo(
    () => (sport === "all" ? visible : visible.filter((e) => e.category === sport)),
    [visible, sport]
  );

  const selectedId = selected?.id ?? null;

  return (
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "18px 14px 60px" }}>
        <Analytics />
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "2px 0 4px" }}>Live Streams</h1>
        <p style={{ color: C.dim, fontSize: 14, margin: "0 0 16px" }}>
          Live football and more, from an independent source. Tap any event to watch.
        </p>

        {selected && (
          <div style={{ background: C.card2, border: `1px solid ${C.line}`, borderRadius: 16, padding: 12, marginBottom: 18, position: "sticky", top: 8, zIndex: 5 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 15, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</div>
              <button onClick={close} style={{ flexShrink: 0, padding: "6px 12px", borderRadius: 9, border: `1px solid ${C.line}`, background: "transparent", color: C.dim, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Close</button>
            </div>
            {embedUrl ? (
              <>
                <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000", borderRadius: 10, overflow: "hidden" }}>
                  <iframe key={embedUrl} src={embedUrl} allowFullScreen allow="autoplay; encrypted-media; fullscreen"
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
                </div>
                {embeds.length > 1 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {embeds.map((e, i) => (
                      <button key={i} onClick={() => setEmbedUrl(e.embedUrl)}
                        style={{ padding: "7px 12px", borderRadius: 9, border: `1px solid ${e.embedUrl === embedUrl ? C.accent : C.line}`, cursor: "pointer",
                          background: e.embedUrl === embedUrl ? C.accent : "transparent", color: e.embedUrl === embedUrl ? "#062019" : C.text, fontSize: 13, fontWeight: 600 }}>
                        {e.server || `Server ${i + 1}`}
                      </button>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 11, color: "#6b7280", marginTop: 8, wordBreak: "break-all" }}>Source: {domainOf(embedUrl)}</p>
              </>
            ) : resolving ? (
              <div style={{ color: C.dim, fontSize: 14, padding: "30px 0", textAlign: "center" }}>Loading stream…</div>
            ) : (
              <div style={{ color: C.red, fontSize: 14, padding: "20px 0", textAlign: "center" }}>No playable stream found for this event.</div>
            )}
          </div>
        )}

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search events…"
          style={{ width: "100%", padding: "12px 14px", borderRadius: 11, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 15, marginBottom: 12, boxSizing: "border-box" }}
        />

        <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap", alignItems: "center" }}>
          <select value={sport} onChange={(e) => { setSport(e.target.value); setSportTouched(true); }}
            style={{ padding: "8px 12px", borderRadius: 10, fontSize: 13, fontWeight: 700, border: `1px solid ${C.line}`, background: C.card, color: C.text, cursor: "pointer", maxWidth: 220 }}>
            <option value="all">All sports</option>
            {sports.map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
          {([["all", "All", counts.all], ["live", "Live", counts.live], ["upcoming", "Upcoming", counts.upcoming]] as const).map(([key, label, count]) => (
            <button key={key} onClick={() => setFilter(key)}
              style={{ padding: "8px 14px", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700,
                border: `1px solid ${filter === key ? C.accent : C.line}`,
                background: filter === key ? C.accent : "transparent",
                color: filter === key ? "#062019" : C.dim }}>
              {label}{count > 0 ? ` (${count})` : ""}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ color: C.dim, fontSize: 14, padding: "30px 0", textAlign: "center" }}>Loading live events…</div>
        ) : sportList.length === 0 ? (
          <div style={{ color: C.dim, fontSize: 14, padding: "30px 0", textAlign: "center" }}>{(() => {
            const noun = sport === "all" ? "events" : `${sport} events`;
            return filter === "upcoming" ? `No upcoming ${noun}.` : filter === "live" ? `No live ${noun} right now.` : `No ${noun} right now.`;
          })()}</div>
        ) : sport === "all" ? (
          <>
            {football.length > 0 && (
              <section style={{ marginBottom: 26 }}>
                <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>⚽ Football</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>({football.length})</span>
                </h2>
                <Grid list={football} selectedId={selectedId} onPick={openEvent} />
              </section>
            )}

            {groups.map(([cat, list]) => (
              <section key={cat} style={{ marginBottom: 26 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: C.dim, textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 12px" }}>{cat} <span style={{ color: "#4b5563" }}>({list.length})</span></h2>
                <Grid list={list} selectedId={selectedId} onPick={openEvent} />
              </section>
            ))}
          </>
        ) : (
          <section style={{ marginBottom: 26 }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 8 }}>
              <span>{isFootball(sport) ? "⚽ " : ""}{sport}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.dim }}>({sportList.length})</span>
            </h2>
            <Grid list={sportList} selectedId={selectedId} onPick={openEvent} />
          </section>
        )}
      </div>
    </main>
  );
}
