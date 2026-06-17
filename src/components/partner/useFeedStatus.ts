"use client";

import { useCallback, useEffect, useState } from "react";
import { getAllMatches, getMatchStatus } from "@/lib/api";
import { normTitle } from "@/lib/match-merge";

export type FeedStatus = "live" | "upcoming" | "ended";

export function matchTitleFromId(matchId: string): string {
  return matchId.split("--").pop()?.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || matchId;
}

// Mirrors the main admin Pulse/Overview: pull the live fixture feed and resolve
// each active match_id to live / upcoming / ended (null = custom/unknown).
export function useFeedStatus() {
  const [feedStatus, setFeedStatus] = useState<Record<string, FeedStatus> | null>(null);
  const [titleStatus, setTitleStatus] = useState<Record<string, FeedStatus> | null>(null);

  useEffect(() => {
    let on = true;
    const load = () =>
      getAllMatches()
        .then((ms) => {
          if (!on) return;
          const map: Record<string, FeedStatus> = {};
          const tmap: Record<string, FeedStatus> = {};
          const RANK = { live: 0, upcoming: 1, ended: 2 } as const;
          for (const m of ms) {
            const st = getMatchStatus(m);
            map[String(m.id)] = st;
            const tk = normTitle(m.title);
            if (!tmap[tk] || RANK[st] < RANK[tmap[tk]]) tmap[tk] = st;
          }
          setFeedStatus(map);
          setTitleStatus(tmap);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => { on = false; clearInterval(t); };
  }, []);

  const rowStatus = useCallback(
    (matchId: string, title?: string): FeedStatus | null => {
      if (!feedStatus) return null;
      const parts = matchId.split("--");
      const feedId = parts.length > 1 ? parts.slice(1).join("--") : matchId;
      if (feedStatus[feedId]) return feedStatus[feedId];
      const base = normTitle((title || matchTitleFromId(matchId)).replace(/\([^)]*\)/g, " "));
      if (titleStatus?.[base]) return titleStatus[base];
      const byTitle = titleStatus?.[normTitle(matchTitleFromId(matchId))];
      if (byTitle) return byTitle;
      const isCustom = parts[0] === "admin" || /^(live-)?event/i.test(parts[0]) || parts.length === 1;
      return isCustom ? null : "ended";
    },
    [feedStatus, titleStatus],
  );

  return { rowStatus, ready: feedStatus !== null };
}
