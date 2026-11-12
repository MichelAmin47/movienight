-- REFERENCE ONLY. Already applied to the hosted Supabase project; do not run it.

-- A NULL watched_on means "watched at some unknown earlier date".
alter table public.watches alter column watched_on drop not null;
-- default current_date is kept
