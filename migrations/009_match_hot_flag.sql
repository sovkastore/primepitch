-- 009: Manually-toggled "HOT" badge per fixture (admin-controlled).
-- Append-only: existing rows default to false, no data is touched.
ALTER TABLE match_flags
  ADD COLUMN IF NOT EXISTS hot boolean NOT NULL DEFAULT false;
