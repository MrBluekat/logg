-- Legger til møtested på møter. Kjør i Supabase -> SQL Editor (trygg å kjøre flere ganger).
alter table public.meetings add column if not exists location text;
