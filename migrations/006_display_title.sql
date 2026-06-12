-- Admin can rename a match: display_title overrides the provider's title on
-- the live list and watch pages. Applied 2026-06-12 via Supabase.
alter table match_flags add column if not exists display_title text;
