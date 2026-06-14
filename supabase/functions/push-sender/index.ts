import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const WC_URL = "https://xellnetwork.xyz/api/world-cup";
const WC_TOPICS = ["football", "football:world-cup"];
const SOON_MIN = 15; // "starting soon" window, in minutes before kick-off

type AlertKey = "startingSoon" | "kickoff" | "goal" | "halftime" | "fulltime";
const DEFAULT_ALERTS: Record<AlertKey, boolean> = {
  startingSoon: true, kickoff: true, goal: true, halftime: false, fulltime: true,
};

type Prefs = { wcAll?: boolean; countries?: string[]; alerts?: Partial<Record<AlertKey, boolean>> };
type Sub = { endpoint: string; p256dh: string; auth: string; topics: string[]; prefs: Prefs };
type Fixture = {
  home: { name: string; country?: string };
  away: { name: string; country?: string };
  status?: string;
  period?: string;
  date?: number;
  home_score: number | null;
  away_score: number | null;
  minute: number | null;
};
type State = { total: number; live: boolean; finished: boolean; startsoon_sent: boolean; halftime_sent: boolean };

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TEAM_ALIASES: Record<string, string> = {
  southkorea: "korearepublic", korea: "korearepublic",
  usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands",
};
const canon = (x: string) => { const n = norm(x); return TEAM_ALIASES[n] || n; };
const keyOf = (f: Fixture) => `wc:${norm(f.home.name)}|${norm(f.away.name)}`;

const isFinished = (status?: string) =>
  /finish|ended|fulltime|aftertime|aet|penalt|final|\bft\b/.test((status || "").toLowerCase());
const isHalftimeSignal = (f: Fixture) =>
  /half[\s-]?time|\bht\b|interval/i.test(`${f.period || ""} ${f.status || ""}`);

function classify(f: Fixture) {
  const hasScore = f.home_score !== null && f.home_score !== undefined;
  const ns = (f.status || "").toLowerCase().replace(/[^a-z]/g, "");
  const finished = isFinished(f.status);
  const notLiveStatus = ns === "notstarted" || ns === "scheduled" || ns === "ns" || ns === "";
  const live = hasScore && !finished && !notLiveStatus;
  const total = (f.home_score || 0) + (f.away_score || 0);
  return { hasScore, finished, live, total };
}

async function loadVapid(): Promise<void> {
  const { data } = await supabase.from("site_settings").select("value").eq("key", "push_keys").maybeSingle();
  const v = data?.value as { publicKey?: string; privateKey?: string; subject?: string } | undefined;
  if (!v?.publicKey || !v?.privateKey) throw new Error("missing vapid keys");
  webpush.setVapidDetails(v.subject ?? "mailto:admin@primepitch", v.publicKey, v.privateKey);
}

async function sendTo(sub: Sub, payload: string): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
    console.error("send failed", code, (err as Error)?.message);
    return false;
  }
}

function parsePrefs(sub: Sub): { wcAll: boolean; countries: string[]; alerts: Record<AlertKey, boolean> } {
  const p = (sub.prefs && typeof sub.prefs === "object" ? sub.prefs : {}) as Prefs;
  const hasPrefs = "wcAll" in p || Array.isArray(p.countries) || (p.alerts != null && typeof p.alerts === "object");
  if (!hasPrefs) {
    // Legacy subscribers (topic-based) → treat as "whole World Cup" with default alerts.
    const wcAll = !sub.topics || sub.topics.length === 0 || sub.topics.some((t) => WC_TOPICS.includes(t));
    return { wcAll, countries: [], alerts: { ...DEFAULT_ALERTS } };
  }
  return {
    wcAll: p.wcAll === true,
    countries: Array.isArray(p.countries) ? p.countries.filter((c): c is string => typeof c === "string") : [],
    alerts: { ...DEFAULT_ALERTS, ...(p.alerts || {}) },
  };
}

type Ev = { kind: AlertKey; title: string; body: string; tag: string; countries: string[] };

function buildEvents(f: Fixture, prev: State | undefined, coldStart: boolean, now: number): { events: Ev[]; startsoon: boolean; halftime: boolean } {
  const c = classify(f);
  const key = keyOf(f);
  const home = f.home.name, away = f.away.name;
  const cs = [canon(f.home.country || home), canon(f.away.country || away)];
  const mins = f.date ? (f.date - now) / 60000 : NaN;
  const soonWindow = Number.isFinite(mins) && mins <= SOON_MIN && mins > 0;
  const notStarted = !c.live && !c.finished;
  const events: Ev[] = [];
  let startsoon = prev?.startsoon_sent ?? false;
  let halftime = prev?.halftime_sent ?? false;
  const score = `${f.home_score ?? 0}\u2013${f.away_score ?? 0}`;

  if (!coldStart) {
    // STARTING SOON
    if (notStarted && soonWindow && !startsoon) {
      const m = Math.max(1, Math.round(mins));
      events.push({ kind: "startingSoon", title: "Starting soon", body: `${home} vs ${away} kicks off in ${m} min`, tag: `pp-soon-${key}`, countries: cs });
      startsoon = true;
    }
    // KICKOFF (transition into live)
    if (c.live && (!prev || !prev.live)) {
      events.push({ kind: "kickoff", title: "Kick-off", body: `${home} vs ${away} is under way`, tag: `pp-kickoff-${key}`, countries: cs });
    } else if (c.live && prev && prev.live && c.total > prev.total) {
      // GOAL
      const min = f.minute ? ` (${f.minute}')` : "";
      events.push({ kind: "goal", title: "Goal", body: `${home} ${score} ${away}${min}`, tag: `pp-goal-${key}-${c.total}`, countries: cs });
    }
    // HALF-TIME (independent; best-effort on feed signal)
    if (c.live && isHalftimeSignal(f) && !halftime) {
      events.push({ kind: "halftime", title: "Half-time", body: `${home} ${score} ${away}`, tag: `pp-ht-${key}`, countries: cs });
      halftime = true;
    }
    // FULL-TIME (only for matches we actually saw live)
    if (c.finished && prev && prev.live) {
      events.push({ kind: "fulltime", title: "Full-time", body: `${home} ${score} ${away}`, tag: `pp-ft-${key}`, countries: cs });
    }
  } else {
    // Cold start: seed flags so we don't fire for matches already past these points.
    if (notStarted && soonWindow) startsoon = true;
    if (c.live && isHalftimeSignal(f)) halftime = true;
  }
  return { events, startsoon, halftime };
}

