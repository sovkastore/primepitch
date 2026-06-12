-- PrimePitch — accurate per-page analytics for the admin Pages section.
-- Run once in the Supabase SQL editor. Safe to re-run.

-- Per-path total views + distinct unique visitors for a time range (done in the DB
-- so it doesn't hit the PostgREST 1000-row client limit as traffic grows).
create or replace function public.page_stats(p_start timestamptz, p_end timestamptz)
returns table(path text, views int, uniques int)
language sql security definer set search_path = public
as $$
  select path,
         count(*)::int                         as views,
         count(distinct visitor_id)::int        as uniques
  from public.page_views
  where created_at >= p_start and created_at <= p_end
  group by path
  order by views desc;
$$;
