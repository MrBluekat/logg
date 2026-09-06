-- ============================================================================
-- ARRANGEMENTSLOGG – Supabase skjema
-- Kjør denne filen i Supabase Dashboard -> SQL Editor -> New query -> Run
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- EVENTS (arrangement)
-- ----------------------------------------------------------------------------
create table public.events (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  event_date   date,
  active_from  timestamptz,     -- når arrangementet regnes som aktivt fra (brukes til statistikk)
  active_until timestamptz,     -- når arrangementet regnes som aktivt til (brukes til statistikk)
  status       text not null default 'active' check (status in ('active','archived')),
  next_seq     integer not null default 1,          -- brukes til å generere H-001, H-002 osv per arrangement
  created_at   timestamptz not null default now()
);

-- Forhåndsdefinerte lokasjoner per arrangement (admin kan redigere listen)
create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  name       text not null
);

-- Kontaktliste per arrangement (navn, telefon, e-post, organisasjon)
create table public.contacts (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null,
  phone        text,
  email        text,
  organization text,
  is_divider   boolean not null default false,   -- true = skillestrek/gruppeoverskrift (kun "name" brukes da)
  sort_order   integer not null default 0,        -- brukes til å bestemme rekkefølgen i listen
  created_at   timestamptz not null default now()
);

-- Oppgaver per arrangement, med valgfri nedtellende timer per oppgave.
-- Timeren styres via target_end_at (når den kjører) i stedet for å skrive til
-- databasen hvert sekund - klienten regner ut gjenstående tid selv, likt "Tid".
create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  description       text not null,
  assigned_name     text,
  assigned_user_id  uuid references public.profiles(id) on delete set null, -- valgfritt: konkret bruker i loggen (i stedet for/i tillegg til fritekstnavn)
  has_timer         boolean not null default false,
  timer_mode        text not null default 'duration' check (timer_mode in ('duration','fixed_time')),
  duration_seconds  integer,             -- opprinnelig varighet (brukes ved "nullstill"), kun timer_mode='duration'
  remaining_seconds integer,             -- gjenstående tid når timeren er pauset/ikke startet, kun timer_mode='duration'
  timer_state       text not null default 'idle' check (timer_state in ('idle','running','paused')),
  target_end_at     timestamptz,         -- satt når timer_mode='duration' og timeren kjører
  fixed_target_at   timestamptz,         -- absolutt tidspunkt å telle ned til, kun timer_mode='fixed_time'
  done              boolean not null default false,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now()
);

-- Varselsenter: én rad per mottaker per varsel (både push-varsler og oppgavetildelinger
-- havner her, slik at brukeren kan se historikken selv om de gikk glipp av selve push-varselet).
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  title      text not null,
  body       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- PROFILES (kobles 1:1 til auth.users)
-- ----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text not null,
  username     text unique not null,     -- det brukeren faktisk taster inn ved innlogging
  role         text not null check (role in ('admin','logger','observator')),
  event_id     uuid references public.events(id) on delete set null, -- null for admin
  active_from  timestamptz,              -- null = ingen nedre grense
  active_until timestamptz,              -- null = ingen øvre grense
  created_at   timestamptz not null default now()
);

-- Hjelpefunksjon: henter rolle for innlogget bruker (brukes i RLS-policyer)
-- Returnerer null (= ingen tilgang) hvis kontoen er utenfor sitt gyldige tidsrom.
create or replace function public.current_role_name()
returns text language sql stable security definer as $$
  select role from public.profiles
  where id = auth.uid()
    and (active_from is null or active_from <= now())
    and (active_until is null or active_until >= now())
$$;

create or replace function public.current_event_id()
returns uuid language sql stable security definer as $$
  select event_id from public.profiles
  where id = auth.uid()
    and (active_from is null or active_from <= now())
    and (active_until is null or active_until >= now())
$$;

-- ----------------------------------------------------------------------------
-- LOG ENTRIES (hendelser / loggføringer)
-- ----------------------------------------------------------------------------
create table public.log_entries (
  id               uuid primary key default gen_random_uuid(),
  display_id       text not null,                -- "H-001"
  event_id         uuid not null references public.events(id) on delete cascade,
  entry_kind       text not null check (entry_kind in ('info','hendelse')),
  category         text not null check (category in ('Loggforing','Utvisning','Medisinsk hendelse','Hendelse','Prioritert hendelse','Scene','Vaer','Publikumstall')),
  location         text,
  reporter_source  text,                          -- Vekter / Frivillig / Politi / Annet / fritekst
  description      text not null,
  action_taken     text,
  notified         text[] not null default '{}',  -- Politi, AMK, Brannvesenet, Sikkerhetsleder, Krisegruppen
  beredskapsniva   text check (beredskapsniva in ('gronn','gul','rod')),        -- valgfritt, kun 1 av gangen
  scene_farge      text check (scene_farge in ('gronn','gul','oransje','rod')), -- valgfritt, kun 1 av gangen
  status           text not null default 'avsluttet' check (status in ('pagaende','avsluttet')),
  created_by       uuid references public.profiles(id) on delete set null,
  created_by_name  text not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  is_edited        boolean not null default false
);

