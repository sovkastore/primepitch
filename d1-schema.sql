-- Cloudflare D1 Schema for PrimePitch High-Speed Tracking
-- This schema handles all the heavy Lifting (Heartbeats, Views, Analytics)
-- It is designed for maximum speed on the Cloudflare Edge.

-- 1) Real-time Presence (Replaces active_viewers)
CREATE TABLE IF NOT EXISTS d1_active_viewers (
    visitor_id TEXT PRIMARY KEY,
    match_id TEXT,
    path TEXT NOT NULL,
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
    duration_sec INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_match_views_match ON d1_match_views(match_id);
CREATE INDEX IF NOT EXISTS idx_match_views_created ON d1_match_views(created_at);
CREATE INDEX IF NOT EXISTS idx_match_views_visitor_id ON d1_match_views(visitor_id);

-- 3) Page Views (Replaces page_views)
CREATE TABLE IF NOT EXISTS d1_page_views (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visitor_id TEXT NOT NULL,
    path TEXT NOT NULL,
    referrer TEXT,
    device_type TEXT,
    country TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_page_views_created ON d1_page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_page_views_visitor ON d1_page_views(visitor_id);

-- 4) Partner Referrals (Tracking attribution)
CREATE TABLE IF NOT EXISTS d1_partner_referrals (
    visitor_id TEXT PRIMARY KEY,
    partner_code TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partner_referrals_code ON d1_partner_referrals(partner_code);

-- 5) Stats Summary (The 'Archive' for fast admin charts)
CREATE TABLE IF NOT EXISTS d1_match_summaries (
    match_id TEXT PRIMARY KEY,
    total_views INTEGER DEFAULT 1,
    peak_viewers INTEGER DEFAULT 0,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
);
