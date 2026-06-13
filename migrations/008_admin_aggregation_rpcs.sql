-- Server-side aggregation for admin analytics. Replaces "fetch rows, count in
-- JS" patterns that silently capped at Supabase/PostgREST's 1000-row default and
-- undercounted once the logs grew past 1000 rows. These count in Postgres.
-- Applied 2026-06-13 via Supabase.

create or replace function count_distinct_visitors(p_start timestamptz, p_end timestamptz)
returns bigint language sql stable as $$
  select count(distinct visitor_id) from page_views
  where created_at >= p_start and created_at <= p_end;
$$;

create or replace function match_sport_breakdown(p_start timestamptz, p_end timestamptz)
returns table(sport text, views bigint) language sql stable as $$
  select coalesce(sport,'other')::text, count(*)::bigint
  from match_views where created_at >= p_start and created_at <= p_end
  group by coalesce(sport,'other');
$$;

create or replace function top_matches(p_start timestamptz, p_end timestamptz, p_limit int)
returns table(match_id text, match_title text, sport text, views bigint) language sql stable as $$
  select match_id::text, max(match_title)::text, max(sport)::text, count(*)::bigint
  from match_views where created_at >= p_start and created_at <= p_end
  group by match_id order by count(*) desc limit p_limit;
$$;

create or replace function top_pages(p_start timestamptz, p_end timestamptz, p_limit int)
returns table(path text, views bigint) language sql stable as $$
  select path::text, count(*)::bigint
  from page_views where created_at >= p_start and created_at <= p_end
  group by path order by count(*) desc limit p_limit;
$$;

create or replace function device_breakdown(p_start timestamptz, p_end timestamptz)
returns table(device_type text, views bigint) language sql stable as $$
  select coalesce(device_type,'unknown')::text, count(*)::bigint
  from page_views where created_at >= p_start and created_at <= p_end
  group by coalesce(device_type,'unknown');
$$;

create or replace function referrer_breakdown(p_start timestamptz, p_end timestamptz)
returns table(referrer text, views bigint) language sql stable as $$
  select referrer::text, count(*)::bigint
  from page_views where created_at >= p_start and created_at <= p_end
    and referrer is not null and referrer <> '' group by referrer;
$$;
