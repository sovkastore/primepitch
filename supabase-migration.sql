-- ============================================
-- PrimePitch Admin Dashboard - Full Migration
-- Paste this into Supabase SQL Editor and run
-- ============================================

-- 1. page_views: Every page load
CREATE TABLE page_views (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id  TEXT NOT NULL,
  path        TEXT NOT NULL,
  referrer    TEXT,
  user_agent  TEXT,
  device_type TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pv_created ON page_views (created_at);
CREATE INDEX idx_pv_path ON page_views (path);
CREATE INDEX idx_pv_visitor ON page_views (visitor_id);

-- 2. match_views: Watch page visits
CREATE TABLE match_views (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id   TEXT NOT NULL,
  match_id     TEXT NOT NULL,
  source       TEXT NOT NULL,
  match_title  TEXT,
  sport        TEXT,
  is_live      BOOLEAN DEFAULT true,
  duration_sec INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mv_match ON match_views (match_id);
CREATE INDEX idx_mv_sport ON match_views (sport);
CREATE INDEX idx_mv_created ON match_views (created_at);

-- 3. daily_stats: Pre-aggregated daily metrics
CREATE TABLE daily_stats (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,
  total_views     INTEGER NOT NULL DEFAULT 0,
  unique_visitors INTEGER NOT NULL DEFAULT 0,
  match_views     INTEGER NOT NULL DEFAULT 0,
  top_sport       TEXT,
  top_match_id    TEXT,
  top_match_title TEXT,
  sport_breakdown JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ds_date ON daily_stats (date);

-- 4. active_viewers: Real-time presence
CREATE TABLE active_viewers (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id  TEXT NOT NULL,
  match_id    TEXT,
  path        TEXT NOT NULL,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_av_visitor ON active_viewers (visitor_id);
CREATE INDEX idx_av_match ON active_viewers (match_id) WHERE match_id IS NOT NULL;
CREATE INDEX idx_av_last_seen ON active_viewers (last_seen);

-- 5. Row Level Security
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_pv" ON page_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_read_pv" ON page_views FOR SELECT TO authenticated USING (true);

ALTER TABLE match_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_mv" ON match_views FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "auth_read_mv" ON match_views FOR SELECT TO authenticated USING (true);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all_ds" ON daily_stats FOR ALL TO authenticated USING (true);

ALTER TABLE active_viewers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_insert_av" ON active_viewers FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon_update_av" ON active_viewers FOR UPDATE TO anon USING (true);
CREATE POLICY "auth_read_av" ON active_viewers FOR SELECT TO authenticated USING (true);

-- 6. Cleanup function
CREATE OR REPLACE FUNCTION cleanup_stale_data() RETURNS void AS $$
BEGIN
  DELETE FROM active_viewers WHERE last_seen < now() - INTERVAL '5 minutes';
  DELETE FROM page_views WHERE created_at < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;
