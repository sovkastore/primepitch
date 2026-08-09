-- 1) Partners Accounts Table
CREATE TABLE IF NOT EXISTS d1_partners (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    suspended INTEGER DEFAULT 0,
    banned INTEGER DEFAULT 0,
    revenue_split INTEGER DEFAULT 50,
    full_stats INTEGER DEFAULT 0,
    payout_currency TEXT,
    payout_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_partners_code ON d1_partners(code);
CREATE INDEX IF NOT EXISTS idx_partners_email ON d1_partners(email);

-- 2) Partner Balances Table
CREATE TABLE IF NOT EXISTS d1_partner_balances (
    partner_id TEXT PRIMARY KEY REFERENCES d1_partners(id) ON DELETE CASCADE,
    earned REAL DEFAULT 0,
    approved REAL DEFAULT 0,
    hold REAL DEFAULT 0,
    paid REAL DEFAULT 0,
    balance REAL DEFAULT 0
);

-- 3) Partner Monetag Ad Zones
CREATE TABLE IF NOT EXISTS d1_partner_zones (
    id TEXT PRIMARY KEY,
    partner_id TEXT REFERENCES d1_partners(id) ON DELETE CASCADE,
    zone_id TEXT UNIQUE NOT NULL,
    label TEXT,
    format TEXT DEFAULT 'popunder',
    full_tag TEXT,
    gross_seen REAL DEFAULT 0,
    last_impressions INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_zones_partner ON d1_partner_zones(partner_id);

-- 4) Partner Applications (Signups)
CREATE TABLE IF NOT EXISTS d1_partner_applications (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    country TEXT,
    platform TEXT,
    audience_size TEXT,
    contact_handle TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    reviewed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_applications_status ON d1_partner_applications(status);

-- 5) Partner Payout Requests & Records
CREATE TABLE IF NOT EXISTS d1_partner_payouts (
    id TEXT PRIMARY KEY,
    partner_id TEXT REFERENCES d1_partners(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    currency TEXT,
    method TEXT DEFAULT 'crypto',
    from_address TEXT,
    to_address TEXT,
    status TEXT DEFAULT 'in_progress', -- in_progress, sent, completed, failed
    proof_link TEXT,
    proof_image TEXT,
    note TEXT,
    fail_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_payouts_partner ON d1_partner_payouts(partner_id);

-- 6) Custom Stream Overrides
CREATE TABLE IF NOT EXISTS d1_stream_overrides (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    match_data TEXT, -- JSON payload of the match
    embed_url TEXT NOT NULL,
    source TEXT,
    server_label TEXT,
    replace_original INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    hd INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_overrides_match ON d1_stream_overrides(match_id);

-- 7) Match Flags Configuration (Hidden, Hot, etc)
CREATE TABLE IF NOT EXISTS d1_match_flags (
    match_id TEXT PRIMARY KEY,
    hidden INTEGER DEFAULT 0,
    forced_live INTEGER DEFAULT 0,
    featured INTEGER DEFAULT 0,
    disable_auto INTEGER DEFAULT 0,
    auto_fallback INTEGER DEFAULT 0,
    match_data TEXT, -- JSON payload of the match
    display_title TEXT,
    force_ended INTEGER DEFAULT 0,
    hot INTEGER DEFAULT 0,
    hide_one INTEGER DEFAULT 0,
    popular INTEGER DEFAULT 0,
    custom_notice TEXT,
    alt_visible INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 8) Global Site Settings
CREATE TABLE IF NOT EXISTS d1_site_settings (
    key TEXT PRIMARY KEY,
    value TEXT, -- JSON configuration or text value
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 9) Live TV Channels List
CREATE TABLE IF NOT EXISTS d1_tv_channels (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    logo TEXT,
    embed_url TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    position INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 10) Push Notification Match States
CREATE TABLE IF NOT EXISTS d1_push_match_state (
    match_key TEXT PRIMARY KEY,
    home_team TEXT,
    away_team TEXT,
    finished INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
