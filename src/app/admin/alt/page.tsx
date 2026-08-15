"use client";

import { useEffect, useState } from "react";
import { ProMatch } from "@/app/(public)/alt/page";
import MatchNoticeModal from "@/components/admin/MatchNoticeModal";
import AutoLivePanel from "@/components/admin/AutoLivePanel";

interface FlagRow {
  match_id: string;
  alt_visible?: boolean;
  force_ended?: boolean;
  custom_notice?: string;
}

const timeLabel = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

// Distinct kickoff times (with counts) for the tap-to-filter chip rows
function timeChips(items: { ms: number }[]) {
  const counts = new Map<string, { ms: number; n: number }>();
  for (const it of items) {
    if (!it.ms) continue;
    const label = timeLabel(it.ms);
    const cur = counts.get(label);
    if (cur) cur.n++;
    else counts.set(label, { ms: it.ms, n: 1 });
  }
  return [...counts.entries()]
    .sort((a, b) => a[1].ms - b[1].ms)
    .map(([label, v]) => ({ label, count: v.n }));
}

function TimeChipRow({
  chips,
  active,
  onPick,
}: {
  chips: { label: string; count: number }[];
  active: string | null;
  onPick: (label: string | null) => void;
}) {
  if (chips.length < 2) return null;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      <button
        onClick={() => onPick(null)}
        className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
          active === null ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
        }`}
      >
        All times
      </button>
      {chips.map((c) => (
        <button
          key={c.label}
          onClick={() => onPick(active === c.label ? null : c.label)}
          className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
            active === c.label ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          {c.label} ({c.count})
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-full transition-colors shrink-0 ${on ? "bg-emerald-500" : "bg-gray-300"}`}
      style={{ width: 36, height: 20 }}
    >
      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function AdminAltMatchesPage() {
  const [matches, setMatches] = useState<ProMatch[]>([]);
  const [bsdFixtures, setBsdFixtures] = useState<any[]>([]);
  const [flags, setFlags] = useState<Record<string, FlagRow>>({});
  const [loading, setLoading] = useState(true);
  const [bsdDate, setBsdDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loadingBsd, setLoadingBsd] = useState(false);
  
  const [autoFetch, setAutoFetch] = useState(true);
  const [cacheMinutes, setCacheMinutes] = useState(30);
  const [globalNotice, setGlobalNotice] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidatingLive, setRevalidatingLive] = useState(false);
  
  const [activeNoticeMatch, setActiveNoticeMatch] = useState<ProMatch | null>(null);

  const [bsdSearchQuery, setBsdSearchQuery] = useState("");
  const [rapidSearchQuery, setRapidSearchQuery] = useState("");
  const [pageToFetch, setPageToFetch] = useState(2);
  const [bsdTimeFilter, setBsdTimeFilter] = useState<string | null>(null);
  const [rapidTimeFilter, setRapidTimeFilter] = useState<string | null>(null);
  const [bsdSelectedOnly, setBsdSelectedOnly] = useState(false);

  const TABS = [
    { id: "robot", label: "🤖 Robot" },
    { id: "picker", label: "📅 Picker" },
    { id: "upcoming", label: "📋 Upcoming" },
    { id: "streams", label: "📡 Streams" },
    { id: "settings", label: "⚙️ Settings" },
  ] as const;
  const [tab, setTab] = useState<string>("robot");
  useEffect(() => {
    const saved = localStorage.getItem("alt_admin_tab");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of the saved tab
    if (saved && TABS.some((t) => t.id === saved)) setTab(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function switchTab(id: string) {
    setTab(id);
    try {
      localStorage.setItem("alt_admin_tab", id);
    } catch {
      /* private mode */
    }
  }

  async function loadData() {
    try {
      const [matchesRes, flagsRes, configRes] = await Promise.all([
        fetch("/api/pro-matches"),
        fetch("/api/admin/match-flags"),
        fetch("/api/admin/alt-config")
      ]);
      
      const data = await matchesRes.json();
      let matchList: ProMatch[] = [];
      if (Array.isArray(data)) matchList = data;
      else if (data && Array.isArray(data.matches)) matchList = data.matches;
      else if (data && Array.isArray(data.data)) matchList = data.data;
      else if (data && Array.isArray(data.results)) matchList = data.results;
      
      setMatches(matchList);

      const flagsData = await flagsRes.json();
      const flagsMap: Record<string, FlagRow> = {};
      if (Array.isArray(flagsData.flags)) {
        for (const f of flagsData.flags) {
          flagsMap[f.match_id] = f;
        }
      }
      setFlags(flagsMap);

      const configData = await configRes.json();
      setAutoFetch(configData.auto_fetch ?? true);
      setCacheMinutes(configData.cache_minutes ?? 30);
      setGlobalNotice(configData.global_notice || "");
      
      await loadBsdFixtures(bsdDate);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  }

  async function loadBsdFixtures(date: string) {
    setLoadingBsd(true);
    try {
      const res = await fetch(`/api/admin/bsd-fixtures?date=${date}`);
      const data = await res.json();
      setBsdFixtures(data.fixtures || []);
    } catch (e) {
      console.error("Failed to load BSD fixtures:", e);
    } finally {
      setLoadingBsd(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- setState runs after await, not synchronously
    loadData();
  }, []);

  useEffect(() => {
    if (!loading) {
      loadBsdFixtures(bsdDate);
    }
  }, [bsdDate]);

  async function saveConfig(newAutoFetch: boolean, newCacheMinutes: number, newGlobalNotice: string) {
    setSavingConfig(true);
    try {
      await fetch("/api/admin/alt-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_fetch: newAutoFetch, cache_minutes: newCacheMinutes, global_notice: newGlobalNotice })
      });
      setAutoFetch(newAutoFetch);
      setCacheMinutes(newCacheMinutes);
      setGlobalNotice(newGlobalNotice);
    } catch (e) {
      console.error("Failed to save config:", e);
    } finally {
      setSavingConfig(false);
    }
  }

  async function triggerManualRevalidate() {
    setRevalidating(true);
    try {
      await fetch("/api/admin/alt-config/revalidate", { method: "POST" });
      setLoading(true);
      await loadData();
    } catch (e) {
      console.error("Failed to revalidate:", e);
    } finally {
      setRevalidating(false);
    }
  }

  async function triggerManualRevalidateLive(page = 1) {
    setRevalidatingLive(true);
    try {
      await fetch(`/api/admin/alt-config/revalidate-live?page=${page}`, { method: "POST" });
      setLoading(true);
      await loadData();
    } catch (e) {
      console.error("Failed to revalidate live:", e);
    } finally {
      setRevalidatingLive(false);
    }
  }

  async function toggleVisible(match: ProMatch) {
    const matchId = `alt-${match.home_team_name.replace(/\s+/g, '')}-${match.away_team_name.replace(/\s+/g, '')}-${match.match_time}`;
    const currentVisible = flags[matchId]?.alt_visible || false;
    const nextVisible = !currentVisible;

    setFlags(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], match_id: matchId, alt_visible: nextVisible }
    }));

    try {
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          alt_visible: nextVisible,
          match_data: { 
            title: `${match.home_team_name} vs ${match.away_team_name}`,
            category: match.league_name
          }
        }),
      });
    } catch (e) {
      setFlags(prev => ({
        ...prev,
        [matchId]: { ...prev[matchId], match_id: matchId, alt_visible: currentVisible }
      }));
    }
  }

  async function toggleBsdVisible(fixture: any) {
    const matchId = `bsd-${fixture.id}`;
    const currentVisible = flags[matchId]?.alt_visible || false;
    const nextVisible = !currentVisible;

    setFlags(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], match_id: matchId, alt_visible: nextVisible }
    }));

    try {
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          alt_visible: nextVisible,
          match_data: { 
            is_mock: true,
            title: `${fixture.home_team} vs ${fixture.away_team}`,
            category: fixture.league?.name || "Football",
            home_team_name: fixture.home_team,
            away_team_name: fixture.away_team,
            match_time: Math.floor(new Date(fixture.event_date).getTime() / 1000).toString(),
            home_team_logo: null,
            away_team_logo: null,
          }
        }),
      });
    } catch (e) {
      setFlags(prev => ({
        ...prev,
        [matchId]: { ...prev[matchId], match_id: matchId, alt_visible: currentVisible }
      }));
    }
  }

  async function toggleForceEnded(match: ProMatch) {
    const matchId = `alt-${match.home_team_name.replace(/\s+/g, '')}-${match.away_team_name.replace(/\s+/g, '')}-${match.match_time}`;
    const currentEnded = flags[matchId]?.force_ended || false;
    const nextEnded = !currentEnded;

    setFlags(prev => ({
      ...prev,
      [matchId]: { ...prev[matchId], match_id: matchId, force_ended: nextEnded }
    }));

    try {
      await fetch("/api/admin/match-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          match_id: matchId,
          force_ended: nextEnded,
          match_data: { 
            title: `${match.home_team_name} vs ${match.away_team_name}`,
            category: match.league_name
          }
        }),
      });
    } catch (e) {
      setFlags(prev => ({
        ...prev,
        [matchId]: { ...prev[matchId], match_id: matchId, force_ended: currentEnded }
      }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Filter matches by search query
  const filteredRapidMatches = matches.filter(match => {
    if (rapidTimeFilter && timeLabel(Number(match.match_time) * 1000) !== rapidTimeFilter) return false;
    if (!rapidSearchQuery) return true;
    const q = rapidSearchQuery.toLowerCase();
    return (
      match.home_team_name?.toLowerCase().includes(q) ||
      match.away_team_name?.toLowerCase().includes(q) ||
      match.league_name?.toLowerCase().includes(q)
    );
  });
  const rapidChips = timeChips(matches.map((m) => ({ ms: Number(m.match_time) * 1000 })));

  // Group matches by day
  const matchesByDay = filteredRapidMatches.reduce((acc, match) => {
    const date = new Date(Number(match.match_time) * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(match);
    return acc;
  }, {} as Record<string, ProMatch[]>);

  // Sort dates so today is first
  const sortedDates = Object.keys(matchesByDay).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Filter BSD fixtures
  const bsdSelectedCount = bsdFixtures.filter((f) => flags[`bsd-${f.id}`]?.alt_visible).length;
  const filteredBsdFixtures = bsdFixtures.filter(fixture => {
    if (bsdSelectedOnly && !flags[`bsd-${fixture.id}`]?.alt_visible) return false;
    if (bsdTimeFilter && timeLabel(new Date(fixture.event_date).getTime()) !== bsdTimeFilter) return false;
    if (!bsdSearchQuery) return true;
    const q = bsdSearchQuery.toLowerCase();
    return (
      fixture.home_team?.toLowerCase().includes(q) ||
      fixture.away_team?.toLowerCase().includes(q) ||
      fixture.league?.name?.toLowerCase().includes(q)
    );
  });
  const bsdChips = timeChips(bsdFixtures.map((f) => ({ ms: new Date(f.event_date).getTime() })));

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="sticky top-0 z-20 -mx-2 px-2 py-2 bg-gray-50/95 backdrop-blur border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              className={`px-4 py-2 rounded-full text-[13px] font-bold whitespace-nowrap transition-colors ${
                tab === t.id
                  ? "bg-gray-900 text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "robot" && <AutoLivePanel section="robot" />}
      {tab === "picker" && <AutoLivePanel section="picker" />}

      {/* BSD Upcoming Fixtures Section */}
      {tab === "upcoming" && (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Upcoming Fixtures (BSD API)</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Browse upcoming matches for any date. Make them &quot;Visible&quot; to add them to your public site before they go live!
          </p>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-[14px] font-bold text-gray-900">Select Date</h2>
            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <input 
                type="text"
                placeholder="Search teams or leagues..."
                value={bsdSearchQuery}
                onChange={(e) => setBsdSearchQuery(e.target.value)}
                className="w-full sm:w-64 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
              <input 
                type="date"
                value={bsdDate}
                onChange={(e) => setBsdDate(e.target.value)}
                className="w-full sm:w-auto px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setBsdSelectedOnly(false)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
                !bsdSelectedOnly ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All fixtures ({bsdFixtures.length})
            </button>
            <button
              onClick={() => setBsdSelectedOnly(true)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-colors ${
                bsdSelectedOnly ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              ✓ Selected for alt ({bsdSelectedCount})
            </button>
          </div>

          <TimeChipRow chips={bsdChips} active={bsdTimeFilter} onPick={setBsdTimeFilter} />

          <div className="pt-3 border-t border-gray-100">
            {loadingBsd ? (
              <div className="text-center py-8 text-sm text-gray-500">Loading fixtures...</div>
            ) : filteredBsdFixtures.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No fixtures found.</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-2">
                {filteredBsdFixtures.map((fixture) => {
                  const matchId = `bsd-${fixture.id}`;
                  const isVisible = flags[matchId]?.alt_visible || false;
                  const time = new Date(fixture.event_date).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  
                  return (
                    <div key={fixture.id} className={`py-3 flex items-center justify-between transition-colors ${isVisible ? "bg-emerald-50/30" : "hover:bg-gray-50"}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-[14px] font-bold text-gray-900 line-clamp-2 mb-1">
                          {fixture.home_team} vs {fixture.away_team}
                        </div>
                        <div className="text-[12px] text-gray-500 flex items-center gap-2">
                          <span>{fixture.league?.name || "Football"}</span>
                          <span>&bull;</span>
                          <span>{time}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <label className="flex flex-col items-center gap-1 cursor-pointer">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isVisible ? "text-emerald-600" : "text-gray-400"}`}>Make Active</span>
                          <Toggle on={isVisible} onClick={() => toggleBsdVisible(fixture)} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      )}

      {/* RapidAPI Live Streams Section */}
      {tab === "streams" && (
      <>
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Live Streams (RapidAPI)</h1>
            <p className="text-[13px] text-gray-500 mt-1">
              Manage the actual streams from the RapidAPI feed. Use &quot;Update Live (1 Request)&quot; when a match is starting to grab the stream link.
            </p>
          </div>
          <input
            type="text"
            placeholder="Search teams or leagues..."
            value={rapidSearchQuery}
            onChange={(e) => setRapidSearchQuery(e.target.value)}
            className="w-full md:w-72 px-3 py-2 border border-gray-200 rounded-lg text-sm"
          />
        </div>

        <TimeChipRow chips={rapidChips} active={rapidTimeFilter} onPick={setRapidTimeFilter} />

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[14px] font-bold text-gray-900">Feed Actions</h2>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-gray-700">Manual Refresh</span>
            <span className="text-[11px] text-gray-500">Instantly fetch fresh matches from the API exactly once</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => triggerManualRevalidateLive(1)}
              disabled={revalidating || revalidatingLive}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {revalidatingLive ? "Fetching..." : "Update Live (1 Request)"}
            </button>
            <div className="flex items-center gap-1.5">
              <select
                value={pageToFetch}
                onChange={(e) => setPageToFetch(Number(e.target.value))}
                className="px-2 py-2 border border-gray-200 rounded-lg text-[12px] font-bold text-gray-700 bg-white"
              >
                {[2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>Page {p}</option>
                ))}
              </select>
              <button
                onClick={() => triggerManualRevalidateLive(pageToFetch)}
                disabled={revalidating || revalidatingLive}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-bold rounded-lg disabled:opacity-50 transition-colors"
              >
                {revalidatingLive ? "Fetching..." : `Fetch Page ${pageToFetch} (1 Request)`}
              </button>
            </div>
            <button 
              onClick={triggerManualRevalidate}
              disabled={revalidating || revalidatingLive}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-900 text-white text-[12px] font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {revalidating ? "Fetching..." : "Fetch All (5 Requests)"}
            </button>
          </div>
        </div>
      </div>
      </div>

      {sortedDates.length === 0 ? (
        <div className="text-center py-16 bg-white border border-gray-200 rounded-2xl">
          <p className="text-gray-500">No alternative matches available right now.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(date => (
            <div key={date} className="space-y-3">
              <h3 className="text-sm font-black text-gray-400 uppercase tracking-wider pl-2">{date}</h3>
              <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {matchesByDay[date].map((match, i) => {
                  const matchId = `alt-${match.home_team_name.replace(/\s+/g, '')}-${match.away_team_name.replace(/\s+/g, '')}-${match.match_time}`;
                  const isVisible = flags[matchId]?.alt_visible || false;
                  const time = new Date(Number(match.match_time) * 1000).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

                  return (
                    <div key={i} className={`p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-colors ${isVisible ? "bg-emerald-50/30" : "hover:bg-gray-50"}`}>
                      <div className="flex-1 min-w-0 sm:pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[14px] font-bold text-gray-900 line-clamp-2">
                            {match.home_team_name} vs {match.away_team_name}
                          </span>
                          {match.match_status === "live" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 uppercase tracking-wider shrink-0">Live</span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wider shrink-0">Upcoming</span>
                          )}
                        </div>
                        <div className="text-[12px] text-gray-500 flex items-center gap-2">
                          <span>{match.league_name}</span>
                          <span>&bull;</span>
                          <span>{time}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <label className="flex flex-col items-center gap-1 cursor-pointer">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${flags[matchId]?.custom_notice ? "text-emerald-600" : "text-gray-400"}`}>Notice</span>
                          <button
                            onClick={() => setActiveNoticeMatch(match)}
                            className={`p-1.5 rounded-lg border transition-colors ${flags[matchId]?.custom_notice ? "bg-emerald-50 border-emerald-200 text-emerald-600" : "bg-white border-gray-200 text-gray-400 hover:text-gray-600"}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                            </svg>
                          </button>
                        </label>
                        <label className="flex flex-col items-center gap-1 cursor-pointer">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${isVisible ? "text-emerald-600" : "text-gray-400"}`}>Visible</span>
                          <Toggle on={isVisible} onClick={() => toggleVisible(match)} />
                        </label>
                        <label className="flex flex-col items-center gap-1 cursor-pointer">
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${flags[matchId]?.force_ended ? "text-red-500" : "text-gray-400"}`}>Force End</span>
                          <Toggle on={flags[matchId]?.force_ended || false} onClick={() => toggleForceEnded(match)} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}

      {/* Settings */}
      {tab === "settings" && (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">⚙️ Settings</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Cache behavior and the notice shown on the public alt page.
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-semibold text-gray-700">Auto Fetch</span>
              <span className="text-[11px] text-gray-500">Automatically request new matches in the background</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-gray-500">{autoFetch ? "ON" : "OFF"}</span>
              <Toggle on={autoFetch} onClick={() => saveConfig(!autoFetch, cacheMinutes, globalNotice)} />
            </div>
          </div>

          {autoFetch && (
            <div className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t border-gray-100">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-gray-700">Cache Duration (Minutes)</span>
                <span className="text-[11px] text-gray-500">How long to wait before automatically fetching again</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={cacheMinutes}
                  onChange={(e) => setCacheMinutes(Number(e.target.value) || 1)}
                  className="w-20 px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                />
                <button
                  onClick={() => saveConfig(autoFetch, cacheMinutes, globalNotice)}
                  disabled={savingConfig}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-bold rounded-lg disabled:opacity-50"
                >
                  {savingConfig ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100">
            <div className="flex flex-col gap-1 mb-2">
              <span className="text-[13px] font-semibold text-gray-700">Global Notice Text (Alt Page)</span>
              <span className="text-[11px] text-gray-500">Custom message displayed at the top of the public Alternative Matches page</span>
            </div>
            <div className="flex items-start gap-2">
              <textarea
                rows={2}
                value={globalNotice}
                onChange={(e) => setGlobalNotice(e.target.value)}
                placeholder="e.g., We are currently experiencing issues with server 1, please use server 2..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y"
              />
              <button
                onClick={() => saveConfig(autoFetch, cacheMinutes, globalNotice)}
                disabled={savingConfig}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-[12px] font-bold rounded-lg disabled:opacity-50 shrink-0 mt-1"
              >
                {savingConfig ? "Saving..." : "Save Notice"}
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {activeNoticeMatch && (
        <MatchNoticeModal
          matchId={`alt-${activeNoticeMatch.home_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.away_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.match_time}`}
          matchTitle={`${activeNoticeMatch.home_team_name} vs ${activeNoticeMatch.away_team_name}`}
          matchData={{
            title: `${activeNoticeMatch.home_team_name} vs ${activeNoticeMatch.away_team_name}`,
            category: activeNoticeMatch.league_name
          }}
          currentNotice={flags[`alt-${activeNoticeMatch.home_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.away_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.match_time}`]?.custom_notice || ""}
          onClose={() => setActiveNoticeMatch(null)}
          onSaved={(newNotice) => {
            const mId = `alt-${activeNoticeMatch.home_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.away_team_name.replace(/\\s+/g, '')}-${activeNoticeMatch.match_time}`;
            setFlags(prev => ({
              ...prev,
              [mId]: { ...prev[mId], match_id: mId, custom_notice: newNotice || undefined }
            }));
          }}
        />
      )}
    </div>
  );
}