-- Auto-generer display_id "H-001" osv per arrangement
create or replace function public.set_log_display_id()
returns trigger language plpgsql as $$
declare
  seq integer;
begin
  update public.events set next_seq = next_seq + 1
    where id = new.event_id
    returning next_seq - 1 into seq;
  new.display_id := 'H-' || lpad(seq::text, 3, '0');
  return new;
end;
$$;

create trigger trg_log_display_id
before insert on public.log_entries
for each row execute function public.set_log_display_id();

-- Historikk over endringer (full versjonshistorikk)
create table public.log_edit_history (
  id             uuid primary key default gen_random_uuid(),
  log_entry_id   uuid not null references public.log_entries(id) on delete cascade,
  previous_data  jsonb not null,
  changed_by     uuid references public.profiles(id) on delete set null,
  changed_by_name text not null,
  changed_at     timestamptz not null default now()
);

-- Lagre forrige versjon automatisk hver gang en rad oppdateres
create or replace function public.log_entry_before_update()
returns trigger language plpgsql as $$
begin
  insert into public.log_edit_history (log_entry_id, previous_data, changed_by, changed_by_name)
  values (old.id, to_jsonb(old), auth.uid(), coalesce(new.created_by_name, old.created_by_name));
  new.is_edited := true;
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_log_entry_before_update
before update on public.log_entries
for each row execute function public.log_entry_before_update();

-- Oppdateringer/kommentarer på en pågående hendelse (tidslinje)
create table public.log_comments (
  id               uuid primary key default gen_random_uuid(),
  log_entry_id     uuid not null references public.log_entries(id) on delete cascade,
  comment_text     text not null,
  created_by       uuid references public.profiles(id) on delete set null,
  created_by_name  text not null,
  created_at       timestamptz not null default now()
);

