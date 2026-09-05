// ---------------------------------------------------------------------------
// Disse verdiene er allerede fylt inn med prosjektet ditt (samme som resten
// av Arrangementslogg). Trenger normalt ikke endres.
// ---------------------------------------------------------------------------

const CONFIG = {
  SUPABASE_URL: "https://heqpvjeuijgbgijdllmz.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_Fl0dVLB7v0Q7KphvY2opcw_dSt1NZIY",

  // Public VAPID-nøkkel for push-varsler (se SETUP.md steg 5 hvis du vil bruke dette)
  VAPID_PUBLIC_KEY: "BPAENCgxyfop6SoGJetB8ERHRT2f4hEZijT5UE5yJfHhiZiUZk2qgI9YTDxe_HFIhJ-CYSVUDsuayk5DF9PY6Zs",

  // Brukere logger inn med brukernavn, som her bygges om til "brukernavn@DOMENE"
  // -- samme mønster som hovedsiden bruker.
  LOGIN_EMAIL_DOMAIN: "arrangementslogg.local",
};
