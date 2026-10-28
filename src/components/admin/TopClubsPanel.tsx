"use client";

import { useEffect, useState } from "react";

interface LeagueDef { key: string; name: string }
interface LeagueClubs { teams: string[]; seasonName?: string; manual?: boolean }
interface TopClubs { season: number; updatedAt: string; leagues: Record<string, LeagueClubs> }

// Admin view of the saved top-flight club lists the picker uses to check cup
// matches. Downloaded once per season; editable by hand.
export default function TopClubsPanel() {
  const [leagues, setLeagues] = useState<LeagueDef[]>([]);
  const [clubs, setClubs] = useState<TopClubs | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/admin/top-clubs");
      const j = await r.json();
      setLeagues(j.leagues || []);
      setClubs(j.clubs || null);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after await
    load();
  }, []);

  async function post(body: object, ok: string) {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/top-clubs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (j.clubs) setClubs(j.clubs);
      setMsg(r.ok ? ok : j.error || "Failed");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-gray-900">🏟️ Top-League Clubs (cup check)</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">
            A cup match is only picked if at least one team is on these lists. Downloaded once per
            season{clubs ? ` (${clubs.season}/${String(clubs.season + 1).slice(2)})` : ""} and updated
            automatically when the new season starts. Edit a list if it&apos;s ever wrong.
          </p>
        </div>
        <button
          onClick={() => post({ action: "redownload" }, "Lists re-downloaded.")}
          disabled={busy}
          className="text-[12px] font-bold text-white bg-gray-800 hover:bg-gray-900 px-4 py-2 rounded-lg disabled:opacity-50"
        >
          {busy ? "Working…" : "↻ Re-download"}
        </button>
      </div>

      {msg && <p className="text-[12px] font-semibold text-emerald-700">{msg}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {leagues.map((l) => {
          const lc = clubs?.leagues?.[l.key];
          const isEditing = editing === l.key;
          return (
            <div key={l.key} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-[13px] font-bold text-gray-900">
                  {l.name}{" "}
                  <span className="text-[11px] font-semibold text-gray-400">
                    {lc ? `${lc.teams.length} clubs` : "not loaded"}
                    {lc?.manual ? " · edited by you" : ""}
                  </span>
                </p>
                {!isEditing ? (
                  <button
                    onClick={() => {
                      setEditing(l.key);
                      setDraft((lc?.teams || []).join("\n"));
                    }}
                    className="text-[11px] font-bold text-violet-700 hover:underline"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await post(
                          { action: "save", league: l.key, teams: draft.split("\n") },
                          `${l.name} list saved.`
                        );
                        setEditing(null);
                      }}
                      disabled={busy}
                      className="text-[11px] font-bold text-emerald-700 hover:underline"
                    >
                      Save
                    </button>
                    <button onClick={() => setEditing(null)} className="text-[11px] font-bold text-gray-500 hover:underline">
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {isEditing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={10}
                  className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-[12px] font-mono"
                  placeholder="One club per line, spelled as in the fixtures"
                />
              ) : (
                <p className="text-[11.5px] text-gray-600 leading-relaxed">{lc?.teams.join(", ") || "—"}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
