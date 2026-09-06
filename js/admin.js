window.Admin = {
  events: [],
  users: [],

  toast(msg) {
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "position:fixed;bottom:1.5rem;right:1.5rem;background:var(--success);color:#06131f;font-weight:600;padding:.6rem 1rem;border-radius:6px;z-index:200;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  },

  async init() {
    await this.refreshEvents();
    await this.refreshUsers();
    this._renderEventForm();
    this._renderUserForm();
  },

  async refreshEvents() {
    const { data } = await sb.from("events").select("*").order("created_at", { ascending: false });
    this.events = data || [];
    this._renderEvents();
  },

  async refreshUsers() {
    const { data } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    this.users = data || [];
    this._renderUsers();
  },

  _renderEventForm() {
    document.getElementById("event-form").innerHTML = `
      <div class="field"><label>${Lang.t("event_name")}</label><input id="ev-name"></div>
      <div class="field"><label>${Lang.t("event_date")}</label><input type="date" id="ev-date"></div>
      <div class="field"><label>${Lang.t("active_from")}</label><input type="datetime-local" id="ev-active-from"></div>
      <div class="field"><label>${Lang.t("active_until")}</label><input type="datetime-local" id="ev-active-until"></div>
      <button class="primary" onclick="Admin.createEvent()">${Lang.t("create")}</button>
    `;
  },

  async createEvent() {
    const name = document.getElementById("ev-name").value.trim();
    const event_date = document.getElementById("ev-date").value || null;
    const activeFromVal = document.getElementById("ev-active-from").value;
    const activeUntilVal = document.getElementById("ev-active-until").value;
    if (!name) return;
    await sb.from("events").insert({
      name, event_date,
      active_from: activeFromVal ? new Date(activeFromVal).toISOString() : null,
      active_until: activeUntilVal ? new Date(activeUntilVal).toISOString() : null,
    });
    await this.refreshEvents();
    this._renderUserForm();
    this.toast("Arrangement opprettet");
  },

  _renderEvents() {
    document.getElementById("event-list").innerHTML = `
      <table class="data-table"><thead><tr><th>${Lang.t("event_name")}</th><th>${Lang.t("event_date")}</th><th>Status</th><th></th></tr></thead>
      <tbody>${this.events.map((ev) => `
        <tr>
          <td>${ev.name}</td>
          <td class="mono">${ev.event_date || "–"}</td>
          <td>${ev.status}</td>
          <td>
            <a href="app.html?event=${ev.id}"><button class="ghost">Åpne logg</button></a>
            <button class="ghost" onclick="PDFExport.promptAndExport('${ev.id}','${ev.name.replace(/'/g, "\\'")}')">${Lang.t("export_pdf")}</button>
            ${ev.status === "active" ? `<button class="danger" onclick="Admin.archiveEvent('${ev.id}','${ev.name.replace(/'/g, "\\'")}')">${Lang.t("archive_export")}</button>` : ""}
          </td>
        </tr>`).join("")}</tbody></table>
    `;
  },

  async archiveEvent(eventId, eventName) {
    if (!confirm(Lang.t("confirm_archive"))) return;
    await sb.from("events").delete().eq("id", eventId);
    await this.refreshEvents();
    this.toast("Arrangement arkivert");
  },

  _renderUserForm() {
    document.getElementById("user-form").innerHTML = `
      <div class="field"><label>${Lang.t("username")}</label><input id="u-username"></div>
      <div class="field"><label>${Lang.t("password")}</label><input id="u-password" type="password"></div>
      <div class="field"><label>${Lang.t("full_name")}</label><input id="u-fullname"></div>
      <div class="field"><label>${Lang.t("role")}</label>
        <select id="u-role" onchange="document.getElementById('u-event-wrap').classList.toggle('hidden', this.value==='admin')">
          <option value="logger">${Lang.t("role_logger")}</option>
          <option value="observator">${Lang.t("role_observator")}</option>
          <option value="admin">${Lang.t("role_admin")}</option>
        </select></div>
      <div class="field" id="u-event-wrap"><label>${Lang.t("assigned_event")}</label>
        <select id="u-event">${this.events.map((ev) => `<option value="${ev.id}">${ev.name}</option>`).join("")}</select></div>
      <button class="primary" onclick="Admin.createUser()">${Lang.t("create")}</button>
      <div id="user-form-error" class="error-text"></div>
    `;
  },

  async createUser() {
    const username = document.getElementById("u-username").value.trim();
    const password = document.getElementById("u-password").value;
    const full_name = document.getElementById("u-fullname").value.trim();
    const role = document.getElementById("u-role").value;
    const event_id = role === "admin" ? null : document.getElementById("u-event").value;
    const errEl = document.getElementById("user-form-error");
    errEl.textContent = "";
    try {
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-create-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ username, password, full_name, role, event_id }),
      });
      const result = await resp.json();
      if (!resp.ok) { errEl.textContent = result.error || "Feil ved oppretting"; return; }
      await this.refreshUsers();
      this.toast("Bruker opprettet");
    } catch (e) {
      errEl.textContent = "Kunne ikke nå funksjonen (sjekk at admin-create-user er deployet med CORS-støtte): " + e;
    }
  },

  async resetPassword(userId) {
    const newPassword = prompt(Lang.t("reset_password") + ":");
    if (!newPassword) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, new_password: newPassword }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert("Feil: " + (result.error || "ukjent feil")); return; }
      this.toast("Passord oppdatert");
    } catch (e) {
      alert("Kunne ikke nå funksjonen: " + e);
    }
  },

  async deleteUser(userId) {
    if (!confirm(Lang.t("confirm_delete_user"))) return;
    try {
      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${window.SUPABASE_URL}/functions/v1/admin-delete-user`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId }),
      });
      const result = await resp.json();
      if (!resp.ok) { alert("Feil: " + (result.error || "ukjent feil")); return; }
      await this.refreshUsers();
      this.toast("Bruker slettet");
    } catch (e) {
      alert("Kunne ikke nå funksjonen: " + e);
    }
  },

  async saveUserRow(userId) {
    const eventEl = document.getElementById(`u-event-${userId}`);
    const fromEl = document.getElementById(`u-from-${userId}`);
    const untilEl = document.getElementById(`u-until-${userId}`);
    const payload = {
      active_from: fromEl.value ? new Date(fromEl.value).toISOString() : null,
      active_until: untilEl.value ? new Date(untilEl.value).toISOString() : null,
    };
    if (eventEl) payload.event_id = eventEl.value || null;
    const { error } = await sb.from("profiles").update(payload).eq("id", userId);
    if (error) { alert("Feil: " + error.message); return; }
    await this.refreshUsers();
    this.toast("Lagret");
  },

  _toDatetimeLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  _renderUsers() {
    document.getElementById("user-list").innerHTML = `
      <table class="data-table"><thead><tr>
        <th>${Lang.t("username")}</th><th>${Lang.t("full_name")}</th><th>${Lang.t("role")}</th>
        <th>${Lang.t("assigned_event")}</th><th>${Lang.t("active_from")}</th><th>${Lang.t("active_until")}</th><th></th>
      </tr></thead>
      <tbody>${this.users.map((u) => `
        <tr>
          <td class="mono">${u.username}</td>
          <td>${u.full_name}</td>
          <td>${Lang.t("role_" + u.role)}</td>
          <td>${u.role === "admin" ? "–" : `
            <select id="u-event-${u.id}">
              ${this.events.map((ev) => `<option value="${ev.id}" ${ev.id === u.event_id ? "selected" : ""}>${ev.name}</option>`).join("")}
            </select>`}</td>
          <td>${u.role === "admin" ? "–" : `<input type="datetime-local" id="u-from-${u.id}" value="${this._toDatetimeLocal(u.active_from)}" style="min-width:170px">`}</td>
          <td>${u.role === "admin" ? "–" : `<input type="datetime-local" id="u-until-${u.id}" value="${this._toDatetimeLocal(u.active_until)}" style="min-width:170px">`}</td>
          <td style="white-space:nowrap">
            ${u.role === "admin" ? "" : `<button class="ghost" onclick="Admin.saveUserRow('${u.id}')">${Lang.t("save_row")}</button>`}
            <button class="ghost" onclick="Admin.resetPassword('${u.id}')">${Lang.t("reset_password")}</button>
            <button class="danger" onclick="Admin.deleteUser('${u.id}')">${Lang.t("delete_user")}</button>
          </td>
        </tr>`).join("")}</tbody></table>
      <p class="small" style="margin-top:.5rem">${Lang.t("no_limit")}: la feltet stå tomt.</p>
    `;
  },
};
