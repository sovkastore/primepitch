import webpush from "web-push";

export interface Env {
  DB: D1Database;
}

const WC_URL = "https://primepitchsports.cc/api/world-cup";
const WC_TOPICS = ["football", "football:world-cup"];
const SOON_MIN = 15;

type AlertKey = "startingSoon" | "almostKickoff" | "kickoff" | "goal" | "halftime" | "secondHalf" | "fulltime";
const DEFAULT_ALERTS: Record<AlertKey, boolean> = {
  startingSoon: true, almostKickoff: true, kickoff: true, goal: true, halftime: true, secondHalf: true, fulltime: true,
};
const PER_MATCH_ALERTS = new Set<AlertKey>(["startingSoon", "almostKickoff", "kickoff", "goal", "halftime", "fulltime"]);

type Prefs = { wcAll?: boolean; countries?: string[]; alerts?: Partial<Record<AlertKey, boolean>> };
type Sub = { endpoint: string; p256dh: string; auth: string; topics?: string[]; prefs?: Prefs };
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
type State = { total: number; live: boolean; finished: boolean; startsoon_sent: boolean; almost_sent: boolean; halftime_sent: boolean; secondhalf_sent: boolean; stream_live_sent: boolean };

const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const TEAM_ALIASES: Record<string, string> = {
  southkorea: "korearepublic", korea: "korearepublic",
  usa: "unitedstates", us: "unitedstates", unitedstatesofamerica: "unitedstates",
  ivorycoast: "cotedivoire", czechrepublic: "czechia", holland: "netherlands", turkey: "turkiye",
};
const canon = (x: string) => { const n = norm(x); return TEAM_ALIASES[n] || n; };
const keyOf = (f: Fixture) => `wc:${norm(f.home.name)}|${norm(f.away.name)}`;

const fold = (s: string) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const canonFold = (x: string) => { const n = fold(x); return TEAM_ALIASES[n] || n; };
const teamKeyOf = (f: Fixture) => [canonFold(f.home.name), canonFold(f.away.name)].sort().join("|");

type StreamedEntry = { title?: string; teams?: { home?: { name?: string }; away?: { name?: string } } };
async function fetchStreamedLiveTeamKeys(): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const res = await fetch("https://streamed.pk/api/matches/live", { headers: { "User-Agent": "primepitch-watcher" } });
    if (!res.ok) return keys;
    const data = (await res.json()) as any;
    const list: StreamedEntry[] = Array.isArray(data) ? data : [];
    for (const m of list) {
      let home = m.teams?.home?.name || "";
      let away = m.teams?.away?.name || "";
      if ((!home || !away) && m.title) {
        const parts = m.title.split(/\s+(?:vs|v|-)\s+/i);
        if (parts.length === 2) { home = home || parts[0]; away = away || parts[1]; }
      }
      if (home && away) keys.add([canonFold(home), canonFold(away)].sort().join("|"));
    }
  } catch (e) {
    console.error("streamed live fetch failed", (e as Error)?.message);
  }
  return keys;
}

const isFinished = (status?: string) => /finish|ended|fulltime|aftertime|aet|penalt|final|\bft\b/.test((status || "").toLowerCase());
const isHalftimeSignal = (f: Fixture) => /half[\s-]?time|\bht\b|interval/i.test(`${f.period || ""} ${f.status || ""}`);

function classify(f: Fixture) {
  const hasScore = f.home_score !== null && f.home_score !== undefined;
  const ns = (f.status || "").toLowerCase().replace(/[^a-z]/g, "");
  const finished = isFinished(f.status);
  const notLiveStatus = ns === "notstarted" || ns === "scheduled" || ns === "ns" || ns === "";
  const live = hasScore && !finished && !notLiveStatus;
  const total = (f.home_score || 0) + (f.away_score || 0);
  return { hasScore, finished, live, total };
}

