window.Admin = {
  events: [],
  users: [],

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
      <button class="primary" onclick="Admin.createEvent()">${Lang.t("create")}</button>
    `;
  },

  async createEvent() {
    const name = document.getElementById("ev-name").value.trim();
    const event_date = document.getElementById("ev-date").value || null;
    if (!name) return;
    await sb.from("events").insert({ name, event_date });
    await this.refreshEvents();
    this._renderUserForm();
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
            <button class="ghost" onclick="Admin.manageLocations('${ev.id}','${ev.name.replace(/'/g, "\\'")}')">${Lang.t("manage_locations")}</button>
            <button class="ghost" onclick="PDFExport.exportEvent('${ev.id}','${ev.name.replace(/'/g, "\\'")}')">${Lang.t("export_pdf")}</button>
            ${ev.status === "active" ? `<button class="danger" onclick="Admin.archiveEvent('${ev.id}','${ev.name.replace(/'/g, "\\'")}')">${Lang.t("archive_export")}</button>` : ""}
          </td>
        </tr>`).join("")}</tbody></table>
    `;
  },

  async manageLocations(eventId, eventName) {
    const { data } = await sb.from("locations").select("*").eq("event_id", eventId).order("name");
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:480px;margin:3rem auto;">
        <div class="panel-head">${Lang.t("manage_locations")} – ${eventName} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <ul>${(data || []).map((l) => `<li>${l.name}</li>`).join("")}</ul>
          <div class="row"><input id="new-loc-name" placeholder="${Lang.t("add_location")}" style="flex:1">
          <button onclick="Admin.addLocationTo('${eventId}','${eventName.replace(/'/g, "\\'")}')">${Lang.t("add_location")}</button></div>
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async addLocationTo(eventId, eventName) {
    const name = document.getElementById("new-loc-name").value.trim();
    if (!name) return;
    await sb.from("locations").insert({ event_id: eventId, name });
    this.manageLocations(eventId, eventName);
  },

  async archiveEvent(eventId, eventName) {
    if (!confirm(Lang.t("confirm_archive"))) return;
    await PDFExport.exportEvent(eventId, eventName);
    await sb.from("events").delete().eq("id", eventId);
    await this.refreshEvents();
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
      alert("Passord oppdatert.");
    } catch (e) {
      alert("Kunne ikke nå funksjonen: " + e);
    }
  },

  _renderUsers() {
    document.getElementById("user-list").innerHTML = `
      <table class="data-table"><thead><tr><th>${Lang.t("username")}</th><th>${Lang.t("full_name")}</th><th>${Lang.t("role")}</th><th>${Lang.t("assigned_event")}</th><th></th></tr></thead>
      <tbody>${this.users.map((u) => `
        <tr>
          <td class="mono">${u.username}</td>
          <td>${u.full_name}</td>
          <td>${Lang.t("role_" + u.role)}</td>
          <td>${this.events.find((e) => e.id === u.event_id)?.name || "–"}</td>
          <td><button class="ghost" onclick="Admin.resetPassword('${u.id}')">${Lang.t("reset_password")}</button></td>
        </tr>`).join("")}</tbody></table>
    `;
  },
};
