-- PrimePitch — visitor roster for detailed visitor analytics
-- Run once in the Supabase SQL editor for the PrimePitch project. Safe to re-run.

-- 1) Central roster: one row per visitor that has ever loaded the site.
create table if not exists public.visitors (
  visitor_id  text primary key,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  visit_count integer not null default 1,
  device_type text,
  referrer    text,
  last_path   text
);
create index if not exists idx_visitors_first_seen on public.visitors (first_seen);

alter table public.visitors enable row level security;
drop policy if exists "visitors authenticated read" on public.visitors;
create policy "visitors authenticated read" on public.visitors
  for select to authenticated using (true);

-- 2) Atomic upsert+increment called on every pageview (first_seen set only on insert).
create or replace function public.track_visitor(p_vid text, p_device text, p_referrer text, p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.visitors (visitor_id, device_type, referrer, last_path)
  values (p_vid, p_device, p_referrer, p_path)
  on conflict (visitor_id) do update
    set last_seen   = now(),
        visit_count = public.visitors.visit_count + 1,
        last_path   = excluded.last_path;
$$;

-- 3) Accurate distinct-visitor counts (done in the DB so they don't hit the
--    PostgREST 1000-row client limit as traffic grows).
create or replace function public.unique_visitors_in_range(p_start timestamptz, p_end timestamptz)
returns integer
language sql security definer set search_path = public
as $$
  select count(distinct visitor_id)::int
  from public.page_views
  where created_at >= p_start and created_at <= p_end;
$$;

create or replace function public.daily_unique_visitors(p_start timestamptz)
returns table(day date, uniques int)
language sql security definer set search_path = public
as $$
  select (created_at at time zone 'UTC')::date as day, count(distinct visitor_id)::int as uniques
  from public.page_views
  where created_at >= p_start
  group by 1
  order by 1;
$$;

-- 4) Backfill from existing page_views so the roster isn't empty on day one.
insert into public.visitors (visitor_id, first_seen, last_seen, visit_count)
select visitor_id, min(created_at), max(created_at), count(*)
from public.page_views
group by visitor_id
on conflict (visitor_id) do nothing;
