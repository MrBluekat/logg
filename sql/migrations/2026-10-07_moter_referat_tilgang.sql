-- Referat flyttes til egen tabell slik at tilgangen kan styres:
-- observatører får KUN lese referat når loggfører har huket av for det.
-- Kjør i Supabase -> SQL Editor (trygg å kjøre flere ganger).

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

drop policy if exists "meeting_minutes: les" on public.meeting_minutes;
create policy "meeting_minutes: les" on public.meeting_minutes
  for select using (
    public.current_role_name() = 'admin'
    or (event_id = public.current_event_id() and (
          public.current_role_name() = 'logger'
          or (public.current_role_name() = 'observator' and observers_can_read)
       ))
  );

drop policy if exists "meeting_minutes: skriv" on public.meeting_minutes;
create policy "meeting_minutes: skriv" on public.meeting_minutes
  for insert with check (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

drop policy if exists "meeting_minutes: endre" on public.meeting_minutes;
create policy "meeting_minutes: endre" on public.meeting_minutes
  for update using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

drop policy if exists "meeting_minutes: slett" on public.meeting_minutes;
create policy "meeting_minutes: slett" on public.meeting_minutes
  for delete using (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

-- Flytt eksisterende referat (deles ikke med observatører før noen huker av)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'meetings' and column_name = 'minutes') then
    insert into public.meeting_minutes (meeting_id, event_id, minutes, decisions, updated_by_name)
      select id, event_id, minutes, decisions, ended_by_name
      from public.meetings
      where status = 'avsluttet'
      on conflict (meeting_id) do nothing;
    alter table public.meetings drop column minutes;
    alter table public.meetings drop column decisions;
  end if;
end $$;
