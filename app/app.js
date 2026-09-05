// ===========================================================================
// Arrangementslogg – PWA-frontend
//
// Snakker med de FAKTISKE tabellene i Supabase-prosjektet (samme database
// som hovedsiden/kontrollrom-appen bruker):
//   profiles, events, log_entries, log_comments, log_attachments,
//   tasks, contacts, locations
// ===========================================================================

const db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
const el = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  Loggforing: "Loggføring",
  Utvisning: "Utvisning",
  "Medisinsk hendelse": "Medisinsk hendelse",
  Hendelse: "Hendelse",
  "Prioritert hendelse": "Prioritert hendelse",
  Scene: "Scene",
  Vaer: "Vær",
  Publikumstall: "Publikumstall",
};

// ---------------------------------------------------------------------------
// Global tilstand
// ---------------------------------------------------------------------------
let profile = null;      // { id, full_name, role, event_id }
let currentEvent = null; // { id, name, active_from, active_until }
let currentTab = "logg";
let selectedFiles = [];
let activeChannels = [];

function canWrite() {
  return profile && (profile.role === "admin" || profile.role === "logger");
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();
  wireUpEvents();
  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  const { data: { session } } = await db.auth.getSession();
  if (session) await loadProfileAndEnter();
});

db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    unsubscribeRealtime();
    el("screen-app").classList.add("hidden");
    el("screen-event-picker").classList.add("hidden");
    el("screen-login").classList.remove("hidden");
  }
});

