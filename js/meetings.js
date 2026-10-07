// Møter (i panelet "Oppgaver / Møter") + deltakervelger som også brukes når man
// oppretter et møte basert på en hendelse i loggskjemaet.
window.Meetings = {
  list: [],          // kun planlagte (ikke avsluttede) møter - avsluttede forsvinner fra oversikten
  users: [],         // brukere som kan velges som deltakere (samme som for oppgaver)
  _pickers: {},      // prefix -> [{ user_id?, name }]

  _el(id) { return document.getElementById(id); },

  async init(containerId) {
        await this.loadUsers();
    await this.load();
    this._render();
    this._subscribeRealtime();
    setInterval(() => this._render(), 30 * 1000); // oppdaterer "om X min" / "Pågår"
  },

  async load() {
    const { data } = await sb.from("meetings").select("*")
      .eq("event_id", Auth.event.id).eq("status", "planlagt").order("scheduled_at");
    this.list = (data || []).slice().sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at));
  },

  // Samme utvalg som for oppgaver: brukere tilknyttet arrangementet + admin.
  async loadUsers() {
    const { data } = await sb.from("profiles").select("id, full_name")
      .or(`event_id.eq.${Auth.event.id},role.eq.admin`).order("full_name");
    this.users = data || [];
  },

  _subscribeRealtime() {
    sb.channel("meetings-" + Auth.event.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings", filter: `event_id=eq.${Auth.event.id}` }, async () => {
        await this.load();
        this._render();
      })
      .subscribe();
  },

  // ------------------------------------------------------------------------
  // Hjelpefunksjoner
  // ------------------------------------------------------------------------
  _fmtWhen(iso) {
    return new Date(iso).toLocaleString("no-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  },

  _defaultTimeLocal(minAhead = 10) {
    const d = new Date(Date.now() + minAhead * 60000);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },

  _participantNames(m) {
    return (m.participants || []).map((p) => p.name).join(", ");
  },

  // ------------------------------------------------------------------------
  // Deltakervelger (gjenbrukes i panelet og i loggskjemaet)
  // ------------------------------------------------------------------------
  pickerHtml(prefix) {
    return `
      <div class="field"><label>${Lang.t("participants")}</label>
        <div class="row">
          <select id="${prefix}-part-select" style="flex:1" onchange="Meetings.onPickerSelectChange('${prefix}')"></select>
          <input id="${prefix}-part-custom" placeholder="${Lang.t("participant_name")}" style="flex:1">
          <button type="button" class="ghost" onclick="Meetings.addParticipant('${prefix}')">+ ${Lang.t("add")}</button>
        </div>
        <div class="chip-row" id="${prefix}-part-chips"></div>
      </div>`;
  },

  // Fyller nedtrekksmenyen og deltakerchips - kalles etter at pickerHtml er satt inn i DOM.
  refreshPicker(prefix) {
    const sel = this._el(`${prefix}-part-select`);
    if (sel) {
      sel.innerHTML = `<option value="__custom">${Lang.t("task_assign_method_text")}</option>` +
        this.users.map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("");
    }
    this.onPickerSelectChange(prefix);
    this._renderChips(prefix);
  },

  onPickerSelectChange(prefix) {
    const sel = this._el(`${prefix}-part-select`);
    const custom = this._el(`${prefix}-part-custom`);
    if (sel && custom) custom.classList.toggle("hidden", sel.value !== "__custom");
  },

  addParticipant(prefix) {
    const list = (this._pickers[prefix] = this._pickers[prefix] || []);
    const sel = this._el(`${prefix}-part-select`).value;
    if (sel === "__custom") {
      const input = this._el(`${prefix}-part-custom`);
      const name = input.value.trim();
      if (!name) return;
      list.push({ name });
      input.value = "";
    } else {
      const u = this.users.find((x) => x.id === sel);
      if (!u || list.some((p) => p.user_id === u.id)) return;
      list.push({ user_id: u.id, name: u.full_name });
    }
    this._renderChips(prefix);
  },

  removeParticipant(prefix, idx) {
    (this._pickers[prefix] || []).splice(idx, 1);
    this._renderChips(prefix);
  },

  getParticipants(prefix) {
    return (this._pickers[prefix] || []).slice();
  },

  resetPicker(prefix) {
    this._pickers[prefix] = [];
  },

  _renderChips(prefix) {
    const box = this._el(`${prefix}-part-chips`);
    if (!box) return;
    const list = this._pickers[prefix] || [];
    box.innerHTML = list.map((p, i) => `
      <span class="chip" title="${p.user_id ? escapeHtml(Lang.t("participant_gets_notified")) : ""}">
        ${escapeHtml(p.name)}${p.user_id ? " 🔔" : ""}
        <button type="button" class="chip-x" onclick="Meetings.removeParticipant('${prefix}', ${i})">✕</button>
      </span>`).join("");
  },

  // ------------------------------------------------------------------------
  // Skjema for nytt møte i panelet (oppgaveskjemaet ligger rett over)
  // ------------------------------------------------------------------------
  locationOptionsHtml() {
    const locs = (window.Log && Log.locations) || [];
    return locs.map((l) => `<option value="${escapeHtml(l.name)}"></option>`).join("");
  },
  // Vindu for nytt møte (åpnes fra knappen i panelet)
  openNew() {
    this.resetPicker("mt");
    const box = this._el("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:560px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("new_meeting_heading")}
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body stack" style="gap:.5rem; max-height:75vh; overflow-y:auto">
          <input id="mt-title" placeholder="${Lang.t("meeting_title")}">
          <div class="field" style="margin:0"><label>${Lang.t("meeting_time")}</label>
            <input type="datetime-local" id="mt-time" value="${this._defaultTimeLocal()}"></div>
          <input id="mt-location" list="mt-loc-list" placeholder="${Lang.t("meeting_location")}">
          <datalist id="mt-loc-list">${this.locationOptionsHtml()}</datalist>
          ${this.pickerHtml("mt")}
          <button class="primary" id="mt-create-btn" onclick="Meetings.createFromPanel()">${Lang.t("meeting_create")}</button>
          <div id="mt-error" class="error-text"></div>
        </div>
      </div>`;
    box.classList.remove("hidden");
    this.refreshPicker("mt");
    this._el("mt-title").focus();
  },

  async createFromPanel() {
    const title = this._el("mt-title").value.trim();
    const time = this._el("mt-time").value;
    const err = this._el("mt-error");
    err.textContent = "";
    if (!title || !time) { err.textContent = Lang.t("meeting_missing_fields"); return; }
    this._el("mt-create-btn").disabled = true;
    const res = await this.create({
      title,
      scheduledAtIso: new Date(time).toISOString(),
      participants: this.getParticipants("mt"),
      location: this._el("mt-location").value.trim(),
    });
    if (res.error) { err.textContent = res.error.message || String(res.error); this._el("mt-create-btn").disabled = false; return; }
    this.resetPicker("mt");
    this._el("history-modal").classList.add("hidden");
    await this.load();
    this._render();
    if (window.Log) await Log.refresh();
  },

  // Opprett møte ut fra en eksisterende hendelse (knapp på hendelsen i loggen og i Status-panelet)
  openFromEntry(entryId) {
    const e = (window.Log && Log.entries || []).find((x) => x.id === entryId);
    if (!e) return;
    this.resetPicker("mm");
    const box = this._el("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:560px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("meeting_from_incident")}: ${escapeHtml(e.display_id)}
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body stack" style="gap:.5rem; max-height:75vh; overflow-y:auto">
          <p class="small">${escapeHtml(e.description)}</p>
          <input id="mm-title" value="Krisemøte" placeholder="${Lang.t("meeting_title")}">
          <div class="field" style="margin:0"><label>${Lang.t("meeting_time")}</label>
            <input type="datetime-local" id="mm-time" value="${this._defaultTimeLocal()}"></div>
          <input id="mm-location" list="mm-loc-list" value="${escapeHtml(e.location || "")}" placeholder="${Lang.t("meeting_location")}">
          <datalist id="mm-loc-list">${this.locationOptionsHtml()}</datalist>
          ${this.pickerHtml("mm")}
          <button class="primary" id="mm-create-btn" onclick="Meetings.confirmFromEntry('${e.id}')">${Lang.t("meeting_create")}</button>
          <div id="mm-error" class="error-text"></div>
        </div>
      </div>`;
    box.classList.remove("hidden");
    this.refreshPicker("mm");
  },

  async confirmFromEntry(entryId) {
    const e = (window.Log && Log.entries || []).find((x) => x.id === entryId);
    const title = this._el("mm-title").value.trim();
    const time = this._el("mm-time").value;
    const err = this._el("mm-error");
    if (!title || !time) { err.textContent = Lang.t("meeting_missing_fields"); return; }
    this._el("mm-create-btn").disabled = true;
    const res = await this.create({
      title, scheduledAtIso: new Date(time).toISOString(),
      participants: this.getParticipants("mm"), sourceEntry: e,
      location: this._el("mm-location").value.trim(),
    });
    if (res.error) { err.textContent = res.error.message || String(res.error); this._el("mm-create-btn").disabled = false; return; }
    this.resetPicker("mm");
    this._el("history-modal").classList.add("hidden");
    await this.load();
    this._render();
    if (window.Log) await Log.refresh();
  },

  // Oppretter møtet, skriver en loggføring ("Møte opprettet") og varsler brukerne som er med.
  // sourceEntry = hendelsen møtet opprettes på bakgrunn av (valgfritt).
  async create({ title, scheduledAtIso, participants, sourceEntry, location }) {
    const { data: meeting, error } = await sb.from("meetings").insert({
      event_id: Auth.event.id,
      title,
      scheduled_at: scheduledAtIso,
      location: location || null,
      participants: participants || [],
      source_entry_id: sourceEntry ? sourceEntry.id : null,
      created_by: Auth.profile.id,
      created_by_name: Auth.profile.full_name,
    }).select().single();
    if (error) return { error };

    const when = this._fmtWhen(scheduledAtIso);
    const names = this._participantNames(meeting);
    const description = `Møte opprettet: ${title} – ${when}` + (meeting.location ? `, ${meeting.location}` : "") + "." +
      (names ? ` Deltakere: ${names}.` : "") +
      (sourceEntry ? ` Basert på hendelse ${sourceEntry.display_id}.` : "");
    await sb.from("log_entries").insert({
      event_id: Auth.event.id, entry_kind: "info", category: "Mote",
      description, notified: [], status: "avsluttet",
      meeting_id: meeting.id, meeting_phase: "opprettet",
      created_by: Auth.profile.id, created_by_name: Auth.profile.full_name,
    });

    // Brukere (ikke fritekstnavn) som er med får varsel - ikke den som oppretter møtet selv.
    const notifyTargets = (meeting.participants || []).filter((p) => p.user_id && p.user_id !== Auth.profile.id);
    await Promise.all(notifyTargets.map((p) =>
      Notifications.notifyUser(p.user_id, Auth.event.id, `Nytt møte: ${title}`, `Kl. ${when}${meeting.location ? " – " + meeting.location : ""}`)));

    Auth.logActivity("Opprettet møte", `${title} – ${when}`);
    return { meeting };
  },

  // ------------------------------------------------------------------------
  // Avslutt møte (med referat og vedtak)
  // ------------------------------------------------------------------------
  openEnd(id) {
    const m = this.list.find((x) => x.id === id);
    if (!m) return;
    const names = this._participantNames(m);
    const box = this._el("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:560px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("meeting_end")}: ${escapeHtml(m.title)}
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <p class="small">${this._fmtWhen(m.scheduled_at)}${names ? ` · ${escapeHtml(names)}` : ""}</p>
          <div class="field"><label>${Lang.t("meeting_minutes")}</label>
            <textarea id="mt-end-minutes" rows="6"></textarea></div>
          <div class="field"><label>${Lang.t("meeting_decisions")}</label>
            <textarea id="mt-end-decisions" rows="4"></textarea></div>
          <label class="row" style="align-items:center; gap:.4rem; padding:.5rem .6rem; border:1px solid var(--border); border-radius:6px">
            <input type="checkbox" id="mt-end-observers">
            <span>${Lang.t("meeting_observers_can_read")}</span>
          </label>
          <button class="primary" id="mt-end-btn" onclick="Meetings.confirmEnd('${m.id}')">${Lang.t("meeting_end")}</button>
          <div id="mt-end-error" class="error-text"></div>
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async confirmEnd(id) {
    const m = this.list.find((x) => x.id === id);
    if (!m) return;
    const minutes = this._el("mt-end-minutes").value.trim();
    const decisions = this._el("mt-end-decisions").value.trim();
    const btn = this._el("mt-end-btn");
    btn.disabled = true;

    const observersCanRead = this._el("mt-end-observers").checked;
    const { error: minErr } = await sb.from("meeting_minutes").upsert({
      meeting_id: id, event_id: Auth.event.id,
      minutes: minutes || null, decisions: decisions || null,
      observers_can_read: observersCanRead,
      updated_by_name: Auth.profile.full_name, updated_at: new Date().toISOString(),
    });
    if (minErr) {
      this._el("mt-end-error").textContent = minErr.message;
      btn.disabled = false;
      return;
    }
    const { error } = await sb.from("meetings").update({
      status: "avsluttet",
      ended_at: new Date().toISOString(),
      ended_by_name: Auth.profile.full_name,
    }).eq("id", id);
    if (error) {
      this._el("mt-end-error").textContent = error.message;
      btn.disabled = false;
      return;
    }

    await sb.from("log_entries").insert({
      event_id: Auth.event.id, entry_kind: "info", category: "Mote",
      description: `Møte avsluttet: ${m.title}.`, notified: [], status: "avsluttet",
      meeting_id: id, meeting_phase: "avsluttet",
      created_by: Auth.profile.id, created_by_name: Auth.profile.full_name,
    });

    this._el("history-modal").classList.add("hidden");
    await this.load();
    this._render();
    if (window.Log) await Log.refresh();
    Auth.logActivity("Avsluttet møte", m.title);
  },

  // ------------------------------------------------------------------------
  // Les referat (fra "Møte avsluttet"-loggføringen)
  // ------------------------------------------------------------------------
  async showMinutes(id) {
    const { data: m } = await sb.from("meetings").select("*").eq("id", id).single();
    // Referatet ligger i egen tabell: observatører får ingen rad tilbake med mindre loggfører har delt det.
    const { data: mmRows } = await sb.from("meeting_minutes").select("*").eq("meeting_id", id);
    const mm = (mmRows || [])[0];
    const box = this._el("history-modal");
    const names = m ? this._participantNames(m) : "";
    const body = !m
      ? `<p class="small">${Lang.t("meeting_not_found")}</p>`
      : m.status !== "avsluttet"
        ? `<p class="small">${Lang.t("meeting_not_ended")}</p>`
        : !mm
          ? `<p class="small">${Lang.t("meeting_minutes_hidden")}</p>`
          : `
          <h4 style="margin:.2rem 0">${Lang.t("meeting_minutes")}</h4>
          <p style="white-space:pre-wrap">${mm.minutes ? escapeHtml(mm.minutes) : "–"}</p>
          <h4 style="margin:.8rem 0 .2rem">${Lang.t("meeting_decisions")}</h4>
          <p style="white-space:pre-wrap">${mm.decisions ? escapeHtml(mm.decisions) : "–"}</p>
          <p class="small" style="margin-top:.8rem">${Lang.t("meeting_ended_by")} ${escapeHtml(m.ended_by_name || "–")} · ${m.ended_at ? new Date(m.ended_at).toLocaleString("no-NO") : ""}</p>
          ${Auth.canWrite() ? `<p class="small">${mm.observers_can_read ? "👁 " + Lang.t("meeting_observers_yes") : "🔒 " + Lang.t("meeting_observers_no")}</p>` : ""}`;
    box.innerHTML = `
      <div class="panel" style="max-width:600px;margin:2rem auto;">
        <div class="panel-head">${m ? escapeHtml(m.title) : Lang.t("meeting_minutes")}
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body" style="max-height:70vh;overflow-y:auto">
          ${m ? `<p class="small">${this._fmtWhen(m.scheduled_at)}${m.location ? ` · ${Lang.t("meeting_location")}: ${escapeHtml(m.location)}` : ""}${names ? ` · ${Lang.t("participants")}: ${escapeHtml(names)}` : ""}</p>` : ""}
          ${body}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  // ------------------------------------------------------------------------
  // Felles liste: møter (sortert på tid) først, deretter oppgaver. Hver rad er merket
  // tydelig som MØTE eller OPPGAVE.
  // ------------------------------------------------------------------------
  _meetingHtml(m, canWrite, now) {
    const diffMin = Math.round((new Date(m.scheduled_at).getTime() - now) / 60000);
    const rel = diffMin <= 0
      ? `<span class="badge pagaende">${Lang.t("meeting_ongoing")}</span>`
      : diffMin < 60 ? `<span class="small">${Lang.t("meeting_in")} ${diffMin} min</span>` : "";
    const names = this._participantNames(m);
    return `
    <div class="meeting-card">
      <div class="meeting-head">
        <span class="kind-badge meeting">${Lang.t("item_meeting")}</span>
        <span class="mono small">${this._fmtWhen(m.scheduled_at)}</span>
        <strong>${escapeHtml(m.title)}</strong>
        ${rel}
      </div>
      ${m.location ? `<div class="small">📍 ${escapeHtml(m.location)}</div>` : ""}
      ${names ? `<div class="small">${Lang.t("participants")}: ${escapeHtml(names)}</div>` : ""}
      ${canWrite ? `<div><button class="ghost" onclick="Meetings.openEnd('${m.id}')">${Lang.t("meeting_end")}</button></div>` : ""}
    </div>`;
  },

  renderAll() {
    const el = window.Tasks && Tasks.containerEl;
    if (!el) return;
    const canWrite = Auth.canWrite();
    const now = Date.now();
    const html = this.list.map((m) => this._meetingHtml(m, canWrite, now)).join("")
      + Tasks.list.map((t) => Tasks._itemHtml(t)).join("");
    el.innerHTML = html || `<p class="small">–</p>`;
  },

  _render() { this.renderAll(); },
};
