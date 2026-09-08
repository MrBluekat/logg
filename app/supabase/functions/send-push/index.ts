// Sender push-varsel + lagrer i varselsenteret (notifications-tabellen).
//
// Kalles på to måter, med to helt ulike sikkerhetssjekker:
//
// A) Automatisk fra en Supabase Database Webhook på log_entries (INSERT):
//    { type: "INSERT", table: "log_entries", record: {...} }
//    Godkjennes KUN hvis header "x-webhook-secret" matcher hemmeligheten
//    WEBHOOK_SECRET (satt i Supabase secrets) - forhindrer at noen utenfra
//    forfalsker en kringkasting ved å late som de er webhooken.
//
// B) Manuelt fra selve appen: { title, body, url, user_id, event_id }
//    Krever en ekte innlogget bruker (admin eller logger - IKKE observatør).
//    En logger kan kun sende til/kringkaste innenfor sitt EGET arrangement.
//    Admin kan sende til/for hvilket som helst arrangement.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT"),
  Deno.env.get("VAPID_PUBLIC_KEY"),
  Deno.env.get("VAPID_PRIVATE_KEY")
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL"),
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BEREDSKAP_LABELS = { gronn: "Grønt", gul: "Gult", rod: "Rødt" };
const SCENE_LABELS = { gronn: "Grønn", gul: "Gul", oransje: "Oransje", rod: "Rød" };

function buildAutoNotification(record) {
  const parts = [];
  if (record.category === "Prioritert hendelse") {
    parts.push({ title: "Prioritert hendelse", body: record.description || "Ny prioritert hendelse registrert" });
  }
  if (record.beredskapsniva) {
    parts.push({ title: "Beredskapsnivå endret", body: `Nytt beredskapsnivå: ${BEREDSKAP_LABELS[record.beredskapsniva] || record.beredskapsniva}` });
  }
  if (record.scene_farge) {
    parts.push({ title: "Scenefarge endret", body: `Ny scenefarge: ${SCENE_LABELS[record.scene_farge] || record.scene_farge}` });
  }
  if (!parts.length) return null;
  return {
    title: parts.length > 1 ? "Arlogg" : parts[0].title,
    body: parts.map((p) => p.body).join(" · "),
  };
}

async function insertNotifications(event_id, user_id, title, body) {
  if (user_id) {
    await supabase.from("notifications").insert({ event_id, user_id, title, body });
    return;
  }
  if (!event_id) return;
  const { data: profiles } = await supabase.from("profiles").select("id").eq("event_id", event_id);
  if (profiles && profiles.length) {
    const rows = profiles.map((p) => ({ event_id, user_id: p.id, title, body }));
    await supabase.from("notifications").insert(rows);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();

    let title, body, url, user_id, event_id;

    // ---- VEI A: automatisk fra Database Webhook ----
    if (payload.table === "log_entries" && payload.record) {
      const providedSecret = req.headers.get("x-webhook-secret");
      const expectedSecret = Deno.env.get("WEBHOOK_SECRET");
      if (!expectedSecret || providedSecret !== expectedSecret) {
        return json({ error: "Ugyldig eller manglende webhook-hemmelighet" }, 401);
      }

      const notification = buildAutoNotification(payload.record);
      if (!notification) return json({ skipped: true });
      title = notification.title;
      body = notification.body;
      event_id = payload.record.event_id;

    // ---- VEI B: manuelt fra appen - krever ekte innlogget admin/logger ----
    } else {
      const authHeader = req.headers.get("Authorization") ?? "";
      const anonClient = createClient(
        Deno.env.get("SUPABASE_URL"),
        Deno.env.get("SUPABASE_ANON_KEY"),
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: userData, error: userErr } = await anonClient.auth.getUser();
      if (userErr || !userData?.user) {
        return json({ error: "Ikke innlogget" }, 401);
      }

      const { data: callerProfile } = await supabase
        .from("profiles").select("role, event_id").eq("id", userData.user.id).single();

      if (!callerProfile || callerProfile.role === "observator") {
        return json({ error: "Ikke tillatt for denne rollen" }, 403);
      }

      ({ title, body, url, user_id, event_id } = payload);
      if (!title) return json({ error: "Mangler tittel" }, 400);

      // Logger kan kun sende innenfor sitt eget arrangement - ikke andre arrangementer
      if (callerProfile.role === "logger") {
        if (event_id !== callerProfile.event_id) {
          return json({ error: "Kan kun sende innenfor eget arrangement" }, 403);
        }
        if (user_id) {
          const { data: recipient } = await supabase.from("profiles").select("event_id").eq("id", user_id).single();
          if (!recipient || recipient.event_id !== callerProfile.event_id) {
            return json({ error: "Mottaker tilhører ikke ditt arrangement" }, 403);
          }
        }
      }
      // admin: ingen ekstra begrensning - kan sende for ethvert arrangement
    }

    await insertNotifications(event_id, user_id, title, body);

    let query = supabase.from("push_subscriptions").select("*");
    if (user_id) query = query.eq("user_id", user_id);
    if (event_id) query = query.eq("event_id", event_id);
    const { data: subs, error } = await query;
    if (error) return json({ error: error.message }, 500);

    const notificationPayload = JSON.stringify({ title, body, url });
    const results = await Promise.allSettled(
      (subs || []).map((sub) =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        )
      )
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected");

    return json({ attempted: results.length, succeeded, failed: failed.length });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
