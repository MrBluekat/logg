// Fyll inn dine egne Supabase-verdier her (finnes under Project Settings -> API).
// SUPABASE_ANON_KEY er trygg å ha i frontend-koden - den er begrenset av RLS-policyene i schema.sql.
// ALDRI legg service_role-nøkkelen her.
window.SUPABASE_URL = "https://DITT-PROSJEKT.supabase.co";
window.SUPABASE_ANON_KEY = "din-anon-public-key";

// Domenet som brukes internt til å bygge e-post av brukernavn (må matche functions/admin-create-user)
window.EMAIL_DOMAIN = "arrangementslogg.local";
