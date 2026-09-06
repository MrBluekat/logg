window.Log = {
  CATEGORIES: ["Loggforing", "Utvisning", "Medisinsk hendelse", "Hendelse", "Prioritert hendelse", "Scene", "Vaer", "Publikumstall"],
  CATEGORY_LABELS: {
    "Loggforing": "Loggføring",
    "Utvisning": "Utvisning",
    "Medisinsk hendelse": "Medisinsk hendelse",
    "Hendelse": "Hendelse",
    "Prioritert hendelse": "Prioritert hendelse",
    "Scene": "Scene",
    "Vaer": "Vær",
    "Publikumstall": "Publikumstall",
  },
  NOTIFY_OPTIONS: ["Politi", "AMK", "Brannvesenet", "Sikkerhetsleder", "Krisegruppen"],
  BEREDSKAP_LEVELS: [
    { value: "gronn", label: "Grønt beredskapsnivå", color: "#3dbe7b" },
    { value: "gul", label: "Gult beredskapsnivå", color: "#e8c93d" },
    { value: "rod", label: "Rødt beredskapsnivå", color: "#e5595e" },
  ],
  SCENE_COLORS: [
    { value: "gronn", label: "Grønn scene", color: "#3dbe7b" },
    { value: "gul", label: "Gul scene", color: "#e8c93d" },
    { value: "oransje", label: "Oransje scene", color: "#e8873d" },
    { value: "rod", label: "Rød scene", color: "#e5595e" },
  ],
  entries: [],
  locations: [],

  async init() {
    await this.loadLocations();
    this._renderForm();
    this._renderFilters();
    await this.refresh();
    this._subscribeRealtime();
  },

  async loadLocations() {
    const { data } = await sb.from("locations").select("*").eq("event_id", Auth.event.id).order("name");
    this.locations = data || [];
  },

  async addLocation(name) {
    await sb.from("locations").insert({ event_id: Auth.event.id, name });
    await this.loadLocations();
  },

  async removeLocation(id) {
    await sb.from("locations").delete().eq("id", id);
    await this.loadLocations();
    this.manageLocations();
  },

  manageLocations() {
    const box = document.getElementById("history-modal");
    const canWrite = Auth.canWrite();
    box.innerHTML = `
      <div class="panel" style="max-width:420px;margin:3rem auto;">
        <div class="panel-head">${Lang.t("manage_locations")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <ul>${this.locations.map((l) => `<li style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
            <span>${l.name}</span> ${canWrite ? `<button class="ghost" onclick="Log.removeLocation('${l.id}')">${Lang.t("remove")}</button>` : ""}
          </li>`).join("") || `<li class="small">–</li>`}</ul>
          ${canWrite ? `
            <div class="row"><input id="new-loc-name" placeholder="${Lang.t("add_location")}" style="flex:1">
            <button onclick="Log.addLocationAndRerender()">${Lang.t("add_location")}</button></div>
          ` : ""}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async addLocationAndRerender() {
    const name = document.getElementById("new-loc-name").value.trim();
    if (!name) return;
    await this.addLocation(name);
    this._renderForm();
    this.manageLocations();
  },

  _subscribeRealtime() {
    sb.channel("log-" + Auth.event.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "log_entries", filter: `event_id=eq.${Auth.event.id}` }, () => this.refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "log_comments" }, () => this.refresh())
      .subscribe();
  },

  async refresh() {
    const filters = this._readFilters();
    let query = sb.from("log_entries").select("*").eq("event_id", Auth.event.id).order("created_at", { ascending: false });
    if (filters.category) query = query.eq("category", filters.category);
    if (filters.location) query = query.eq("location", filters.location);
    if (filters.status) query = query.eq("status", filters.status);
    if (filters.registeredBy) query = query.ilike("created_by_name", `%${filters.registeredBy}%`);
    if (filters.from) query = query.gte("created_at", filters.from);
    if (filters.to) query = query.lte("created_at", filters.to + "T23:59:59");
    if (filters.search) query = query.ilike("description", `%${filters.search}%`);

    const { data: entries, error } = await query;
    if (error) { console.error(error); return; }

    const ids = (entries || []).map((e) => e.id);
    let comments = [], attachments = [];
    if (ids.length) {
      const c = await sb.from("log_comments").select("*").in("log_entry_id", ids).order("created_at");
      comments = c.data || [];
      const a = await sb.from("log_attachments").select("*").in("log_entry_id", ids);
      attachments = a.data || [];
    }
    this.entries = (entries || []).map((e) => ({
      ...e,
      comments: comments.filter((c) => c.log_entry_id === e.id),
      attachments: attachments.filter((a) => a.log_entry_id === e.id),
    }));
    this._renderEntries();
    if (window.Dashboard) Dashboard.update(this.entries);
  },

  _readFilters() {
    const g = (id) => document.getElementById(id)?.value || "";
    return {
      category: g("f-category"), location: g("f-location"), status: g("f-status"),
      registeredBy: g("f-registeredby"), from: g("f-from"), to: g("f-to"), search: g("f-search"),
    };
  },

  applyFilters() { this.refresh(); },

  _renderFilters() {
    const el = document.getElementById("filter-bar");
    if (!el) return;
    el.innerHTML = `
      <div class="field"><label>${Lang.t("category")}</label>
        <select id="f-category" onchange="Log.applyFilters()"><option value="">${Lang.t("all_categories")}</option>
        ${this.CATEGORIES.map((c) => `<option value="${c}">${this.CATEGORY_LABELS[c]}</option>`).join("")}</select></div>
      <div class="field"><label>${Lang.t("location")}</label>
        <select id="f-location" onchange="Log.applyFilters()"><option value="">${Lang.t("all_locations")}</option>
        ${this.locations.map((l) => `<option value="${l.name}">${l.name}</option>`).join("")}</select></div>
      <div class="field"><label>${Lang.t("category").includes("type") ? "" : ""}${Lang.t("status_pagaende")}/${Lang.t("status_avsluttet")}</label>
        <select id="f-status" onchange="Log.applyFilters()"><option value="">${Lang.t("all_statuses")}</option>
        <option value="pagaende">${Lang.t("status_pagaende")}</option><option value="avsluttet">${Lang.t("status_avsluttet")}</option></select></div>
      <div class="field"><label>${Lang.t("registered_by")}</label><input id="f-registeredby" oninput="Log.applyFilters()"></div>
      <div class="field"><label>${Lang.t("from_date")}</label><input type="date" id="f-from" onchange="Log.applyFilters()"></div>
      <div class="field"><label>${Lang.t("to_date")}</label><input type="date" id="f-to" onchange="Log.applyFilters()"></div>
      <div class="field" style="flex:2 1 220px"><label>${Lang.t("search_placeholder")}</label><input id="f-search" oninput="Log.applyFilters()" placeholder="${Lang.t("search_placeholder")}"></div>
    `;
  },

  _renderForm() {
    const el = document.getElementById("entry-form");
    if (!el || !Auth.canWrite()) return;
    el.innerHTML = `
      <div class="grid-2">
        <div class="field"><label>${Lang.t("entry_type_label")}</label>
          <select id="in-kind"><option value="info">${Lang.t("entry_kind_info")}</option><option value="hendelse">${Lang.t("entry_kind_hendelse")}</option></select>
        </div>
        <div class="field"><label>${Lang.t("category")}</label>
          <select id="in-category">${this.CATEGORIES.map((c) => `<option value="${c}">${this.CATEGORY_LABELS[c]}</option>`).join("")}</select></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>${Lang.t("location")} <button class="ghost" style="padding:.1rem .4rem" onclick="Log.manageLocations()">⚙</button></label>
          <select id="in-location" onchange="document.getElementById('in-location-custom').classList.toggle('hidden', this.value !== '__custom')">
            <option value="">–</option>
            ${this.locations.map((l) => `<option value="${l.name}">${l.name}</option>`).join("")}
            <option value="__custom">${Lang.t("location_custom")}</option>
          </select>
          <input id="in-location-custom" class="hidden" placeholder="${Lang.t("location_custom")}" style="margin-top:.4rem">
        </div>
        <div class="field"><label>${Lang.t("reporter_source")}</label><input id="in-reporter" placeholder="Vekter / Frivillig / Politi / Annet"></div>
      </div>
      <div class="field"><label>${Lang.t("description")}</label><textarea id="in-description"></textarea></div>
      <div class="field"><label>${Lang.t("action_taken")}</label><textarea id="in-action"></textarea></div>
      <div class="field"><label>${Lang.t("notified")}</label>
        <div class="check-list">${this.NOTIFY_OPTIONS.map((n) => `<label><input type="checkbox" value="${n}" class="notify-cb"> ${n}</label>`).join("")}</div>
      </div>
      <div class="field"><label>${Lang.t("beredskap")}</label>
        <div class="check-list">${this.BEREDSKAP_LEVELS.map((b) => `
          <label class="color-chip" style="--chip-color:${b.color}"><input type="radio" name="in-beredskap" value="${b.value}"> ${b.label}</label>
        `).join("")}</div>
      </div>
      <div class="field"><label>${Lang.t("scene_farge")}</label>
        <div class="check-list">${this.SCENE_COLORS.map((s) => `
          <label class="color-chip" style="--chip-color:${s.color}"><input type="radio" name="in-scene" value="${s.value}"> ${s.label}</label>
        `).join("")}</div>
      </div>
      <div class="field"><label>${Lang.t("attachments")}</label><input type="file" id="in-files" multiple></div>
      <button class="primary" onclick="Log.submit()">${Lang.t("save")}</button>
      <div id="form-error" class="error-text"></div>
    `;
  },

  async submit() {
    const g = (id) => document.getElementById(id).value;
    const kind = g("in-kind");
    let location = g("in-location");
    let isCustomLocation = false;
    if (location === "__custom") {
      location = g("in-location-custom").trim();
      isCustomLocation = true;
    }
    const description = g("in-description").trim();
    if (!description) {
      document.getElementById("form-error").textContent = "Beskrivelse må fylles ut.";
      return;
    }
    // Fritekst-lokasjon lagres automatisk for arrangementet, slik at den dukker opp i
    // nedtrekksmenyen neste gang - loggeren slipper å skrive samme sted på nytt.
    if (isCustomLocation && location && !this.locations.some((l) => l.name.toLowerCase() === location.toLowerCase())) {
      await this.addLocation(location);
    }
    const notified = Array.from(document.querySelectorAll(".notify-cb:checked")).map((c) => c.value);
    const beredskapsniva = document.querySelector('input[name="in-beredskap"]:checked')?.value || null;
    const scene_farge = document.querySelector('input[name="in-scene"]:checked')?.value || null;
    const payload = {
      event_id: Auth.event.id,
      entry_kind: kind,
      category: g("in-category"),
      location: location || null,
      reporter_source: g("in-reporter").trim() || null,
      description,
      action_taken: g("in-action").trim() || null,
      notified,
      beredskapsniva,
      scene_farge,
      status: kind === "hendelse" ? "pagaende" : "avsluttet",
      created_by: Auth.profile.id,
      created_by_name: Auth.profile.full_name,
    };
    const { data, error } = await sb.from("log_entries").insert(payload).select().single();
    if (error) { document.getElementById("form-error").textContent = error.message; return; }

    const files = document.getElementById("in-files").files;
    if (files.length) await this.uploadAttachments(data.id, files);

    document.getElementById("entry-form").reset?.();
    this._renderForm();
    await this.refresh();
  },

  async uploadAttachments(entryId, fileList) {
    for (const file of fileList) {
      const path = `${Auth.event.id}/${entryId}/${Date.now()}_${file.name}`;
      // Leser hele filen inn i minnet før opplasting - unngår "No content provided"-feil
      // som kan oppstå på enkelte mobile nettlesere (spesielt iPhone/Safari) ved direkte opplasting av et File-objekt.
      const arrayBuffer = await file.arrayBuffer();
      const { error } = await sb.storage.from("attachments").upload(path, arrayBuffer, {
        contentType: file.type || "application/octet-stream",
      });
      if (error) { console.error(error); continue; }
      await sb.from("log_attachments").insert({
        event_id: Auth.event.id, log_entry_id: entryId, file_path: path, file_name: file.name,
        file_type: file.type, uploaded_by: Auth.profile.id, uploaded_by_name: Auth.profile.full_name,
      });
    }
  },

  async addComment(entryId) {
    const el = document.getElementById(`comment-input-${entryId}`);
    const text = el.value.trim();
    if (!text) return;
    await sb.from("log_comments").insert({
      log_entry_id: entryId, comment_text: text,
      created_by: Auth.profile.id, created_by_name: Auth.profile.full_name,
    });
    el.value = "";
    await this.refresh();
  },

  async markClosed(entryId) {
    await sb.from("log_entries").update({ status: "avsluttet" }).eq("id", entryId);
    await this.refresh();
  },

  async deleteEntry(entryId) {
    if (!confirm(Lang.t("confirm_delete_entry"))) return;
    const { error } = await sb.from("log_entries").delete().eq("id", entryId);
    if (error) { alert("Feil: " + error.message); return; }
    await this.refresh();
  },

  canEdit(entry) {
    const withinWindow = (Date.now() - new Date(entry.created_at).getTime()) < 5 * 60 * 1000;
    if (!withinWindow) return false;
    if (Auth.isAdmin()) return true;
    return Auth.isLogger() && entry.created_by === Auth.profile.id;
  },

  startEdit(entryId) {
    const entry = this.entries.find((e) => e.id === entryId);
    if (!entry) return;
    const el = document.getElementById(`entry-${entryId}`);
    el.querySelector(".edit-area").innerHTML = `
      <div class="field"><textarea id="edit-desc-${entryId}">${entry.description}</textarea></div>
      <div class="field"><textarea id="edit-action-${entryId}">${entry.action_taken || ""}</textarea></div>
      <button class="primary" onclick="Log.saveEdit('${entryId}')">${Lang.t("save")}</button>
    `;
    el.querySelector(".edit-area").classList.remove("hidden");
    el.querySelector(".view-area").classList.add("hidden");
  },

  async saveEdit(entryId) {
    const description = document.getElementById(`edit-desc-${entryId}`).value.trim();
    const action_taken = document.getElementById(`edit-action-${entryId}`).value.trim();
    await sb.from("log_entries").update({ description, action_taken }).eq("id", entryId);
    await this.refresh();
  },

  async showHistory(entryId) {
    const { data } = await sb.from("log_edit_history").select("*").eq("log_entry_id", entryId).order("changed_at");
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:520px;margin:3rem auto;">
        <div class="panel-head">Versjonshistorikk <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          ${(data || []).map((h) => `<div class="log-entry"><div class="meta">${new Date(h.changed_at).toLocaleString("no-NO")} — ${h.changed_by_name}</div>
            <p>${h.previous_data.description}</p><p class="small">${h.previous_data.action_taken || ""}</p></div>`).join("") || "<p class='small'>Ingen tidligere versjoner.</p>"}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async attachmentUrl(path) {
    const { data } = await sb.storage.from("attachments").createSignedUrl(path, 3600);
    return data?.signedUrl;
  },

  _renderEntries() {
    const el = document.getElementById("log-feed");
    if (!el) return;
    el.innerHTML = this.entries.map((e) => this._entryHtml(e)).join("") || `<p class="small">Ingen registreringer ennå.</p>`;
    this.entries.forEach((e) => {
      e.attachments.forEach(async (a) => {
        const url = await this.attachmentUrl(a.file_path);
        const link = document.getElementById(`att-${a.id}`);
        if (link && url) link.href = url;
      });
    });
  },

  _colorBadge(list, value) {
    if (!value) return "";
    const item = list.find((x) => x.value === value);
    if (!item) return "";
    return `<span class="badge" style="border-color:${item.color}; color:${item.color}">${item.label}</span>`;
  },

  _entryHtml(e) {
    const isPrioritert = e.category === "Prioritert hendelse";
    const canWrite = Auth.canWrite();
    return `
    <div class="log-entry ${isPrioritert ? "prioritert" : ""}" id="entry-${e.id}">
      <div class="view-area">
        <div class="row1">
          <span class="display-id mono">${e.display_id}</span>
          <span class="badge ${isPrioritert ? "category-prioritert" : "info"}">${this.CATEGORY_LABELS[e.category]}</span>
          ${e.entry_kind === "hendelse" ? `<span class="badge ${e.status}">${Lang.t("status_" + e.status)}</span>` : ""}
          ${this._colorBadge(this.BEREDSKAP_LEVELS, e.beredskapsniva)}
          ${this._colorBadge(this.SCENE_COLORS, e.scene_farge)}
          ${e.is_edited ? `<button class="edited-tag" onclick="Log.showHistory('${e.id}')">${Lang.t("edited")}</button>` : ""}
          <span class="timestamp mono">${new Date(e.created_at).toLocaleString("no-NO")}</span>
        </div>
        <p class="desc">${e.description}</p>
        ${e.action_taken ? `<p class="small">${Lang.t("action_taken")}: ${e.action_taken}</p>` : ""}
        <div class="meta">
          ${e.location ? `<span>${Lang.t("location")}: ${e.location}</span>` : ""}
          ${e.reporter_source ? `<span>${Lang.t("reporter_source")}: ${e.reporter_source}</span>` : ""}
          ${e.notified?.length ? `<span>${Lang.t("notified")}: ${e.notified.join(", ")}</span>` : ""}
          <span>${e.created_by_name}</span>
        </div>
        ${e.attachments.length ? `<div class="attachments">${e.attachments.map((a) => `<a id="att-${a.id}" href="#" target="_blank">📎 ${a.file_name}</a>`).join("")}</div>` : ""}
        ${e.entry_kind === "hendelse" ? `
          <div class="comments">
            ${e.comments.map((c) => `<div class="comment"><div class="who">${new Date(c.created_at).toLocaleString("no-NO")} — ${c.created_by_name}</div>${c.comment_text}</div>`).join("")}
            ${canWrite && e.status === "pagaende" ? `
              <div class="row" style="margin-left:1.4rem">
                <input id="comment-input-${e.id}" placeholder="${Lang.t("comment_placeholder")}" style="flex:1">
                <button onclick="Log.addComment('${e.id}')">${Lang.t("add_comment")}</button>
              </div>` : ""}
          </div>` : ""}
        <div class="actions">
          ${canWrite && this.canEdit(e) ? `<button class="ghost" onclick="Log.startEdit('${e.id}')">${Lang.t("edit")}</button>` : ""}
          ${canWrite && e.entry_kind === "hendelse" && e.status === "pagaende" ? `<button class="ghost" onclick="Log.markClosed('${e.id}')">${Lang.t("mark_closed")}</button>` : ""}
          ${Auth.isAdmin() ? `<button class="danger" onclick="Log.deleteEntry('${e.id}')">✕ ${Lang.t("delete_entry")}</button>` : ""}
        </div>
      </div>
      <div class="edit-area hidden"></div>
    </div>`;
  },
};
