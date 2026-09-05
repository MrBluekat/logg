# Arrangementslogg PWA – oppsett

Dette er en installerbar mobilapp-versjon av Arrangementslogg. Den bruker **nøyaktig samme
Supabase-database** som hovedsiden (kontrollrom-appen) – samme brukere, samme arrangementer,
samme logg, oppgaver og kontaktliste. Den er allerede koblet til riktig prosjekt i `config.js`.

## Hva den kan gjøre
- **Logg**: se og registrere loggføringer (samme kategorier, varsler, tiltak, vedlegg som
  hovedsiden), legge til oppdateringer på pågående hendelser, markere som avsluttet.
- **Oppgaver**: se oppgaver (inkl. nedtellende timer), krysse av som utført, legge til nye.
- **Kontakter**: se og legge til kontakter i kontaktlisten.
- **Roller**: en **observatør** ser alt, men kan ikke registrere/redigere noe (samme regler som
  hovedsiden). **Logger** og **admin** kan registrere og redigere.
- **Admin** velger hvilket arrangement de vil se etter innlogging (siden admin ikke er bundet til
  ett fast arrangement). Logger/observatør går rett inn på sitt tildelte arrangement.
- Installeres som en app på hjemskjermen (Android: automatisk prompt. iPhone: Del-ikon → Legg til
  på Hjem-skjerm), og kan sende push-varsler.

## 1. Ingen ekstra Supabase-oppsett nødvendig for kjernefunksjonene
`config.js` peker allerede til riktig prosjekt og bruker samme `attachments`-bucket som
hovedsiden for bilder/filer. Så lenge hovedsiden din fungerer, fungerer denne appen mot samme data
uten noe mer arbeid.

## 2. Publiser på GitHub Pages
- Last opp hele denne mappen til repoet ditt, f.eks. i en undermappe kalt `/app` (så hovedsiden
  ligger på roten og PWA-en på `dittbrukernavn.github.io/repo/app/`)
- GitHub Pages serveres alltid over HTTPS, som er et krav for at service worker og push skal fungere
- Besøk URL-en på mobil → Android: automatisk installasjonsprompt / "Legg til på Hjem-skjerm".
  iPhone: Del-ikon → Legg til på Hjem-skjerm (push-varsler krever at appen er installert slik på
  iPhone, det fungerer ikke bare i Safari)

## 3. Push-varsler (valgfritt)
Push-varsler er ikke nødvendig for at appen skal fungere – dropp dette steget hvis dere ikke
trenger det ennå.

1. Generer et VAPID-nøkkelpar (kun én gang):
   ```
   npx web-push generate-vapid-keys
   ```
   Den offentlige nøkkelen ligger allerede i `config.js` fra tidligere - bytt ut med din egen hvis
   du genererer et nytt nøkkelpar.

2. Opprett abonnement-tabellen i Supabase SQL Editor:
   ```sql
   create table push_subscriptions (
     id bigint generated always as identity primary key,
     user_id uuid references auth.users(id),
     event_id uuid references public.events(id),
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

3. Deploy edge-funksjonen (samme fremgangsmåte som de andre Edge Functions dere allerede har satt
   opp - Supabase Dashboard → Edge Functions → Deploy a new function → navn `send-push` → lim inn
   koden fra `supabase/functions/send-push/index.ts`):
   ```
   supabase functions deploy send-push
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:din@epost.no
   ```

4. Send et varsel når en **prioritert hendelse** opprettes: enklest er en **Database Webhook** i
   Supabase Dashboard (Database → Webhooks → Create a new hook):
   - Table: `log_entries`, Event: `Insert`
   - Type: HTTP Request → URL til din `send-push`-funksjon
   - Legg ved en betingelse/filter på `category = 'Prioritert hendelse'` (eller filtrer i selve
     edge-funksjonen basert på payloadet den mottar)
   - Send med `event_id` fra den nye raden i requesten, slik at kun de som abonnerer på akkurat
     det arrangementet varsles

## 4. Test
- Logg inn med en ekte bruker fra Supabase Auth (samme brukernavn/passord som på hovedsiden)
- Admin: velg et arrangement fra listen som dukker opp. Logger/observatør går rett inn.
- Registrer en test-loggføring med vedlegg, se at den dukker opp i loggen (også i sanntid på en
  annen enhet/i hovedsiden samtidig)
- Prøv en observatør-konto og bekreft at "+"-knappen og skrivefeltene ikke vises
- Aktiver push-varsler og test at en varsling faktisk kommer frem (husk: appen må være installert
  på hjemskjermen på iPhone for at push skal virke)

## Kjente forenklinger sammenlignet med hovedsiden
Dette er en lettvekts mobilapp - noen ting er bevisst forenklet eller utelatt her, men fungerer
fullt ut på hovedsiden:
- Lokasjon er et fritekstfelt her (ikke en administrerbar forhåndsdefinert liste)
- Ingen redigering/versjonshistorikk på loggføringer, kun nye oppdateringer på pågående saker
- Ingen "Filer"-galleri, statistikk/grafer, PDF-eksport eller adminpanel (brukere/arrangementer) -
  disse gjøres på hovedsiden
- Kontaktlisten støtter ikke skillestreker eller endring av rekkefølge her
