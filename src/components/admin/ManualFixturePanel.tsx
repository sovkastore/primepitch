"use client";

import { useEffect, useState } from "react";

interface ManualFixture {
  match_id: string;
  alt_visible: boolean;
  title?: string;
  category?: string;
  home_team_name?: string;
  away_team_name?: string;
  match_time?: string;
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full transition-colors shrink-0 ${on ? "bg-emerald-500" : "bg-gray-300"}`}
      style={{ width: 36, height: 20 }}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export default function ManualFixturePanel() {
  const [fixtures, setFixtures] = useState<ManualFixture[]>([]);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [league, setLeague] = useState("");
  const [kickoffLocal, setKickoffLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");

  async function loadFixtures() {
    try {
      const res = await fetch("/api/admin/manual-fixture");
      const data = await res.json();
      setFixtures(data.fixtures || []);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after await, not synchronously
    loadFixtures();
  }, []);

  async function addFixture() {
    if (!home.trim() || !away.trim() || !kickoffLocal) {
      setNote("Fill in both teams and the kickoff time");
      return;
    }
    setSaving(true);
    setNote("");
    try {
      const kickoff = Math.floor(new Date(kickoffLocal).getTime() / 1000);
      const res = await fetch("/api/admin/manual-fixture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home: home.trim(), away: away.trim(), league: league.trim(), kickoff }),
      });
      const data = await res.json();
      if (data.ok) {
        setNote("✓ Added and visible on /alt — the robot takes it live at kickoff");
        setHome("");
        setAway("");
        setLeague("");
        setKickoffLocal("");
        await loadFixtures();
      } else {
        setNote(data.error || "Failed to add");
      }
    } catch {
      setNote("Failed to add — try again");
    } finally {
      setSaving(false);
    }
  }

  async function toggleVisible(f: ManualFixture) {
    await fetch("/api/admin/match-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ match_id: f.match_id, alt_visible: !f.alt_visible }),
    });
    await loadFixtures();
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">✍️ Manual Fixtures</h1>
        <p className="text-[13px] text-gray-500 mt-1">
          For matches the BSD API doesn&apos;t carry (Community Shield, special games). Add the
          teams and kickoff — it shows as upcoming on /alt, and at kickoff the robot scans the
          stream feed and the AI takes it live automatically, same as any other fixture.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            type="text"
            placeholder="Home team (e.g. Arsenal)"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="text"
            placeholder="Away team (e.g. Manchester City)"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="text"
            placeholder="Competition (e.g. Community Shield)"
            value={league}
            onChange={(e) => setLeague(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
          <input
            type="datetime-local"
            value={kickoffLocal}
            onChange={(e) => setKickoffLocal(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>
        <button
          onClick={addFixture}
          disabled={saving}
          className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold rounded-lg disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding…" : "+ Add Fixture"}
        </button>
        {note && <p className="text-[12px] font-semibold text-gray-600">{note}</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
          Your manual fixtures
        </h3>
        {fixtures.length === 0 ? (
          <p className="text-[13px] text-gray-400 py-2">None yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {fixtures.map((f) => (
              <div key={f.match_id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-bold text-gray-900">{f.title}</p>
                  <p className="text-[11px] text-gray-500">
                    {f.category} ·{" "}
                    {f.match_time
                      ? new Date(Number(f.match_time) * 1000).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </p>
                </div>
                <label className="flex flex-col items-center gap-1">
                  <span className={`text-[9px] font-bold uppercase ${f.alt_visible ? "text-emerald-600" : "text-gray-400"}`}>
                    Visible
                  </span>
                  <Toggle on={f.alt_visible} onClick={() => toggleVisible(f)} />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
