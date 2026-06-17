-- PrimePitch — per-server display order for curated stream overrides.
-- Run this once in the Supabase SQL editor for the PrimePitch project.
-- Safe to re-run (idempotent).
--
-- Lower `position` = shown/loaded first on the watch page. The first server an
-- admin picks in the Test page becomes position 0, so it's the one that auto-
-- plays for viewers. NULL positions sort last (fall back to created_at order),
-- so existing override rows keep working unchanged until they're re-curated.
alter table public.stream_overrides
  add column if not exists position int;
