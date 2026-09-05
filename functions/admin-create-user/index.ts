// Supabase Edge Function: admin-create-user
// Kun innloggede admin-brukere kan kalle denne. Oppretter en ny bruker
// (auth.users + profiles) med brukernavn, passord, rolle og ev. arrangement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMAIL_DOMAIN = "arrangementslogg.local"; // brukernavn -> {brukernavn}@arrangementslogg.local

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json({ error: "Ikke innlogget" }, 401);
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
      return json({ error: "Kun admin kan opprette brukere" }, 403);
    }

    const { username, password, full_name, role, event_id } = await req.json();
    if (!username || !password || !full_name || !role) {
      return json({ error: "Mangler felt" }, 400);
    }
    if (!["admin", "logger", "observator"].includes(role)) {
      return json({ error: "Ugyldig rolle" }, 400);
    }
    if (role !== "admin" && !event_id) {
      return json({ error: "Logger/observatør må ha et arrangement" }, 400);
    }

    const email = `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr) {
      return json({ error: createErr.message }, 400);
    }

    const { error: profileErr } = await admin.from("profiles").insert({
      id: created.user.id,
      username: username.trim().toLowerCase(),
      full_name,
      role,
      event_id: role === "admin" ? null : event_id,
    });
    if (profileErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: profileErr.message }, 400);
    }

    return json({ ok: true, user_id: created.user.id });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
