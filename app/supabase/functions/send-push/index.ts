// Eksempel på Supabase Edge Function som:
// 1. Lagrer varselet i varselsenteret (notifications-tabellen)
// 2. Sender push-varsel til alle relevante abonnenter
//
// Kalles på to måter:
// A) Manuelt fra egen kode: { title, body, url, user_id, event_id }
//    - user_id satt = varsel til akkurat den brukeren (f.eks. tildelt oppgave)
//    - kun event_id satt (ingen user_id) = kringkasting til alle brukere tilknyttet arrangementet
// B) Automatisk fra en Supabase Database Webhook på log_entries (INSERT):
//    { type: "INSERT", table: "log_entries", record: {...hele raden...} }
//    Da avgjør funksjonen SELV om varselet faktisk skal sendes (se buildAutoNotification),
//    og kringkaster i så fall til alle tilknyttet arrangementet.

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

// Lagrer varselet i varselsenteret. Enten til én bestemt bruker, eller (hvis ingen
// user_id oppgis) kringkastet til alle brukere tilknyttet arrangementet.
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
  const payload = await req.json();

  let title, body, url, user_id, event_id;

  if (payload.table === "log_entries" && payload.record) {
    const notification = buildAutoNotification(payload.record);
    if (!notification) {
      return new Response(JSON.stringify({ skipped: true }), { headers: { "Content-Type": "application/json" } });
    }
    title = notification.title;
    body = notification.body;
    event_id = payload.record.event_id;
  } else {
    ({ title, body, url, user_id, event_id } = payload);
  }

  await insertNotifications(event_id, user_id, title, body);

  let query = supabase.from("push_subscriptions").select("*");
  if (user_id) query = query.eq("user_id", user_id);
  if (event_id) query = query.eq("event_id", event_id);
  const { data: subs, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

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

  return new Response(JSON.stringify({ attempted: results.length, succeeded, failed: failed.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
