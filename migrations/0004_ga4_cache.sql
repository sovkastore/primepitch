CREATE TABLE IF NOT EXISTS d1_ga4_cache (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  ref_code TEXT,
  
  -- Core metrics
  page_views INTEGER DEFAULT 0,
  unique_visitors INTEGER DEFAULT 0,
  new_visitors INTEGER DEFAULT 0,
  returning_visitors INTEGER DEFAULT 0,
  
  -- JSON stored aggregates (since sqlite doesn't have arrays/objects natively without extensions)
  devices_json TEXT,    -- e.g. {"mobile": 50, "desktop": 10}
  referrers_json TEXT,  -- e.g. {"google": 20, "direct": 5}
  pages_json TEXT,      -- e.g. {"/": 100, "/match/1": 50}
  
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ga4_cache_date ON d1_ga4_cache(date);
CREATE INDEX IF NOT EXISTS idx_ga4_cache_ref_code ON d1_ga4_cache(ref_code);