-- Vedlegg (bilder/filer) - selve filen ligger i Storage, denne raden peker til den.
-- log_entry_id er null for filer lastet opp manuelt via "Filer"-galleriet (ikke knyttet til en hendelse).
create table public.log_attachments (
  id                uuid primary key default gen_random_uuid(),
  event_id          uuid not null references public.events(id) on delete cascade,
  log_entry_id      uuid references public.log_entries(id) on delete cascade,
  file_path         text not null,     -- path i Storage-bucketen "attachments"
  file_name         text not null,
  file_type         text,
  uploaded_by       uuid references public.profiles(id) on delete set null,
  uploaded_by_name  text,
  uploaded_at       timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
alter table public.events           enable row level security;
alter table public.locations        enable row level security;
alter table public.profiles         enable row level security;
alter table public.log_entries      enable row level security;
alter table public.log_edit_history enable row level security;
alter table public.log_comments     enable row level security;
alter table public.log_attachments  enable row level security;

-- PROFILES
create policy "profil: se egen eller admin ser alle" on public.profiles
  for select using (id = auth.uid() or public.current_role_name() = 'admin');
create policy "profil: samme arrangement ser hverandre" on public.profiles
  for select using (event_id = public.current_event_id());
create policy "profil: alle ser admin-profiler" on public.profiles
  for select using (role = 'admin');
create policy "profil: kun admin oppretter/endrer" on public.profiles
  for insert with check (public.current_role_name() = 'admin');
create policy "profil: kun admin oppdaterer" on public.profiles
  for update using (public.current_role_name() = 'admin');
create policy "profil: kun admin sletter" on public.profiles
  for delete using (public.current_role_name() = 'admin');

-- EVENTS
create policy "events: admin ser alle, andre ser eget aktivt arrangement" on public.events
  for select using (
    public.current_role_name() = 'admin'
    or (id = public.current_event_id() and status = 'active')
  );
create policy "events: kun admin oppretter" on public.events
  for insert with check (public.current_role_name() = 'admin');
create policy "events: kun admin endrer" on public.events
  for update using (public.current_role_name() = 'admin');
create policy "events: kun admin sletter" on public.events
  for delete using (public.current_role_name() = 'admin');

-- LOCATIONS
create policy "locations: se egne arrangement" on public.locations
  for select using (public.current_role_name() = 'admin' or event_id = public.current_event_id());
create policy "locations: admin/logger oppretter" on public.locations
  for insert with check (public.current_role_name() in ('admin','logger') and (public.current_role_name() = 'admin' or event_id = public.current_event_id()));
create policy "locations: admin sletter" on public.locations
  for delete using (public.current_role_name() = 'admin');

-- CONTACTS
create policy "contacts: se eget arrangement" on public.contacts
  for select using (public.current_role_name() = 'admin' or event_id = public.current_event_id());
create policy "contacts: admin/logger oppretter" on public.contacts
  for insert with check (public.current_role_name() in ('admin','logger') and (public.current_role_name() = 'admin' or event_id = public.current_event_id()));
create policy "contacts: admin/logger endrer" on public.contacts
  for update using (public.current_role_name() = 'admin' or (public.current_role_name() = 'logger' and event_id = public.current_event_id()));
create policy "contacts: admin/logger sletter" on public.contacts
  for delete using (public.current_role_name() = 'admin' or (public.current_role_name() = 'logger' and event_id = public.current_event_id()));

-- TASKS
create policy "tasks: se eget arrangement" on public.tasks
  for select using (public.current_role_name() = 'admin' or event_id = public.current_event_id());
create policy "tasks: admin/logger oppretter" on public.tasks
  for insert with check (public.current_role_name() in ('admin','logger') and (public.current_role_name() = 'admin' or event_id = public.current_event_id()));
create policy "tasks: admin/logger endrer" on public.tasks
  for update using (public.current_role_name() = 'admin' or (public.current_role_name() = 'logger' and event_id = public.current_event_id()));
create policy "tasks: admin/logger sletter" on public.tasks
  for delete using (public.current_role_name() = 'admin' or (public.current_role_name() = 'logger' and event_id = public.current_event_id()));

-- NOTIFICATIONS (varselsenter)
create policy "notifications: bruker ser egne" on public.notifications
  for select using (user_id = auth.uid());
create policy "notifications: bruker markerer egne som lest" on public.notifications
  for update using (user_id = auth.uid());
-- Ingen insert-policy for vanlige brukere med vilje - varsler opprettes kun via
-- Edge Function-en (send-push), som bruker service_role og dermed går utenom RLS.

-- LOG ENTRIES
create policy "log: se eget arrangement" on public.log_entries
  for select using (public.current_role_name() = 'admin' or event_id = public.current_event_id());
create policy "log: admin/logger oppretter i eget arrangement" on public.log_entries
  for insert with check (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );
create policy "log: admin endrer alt, logger endrer eget innen 5 min" on public.log_entries
  for update using (
    public.current_role_name() = 'admin'
    or (
      public.current_role_name() = 'logger'
      and event_id = public.current_event_id()
      and created_by = auth.uid()
      and created_at > now() - interval '5 minutes'
    )
    or (
      -- tillat oppdatering av status/updated_at (marker avsluttet) uten tidsbegrensning
      public.current_role_name() = 'logger'
      and event_id = public.current_event_id()
    )
  );

-- LOG EDIT HISTORY
create policy "historikk: se eget arrangement" on public.log_edit_history
  for select using (
    public.current_role_name() = 'admin'
    or exists (select 1 from public.log_entries e where e.id = log_entry_id and e.event_id = public.current_event_id())
  );
create policy "historikk: system oppretter" on public.log_edit_history
  for insert with check (
    public.current_role_name() = 'admin'
    or exists (select 1 from public.log_entries e where e.id = log_entry_id and e.event_id = public.current_event_id())
  );

-- LOG COMMENTS
create policy "kommentar: se eget arrangement" on public.log_comments
  for select using (
    public.current_role_name() = 'admin'
    or exists (select 1 from public.log_entries e where e.id = log_entry_id and e.event_id = public.current_event_id())
  );
create policy "kommentar: admin/logger oppretter" on public.log_comments
  for insert with check (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger'
        and exists (select 1 from public.log_entries e where e.id = log_entry_id and e.event_id = public.current_event_id() and e.status = 'pagaende'))
  );

-- LOG ATTACHMENTS
create policy "vedlegg: se eget arrangement" on public.log_attachments
  for select using (
    public.current_role_name() = 'admin' or event_id = public.current_event_id()
  );
create policy "vedlegg: admin/logger laster opp" on public.log_attachments
  for insert with check (
    public.current_role_name() = 'admin'
    or (public.current_role_name() = 'logger' and event_id = public.current_event_id())
  );

-- ----------------------------------------------------------------------------
-- STORAGE (vedlegg: bilder/filer)
-- Opprett bucket "attachments" i Supabase Dashboard -> Storage (privat bucket),
-- kjør deretter policyene under.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('attachments', 'attachments', false)
  on conflict (id) do nothing;

create policy "vedlegg-storage: les eget arrangement"
  on storage.objects for select using (
    bucket_id = 'attachments'
    and (
      public.current_role_name() = 'admin'
      or (storage.foldername(name))[1] = public.current_event_id()::text
    )
  );

create policy "vedlegg-storage: last opp eget arrangement"
  on storage.objects for insert with check (
    bucket_id = 'attachments'
    and public.current_role_name() in ('admin','logger')
    and (
      public.current_role_name() = 'admin'
      or (storage.foldername(name))[1] = public.current_event_id()::text
    )
  );

-- ----------------------------------------------------------------------------
-- Ferdig! Neste steg (se README.md):
-- 1. Opprett Storage-bucket "attachments" manuelt i Dashboard hvis den ikke ble laget over.
-- 2. Deploy Edge Functions (admin-create-user, admin-reset-password).
-- 3. Opprett første admin-bruker (se README.md).
-- ----------------------------------------------------------------------------