function wireUpEvents() {
  el("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = el("login-email").value.trim();
    const password = el("login-password").value;
    const btn = el("login-btn");
    const errorBox = el("login-error");
    errorBox.textContent = "";
    btn.disabled = true;
    btn.textContent = "Logger inn …";

    const email = username.includes("@") ? username : `${username}@${CONFIG.LOGIN_EMAIL_DOMAIN}`;
    const { error } = await db.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = "Logg inn";

    if (error) {
      errorBox.textContent = "Feil brukernavn eller passord.";
      return;
    }
    await loadProfileAndEnter();
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  el("fab-new").addEventListener("click", () => {
    if (currentTab === "logg") el("new-sheet").classList.remove("hidden");
    else if (currentTab === "oppgaver") el("new-task-sheet").classList.remove("hidden");
    else if (currentTab === "kontakter") el("new-contact-sheet").classList.remove("hidden");
  });
  el("cancel-new").addEventListener("click", closeNewSheet);
  el("new-sheet").addEventListener("click", (e) => { if (e.target.id === "new-sheet") closeNewSheet(); });
  el("new-photo").addEventListener("change", handlePhotoPreview);
  el("new-form").addEventListener("submit", saveNewEntry);

  el("cancel-new-task").addEventListener("click", () => { el("new-task-sheet").classList.add("hidden"); el("new-task-form").reset(); });
  el("new-task-sheet").addEventListener("click", (e) => { if (e.target.id === "new-task-sheet") { el("new-task-sheet").classList.add("hidden"); el("new-task-form").reset(); } });
  el("new-task-form").addEventListener("submit", saveNewTask);

  el("cancel-new-contact").addEventListener("click", () => { el("new-contact-sheet").classList.add("hidden"); el("new-contact-form").reset(); });
  el("new-contact-sheet").addEventListener("click", (e) => { if (e.target.id === "new-contact-sheet") { el("new-contact-sheet").classList.add("hidden"); el("new-contact-form").reset(); } });
  el("new-contact-form").addEventListener("submit", saveNewContact);

  el("push-enable-btn").addEventListener("click", enablePush);
  el("logout-btn").addEventListener("click", logout);
  el("logout-btn-picker").addEventListener("click", logout);
  el("switch-event-btn").addEventListener("click", () => {
    unsubscribeRealtime();
    showEventPicker();
  });
}

async function logout() {
  unsubscribeRealtime();
  profile = null;
  currentEvent = null;
  await db.auth.signOut();
}

// ---------------------------------------------------------------------------
// Profil / arrangement-valg
// ---------------------------------------------------------------------------
async function loadProfileAndEnter() {
  const { data: { user } } = await db.auth.getUser();
  if (!user) return;
  const { data: p, error } = await db.from("profiles").select("*").eq("id", user.id).single();
  if (error || !p) {
    showToast("Fant ingen profil for denne brukeren.");
    await db.auth.signOut();
    return;
  }
  profile = p;

  if (profile.role === "admin") {
    await showEventPicker();
  } else {
    if (!profile.event_id) {
      showToast("Ingen arrangement tilknyttet denne brukeren.");
      return;
    }
    const { data: ev } = await db.from("events").select("*").eq("id", profile.event_id).single();
    currentEvent = ev;
    await enterApp();
  }
}

async function showEventPicker() {
  el("screen-login").classList.add("hidden");
  el("screen-app").classList.add("hidden");
  el("screen-event-picker").classList.remove("hidden");

  const { data: events } = await db.from("events").select("*").eq("status", "active").order("created_at", { ascending: false });
  const list = el("event-picker-list");
  list.innerHTML = "";
  (events || []).forEach((ev) => {
    const li = document.createElement("li");
    li.className = "item-row";
    li.style.cursor = "pointer";
    li.innerHTML = `<div class="row-top"><span class="kategori">${escapeHtml(ev.name)}</span><span class="tid">${ev.event_date || ""}</span></div>`;
    li.addEventListener("click", async () => {
      currentEvent = ev;
      await enterApp();
    });
    list.appendChild(li);
  });
  if (!events || !events.length) {
    list.innerHTML = `<li class="empty-state">Ingen aktive arrangementer.</li>`;
  }
}

async function enterApp() {
  el("screen-login").classList.add("hidden");
  el("screen-event-picker").classList.add("hidden");
  el("screen-app").classList.remove("hidden");
  el("event-name-label").textContent = currentEvent ? currentEvent.name : "";
  el("fab-new").style.display = canWrite() ? "flex" : "none";
  el("switch-event-btn").classList.toggle("hidden", profile.role !== "admin");

  await Promise.all([loadEntries(), loadTasks(), loadContacts()]);
  subscribeRealtime();
  maybeShowPushBanner();
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  el(`tab-${tab}`).classList.add("active");
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add("active");
  el("header-title").textContent = tab === "logg" ? "Logg" : tab === "oppgaver" ? "Oppgaver" : "Kontakter";
  el("fab-new").style.display = canWrite() ? "flex" : "none";
}

function subscribeRealtime() {
  unsubscribeRealtime();
  const ch1 = db.channel("pwa-log-" + currentEvent.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "log_entries", filter: `event_id=eq.${currentEvent.id}` }, loadEntries)
    .on("postgres_changes", { event: "*", schema: "public", table: "log_comments" }, loadEntries)
    .subscribe();
  const ch2 = db.channel("pwa-tasks-" + currentEvent.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `event_id=eq.${currentEvent.id}` }, loadTasks)
    .subscribe();
  const ch3 = db.channel("pwa-contacts-" + currentEvent.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "contacts", filter: `event_id=eq.${currentEvent.id}` }, loadContacts)
    .subscribe();
  activeChannels = [ch1, ch2, ch3];
}

function unsubscribeRealtime() {
  activeChannels.forEach((ch) => db.removeChannel(ch));
  activeChannels = [];
  if (window._taskTicker) { clearInterval(window._taskTicker); window._taskTicker = null; }
}

// ---------------------------------------------------------------------------
// Logg
// ---------------------------------------------------------------------------
async function loadEntries() {
  const { data: entries, error } = await db.from("log_entries")
    .select("*").eq("event_id", currentEvent.id)
    .order("created_at", { ascending: false }).limit(100);
  if (error) { console.error(error); return; }

  const ids = (entries || []).map((e) => e.id);
  let comments = [], attachments = [];
  if (ids.length) {
    const c = await db.from("log_comments").select("*").in("log_entry_id", ids).order("created_at");
    comments = c.data || [];
    const a = await db.from("log_attachments").select("*").in("log_entry_id", ids);
    attachments = a.data || [];
  }
  const rows = (entries || []).map((e) => ({
    ...e,
    comments: comments.filter((c) => c.log_entry_id === e.id),
    attachments: attachments.filter((a) => a.log_entry_id === e.id),
  }));
  renderEntries(rows);
}

