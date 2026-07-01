-- Run this in your Supabase SQL Editor to create the table for Sports Live manual streams.

CREATE TABLE IF NOT EXISTS sports_live_streams (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Football',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('live', 'today', 'tomorrow', 'hidden')),
  streams JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE sports_live_streams ENABLE ROW LEVEL SECURITY;

-- Allow public read access (for the public page)
CREATE POLICY "Allow public read" ON sports_live_streams
  FOR SELECT USING (true);

-- Allow service role full access (for the admin API)
CREATE POLICY "Allow service role all" ON sports_live_streams
  FOR ALL USING (auth.role() = 'service_role');