async function loadVapid(env: Env): Promise<void> {
  const { results } = await env.DB.prepare("SELECT value FROM d1_site_settings WHERE key = 'push_keys'").all();
  const row = results[0] as any;
  const v = row?.value ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : undefined;
  if (!v?.publicKey || !v?.privateKey) throw new Error("missing vapid keys");
  webpush.setVapidDetails(v.subject ?? "mailto:admin@primepitch", v.publicKey, v.privateKey);
}

async function sendTo(sub: Sub, payload: string, env: Env): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
    return true;
  } catch (err) {
    const code = (err as { statusCode?: number })?.statusCode;
    if (code === 404 || code === 410) {
      await env.DB.prepare("DELETE FROM d1_push_subscriptions WHERE endpoint = ?").bind(sub.endpoint).all();
    }
    console.error("send failed", code, (err as Error)?.message);
    return false;
  }
}

function parsePrefs(sub: Sub): { wcAll: boolean; countries: string[]; alerts: Record<AlertKey, boolean> } {
  const p = (sub.prefs && typeof sub.prefs === "object" ? sub.prefs : {}) as Prefs;
  const hasPrefs = "wcAll" in p || Array.isArray(p.countries) || (p.alerts != null && typeof p.alerts === "object");
  if (!hasPrefs) {
    const wcAll = !sub.topics || sub.topics.length === 0 || sub.topics.some((t) => WC_TOPICS.includes(t));
    return { wcAll, countries: [], alerts: { ...DEFAULT_ALERTS } };
  }
  return {
    wcAll: p.wcAll === true,
    countries: Array.isArray(p.countries) ? p.countries.filter((c): c is string => typeof c === "string") : [],
    alerts: { ...DEFAULT_ALERTS, ...(p.alerts || {}) },
  };
}

type Ev = { kind: AlertKey; title: string; body: string; tag: string; countries: string[]; teamKey: string };

function buildEvents(f: Fixture, prev: State | undefined, coldStart: boolean, now: number, streamLive: boolean): { events: Ev[]; startsoon: boolean; almost: boolean; halftime: boolean; secondhalf: boolean; streamSent: boolean } {
  const c = classify(f);
  const key = keyOf(f);
  const tk = teamKeyOf(f);
  const home = f.home.name, away = f.away.name;
  const cs = [canon(f.home.country || home), canon(f.away.country || away)];
  const mins = f.date ? (f.date - now) / 60000 : NaN;
  const soonWindow = Number.isFinite(mins) && mins <= SOON_MIN && mins > 0;
  const almostWindow = Number.isFinite(mins) && mins <= 1.5 && mins > 0;
  const notStarted = !c.live && !c.finished;
  const halftimeNow = c.live && isHalftimeSignal(f);
  const events: Ev[] = [];
  let startsoon = prev?.startsoon_sent ?? false;
  let almost = prev?.almost_sent ?? false;
  let halftime = prev?.halftime_sent ?? false;
  let secondhalf = prev?.secondhalf_sent ?? false;
  let streamSent = prev?.stream_live_sent ?? false;
  const score = `${f.home_score ?? 0}–${f.away_score ?? 0}`;

  if (!coldStart) {
    if (notStarted && streamLive && !streamSent) {
      events.push({ kind: "kickoff", title: "🔴 Live now", body: `${home} vs ${away} is live — watch now`, tag: `pp-livenow-${key}`, countries: cs, teamKey: tk });
      streamSent = true;
      almost = true;
    }
    if (notStarted && soonWindow && !startsoon) {
      const m = Math.max(1, Math.round(mins));
      events.push({ kind: "startingSoon", title: "Starting soon", body: `${home} vs ${away} kicks off in ${m} min`, tag: `pp-soon-${key}`, countries: cs, teamKey: tk });
      startsoon = true;
    }
    if (notStarted && almostWindow && !almost) {
      events.push({ kind: "almostKickoff", title: "About to start", body: `${home} vs ${away} kicks off in 1 min`, tag: `pp-almost-${key}`, countries: cs, teamKey: tk });
      almost = true;
    }
    if (c.live && (!prev || !prev.live)) {
      events.push({ kind: "kickoff", title: "Kick-off", body: `${home} vs ${away} is under way`, tag: `pp-kickoff-${key}`, countries: cs, teamKey: tk });
    } else if (c.live && prev && prev.live && c.total > prev.total) {
      const min = f.minute ? ` (${f.minute}')` : "";
      events.push({ kind: "goal", title: "Goal", body: `${home} ${score} ${away}${min}`, tag: `pp-goal-${key}-${c.total}`, countries: cs, teamKey: tk });
    }
    if (halftimeNow && !halftime) {
      events.push({ kind: "halftime", title: "Half-time", body: `${home} ${score} ${away}`, tag: `pp-ht-${key}`, countries: cs, teamKey: tk });
      halftime = true;
    }
    if (c.live && !halftimeNow && halftime && !secondhalf) {
      events.push({ kind: "secondHalf", title: "Second half", body: `Second half under way: ${home} ${score} ${away}`, tag: `pp-2h-${key}`, countries: cs, teamKey: tk });
      secondhalf = true;
    }
    if (c.finished && prev && prev.live) {
      events.push({ kind: "fulltime", title: "Full-time", body: `${home} ${score} ${away}`, tag: `pp-ft-${key}`, countries: cs, teamKey: tk });
    }
  } else {
    if (notStarted && soonWindow) startsoon = true;
    if (notStarted && almostWindow) almost = true;
    if (notStarted && streamLive) streamSent = true;
    if (halftimeNow) halftime = true;
  }
  return { events, startsoon, almost, halftime, secondhalf, streamSent };
}

