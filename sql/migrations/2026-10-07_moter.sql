-- ============================================================================
-- MIGRASJON: Møter (Oppgaver / Møter-panelet + "Opprett møte basert på hendelse")
-- Kjør i Supabase -> SQL Editor. Trygg å kjøre én gang på en eksisterende database.
-- ============================================================================

-- 1) Møter-tabell
create table if not exists public.meetings (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  title            text not null,
  scheduled_at     timestamptz not null,
  location         text,   -- møtested (fritekst)
  status           text not null default 'planlagt' check (status in ('planlagt','avsluttet')),
  participants     jsonb not null default '[]'::jsonb,  -- [{"user_id": "...", "name": "..."} | {"name": "fritekst"}]
  source_entry_id  uuid references public.log_entries(id) on delete set null, -- hendelsen møtet ble opprettet fra
  created_by       uuid references public.profiles(id) on delete set null,
  created_by_name  text not null,
  created_at       timestamptz not null default now(),
  ended_at         timestamptz,
  ended_by_name    text
);
create index if not exists meetings_event_idx on public.meetings(event_id, status, scheduled_at);

alter table public.meetings enable row level security;

create policy "meetings: se eget arrangement" on public.meetings
  for select using (public.current_role_name() = 'admin' or event_id = public.current_event_id());
create policy "meetings: admin/logger oppretter" on public.meetings
  for insert with check (
    public.current_role_name() in ('admin','logger')
    and (public.current_role_name() = 'admin' or event_id = public.current_event_id())
  );
create policy "meetings: admin/logger endrer" on public.meetings
  for update using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );
create policy "meetings: admin/logger sletter" on public.meetings
  for delete using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

-- Referat ligger i egen tabell slik at observatører bare kan lese det når loggfører har gitt tilgang.
create table if not exists public.meeting_minutes (
  meeting_id          uuid primary key references public.meetings(id) on delete cascade,
  event_id            uuid not null references public.events(id) on delete cascade,
  minutes             text,
  decisions           text,
  observers_can_read  boolean not null default false,
  updated_by_name     text,
  updated_at          timestamptz not null default now()
);
alter table public.meeting_minutes enable row level security;
create policy "meeting_minutes: les" on public.meeting_minutes
  for select using (
    public.current_role_name() = 'admin'
    or (event_id = public.current_event_id() and (
          public.current_role_name() = 'logger'
          or (public.current_role_name() = 'observator' and observers_can_read)
       ))
  );
create policy "meeting_minutes: skriv" on public.meeting_minutes
  for insert with check (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );
create policy "meeting_minutes: endre" on public.meeting_minutes
  for update using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );
create policy "meeting_minutes: slett" on public.meeting_minutes
  for delete using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

-- 2) Ny kategori "Mote" + kobling fra loggføring til møte
alter table public.log_entries drop constraint if exists log_entries_category_check;
alter table public.log_entries add constraint log_entries_category_check
  check (category in ('Loggforing','Utvisning','Medisinsk hendelse','Hendelse','Prioritert hendelse','Scene','Vaer','Publikumstall','Ping','Mote'));

alter table public.log_entries add column if not exists meeting_id uuid references public.meetings(id) on delete set null;
alter table public.log_entries add column if not exists meeting_phase text check (meeting_phase in ('opprettet','avsluttet'));

-- 3) Sanntid for møter (ufarlig hvis tabellen allerede ligger i publikasjonen)
do $$
begin
  alter publication supabase_realtime add table public.meetings;
exception when duplicate_object then null;
end $$;
