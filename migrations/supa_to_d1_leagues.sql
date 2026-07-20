-- 1) League Configurations Table
CREATE TABLE IF NOT EXISTS d1_league_config (
    league_id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    enabled INTEGER DEFAULT 0,
    display_order INTEGER DEFAULT 0,
    has_table INTEGER DEFAULT 0,
    default_tab TEXT DEFAULT 'auto',
    logo_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_league_config_enabled ON d1_league_config(enabled);

-- 2) League Matches/Fixtures/Results Table
CREATE TABLE IF NOT EXISTS d1_league_matches (
    match_key TEXT PRIMARY KEY,
    league_id INTEGER NOT NULL,
    season_id INTEGER NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    group_name TEXT,
    round_number INTEGER,
    round_name TEXT,
    event_date TEXT NOT NULL,
    status TEXT DEFAULT 'notstarted',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(league_id) REFERENCES d1_league_config(league_id)
);
CREATE INDEX IF NOT EXISTS idx_league_matches_league_season ON d1_league_matches(league_id, season_id);
CREATE INDEX IF NOT EXISTS idx_league_matches_status ON d1_league_matches(status);

-- 3) League Standings/Tables Table
CREATE TABLE IF NOT EXISTS d1_league_standings (
    league_id INTEGER PRIMARY KEY,
    grouped INTEGER DEFAULT 0,
    season_name TEXT,
    standings TEXT, -- JSON array of StandingRow
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(league_id) REFERENCES d1_league_config(league_id)
);

-- 4) League Teams and Badges/Crests
CREATE TABLE IF NOT EXISTS d1_league_teams (
    name TEXT PRIMARY KEY,
    crest_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5) Cricket Streams Table
CREATE TABLE IF NOT EXISTS d1_cricket_streams (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    competition TEXT,
    starts_at TEXT,
    time TEXT,
    status TEXT DEFAULT 'live',
    channel_ids TEXT, -- JSON array of channel IDs
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6) Push Notifications Subscriptions Table
CREATE TABLE IF NOT EXISTS d1_push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    topics TEXT, -- JSON array
    prefs TEXT, -- JSON object
    user_agent TEXT,
    last_seen_at TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_count INTEGER DEFAULT 0,
    open_count INTEGER DEFAULT 0,
    last_opened_at TEXT
);

-- 7) Push Notification Match Follows Table
CREATE TABLE IF NOT EXISTS d1_match_follows (
    team_key TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(team_key, endpoint),
    FOREIGN KEY(endpoint) REFERENCES d1_push_subscriptions(endpoint) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_match_follows_endpoint ON d1_match_follows(endpoint);
