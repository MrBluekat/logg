// Supabase Edge Function: admin-reset-password
// Kun admin kan kalle denne. Setter nytt passord for en eksisterende bruker.
// Deploy: supabase functions deploy admin-reset-password

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

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
      return new Response(JSON.stringify({ error: "Kun admin kan tilbakestille passord" }), { status: 403 });
    }

    const { user_id, new_password } = await req.json();
    if (!user_id || !new_password) {
      return new Response(JSON.stringify({ error: "Mangler felt" }), { status: 400 });
    }

    const { error } = await admin.auth.admin.updateUserById(user_id, { password: new_password });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 400 });
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
