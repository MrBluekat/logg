// Eksempel på Supabase Edge Function som sender push-varsel til alle
// registrerte abonnenter (eller en bestemt bruker) i push_subscriptions-tabellen.
//
// Deploy med:  supabase functions deploy send-push
// Kall den fra en database-trigger, eller manuelt via fetch fra egen kode.
//
// Nødvendige secrets (sett med `supabase secrets set`):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT        (f.eks. "mailto:din-epost@example.com")
//   SUPABASE_URL         (settes automatisk av Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (settes automatisk av Supabase)

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Kalles på to måter:
// 1. Manuelt fra egen kode: { title, body, url, user_id, event_id }
// 2. Automatisk fra en Supabase Database Webhook på log_entries (INSERT):
//    { type: "INSERT", table: "log_entries", record: {...hele raden...} }
//    Da avgjør funksjonen SELV om varselet faktisk skal sendes (se buildAutoNotification).

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
    title: parts.length > 1 ? "Arrangementslogg" : parts[0].title,
    body: parts.map((p) => p.body).join(" · "),
  };
}

Deno.serve(async (req) => {
  const payload = await req.json();

  let title, body, url, user_id, event_id;

  if (payload.table === "log_entries" && payload.record) {
    // Automatisk kall fra Database Webhook - avgjør selv om det er verdt å varsle om
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

  let query = supabase.from("push_subscriptions").select("*");
  if (user_id) query = query.eq("user_id", user_id);
  if (event_id) query = query.eq("event_id", event_id);
  const { data: subs, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.allSettled(
    (subs || []).map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  return new Response(JSON.stringify({ sent: results.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
