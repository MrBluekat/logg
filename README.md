# Arrangementslogg

En passordbeskyttet nettside for å loggføre hendelser i kontrollrommet under et arrangement –
med brukerroller, sanntidsoppdatering, timere, klokke, PDF-eksport og lyst/mørkt tema.
Bygget som en statisk nettside (kan ligge på GitHub Pages) med [Supabase](https://supabase.com)
som backend (innlogging, database, filopplasting, sanntid).

## 1. Kjør databaseskjemaet

1. Gå til ditt Supabase-prosjekt → **SQL Editor** → **New query**.
2. Lim inn hele innholdet i `sql/schema.sql` og trykk **Run**.
   - Dette oppretter alle tabeller, sikkerhetsregler (RLS) og et privat lagringsrom
     («storage bucket») kalt `attachments` for bilder/filer.
3. Sjekk under **Storage** at bucketen `attachments` finnes og er satt til **privat** (ikke public).
   Hvis den ikke ble opprettet automatisk: lag den manuelt med navnet `attachments`, privat.

## 2. Deploy Edge Functions (trengs for å opprette brukere/passord trygt)

Disse to funksjonene lar admin opprette brukere og tilbakestille passord uten at den
hemmelige "service role"-nøkkelen noensinne havner i nettleseren.

Du trenger [Supabase CLI](https://supabase.com/docs/guides/cli) lokalt:

```bash
supabase login
supabase link --project-ref DIN-PROSJEKT-REF
supabase secrets set SUPABASE_URL=https://DIN-PROSJEKT-REF.supabase.co
supabase secrets set SUPABASE_ANON_KEY=din-anon-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=din-service-role-key
supabase functions deploy admin-create-user
supabase functions deploy admin-reset-password
```

(`SUPABASE_SERVICE_ROLE_KEY` finner du under Project Settings → API → `service_role` – **ikke**
del denne, og den skal aldri legges i nettsidens egne filer.)

## 3. Opprett den aller første admin-brukeren manuelt

Siden admin-brukere selv oppretter alle andre brukere, må den første admin-kontoen lages
for hånd én gang:

1. Supabase Dashboard → **Authentication** → **Add user** → fyll inn en e-post
   (f.eks. `admin@arrangementslogg.local`) og et passord.
2. Supabase Dashboard → **SQL Editor**, kjør (bytt ut UUID-en med brukerens id fra forrige steg,
   finnes under Authentication → Users):

   ```sql
   insert into public.profiles (id, full_name, username, role, event_id)
   values ('LIM-INN-USER-ID-HER', 'Ditt navn', 'admin', 'admin', null);
   ```

   («username» her, `admin`, er det du taster inn på innloggingssiden – ikke selve e-posten.)

Alle senere brukere (logger/observatør/flere admins) oppretter du enkelt inne i adminpanelet på
selve nettsiden.

## 4. Fyll inn `js/config.js`

Åpne `js/config.js` og lim inn din prosjekt-URL og `anon` public key (Project Settings → API):

```js
window.SUPABASE_URL = "https://DIN-PROSJEKT-REF.supabase.co";
window.SUPABASE_ANON_KEY = "din-anon-public-key";
```

`anon`-nøkkelen er trygg å ha i frontend-koden – den begrenses av sikkerhetsreglene (RLS) i databasen.

## 5. Legg til på GitHub og publiser med GitHub Pages

```bash
git init
git add .
git commit -m "Arrangementslogg"
git remote add origin https://github.com/DITT-BRUKERNAVN/arrangementslogg.git
git push -u origin main
```

Deretter: repoet → **Settings** → **Pages** → Source: `main`-branch, `/ (root)` → Save.
Siden blir tilgjengelig på `https://DITT-BRUKERNAVN.github.io/arrangementslogg/`.

## Bruk

- **Logg inn** (`index.html`) med brukernavn + passord admin har opprettet.
- **Admin** havner i adminpanelet: opprette arrangementer, brukere, administrere lokasjoner per
  arrangement, eksportere til PDF, og arkivere (eksporterer PDF og sletter arrangementet permanent).
- **Logger/observatør** havner rett i kontrollrom-siden knyttet til sitt arrangement:
  - Klokke (med sekunder) og valgfrie navngitte timere (stoppeklokke/nedtelling, helt manuelle).
  - Loggskjema (kun for logger/admin): type «info» (avsluttes med én gang) eller «hendelse»
    (pågående, kan følges opp med kommentarer/tidslinje til den markeres avsluttet).
  - Redigering er mulig i 5 minutter etter opprettelse (for admin: alltid); en "Redigert"-lenke
    viser full versjonshistorikk.
  - Filter/søk på type, lokasjon, status, registrert av, dato og fritekst.
  - Dashboard med nøkkeltall og fordeling per kategori, oppdateres i sanntid via Supabase Realtime.
  - Observatør ser alt, men kan ikke registrere eller redigere.
  - På skjermer under 640px (mobil) vises loggen kun til lesing, uavhengig av rolle.
- **Lyst/mørkt tema** og **norsk/engelsk** kan byttes øverst til høyre – valget huskes i nettleseren.

## Kjente forenklinger / ting å teste videre

- RLS-policyene er skrevet for å dekke rollene slik de er beskrevet, men bør testes grundig med
  ekte brukere/roller før et skarpt arrangement, spesielt regelen som lar en «logger» redigere
  egne innlegg kun de første 5 minuttene.
- PDF-eksporten bygger inn bilder, men lister kun filnavn for andre filtyper (Word/Excel/PDF-vedlegg) –
  disse må lastes ned separat fra loggen ved behov.
- Vedlegg utover bilder (Word/Excel/PDF/tekstfiler) lastes opp og lagres, men vises kun som en
  nedlastbar lenke i selve loggvisningen, ikke som forhåndsvisning.
- Observatør-rollen er ment for delt konto med flere samtidige innlogginger – dette fungerer med
  Supabase Auth som standard, men sørg for at "enforce single session per user" ikke er aktivert
  i Supabase-prosjektets auth-innstillinger.
