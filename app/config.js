// ---------------------------------------------------------------------------
// FYLL INN DINE EGNE VERDIER HER FØR DU TAR APPEN I BRUK.
// Du finner Supabase-verdiene under: Project Settings -> API i Supabase-dashbordet.
// ---------------------------------------------------------------------------

const CONFIG = {
  // Project URL, f.eks. "https://xxxxxxxxxxxx.supabase.co"
  SUPABASE_URL: "https://DITT-PROSJEKT.supabase.co",

  // "anon public" nøkkelen (IKKE service_role-nøkkelen — den skal aldri ligge i frontend-kode)
  SUPABASE_ANON_KEY: "DIN-ANON-KEY",

  // Navnet på tabellene dine i Supabase. Endre disse til det du faktisk kalte dem.
  TABLE_HENDELSER: "hendelser",
  TABLE_OPPGAVER: "oppgaver",

  // Public VAPID-nøkkel for push-varsler (genereres én gang, se SETUP.md steg 5)
  VAPID_PUBLIC_KEY: "DIN-VAPID-PUBLIC-KEY",
};
