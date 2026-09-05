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

Deno.serve(async (req) => {
  const { title, body, url, user_id, event_id } = await req.json();

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
