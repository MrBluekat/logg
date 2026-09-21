// ===========================================================================
// Arrangementslogg – PWA-frontend
//
// Antatt databasestruktur i Supabase (juster i config.js / spørringene under
// hvis dine tabeller heter noe annet):
//
//   hendelser (id, created_at, kategori, alvorlighet, beskrivelse,
//              status, bilde_url, opprettet_av)
//   oppgaver  (id, tittel, status, frist, tildelt_til)
//   push_subscriptions (id, user_id, endpoint, p256dh, auth)
// ===========================================================================

const supabase = window.supabase.createClient(
  CONFIG.SUPABASE_URL,
  CONFIG.SUPABASE_ANON_KEY
);

const el = (id) => document.getElementById(id);

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", async () => {
  registerServiceWorker();
  wireUpEvents();
  updateOnlineStatus();
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await enterApp();
  }
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    el("screen-app").classList.add("hidden");
    el("screen-login").classList.remove("hidden");
  }
});

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
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

    // Bygg om brukernavn til e-post, samme mønster som hovedsiden bruker
    const email = username.includes("@")
      ? username
      : `${username}@${CONFIG.LOGIN_EMAIL_DOMAIN}`;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    btn.disabled = false;
    btn.textContent = "Logg inn";

    if (error) {
      errorBox.textContent = "Feil e-post eller passord.";
      return;
    }
    await enterApp();
  });

  // Tab switching
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // New-hendelse sheet
  el("fab-new").addEventListener("click", () => el("new-sheet").classList.remove("hidden"));
  el("cancel-new").addEventListener("click", closeNewSheet);
  el("new-sheet").addEventListener("click", (e) => {
    if (e.target.id === "new-sheet") closeNewSheet();
  });
  el("new-photo").addEventListener("change", handlePhotoPreview);
  el("new-form").addEventListener("submit", saveNewHendelse);

  // Push
  el("push-enable-btn").addEventListener("click", enablePush);
}

async function enterApp() {
  el("screen-login").classList.add("hidden");
  el("screen-app").classList.remove("hidden");
  await Promise.all([loadHendelser(), loadOppgaver()]);
  subscribeToRealtimeHendelser();
  maybeShowPushBanner();
}

function switchTab(tab) {
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  el(`tab-${tab}`).classList.add("active");
  document.querySelector(`.tab-btn[data-tab="${tab}"]`).classList.add("active");
  el("header-title").textContent = tab === "logg" ? "Logg" : "Oppgaver";
  el("fab-new").style.display = tab === "logg" ? "flex" : "none";
}

// ---------------------------------------------------------------------------
// Logg
// ---------------------------------------------------------------------------
async function loadHendelser() {
  const { data, error } = await supabase
    .from(CONFIG.TABLE_HENDELSER)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Klarte ikke å hente hendelser:", error);
    return;
  }
  renderHendelser(data || []);
}

function renderHendelser(rows) {
  const list = el("logg-list");
  list.innerHTML = "";
  el("logg-empty").classList.toggle("hidden", rows.length > 0);

  rows.forEach((row) => list.appendChild(hendelseRow(row)));
}

function hendelseRow(row) {
  const li = document.createElement("li");
  li.className = `item-row sev-${row.alvorlighet || "lav"}`;

  const statusClass =
    row.status === "lukket" ? "status-lukket" :
    row.status === "under" ? "status-under" : "status-apen";
  const statusLabel =
    row.status === "lukket" ? "Lukket" :
    row.status === "under" ? "Under arbeid" : "Åpen";

  li.innerHTML = `
    <div class="row-top">
      <span class="kategori">${escapeHtml(row.kategori || "Ukjent")}</span>
      <span class="tid">${formatTime(row.created_at)}</span>
    </div>
    <div class="beskrivelse">${escapeHtml(row.beskrivelse || "")}</div>
    <span class="badge ${statusClass}">${statusLabel}</span>
    ${row.bilde_url ? `<img class="thumb" src="${row.bilde_url}" alt="" />` : ""}
  `;
  return li;
}

function subscribeToRealtimeHendelser() {
  supabase
    .channel("hendelser-live")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: CONFIG.TABLE_HENDELSER },
      (payload) => {
        const list = el("logg-list");
        el("logg-empty").classList.add("hidden");
        list.insertBefore(hendelseRow(payload.new), list.firstChild);
      }
    )
    .subscribe();
}

// ---------------------------------------------------------------------------
// Oppgaver
// ---------------------------------------------------------------------------
async function loadOppgaver() {
  const { data, error } = await supabase
    .from(CONFIG.TABLE_OPPGAVER)
    .select("*")
    .order("frist", { ascending: true });

  if (error) {
    console.error("Klarte ikke å hente oppgaver:", error);
    return;
  }
  renderOppgaver(data || []);
}

function renderOppgaver(rows) {
  const list = el("oppgaver-list");
  list.innerHTML = "";
  el("oppgaver-empty").classList.toggle("hidden", rows.length > 0);

  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "task-row";
    const done = row.status === "fullført";
    li.innerHTML = `
      <button class="task-check ${done ? "done" : ""}" data-id="${row.id}">${done ? "✓" : ""}</button>
      <div class="task-body">
        <div class="task-title ${done ? "done" : ""}">${escapeHtml(row.tittel || "")}</div>
        <div class="task-meta">${row.tildelt_til ? escapeHtml(row.tildelt_til) + " · " : ""}${row.frist ? formatTime(row.frist) : "Ingen frist"}</div>
      </div>
    `;
    li.querySelector(".task-check").addEventListener("click", () => toggleOppgave(row));
    list.appendChild(li);
  });
}

async function toggleOppgave(row) {
  const newStatus = row.status === "fullført" ? "åpen" : "fullført";
  const { error } = await supabase
    .from(CONFIG.TABLE_OPPGAVER)
    .update({ status: newStatus })
    .eq("id", row.id);

  if (!error) loadOppgaver();
}

// ---------------------------------------------------------------------------
// Ny hendelse
// ---------------------------------------------------------------------------
let selectedPhotoFile = null;

function handlePhotoPreview(e) {
  const file = e.target.files[0];
  selectedPhotoFile = file || null;
  const preview = el("photo-preview");
  if (file) {
    preview.src = URL.createObjectURL(file);
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }
}

function closeNewSheet() {
  el("new-sheet").classList.add("hidden");
  el("new-form").reset();
  el("photo-preview").style.display = "none";
  selectedPhotoFile = null;
}

async function saveNewHendelse(e) {
  e.preventDefault();
  const saveBtn = el("save-new");
  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer …";

  try {
    let bildeUrl = null;
    if (selectedPhotoFile) {
      bildeUrl = await uploadPhoto(selectedPhotoFile);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from(CONFIG.TABLE_HENDELSER).insert({
      kategori: el("new-kategori").value,
      alvorlighet: el("new-alvorlighet").value,
      beskrivelse: el("new-beskrivelse").value,
      status: "apen",
      bilde_url: bildeUrl,
      opprettet_av: user ? user.id : null,
    });

    if (error) throw error;

    closeNewSheet();
    showToast("Hendelse lagret");
    loadHendelser();
  } catch (err) {
    console.error(err);
    showToast("Kunne ikke lagre hendelsen. Prøv igjen.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lagre hendelse";
  }
}

async function uploadPhoto(file) {
  const path = `${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("hendelse-bilder").upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from("hendelse-bilder").getPublicUrl(path);
  return data.publicUrl;
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
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from("push_subscriptions").upsert({
      user_id: user ? user.id : null,
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
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.error("Service worker-registrering feilet:", err)
    );
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
