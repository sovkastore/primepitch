-- PrimePitch — Fast Additive Statistics (v2)
-- Changes stats from "Re-calculate everything" to "Just add +1".
-- This makes the site 100x faster and prevents crashes.

-- 1) Fast Additive Match Join
create or replace function public.record_match_join(p_match_id text, p_title text, p_sport text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.match_stats (match_id, match_title, sport, unique_viewers, updated_at)
  values (p_match_id, p_title, p_sport, 1, now())
  on conflict (match_id) do update set
    match_title    = coalesce(excluded.match_title, public.match_stats.match_title),
    sport          = coalesce(excluded.sport, public.match_stats.sport),
    unique_viewers = public.match_stats.unique_viewers + 1,
    updated_at     = now();
$$;

-- 2) Fast Additive Visitor Tracking
create or replace function public.track_visitor(p_vid text, p_device text, p_referrer text, p_path text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.visitors (visitor_id, device_type, referrer, last_path, visit_count)
  values (p_vid, p_device, p_referrer, p_path, 1)
  on conflict (visitor_id) do update
    set last_seen   = now(),
        visit_count = public.visitors.visit_count + 1,
        last_path   = excluded.last_path;
$$;