async function handlePush(env: Env, mode: string): Promise<Response> {
  const now = Date.now();
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

  try {
    await loadVapid(env);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  const { results: subRows } = await env.DB.prepare("SELECT endpoint, p256dh, auth, topics, prefs FROM d1_push_subscriptions").all();
  const subs = (subRows ?? []).map(r => ({
    ...r,
    topics: typeof r.topics === 'string' ? JSON.parse(r.topics) : r.topics,
    prefs: typeof r.prefs === 'string' ? JSON.parse(r.prefs) : r.prefs,
  })) as Sub[];

  const { results: followRows } = await env.DB.prepare("SELECT team_key, endpoint FROM d1_match_follows").all();
  const followsByEp = new Map<string, Set<string>>();
  for (const r of (followRows ?? []) as any[]) {
    const set = followsByEp.get(r.endpoint) ?? new Set<string>();
    set.add(r.team_key);
    followsByEp.set(r.endpoint, set);
  }

  if (mode === "test") {
    const payload = JSON.stringify({
      title: "PrimePitch", body: "Test alert — delivery works.",
      url: "/", icon: "/icon-192.png", badge: "/icon-192.png",
      actions: [{ action: "open", title: "Open PrimePitch" }], tag: "pp-test",
    });
    let ok = 0;
    for (const s of subs) if (await sendTo(s, payload, env)) ok++;
    return json({ mode, subscribers: subs.length, sent: ok });
  }

  if (mode === "run" && subs.length === 0) {
    return json({ mode, skipped: "no subscribers", polled: false });
  }

  let fixtures: Fixture[] = [];
  try {
    const res = await fetch(WC_URL, { headers: { "User-Agent": "primepitch-watcher" } });
    const data = (await res.json()) as any;
    fixtures = Array.isArray(data?.fixtures) ? data.fixtures : [];
  } catch (e) {
    return json({ error: "wc fetch failed: " + String(e) }, 502);
  }

  const { results: stateRows } = await env.DB
    .prepare("SELECT match_key, total, live, finished, startsoon_sent, almost_sent, halftime_sent, secondhalf_sent, stream_live_sent FROM d1_push_match_state")
    .all();
  const state = new Map<string, State>();
  for (const r of (stateRows ?? []) as any[]) {
    state.set(r.match_key, {
      total: r.total, live: Boolean(r.live), finished: Boolean(r.finished),
      startsoon_sent: Boolean(r.startsoon_sent), almost_sent: Boolean(r.almost_sent),
      halftime_sent: Boolean(r.halftime_sent), secondhalf_sent: Boolean(r.secondhalf_sent), stream_live_sent: Boolean(r.stream_live_sent)
    });
  }
  const coldStart = state.size === 0;

  const streamedLiveKeys = await fetchStreamedLiveTeamKeys();

  const allEvents: Ev[] = [];
  const upserts: Array<any> = [];
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

    const within5 = Number.isFinite(mins) && mins <= 5 && mins > 0;
    const streamLive = within5 && streamedLiveKeys.has(teamKeyOf(f));

    const { events, startsoon, almost, halftime, secondhalf, streamSent } = buildEvents(f, prev, coldStart, now, streamLive);
    for (const ev of events) allEvents.push(ev);
    seen.push({ key, status: f.status, score: `${f.home_score ?? "-"}-${f.away_score ?? "-"}`, kinds: events.map((e) => e.kind) });

    upserts.push({
      match_key: key,
      total: c.total,
      live: c.live || streamSent ? 1 : 0,
      finished: c.finished || (prev?.finished ?? false) ? 1 : 0,
      startsoon_sent: startsoon ? 1 : 0,
      almost_sent: almost ? 1 : 0,
      halftime_sent: halftime ? 1 : 0,
      secondhalf_sent: secondhalf ? 1 : 0,
      stream_live_sent: streamSent ? 1 : 0,
      home_team: f.home.name,
      away_team: f.away.name,
      updated_at: new Date().toISOString(),
    });
  }

  if (mode === "inspect") {
    return json({ mode, coldStart, subscribers: subs.length, follows: followsByEp.size, tracked: upserts.length, events: allEvents, seen });
  }

  if (upserts.length > 0) {
    for (const u of upserts) {
      await env.DB.prepare(`
        INSERT INTO d1_push_match_state (match_key, total, live, finished, startsoon_sent, almost_sent, halftime_sent, secondhalf_sent, stream_live_sent, home_team, away_team, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(match_key) DO UPDATE SET
          total = excluded.total, live = excluded.live, finished = excluded.finished,
          startsoon_sent = excluded.startsoon_sent, almost_sent = excluded.almost_sent,
          halftime_sent = excluded.halftime_sent, secondhalf_sent = excluded.secondhalf_sent,
          stream_live_sent = excluded.stream_live_sent, updated_at = excluded.updated_at
      `).bind(
        u.match_key, u.total, u.live, u.finished, u.startsoon_sent, u.almost_sent, u.halftime_sent, u.secondhalf_sent, u.stream_live_sent, u.home_team, u.away_team, u.updated_at
      ).all();
    }
  }

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
        const follows = followsByEp.get(s.endpoint);
        const followsThis = follows ? follows.has(ev.teamKey) : false;
        const broad = p.wcAll || ev.countries.some((c) => new Set(p.countries.map(canon)).has(c));
        const allowByFollow = followsThis && PER_MATCH_ALERTS.has(ev.kind);
        const allowByBroad = broad && p.alerts[ev.kind];
        if (!allowByFollow && !allowByBroad) continue;
        if (await sendTo(s, payload, env)) { sent++; okEps.push(s.endpoint); }
      }
      if (okEps.length > 0) {
        try { 
          // manually simulate bump_sent RPC
          // we can't do an IN clause easily with D1 arrays, so we loop or use JSON functions
          for (const ep of okEps) {
            await env.DB.prepare("UPDATE d1_push_subscriptions SET sent_count = coalesce(sent_count, 0) + 1 WHERE endpoint = ?").bind(ep).all();
          }
        } catch (e) { 
          console.error("bump_sent failed", (e as Error)?.message); 
        }
      }
    }
  }
  return json({ mode, coldStart, detected: allEvents.length, sent, tracked: upserts.length });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const mode = url.searchParams.get("mode") ?? "run";
    return await handlePush(env, mode);
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    await handlePush(env, "run");
  }
};