Deno.serve(async (req: Request) => {
  const mode = new URL(req.url).searchParams.get("mode") ?? "run";
  const now = Date.now();
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

  try {
    await loadVapid();
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  const { data: subRows } = await supabase.from("push_subscriptions").select("endpoint, p256dh, auth, topics, prefs");
  const subs = (subRows ?? []) as Sub[];

  if (mode === "test") {
    const payload = JSON.stringify({
      title: "PrimePitch", body: "Test alert \u2014 delivery works.",
      url: "/", icon: "/icon-192.png", badge: "/icon-192.png",
      actions: [{ action: "open", title: "Open PrimePitch" }], tag: "pp-test",
    });
    let ok = 0;
    for (const s of subs) if (await sendTo(s, payload)) ok++;
    return json({ mode, subscribers: subs.length, sent: ok });
  }

  // Cost guard: nobody subscribed at all → don't even poll for scores.
  if (mode === "run" && subs.length === 0) {
    return json({ mode, skipped: "no subscribers", polled: false });
  }

  let fixtures: Fixture[] = [];
  try {
    const res = await fetch(WC_URL, { headers: { "User-Agent": "primepitch-watcher" } });
    const data = await res.json();
    fixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  } catch (e) {
    return json({ error: "wc fetch failed: " + String(e) }, 502);
  }

  const { data: stateRows } = await supabase
    .from("push_match_state")
    .select("match_key, total, live, finished, startsoon_sent, halftime_sent");
  const state = new Map<string, State>();
  for (const r of stateRows ?? [])
    state.set(r.match_key, { total: r.total, live: r.live, finished: r.finished, startsoon_sent: r.startsoon_sent, halftime_sent: r.halftime_sent });
  const coldStart = state.size === 0;

  const allEvents: Ev[] = [];
  const upserts: Array<Record<string, unknown>> = [];
  const seen: Array<{ key: string; status?: string; score: string; kinds: string[] }> = [];

  for (const f of fixtures) {
    const c = classify(f);
    const key = keyOf(f);
    const prev = state.get(key);
    const mins = f.date ? (f.date - now) / 60000 : NaN;
    const soonWindow = Number.isFinite(mins) && mins <= SOON_MIN && mins > 0;
    const notStarted = !c.live && !c.finished;
    const relevant = c.live || c.finished || (notStarted && soonWindow);
    if (!relevant) continue;

    const { events, startsoon, halftime } = buildEvents(f, prev, coldStart, now);
    for (const ev of events) allEvents.push(ev);
    seen.push({ key, status: f.status, score: `${f.home_score ?? "-"}-${f.away_score ?? "-"}`, kinds: events.map((e) => e.kind) });

    upserts.push({
      match_key: key,
      total: c.total,
      live: c.live,
      finished: c.finished || (prev?.finished ?? false),
      startsoon_sent: startsoon,
      halftime_sent: halftime,
      home_team: f.home.name,
      away_team: f.away.name,
      updated_at: new Date().toISOString(),
    });
  }

  if (mode === "inspect") {
    return json({ mode, coldStart, subscribers: subs.length, tracked: upserts.length, events: allEvents, seen });
  }

  if (upserts.length > 0) await supabase.from("push_match_state").upsert(upserts, { onConflict: "match_key" });

  let sent = 0;
  if (!coldStart) {
    const parsed = subs.map((s) => ({ s, p: parsePrefs(s) }));
    for (const ev of allEvents) {
      const payload = JSON.stringify({
        title: ev.title, body: ev.body, url: "/",
        icon: "/icon-192.png", badge: "/icon-192.png",
        actions: [{ action: "open", title: "Open PrimePitch" }], tag: ev.tag,
      });
      const okEps: string[] = [];
      for (const { s, p } of parsed) {
        if (!p.alerts[ev.kind]) continue;
        const inScope = p.wcAll || ev.countries.some((c) => new Set(p.countries.map(canon)).has(c));
        if (!inScope) continue;
        if (await sendTo(s, payload)) { sent++; okEps.push(s.endpoint); }
      }
      if (okEps.length > 0) {
        try { await supabase.rpc("bump_sent", { eps: okEps }); } catch (e) { console.error("bump_sent failed", (e as Error)?.message); }
      }
    }
  }
  return json({ mode, coldStart, detected: allEvents.length, sent, tracked: upserts.length });
});
