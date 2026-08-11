"use client";

import { useEffect, useState } from "react";
import { ProMatch } from "@/app/(public)/alt/page";
import MatchNoticeModal from "@/components/admin/MatchNoticeModal";

interface FlagRow {
  match_id: string;
  alt_visible?: boolean;
  force_ended?: boolean;
  custom_notice?: string;
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

  async function triggerManualRevalidateLive() {
    setRevalidatingLive(true);
    try {
      await fetch("/api/admin/alt-config/revalidate-live", { method: "POST" });
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

  // Group matches by day
  const matchesByDay = matches.reduce((acc, match) => {
    const date = new Date(Number(match.match_time) * 1000).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!acc[date]) acc[date] = [];
    acc[date].push(match);
    return acc;
  }, {} as Record<string, ProMatch[]>);

  // Sort dates so today is first
  const sortedDates = Object.keys(matchesByDay).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return (
    <div className="space-y-10 max-w-5xl">
      {/* BSD Upcoming Fixtures Section */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Upcoming Fixtures (BSD API)</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Browse upcoming matches for any date. Make them "Visible" to add them to your public site before they go live!
          </p>
        </div>
        
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-[14px] font-bold text-gray-900">Select Date</h2>
            <input 
              type="date"
              value={bsdDate}
              onChange={(e) => setBsdDate(e.target.value)}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          
          <div className="pt-3 border-t border-gray-100">
            {loadingBsd ? (
              <div className="text-center py-8 text-sm text-gray-500">Loading fixtures...</div>
            ) : bsdFixtures.length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500">No fixtures found for this date.</div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-2">
                {bsdFixtures.map((fixture) => {
                  const matchId = `bsd-${fixture.id}`;
                  const isVisible = flags[matchId]?.alt_visible || false;
                  const time = new Date(fixture.event_date).toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
                  
                  return (
                    <div key={fixture.id} className={`py-3 flex items-center justify-between transition-colors ${isVisible ? "bg-emerald-50/30" : "hover:bg-gray-50"}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-[14px] font-bold text-gray-900 truncate mb-1">
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

      <hr className="border-gray-200 border-2 rounded" />

      {/* RapidAPI Live Streams Section */}
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Live Streams (RapidAPI)</h1>
          <p className="text-[13px] text-gray-500 mt-1">
            Manage the actual streams from the RapidAPI feed. Use "Update Live (1 Request)" when a match is starting to grab the stream link.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-[14px] font-bold text-gray-900">API Cache Settings</h2>
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

        <div className="flex items-center justify-between gap-4 flex-wrap pt-3 border-t border-gray-100">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-gray-700">Manual Refresh</span>
            <span className="text-[11px] text-gray-500">Instantly fetch fresh matches from the API exactly once</span>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={triggerManualRevalidateLive}
              disabled={revalidating || revalidatingLive}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-[12px] font-bold rounded-lg disabled:opacity-50 transition-colors"
            >
              {revalidatingLive ? "Fetching..." : "Update Live (1 Request)"}
            </button>
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
                    <div key={i} className={`p-4 flex items-center justify-between transition-colors ${isVisible ? "bg-emerald-50/30" : "hover:bg-gray-50"}`}>
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[14px] font-bold text-gray-900 truncate">
                            {match.home_team_name} vs {match.away_team_name}
                          </span>
                          {match.match_status === "live" ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 uppercase tracking-wider">Live</span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 uppercase tracking-wider">Upcoming</span>
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
