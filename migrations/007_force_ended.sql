-- Manual "End match now": force a live card into the ENDED state even while the
-- provider feed still reports it live. Card stays visible but greyed/unclickable.
-- (Hiding entirely is the existing `hidden` flag = "Remove from feed".)
alter table match_flags add column if not exists force_ended boolean not null default false;
