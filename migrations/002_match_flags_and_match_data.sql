-- PrimePitch — comprehensive admin + auto-fallback support
-- Run this once in the Supabase SQL editor for the PrimePitch project.
-- Safe to re-run (idempotent).

-- 1) Capture the full streamed.pk Match on an override, so override/forced matches
--    can render on the site even when streamed.pk's curated live list / echo omit them.
alter table public.stream_overrides
  add column if not exists match_data jsonb;

-- 2) Per-match admin flags: hide / force-live / featured / disable auto-fallback.
create table if not exists public.match_flags (
  match_id     text primary key,                 -- "<source>--<id>"
  hidden       boolean not null default false,
  forced_live  boolean not null default false,
  featured     boolean not null default false,
  disable_auto boolean not null default false,
  match_data   jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.match_flags enable row level security;

-- Server routes use the service-role key (bypasses RLS); this policy is for parity
-- with stream_overrides and any authenticated client access.
drop policy if exists "match_flags authenticated all" on public.match_flags;
create policy "match_flags authenticated all" on public.match_flags
  for all to authenticated using (true) with check (true);
