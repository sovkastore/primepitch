-- PrimePitch — per-match traction stats: peak concurrent viewers + unique viewers.
-- Piggybacks entirely on existing tracking calls (match-view + heartbeat), so it
-- adds ZERO new Cloudflare requests. Safe to re-run.

-- 1) One row per match.
create table if not exists public.match_stats (
  match_id       text primary key,
  match_title    text,
  sport          text,
  peak_viewers   integer not null default 0,
  peak_at        timestamptz,
  unique_viewers integer not null default 0,
  first_viewed   timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_match_stats_updated on public.match_stats (updated_at desc);

alter table public.match_stats enable row level security;
drop policy if exists "match_stats authenticated read" on public.match_stats;
create policy "match_stats authenticated read" on public.match_stats
  for select to authenticated using (true);

-- 2) Called from /api/track/match-view when a viewer joins a match:
--    upserts the stats row (storing title/sport) and recomputes unique viewers.
create or replace function public.record_match_join(p_match_id text, p_title text, p_sport text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.match_stats (match_id, match_title, sport, unique_viewers, updated_at)
  values (
    p_match_id,
    p_title,
    p_sport,
    (select count(distinct visitor_id)::int from public.match_views where match_id = p_match_id),
    now()
  )
  on conflict (match_id) do update set
    match_title    = coalesce(excluded.match_title, public.match_stats.match_title),
    sport          = coalesce(excluded.sport, public.match_stats.sport),
    unique_viewers = excluded.unique_viewers,
    updated_at     = now();
$$;

-- 3) Called from /api/track/heartbeat while a match is being watched:
--    counts current concurrent viewers (active in the last 6 minutes) and
--    raises the stored peak if this moment is the new high-water mark.
create or replace function public.bump_match_peak(p_match_id text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.match_stats (match_id, peak_viewers, peak_at, updated_at)
  values (
    p_match_id,
    (select count(*)::int from public.active_viewers
      where match_id = p_match_id and last_seen >= now() - interval '6 minutes'),
    now(),
    now()
  )
  on conflict (match_id) do update set
    peak_at      = case when excluded.peak_viewers > public.match_stats.peak_viewers
                        then now() else public.match_stats.peak_at end,
    peak_viewers = greatest(public.match_stats.peak_viewers, excluded.peak_viewers),
    updated_at   = now();
$$;

-- 4) Backfill unique viewers from history so the table isn't empty on day one.
insert into public.match_stats (match_id, match_title, sport, unique_viewers, first_viewed, updated_at)
select
  match_id,
  max(match_title),
  max(sport),
  count(distinct visitor_id)::int,
  min(created_at),
  now()
from public.match_views
group by match_id
on conflict (match_id) do update set
  unique_viewers = excluded.unique_viewers,
  match_title    = coalesce(public.match_stats.match_title, excluded.match_title),
  sport          = coalesce(public.match_stats.sport, excluded.sport);
