// Supabase Edge Function: admin-create-user
// Kun innloggede admin-brukere kan kalle denne. Oppretter en ny bruker
// (auth.users + profiles) med brukernavn, passord, rolle og ev. arrangement.
//
// Deploy: supabase functions deploy admin-create-user
// Krever secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (sett med `supabase secrets set`)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_DOMAIN = "arrangementslogg.local"; // brukernavn -> {brukernavn}@arrangementslogg.local

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // 1. Verifiser at kalleren er innlogget og er admin
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Ikke innlogget" }), { status: 401 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Kun admin kan opprette brukere" }), { status: 403 });
    }

    // 2. Les input
    const { username, password, full_name, role, event_id } = await req.json();
    if (!username || !password || !full_name || !role) {
      return new Response(JSON.stringify({ error: "Mangler felt" }), { status: 400 });
    }
    if (!["admin", "logger", "observator"].includes(role)) {
      return new Response(JSON.stringify({ error: "Ugyldig rolle" }), { status: 400 });
    }
    if (role !== "admin" && !event_id) {
      return new Response(JSON.stringify({ error: "Logger/observatør må ha et arrangement" }), { status: 400 });
    }

    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

    // 3. Opprett auth-bruker
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return new Response(JSON.stringify({ error: createErr.message }), { status: 400 });
    }

    // 4. Opprett profil
    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      username: username.trim().toLowerCase(),
      full_name,
      role,
      event_id: role === "admin" ? null : event_id,
    });
    if (profileErr) {
      // rydd opp auth-brukeren hvis profil feiler
      await admin.auth.admin.deleteUser(created.user.id);
      return new Response(JSON.stringify({ error: profileErr.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true, user_id: created.user.id }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
