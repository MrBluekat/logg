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
    this._renderMapPanel();
    await this.loadPresence();
    await this.loadActivityLog();
    setInterval(() => this.loadPresence(), 30 * 1000); // oppdater "aktiv nå" jevnlig
  },

  async refreshEvents() {
    const { data } = await sb.from("events").select("*").order("created_at", { ascending: false });
    this.events = data || [];
    this._renderEvents();
  },

  async refreshUsers() {
    const { data } = await sb.from("profiles").select("*").order("created_at", { ascending: false });
    this.users = data || [];
    await this.loadUserListItems();
    this._renderUsers();
  },

  // Manuell rekkefølge/gruppering av brukerlisten (med skillestreker). Brukere som
  // ikke har en egen rad her ennå (f.eks. opprettet før denne funksjonen fantes)
  // legges automatisk til på slutten, slik at ingen forsvinner fra visningen.
  async loadUserListItems() {
    const { data } = await sb.from("user_list_items").select("*").order("sort_order");
    let items = data || [];
    const known = new Set(items.filter((i) => i.kind === "user").map((i) => i.profile_id));
    const orphans = this.users.filter((u) => !known.has(u.id));
    if (orphans.length) {
      const maxOrder = items.reduce((m, i) => Math.max(m, i.sort_order), -1);
      const newItems = orphans.map((u, idx) => ({ kind: "user", profile_id: u.id, sort_order: maxOrder + 1 + idx }));
      await sb.from("user_list_items").insert(newItems);
      const { data: refreshed } = await sb.from("user_list_items").select("*").order("sort_order");
      items = refreshed || items;
    }
    this.userListItems = items;
  },

  async addUserDivider() {
    const label = prompt("Tekst på skillestreken (f.eks. arrangement- eller avdelingsnavn):");
    if (label === null) return;
    const maxOrder = (this.userListItems || []).reduce((m, i) => Math.max(m, i.sort_order), -1);
    await sb.from("user_list_items").insert({ kind: "divider", label: label.trim() || "—", sort_order: maxOrder + 1 });
    await this.loadUserListItems();
    this._renderUsers();
  },

  async removeUserListItem(itemId) {
    await sb.from("user_list_items").delete().eq("id", itemId);
    await this.loadUserListItems();
    this._renderUsers();
  },

  async moveUserListItem(itemId, direction) {
    const items = this.userListItems;
    const idx = items.findIndex((i) => i.id === itemId);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx], b = items[swapIdx];
    await sb.from("user_list_items").update({ sort_order: b.sort_order }).eq("id", a.id);
    await sb.from("user_list_items").update({ sort_order: a.sort_order }).eq("id", b.id);
    await this.loadUserListItems();
    this._renderUsers();
  },

  // ------------------------------------------------------------------------
  // Tilstedeværelse ("aktiv nå") og aktivitetslogg
  // ------------------------------------------------------------------------
  async loadPresence() {
    const { data } = await sb.from("presence").select("*");
    this.presence = data || [];
    this._renderPresence();
  },

  async loadActivityLog() {
    const { data } = await sb.from("activity_log").select("*").order("created_at", { ascending: false }).limit(200);
    this.activityLog = data || [];
    this._renderActivityLog();
  },

  _renderPresence() {
    const el = document.getElementById("presence-list");
    if (!el) return;
    const now = Date.now();
    const ONLINE_WINDOW_MS = 5 * 60 * 1000;
    const rows = this.users.map((u) => {
      const p = (this.presence || []).find((x) => x.user_id === u.id);
      const lastSeen = p ? new Date(p.last_seen_at) : null;
      const online = lastSeen && (now - lastSeen.getTime()) < ONLINE_WINDOW_MS;
      return { u, lastSeen, online };
    }).sort((a, b) => (b.lastSeen?.getTime() || 0) - (a.lastSeen?.getTime() || 0));
    el.innerHTML = `
      <table class="data-table"><thead><tr>
        <th></th><th>${Lang.t("username")}</th><th>${Lang.t("full_name")}</th><th>${Lang.t("role")}</th><th>${Lang.t("last_seen")}</th>
      </tr></thead>
      <tbody>${rows.map(({ u, lastSeen, online }) => `
        <tr>
          <td>${online ? `<span style="color:var(--success)">●</span> ${Lang.t("online_now_badge")}` : ""}</td>
          <td class="mono">${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${Lang.t("role_" + u.role)}</td>
          <td class="small">${lastSeen ? lastSeen.toLocaleString("no-NO") : "–"}</td>
        </tr>`).join("")}</tbody></table>
    `;
  },

  _renderActivityLog() {
    const el = document.getElementById("activity-log");
    if (!el) return;
    const eventName = (id) => this.events.find((e) => e.id === id)?.name || "";
    el.innerHTML = `
      <table class="data-table"><thead><tr>
        <th>${Lang.t("timestamp")}</th><th>${Lang.t("username")}</th><th>${Lang.t("action")}</th><th>${Lang.t("details")}</th><th>${Lang.t("assigned_event")}</th>
      </tr></thead>
      <tbody>${(this.activityLog || []).map((a) => `
        <tr>
          <td class="small mono">${new Date(a.created_at).toLocaleString("no-NO")}</td>
          <td class="small">${escapeHtml(a.user_name)}</td>
          <td class="small">${escapeHtml(a.action)}</td>
          <td class="small">${escapeHtml(a.details || "–")}</td>
          <td class="small">${escapeHtml(a.event_id ? eventName(a.event_id) : "–")}</td>
        </tr>`).join("") || `<tr><td colspan="5" class="small">–</td></tr>`}</tbody></table>
    `;
  },

  // ------------------------------------------------------------------------
  // Egendefinert kart (kalibrert med to hjørner) - brukes som grunnlag for
  // GPS-posisjoner/pinger i stedet for Google Maps når mulig.
  // ------------------------------------------------------------------------
  _mapSelectedEventId: null,

  async _renderMapPanel() {
    const el = document.getElementById("map-panel");
    if (!el) return;
    if (!this._mapSelectedEventId && this.events.length) this._mapSelectedEventId = this.events[0].id;

    el.innerHTML = `
      <div class="field"><label>${Lang.t("event_name")}</label>
        <select id="map-event-select" onchange="Admin._onMapEventChange(this.value)">
          ${this.events.map((ev) => `<option value="${ev.id}" ${ev.id === this._mapSelectedEventId ? "selected" : ""}>${escapeHtml(ev.name)}</option>`).join("")}
        </select>
      </div>
      <div id="map-panel-body">Laster …</div>
    `;
    if (this._mapSelectedEventId) await this._loadMapForSelectedEvent();
  },

  async _onMapEventChange(eventId) {
    this._mapSelectedEventId = eventId;
    await this._loadMapForSelectedEvent();
  },

  async _loadMapForSelectedEvent() {
    const body = document.getElementById("map-panel-body");
    const { data } = await sb.from("event_maps").select("*").eq("event_id", this._mapSelectedEventId);
    const existing = (data && data[0]) || null;
    let previewUrl = "";
    if (existing) {
      const { data: signed } = await sb.storage.from("attachments").createSignedUrl(existing.image_path, 3600);
      previewUrl = signed?.signedUrl || "";
    }
    body.innerHTML = `
      ${existing ? `
        <div style="margin-bottom:1rem">
          <img src="${previewUrl}" style="max-width:100%;max-height:260px;border-radius:8px;border:1px solid var(--border)">
          <p class="small" style="margin-top:.4rem">${Lang.t("map_current")}</p>
          <button class="danger" onclick="Admin.deleteMap()">${Lang.t("remove")}</button>
        </div>
      ` : `<p class="small" style="margin-bottom:1rem">${Lang.t("map_none")}</p>`}
      <p class="small" style="margin-bottom:.6rem">${Lang.t("map_hint")}</p>
      <div class="grid-2">
        <div class="field"><label>${Lang.t("map_image")}</label><input type="file" id="map-image-input" accept="image/*"></div>
        <div></div>
        <div class="field"><label>${Lang.t("map_top_left")}</label>
          <input id="map-tl-lat" placeholder="Breddegrad (lat)" value="${existing ? existing.top_left_lat : ""}">
          <input id="map-tl-lng" placeholder="Lengdegrad (lng)" style="margin-top:.3rem" value="${existing ? existing.top_left_lng : ""}">
        </div>
        <div class="field"><label>${Lang.t("map_bottom_right")}</label>
          <input id="map-br-lat" placeholder="Breddegrad (lat)" value="${existing ? existing.bottom_right_lat : ""}">
          <input id="map-br-lng" placeholder="Lengdegrad (lng)" style="margin-top:.3rem" value="${existing ? existing.bottom_right_lng : ""}">
        </div>
      </div>
      <button class="primary" onclick="Admin.saveMap()">${Lang.t("save")}</button>
      <div id="map-error" class="error-text"></div>
    `;
  },

  async saveMap() {
    const eventId = this._mapSelectedEventId;
    const fileInput = document.getElementById("map-image-input");
    const tlLat = parseFloat(document.getElementById("map-tl-lat").value);
    const tlLng = parseFloat(document.getElementById("map-tl-lng").value);
    const brLat = parseFloat(document.getElementById("map-br-lat").value);
    const brLng = parseFloat(document.getElementById("map-br-lng").value);
    const errEl = document.getElementById("map-error");
    errEl.textContent = "";

    if ([tlLat, tlLng, brLat, brLng].some((n) => Number.isNaN(n))) {
      errEl.textContent = "Alle fire koordinatene må fylles ut.";
      return;
    }

    const { data: existingRows } = await sb.from("event_maps").select("*").eq("event_id", eventId);
    const existing = (existingRows && existingRows[0]) || null;
    let imagePath = existing ? existing.image_path : null;

    if (fileInput.files.length) {
      const file = fileInput.files[0];
      imagePath = `${eventId}/map/${Date.now()}_${file.name}`;
      const { error: upErr } = await sb.storage.from("attachments").upload(imagePath, file, { contentType: file.type, upsert: true });
      if (upErr) { errEl.textContent = "Kunne ikke laste opp bilde: " + upErr.message; return; }
    }
    if (!imagePath) {
      errEl.textContent = "Velg et kartbilde.";
      return;
    }

    const payload = {
      event_id: eventId, image_path: imagePath,
      top_left_lat: tlLat, top_left_lng: tlLng,
      bottom_right_lat: brLat, bottom_right_lng: brLng,
    };
    const { error } = existing
      ? await sb.from("event_maps").update(payload).eq("event_id", eventId)
      : await sb.from("event_maps").insert(payload);
    if (error) { errEl.textContent = "Feil: " + error.message; return; }

    await this._loadMapForSelectedEvent();
    this.toast("Kart lagret");
  },

  async deleteMap() {
    if (!confirm("Fjerne det egendefinerte kartet for dette arrangementet?")) return;
    await sb.from("event_maps").delete().eq("event_id", this._mapSelectedEventId);
    await this._loadMapForSelectedEvent();
    this.toast("Kart fjernet");
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

  DEFAULT_LOCATIONS: ["Innslipp", "Stage left", "Stage right", "Front of house", "Bar", "Toalettområde"],

  async createEvent() {
    const name = document.getElementById("ev-name").value.trim();
    const event_date = document.getElementById("ev-date").value || null;
    const activeFromVal = document.getElementById("ev-active-from").value;
    const activeUntilVal = document.getElementById("ev-active-until").value;
    if (!name) return;
    const { data: created } = await sb.from("events").insert({
      name, event_date,
      active_from: activeFromVal ? new Date(activeFromVal).toISOString() : null,
      active_until: activeUntilVal ? new Date(activeUntilVal).toISOString() : null,
    }).select().single();

    if (created) {
      await sb.from("locations").insert(
        this.DEFAULT_LOCATIONS.map((name) => ({ event_id: created.id, name }))
      );
    }

    await this.refreshEvents();
    this._renderUserForm();
    this.toast("Arrangement opprettet");
    Auth.logActivity("Opprettet arrangement", name);
  },

  _renderEvents() {
    document.getElementById("event-list").innerHTML = `
      <table class="data-table"><thead><tr><th>${Lang.t("event_name")}</th><th>${Lang.t("event_date")}</th><th>Status</th><th></th></tr></thead>
      <tbody>${this.events.map((ev) => `
        <tr>
          <td>${escapeHtml(ev.name)}</td>
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
    Auth.logActivity("Arkiverte arrangement", eventName);
  },

  _renderUserForm() {
    document.getElementById("user-form").innerHTML = `
      <div class="field"><label>${Lang.t("username")}</label><input id="u-username"></div>
      <div class="field"><label>${Lang.t("password")}</label><input id="u-password" type="password"></div>
      <div class="field"><label>${Lang.t("full_name")}</label><input id="u-fullname"></div>
      <div class="field"><label>${Lang.t("role")}</label>
        <select id="u-role" onchange="document.getElementById('u-event-hint').classList.toggle('hidden', this.value!=='admin')">
          <option value="logger">${Lang.t("role_logger")}</option>
          <option value="observator">${Lang.t("role_observator")}</option>
          <option value="admin">${Lang.t("role_admin")}</option>
        </select></div>
      <div class="field" id="u-event-wrap"><label>${Lang.t("assigned_event")}</label>
        <select id="u-event"><option value="">${Lang.t("no_event")}</option>${this.events.map((ev) => `<option value="${ev.id}">${escapeHtml(ev.name)}</option>`).join("")}</select>
        <p class="small hidden" id="u-event-hint" style="margin-top:.3rem">${Lang.t("admin_event_optional_hint")}</p>
      </div>
      <button class="primary" onclick="Admin.createUser()">${Lang.t("create")}</button>
      <div id="user-form-error" class="error-text"></div>
    `;
  },

  async createUser() {
    const username = document.getElementById("u-username").value.trim();
    const password = document.getElementById("u-password").value;
    const full_name = document.getElementById("u-fullname").value.trim();
    const role = document.getElementById("u-role").value;
    const event_id = document.getElementById("u-event").value || null;
    if (role !== "admin" && !event_id) {
      document.getElementById("user-form-error").textContent = "Logger/observatør må ha et tilknyttet arrangement.";
      return;
    }
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
      Auth.logActivity("Opprettet bruker", `${username} (${Lang.t("role_" + role)})`);
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
    const target = this.users.find((u) => u.id === userId);
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
      Auth.logActivity("Slettet bruker", target ? target.username : userId);
    } catch (e) {
      alert("Kunne ikke nå funksjonen: " + e);
    }
  },

  async saveUserRow(userId) {
    const eventEl = document.getElementById(`u-event-${userId}`);
    const fromEl = document.getElementById(`u-from-${userId}`);
    const untilEl = document.getElementById(`u-until-${userId}`);
    const payload = {};
    if (eventEl) payload.event_id = eventEl.value || null;
    if (fromEl) payload.active_from = fromEl.value ? new Date(fromEl.value).toISOString() : null;
    if (untilEl) payload.active_until = untilEl.value ? new Date(untilEl.value).toISOString() : null;
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
    const canDelete = (u) => u.id !== Auth.profile.id;
    document.getElementById("user-list").innerHTML = `
      <table class="data-table"><thead><tr>
        <th></th><th>${Lang.t("username")}</th><th>${Lang.t("full_name")}</th><th>${Lang.t("role")}</th>
        <th>${Lang.t("assigned_event")}</th><th>${Lang.t("active_from")}</th><th>${Lang.t("active_until")}</th><th></th>
      </tr></thead>
      <tbody>${(this.userListItems || []).map((item, idx) => {
        const moveButtons = `
          <button class="ghost" style="padding:.1rem .4rem" onclick="Admin.moveUserListItem('${item.id}',-1)" ${idx === 0 ? "disabled" : ""}>▲</button>
          <button class="ghost" style="padding:.1rem .4rem" onclick="Admin.moveUserListItem('${item.id}',1)" ${idx === this.userListItems.length - 1 ? "disabled" : ""}>▼</button>`;

        if (item.kind === "divider") {
          return `<tr><td colspan="8" style="padding-top:1rem">
            <div style="display:flex;align-items:center;gap:.6rem">
              ${moveButtons}
              <strong style="white-space:nowrap">${escapeHtml(item.label)}</strong>
              <div style="flex:1;border-top:1px solid var(--border)"></div>
              <button class="ghost" onclick="Admin.removeUserListItem('${item.id}')">${Lang.t("remove")}</button>
            </div>
          </td></tr>`;
        }

        const u = this.users.find((x) => x.id === item.profile_id);
        if (!u) return ""; // brukeren ble slettet - raden fjernes automatisk via kaskade neste innlasting
        return `
        <tr>
          <td style="white-space:nowrap">${moveButtons}</td>
          <td class="mono">${escapeHtml(u.username)}</td>
          <td>${escapeHtml(u.full_name)}</td>
          <td>${Lang.t("role_" + u.role)}</td>
          <td>
            <select id="u-event-${u.id}">
              <option value="">${Lang.t("no_event")}</option>
              ${this.events.map((ev) => `<option value="${ev.id}" ${ev.id === u.event_id ? "selected" : ""}>${escapeHtml(ev.name)}</option>`).join("")}
            </select></td>
          <td>${u.role === "admin" ? "–" : `<input type="datetime-local" id="u-from-${u.id}" value="${this._toDatetimeLocal(u.active_from)}" style="min-width:170px">`}</td>
          <td>${u.role === "admin" ? "–" : `<input type="datetime-local" id="u-until-${u.id}" value="${this._toDatetimeLocal(u.active_until)}" style="min-width:170px">`}</td>
          <td style="white-space:nowrap">
            <button class="ghost" onclick="Admin.saveUserRow('${u.id}')">${Lang.t("save_row")}</button>
            <button class="ghost" onclick="Admin.resetPassword('${u.id}')">${Lang.t("reset_password")}</button>
            ${canDelete(u) ? `<button class="danger" onclick="Admin.deleteUser('${u.id}')">${Lang.t("delete_user")}</button>` : ""}
          </td>
        </tr>`;
      }).join("")}</tbody></table>
      <p class="small" style="margin-top:.5rem">${Lang.t("no_limit")}: la feltet stå tomt.</p>
    `;
  },
};
