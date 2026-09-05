# Arrangementslogg PWA – oppsett

## 1. Fyll inn Supabase-tilkobling
Åpne `config.js` og sett inn:
- `SUPABASE_URL` og `SUPABASE_ANON_KEY` (Project Settings → API i Supabase)
- Riktige tabellnavn hvis dine heter noe annet enn `hendelser` / `oppgaver`

## 2. Sjekk at tabellene dine matcher forventede kolonner
`app.js` forventer disse kolonnene (juster spørringene i `app.js` hvis du har andre navn):

**hendelser**: `id, created_at, kategori, alvorlighet, beskrivelse, status, bilde_url, opprettet_av`
**oppgaver**: `id, tittel, status, frist, tildelt_til`

## 3. Opprett en Storage-bucket for bilder
I Supabase → Storage → New bucket → kall den `hendelse-bilder`. Sett den til public hvis dere vil vise
bildene direkte i loggen (ellers må dere bruke signerte URL-er i stedet for `getPublicUrl`).

## 4. Aktiver Row Level Security
Pass på at RLS er skrudd på for alle tabellene, med policies som gir innloggede brukere lov til å
lese/skrive slik dere ønsker per rolle (Admin/Logger/Observatør).

## 5. Sett opp push-varsler
1. Generer et VAPID-nøkkelpar (kun én gang):
   ```
   npx web-push generate-vapid-keys
   ```
2. Legg den **offentlige** nøkkelen i `config.js` (`VAPID_PUBLIC_KEY`)
3. Opprett tabellen for abonnementer i Supabase SQL-editor:
   ```sql
   create table push_subscriptions (
     id bigint generated always as identity primary key,
     user_id uuid references auth.users(id),
     endpoint text unique not null,
     p256dh text not null,
     auth text not null,
     created_at timestamptz default now()
   );
   alter table push_subscriptions enable row level security;
   create policy "Brukere kan administrere eget abonnement"
     on push_subscriptions for all
     using (auth.uid() = user_id);
   ```
4. Deploy edge-funksjonen som faktisk sender varselet:
   ```
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:din@epost.no
   ```
5. Kall funksjonen når en kritisk hendelse opprettes — enklest er en database-trigger/webhook på
   `hendelser`-tabellen som kaller `send-push` når `alvorlighet = 'hoy'`.

## 6. Bytt ut ikonene (valgfritt)
`icons/`-mappen inneholder enkle plassholder-ikoner i appens farger. Bytt ut med egne når dere har noe
endelig.

## 7. Publiser på GitHub Pages
- Last opp alle filene til repoet deres (samme sted som resten av Arrangementslogg, eller en egen
  `/app`-mappe)
- GitHub Pages serveres alltid over HTTPS, som er et krav for at service worker og push skal fungere
- Besøk URL-en på mobil → følg installasjonsstegene vi gikk gjennom tidligere (Android: automatisk
  prompt / Legg til på Hjem-skjerm. iPhone: Del-ikon → Legg til på Hjem-skjerm)

## 8. Test
- Logg inn med en ekte bruker fra deres Supabase Auth
- Opprett en test-hendelse med bilde, se at den dukker opp i loggen (også i sanntid på en annen enhet)
- Aktiver push-varsler og test at en varsling faktisk kommer frem på både Android og iPhone
  (husk: appen må være installert på hjemskjermen på iPhone for at push skal virke)
