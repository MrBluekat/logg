window.Tasks = {
  list: [],
  eventUsers: [],
  containerEl: null,

  async init(containerId) {
    this.containerEl = document.getElementById(containerId);
    await this.load();
    await this.loadEventUsers();
    this._render();
    this._subscribeRealtime();
    setInterval(() => this._render(), 1000); // oppdaterer nedtelling-visningen
  },

  async load() {
    const { data } = await sb.from("tasks").select("*").eq("event_id", Auth.event.id).order("sort_order");
    this.list = data || [];
  },

  // Kun brukere (logger/observatør) tilknyttet DETTE arrangementet - pluss admin, som
  // alltid skal være tilgjengelig siden admin ikke er bundet til ett bestemt arrangement.
  async loadEventUsers() {
    const { data } = await sb.from("profiles").select("id, full_name")
      .or(`event_id.eq.${Auth.event.id},role.eq.admin`).order("full_name");
    this.eventUsers = data || [];
    const select = document.getElementById("task-assigned-select");
    if (select) {
      select.innerHTML = `<option value="__custom">${Lang.t("task_assign_method_text")}</option>` +
        this.eventUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("");
    }
  },

  _subscribeRealtime() {
    sb.channel("tasks-" + Auth.event.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `event_id=eq.${Auth.event.id}` }, async () => {
        await this.load();
        this._render();
      })
      .subscribe();
  },

  async _nextSortOrder() {
    const max = this.list.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    return max + 1;
  },

  // Vindu for ny oppgave (åpnes fra knappen i panelet)
  openNew() {
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:560px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("new_task_heading")}
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body stack" style="gap:.5rem; max-height:75vh; overflow-y:auto">
          <input id="task-description" placeholder="${Lang.t("task_description")}">
          <div class="row">
            <select id="task-assigned-select" style="flex:1" onchange="document.getElementById('task-assigned-custom').classList.toggle('hidden', this.value !== '__custom')"></select>
            <input id="task-assigned-custom" placeholder="${Lang.t("task_assigned")}" style="flex:1">
          </div>
          <label class="row" style="align-items:center; gap:.3rem">
            <input type="checkbox" id="task-has-timer" onchange="document.getElementById('task-timer-block').classList.toggle('hidden', !this.checked)">
            <span>${Lang.t("task_has_timer")}</span>
          </label>
          <div class="stack hidden" id="task-timer-block" style="gap:.4rem">
            <select id="task-timer-mode" onchange="updateTaskTimerInputs()">
              <option value="duration">${Lang.t("timer_type_countdown_duration")}</option>
              <option value="fixed_time">${Lang.t("timer_type_countdown_to")}</option>
            </select>
            <div class="row" id="task-duration-inputs">
              <input id="task-timer-hours" type="number" min="0" placeholder="t" style="width:70px">
              <input id="task-timer-minutes" type="number" min="0" placeholder="min" style="width:70px">
            </div>
            <div class="row hidden" id="task-fixed-inputs">
              <input id="task-timer-target" type="datetime-local" style="flex:1">
            </div>
          </div>
          <button class="primary" onclick="Tasks.add()">${Lang.t("task_add")}</button>
        </div>
      </div>`;
    const select = document.getElementById("task-assigned-select");
    select.innerHTML = `<option value="__custom">${Lang.t("task_assign_method_text")}</option>` +
      this.eventUsers.map((u) => `<option value="${u.id}">${escapeHtml(u.full_name)}</option>`).join("");
    box.classList.remove("hidden");
    document.getElementById("task-description").focus();
  },

  async add() {
    const description = document.getElementById("task-description").value.trim();
    const assignSelect = document.getElementById("task-assigned-select").value;
    const customName = document.getElementById("task-assigned-custom").value.trim();
    const hasTimer = document.getElementById("task-has-timer").checked;
    const mode = document.getElementById("task-timer-mode").value;
    if (!description) return;

    let assigned_user_id = null;
    let assigned_name = null;
    if (assignSelect === "__custom") {
      assigned_name = customName || null;
    } else {
      assigned_user_id = assignSelect;
      assigned_name = this.eventUsers.find((u) => u.id === assignSelect)?.full_name || null;
    }

    const payload = {
      event_id: Auth.event.id, description, assigned_name, assigned_user_id,
      has_timer: hasTimer, sort_order: await this._nextSortOrder(),
    };

    if (hasTimer && mode === "fixed_time") {
      const target = document.getElementById("task-timer-target").value;
      if (target) {
        payload.timer_mode = "fixed_time";
        payload.fixed_target_at = new Date(target).toISOString();
      }
    } else if (hasTimer) {
      const hours = parseFloat(document.getElementById("task-timer-hours").value || "0");
      const minutes = parseFloat(document.getElementById("task-timer-minutes").value || "0");
      const duration = Math.max(0, Math.round(hours * 3600 + minutes * 60));
      payload.timer_mode = "duration";
      payload.duration_seconds = duration;
      payload.remaining_seconds = duration;
    }

    await sb.from("tasks").insert(payload);

    if (assigned_user_id) {
      await Notifications.notifyUser(assigned_user_id, Auth.event.id, "Ny oppgave tildelt", description);
      Auth.logActivity("Tildelte oppgave", `${description} → ${assigned_name}`);
    }

    document.getElementById("history-modal").classList.add("hidden");
    await this.load();
    this._render();
  },

  async remove(id) {
    await sb.from("tasks").delete().eq("id", id);
    await this.load();
    this._render();
  },

  async toggleDone(id) {
    const t = this.list.find((x) => x.id === id);
    if (!t) return;
    await sb.from("tasks").update({ done: !t.done }).eq("id", id);
    await this.load();
    this._render();
  },

  async startTimer(id) {
    const t = this.list.find((x) => x.id === id);
    if (!t) return;
    const remaining = t.remaining_seconds ?? t.duration_seconds ?? 0;
    const target = new Date(Date.now() + remaining * 1000).toISOString();
    await sb.from("tasks").update({ timer_state: "running", target_end_at: target }).eq("id", id);
    await this.load();
    this._render();
  },

  async pauseTimer(id) {
    const t = this.list.find((x) => x.id === id);
    if (!t || !t.target_end_at) return;
    const remaining = Math.max(0, Math.round((new Date(t.target_end_at).getTime() - Date.now()) / 1000));
    await sb.from("tasks").update({ timer_state: "paused", remaining_seconds: remaining, target_end_at: null }).eq("id", id);
    await this.load();
    this._render();
  },

  async resetTimer(id) {
    const t = this.list.find((x) => x.id === id);
    if (!t) return;
    await sb.from("tasks").update({ timer_state: "idle", remaining_seconds: t.duration_seconds, target_end_at: null }).eq("id", id);
    await this.load();
    this._render();
  },

  _fmt(sec) {
    sec = Math.max(0, sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = Math.floor(sec % 60);
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  },

  _displaySeconds(t) {
    if (t.timer_mode === "fixed_time" && t.fixed_target_at) {
      return Math.max(0, Math.round((new Date(t.fixed_target_at).getTime() - Date.now()) / 1000));
    }
    if (t.timer_state === "running" && t.target_end_at) {
      return Math.max(0, Math.round((new Date(t.target_end_at).getTime() - Date.now()) / 1000));
    }
    return t.remaining_seconds ?? t.duration_seconds ?? 0;
  },

  _itemHtml(t) {
    const canWrite = Auth.canWrite();
    return `
      <div class="timer item-task ${t.timer_state === "running" ? "running" : ""} ${t.done ? "done" : ""}" style="flex-wrap:wrap">
        <input type="checkbox" ${t.done ? "checked" : ""} ${canWrite ? `onchange="Tasks.toggleDone('${t.id}')"` : "disabled"}>
        <span class="kind-badge task">${Lang.t("item_task")}</span>
        <span class="name" style="${t.done ? "text-decoration:line-through; color:var(--text-muted)" : ""}">
          ${escapeHtml(t.description)}${t.assigned_name ? ` <span class="small">— ${escapeHtml(t.assigned_name)}</span>` : ""}
        </span>
        ${t.has_timer ? `
          <span class="display">${this._fmt(this._displaySeconds(t))}</span>
          ${canWrite && t.timer_mode !== "fixed_time" ? `
            ${t.timer_state === "running"
              ? `<button class="ghost" onclick="Tasks.pauseTimer('${t.id}')">${Lang.t("pause")}</button>`
              : `<button class="ghost" onclick="Tasks.startTimer('${t.id}')">${Lang.t("start")}</button>`}
            <button class="ghost" onclick="Tasks.resetTimer('${t.id}')">${Lang.t("reset")}</button>
          ` : ""}
        ` : ""}
        ${canWrite ? `<button class="ghost" onclick="Tasks.remove('${t.id}')">${Lang.t("remove")}</button>` : ""}
      </div>`;
  },

  // Oppgaver og møter vises i én felles liste (se Meetings.renderAll).
  _render() {
    if (!this.containerEl) return;
    if (window.Meetings) { Meetings.renderAll(); return; }
    this.containerEl.innerHTML = this.list.map((t) => this._itemHtml(t)).join("") || `<p class="small">–</p>`;
  },
};