function renderEntries(rows) {
  const list = el("logg-list");
  list.innerHTML = "";
  el("logg-empty").classList.toggle("hidden", rows.length > 0);
  rows.forEach((row) => list.appendChild(entryRow(row)));
}

function entryRow(row) {
  const li = document.createElement("li");
  const isPrioritert = row.category === "Prioritert hendelse";
  li.className = `item-row ${isPrioritert ? "sev-hoy" : ""}`;

  const statusBadge = row.entry_kind === "hendelse"
    ? `<span class="badge ${row.status === "pagaende" ? "status-under" : "status-lukket"}">${row.status === "pagaende" ? "Pågående" : "Avsluttet"}</span>`
    : "";

  const metaBits = [];
  if (row.location) metaBits.push(escapeHtml(row.location));
  if (row.reporter_source) metaBits.push("Via: " + escapeHtml(row.reporter_source));
  metaBits.push(escapeHtml(row.created_by_name || ""));

  li.innerHTML = `
    <div class="row-top">
      <span class="kategori">${CATEGORY_LABELS[row.category] || row.category}</span>
      <span class="tid">${formatTime(row.created_at)}</span>
    </div>
    <div class="beskrivelse">${escapeHtml(row.description || "")}</div>
    ${row.action_taken ? `<div class="beskrivelse">Tiltak: ${escapeHtml(row.action_taken)}</div>` : ""}
    <div class="meta-line">${statusBadge} ${metaBits.length ? `<span class="meta-text">${metaBits.join(" · ")}</span>` : ""}</div>
    ${row.notified?.length ? `<div class="meta-line"><span class="meta-text">Varslet: ${row.notified.join(", ")}</span></div>` : ""}
    <div class="attachments-row" id="att-${row.id}"></div>
    ${row.entry_kind === "hendelse" ? `
      <div class="comment-list">
        ${row.comments.map((c) => `<div class="comment-item"><span class="comment-who">${formatTime(c.created_at)} — ${escapeHtml(c.created_by_name)}</span>${escapeHtml(c.comment_text)}</div>`).join("")}
      </div>
      ${canWrite() && row.status === "pagaende" ? `
        <div class="inline-form">
          <input type="text" placeholder="Skriv en oppdatering..." class="comment-input" data-id="${row.id}">
          <button class="btn-small add-comment-btn" data-id="${row.id}">Legg til</button>
        </div>
        <button class="btn-small btn-close-case" data-id="${row.id}">Marker som avsluttet</button>
      ` : ""}
    ` : ""}
  `;

  if (row.attachments.length) {
    const wrap = li.querySelector(`#att-${row.id}`);
    row.attachments.forEach(async (a) => {
      const { data } = await db.storage.from("attachments").createSignedUrl(a.file_path, 3600);
      if (!data) return;
      if (a.file_type && a.file_type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = data.signedUrl; img.className = "thumb";
        img.addEventListener("click", () => window.open(data.signedUrl, "_blank"));
        wrap.appendChild(img);
      } else {
        const link = document.createElement("a");
        link.href = data.signedUrl; link.target = "_blank"; link.className = "file-chip";
        link.textContent = "📎 " + a.file_name;
        wrap.appendChild(link);
      }
    });
  }

  const commentBtn = li.querySelector(".add-comment-btn");
  if (commentBtn) commentBtn.addEventListener("click", () => addComment(row.id, li.querySelector(".comment-input")));
  const closeBtn = li.querySelector(".btn-close-case");
  if (closeBtn) closeBtn.addEventListener("click", () => markClosed(row.id));

  return li;
}

async function addComment(entryId, inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  const { data: { user } } = await db.auth.getUser();
  await db.from("log_comments").insert({
    log_entry_id: entryId, comment_text: text, created_by: user.id, created_by_name: profile.full_name,
  });
  inputEl.value = "";
  loadEntries();
}

async function markClosed(entryId) {
  await db.from("log_entries").update({ status: "avsluttet" }).eq("id", entryId);
  loadEntries();
}

