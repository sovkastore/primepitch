"use client";

import { useEffect, useState } from "react";

interface PPVEvent { id: number; name: string; category: string }
interface Embed { embedUrl: string; server: string }

function domainOf(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

export default function PpvTestPage() {
  const [events, setEvents] = useState<PPVEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PPVEvent | null>(null);
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  const [embedUrl, setEmbedUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/ppv-test")
      .then((r) => r.json())
      .then((d) => setEvents(Array.isArray(d.events) ? d.events : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openEvent(ev: PPVEvent) {
    setSelected(ev); setEmbeds([]); setEmbedUrl(""); setResolving(true);
    try {
      const r = await fetch(`/api/ppv-test?id=${ev.id}`);
      const d = await r.json();
      const list: Embed[] = Array.isArray(d.embeds) ? d.embeds : [];
      setEmbeds(list);
      if (list[0]) setEmbedUrl(list[0].embedUrl);
    } catch {}
    setResolving(false);
  }

  const filtered = q ? events.filter((e) => e.name.toLowerCase().includes(q.toLowerCase())) : events;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 16, fontFamily: "system-ui, sans-serif", color: "#111" }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>PPV Stream Test</h1>
      <p style={{ color: "#555", fontSize: 14, marginTop: 0 }}>
        Pick a live event. If the video plays, PPV works on your network. If it stays a black
        screen, PPV is blocked for you too. This page is only a test - it does not affect the main site.
      </p>

      {embedUrl ? (
        <div style={{ margin: "12px 0" }}>
          <div style={{ position: "relative", width: "100%", paddingTop: "56.25%", background: "#000", borderRadius: 10, overflow: "hidden" }}>
            <iframe key={embedUrl} src={embedUrl} allowFullScreen allow="autoplay; encrypted-media; fullscreen"
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
          </div>
          <p style={{ fontSize: 12, color: "#888", marginTop: 6, wordBreak: "break-all" }}>
            Embed domain: <strong>{domainOf(embedUrl)}</strong>
          </p>
          {embeds.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {embeds.map((e, i) => (
                <button key={i} onClick={() => setEmbedUrl(e.embedUrl)}
                  style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #ccc", cursor: "pointer",
                    background: e.embedUrl === embedUrl ? "#16a34a" : "#fff", color: e.embedUrl === embedUrl ? "#fff" : "#111", fontSize: 13 }}>
                  {e.server || `Server ${i + 1}`}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {selected && resolving ? <p>Resolving stream...</p> : null}
      {selected && !resolving && embeds.length === 0 ? <p style={{ color: "#b91c1c" }}>No playable embed found for this event.</p> : null}

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events..."
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #ccc", margin: "12px 0", boxSizing: "border-box" }} />

      {loading ? (
        <p>Loading live PPV events...</p>
      ) : filtered.length === 0 ? (
        <p>No live PPV events right now.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {filtered.map((ev) => (
            <li key={ev.id}>
              <button onClick={() => openEvent(ev)}
                style={{ width: "100%", textAlign: "left", padding: "12px 10px", borderRadius: 8, cursor: "pointer",
                  border: "1px solid #eee", background: selected?.id === ev.id ? "#ecfdf5" : "#fff", marginBottom: 8 }}>
                <span style={{ fontWeight: 600 }}>{ev.name}</span>
                <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{ev.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
