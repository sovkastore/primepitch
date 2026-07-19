-- Cloudflare D1 Schema for PrimePitch High-Speed Tracking
-- This schema handles all the heavy Lifting (Heartbeats, Views, Analytics)
-- It is designed for maximum speed on the Cloudflare Edge.

-- 1) Real-time Presence (Replaces active_viewers)
CREATE TABLE IF NOT EXISTS d1_active_viewers (
    visitor_id TEXT PRIMARY KEY,
    match_id TEXT,
    path TEXT NOT NULL,
    ref_code TEXT,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_active_viewers_last_seen ON d1_active_viewers(last_seen);
CREATE INDEX IF NOT EXISTS idx_active_viewers_match ON d1_active_viewers(match_id);

-- 2) Match Views (Replaces match_views)
CREATE TABLE IF NOT EXISTS d1_match_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    source TEXT,
    match_title TEXT,
    sport TEXT,
    is_live INTEGER DEFAULT 1,
    country TEXT,
    ref_code TEXT,
    duration_sec INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_match_views_visitor ON d1_match_views(visitor_id);
CREATE INDEX IF NOT EXISTS idx_match_views_match ON d1_match_views(match_id);
CREATE INDEX IF NOT EXISTS idx_match_views_created ON d1_match_views(created_at);

-- 3) Page Views (Replaces page_views)
CREATE TABLE IF NOT EXISTS d1_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    path TEXT NOT NULL,
    referrer TEXT,
    device_type TEXT,
    country TEXT,
    ref_code TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON d1_page_views(created_at);

-- 4) Stats Summary (The 'Archive' for fast admin charts)
CREATE TABLE IF NOT EXISTS d1_match_summaries (
    match_id TEXT PRIMARY KEY,
    total_views INTEGER DEFAULT 1,
    peak_viewers INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