// ---------------------------------------------------------------------------
// Ny loggføring
// ---------------------------------------------------------------------------
function handlePhotoPreview(e) {
  selectedFiles = Array.from(e.target.files || []);
  el("photo-preview").textContent = selectedFiles.length
    ? `${selectedFiles.length} fil(er) valgt: ${selectedFiles.map((f) => f.name).join(", ")}`
    : "";
}

function closeNewSheet() {
  el("new-sheet").classList.add("hidden");
  el("new-form").reset();
  el("photo-preview").textContent = "";
  selectedFiles = [];
}

async function saveNewEntry(e) {
  e.preventDefault();
  const saveBtn = el("save-new");
  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer …";

  try {
    const kind = el("new-kind").value;
    const notified = Array.from(document.querySelectorAll(".notify-cb:checked")).map((c) => c.value);
    const { data: { user } } = await db.auth.getUser();

    const { data: created, error } = await db.from("log_entries").insert({
      event_id: currentEvent.id,
      entry_kind: kind,
      category: el("new-kategori").value,
      location: el("new-lokasjon").value.trim() || null,
      reporter_source: el("new-reporter").value.trim() || null,
      description: el("new-beskrivelse").value.trim(),
      action_taken: el("new-tiltak").value.trim() || null,
      notified,
      status: kind === "hendelse" ? "pagaende" : "avsluttet",
      created_by: user.id,
      created_by_name: profile.full_name,
    }).select().single();

    if (error) throw error;

    for (const file of selectedFiles) {
      const path = `${currentEvent.id}/${created.id}/${Date.now()}_${file.name}`;
      const { error: upErr } = await db.storage.from("attachments").upload(path, file);
      if (upErr) { console.error(upErr); continue; }
      await db.from("log_attachments").insert({
        event_id: currentEvent.id, log_entry_id: created.id, file_path: path,
        file_name: file.name, file_type: file.type, uploaded_by: user.id, uploaded_by_name: profile.full_name,
      });
    }

    closeNewSheet();
    showToast("Loggføring lagret");
    loadEntries();
  } catch (err) {
    console.error(err);
    showToast("Kunne ikke lagre loggføringen. Prøv igjen.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lagre loggføring";
  }
}

// ---------------------------------------------------------------------------
// Oppgaver
// ---------------------------------------------------------------------------
async function loadTasks() {
  const { data, error } = await db.from("tasks").select("*").eq("event_id", currentEvent.id).order("sort_order");
  if (error) { console.error(error); return; }
  renderTasks(data || []);
  if (!window._taskTicker) window._taskTicker = setInterval(() => renderTasks(window._lastTasks || []), 1000);
  window._lastTasks = data || [];
}

function taskDisplaySeconds(t) {
  if (t.timer_mode === "fixed_time" && t.fixed_target_at) {
    return Math.max(0, Math.round((new Date(t.fixed_target_at).getTime() - Date.now()) / 1000));
  }
  if (t.timer_state === "running" && t.target_end_at) {
    return Math.max(0, Math.round((new Date(t.target_end_at).getTime() - Date.now()) / 1000));
  }
  return t.remaining_seconds ?? t.duration_seconds ?? 0;
}

function fmtSeconds(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function renderTasks(rows) {
  const list = el("oppgaver-list");
  list.innerHTML = "";
  el("oppgaver-empty").classList.toggle("hidden", rows.length > 0);

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "task-row";
    const done = row.done;
    li.innerHTML = `
      <button class="task-check ${done ? "done" : ""}" ${canWrite() ? "" : "disabled"}>${done ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-title ${done ? "done" : ""}">${escapeHtml(row.description || "")}</div>
        <div class="task-meta">${row.assigned_name ? escapeHtml(row.assigned_name) + " · " : ""}${row.has_timer ? fmtSeconds(taskDisplaySeconds(row)) : ""}</div>
      </div>
    `;
    if (canWrite()) {
      li.querySelector(".task-check").addEventListener("click", () => toggleTask(row.id, !done));
    }
    list.appendChild(li);
  });
}

async function toggleTask(id, done) {
  await db.from("tasks").update({ done }).eq("id", id);
  loadTasks();
}

async function saveNewTask(e) {
  e.preventDefault();
  const description = el("task-beskrivelse").value.trim();
  const assigned_name = el("task-ansvarlig").value.trim();
  if (!description) return;
  const { data: existing } = await db.from("tasks").select("sort_order").eq("event_id", currentEvent.id).order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length ? existing[0].sort_order + 1 : 0;
  await db.from("tasks").insert({
    event_id: currentEvent.id, description, assigned_name: assigned_name || null, sort_order: nextOrder,
  });
  el("new-task-sheet").classList.add("hidden");
  el("new-task-form").reset();
  showToast("Oppgave lagt til");
  loadTasks();
}

// ---------------------------------------------------------------------------
// Kontakter
// ---------------------------------------------------------------------------
async function loadContacts() {
  const { data, error } = await db.from("contacts").select("*").eq("event_id", currentEvent.id).order("sort_order");
  if (error) { console.error(error); return; }
  renderContacts(data || []);
}

function renderContacts(rows) {
  const list = el("kontakter-list");
  list.innerHTML = "";
  el("kontakter-empty").classList.toggle("hidden", rows.length > 0);

  rows.forEach((row) => {
    const li = document.createElement("li");
    if (row.is_divider) {
      li.className = "divider-row";
      li.textContent = row.name;
    } else {
      li.className = "contact-row";
      li.innerHTML = `
        <div class="task-title">${escapeHtml(row.name)}</div>
        <div class="task-meta">
          ${row.phone ? `<a href="tel:${escapeHtml(row.phone)}">${escapeHtml(row.phone)}</a>` : ""}
          ${row.email ? ` · <a href="mailto:${escapeHtml(row.email)}">${escapeHtml(row.email)}</a>` : ""}
          ${row.organization ? ` · ${escapeHtml(row.organization)}` : ""}
        </div>
      `;
    }
    list.appendChild(li);
  });
}

async function saveNewContact(e) {
  e.preventDefault();
  const name = el("contact-navn").value.trim();
  if (!name) return;
  const { data: existing } = await db.from("contacts").select("sort_order").eq("event_id", currentEvent.id).order("sort_order", { ascending: false }).limit(1);
  const nextOrder = existing && existing.length ? existing[0].sort_order + 1 : 0;
  await db.from("contacts").insert({
    event_id: currentEvent.id, name,
    phone: el("contact-tlf").value.trim() || null,
    email: el("contact-epost").value.trim() || null,
    organization: el("contact-org").value.trim() || null,
    is_divider: false, sort_order: nextOrder,
  });
  el("new-contact-sheet").classList.add("hidden");
  el("new-contact-form").reset();
  showToast("Kontakt lagt til");
  loadContacts();
}

// ---------------------------------------------------------------------------
// Push-varsler
// ---------------------------------------------------------------------------
function maybeShowPushBanner() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
  if (Notification.permission === "default") {
    el("push-banner").classList.remove("hidden");
  }
}

async function enablePush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      el("push-banner").classList.add("hidden");
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(CONFIG.VAPID_PUBLIC_KEY),
    });

    const raw = subscription.toJSON();
    const { data: { user } } = await db.auth.getUser();

    await db.from("push_subscriptions").upsert({
      user_id: user ? user.id : null,
      event_id: currentEvent ? currentEvent.id : null,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth: raw.keys.auth,
    }, { onConflict: "endpoint" });

    el("push-banner").classList.add("hidden");
    showToast("Push-varsler aktivert");
  } catch (err) {
    console.error("Klarte ikke å aktivere push:", err);
    showToast("Klarte ikke å aktivere push-varsler");
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// ---------------------------------------------------------------------------
// Diverse
// ---------------------------------------------------------------------------
function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((err) => console.error("Service worker-registrering feilet:", err));
  }
}

function updateOnlineStatus() {
  const dot = el("status-dot");
  if (navigator.onLine) {
    dot.textContent = "Tilkoblet";
    dot.classList.remove("offline");
  } else {
    dot.textContent = "Ingen nett";
    dot.classList.add("offline");
  }
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("no-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

let toastTimer;
function showToast(msg) {
  const toast = el("toast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
}
