window.Tasks = {
  list: [],
  containerEl: null,

  async init(containerId) {
    this.containerEl = document.getElementById(containerId);
    await this.load();
    this._render();
    this._subscribeRealtime();
    setInterval(() => this._render(), 1000); // oppdaterer nedtelling-visningen
  },

  async load() {
    const { data } = await sb.from("tasks").select("*").eq("event_id", Auth.event.id).order("sort_order");
    this.list = data || [];
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

  async add() {
    const description = document.getElementById("task-description").value.trim();
    const assigned_name = document.getElementById("task-assigned").value.trim();
    const hasTimer = document.getElementById("task-has-timer").checked;
    const hours = parseFloat(document.getElementById("task-timer-hours").value || "0");
    const minutes = parseFloat(document.getElementById("task-timer-minutes").value || "0");
    if (!description) return;
    const duration = hasTimer ? Math.max(0, Math.round(hours * 3600 + minutes * 60)) : null;
    const sort_order = await this._nextSortOrder();
    await sb.from("tasks").insert({
      event_id: Auth.event.id, description, assigned_name: assigned_name || null,
      has_timer: hasTimer, duration_seconds: duration, remaining_seconds: duration,
      sort_order,
    });
    document.getElementById("task-description").value = "";
    document.getElementById("task-assigned").value = "";
    document.getElementById("task-timer-hours").value = "";
    document.getElementById("task-timer-minutes").value = "";
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
    if (t.timer_state === "running" && t.target_end_at) {
      return Math.max(0, Math.round((new Date(t.target_end_at).getTime() - Date.now()) / 1000));
    }
    return t.remaining_seconds ?? t.duration_seconds ?? 0;
  },

  _render() {
    if (!this.containerEl) return;
    const canWrite = Auth.canWrite();
    this.containerEl.innerHTML = this.list.map((t) => `
      <div class="timer ${t.timer_state === "running" ? "running" : ""} ${t.done ? "done" : ""}" style="flex-wrap:wrap">
        <input type="checkbox" ${t.done ? "checked" : ""} ${canWrite ? `onchange="Tasks.toggleDone('${t.id}')"` : "disabled"}>
        <span class="name" style="${t.done ? "text-decoration:line-through; color:var(--text-muted)" : ""}">
          ${t.description}${t.assigned_name ? ` <span class="small">— ${t.assigned_name}</span>` : ""}
        </span>
        ${t.has_timer ? `
          <span class="display">${this._fmt(this._displaySeconds(t))}</span>
          ${canWrite ? `
            ${t.timer_state === "running"
              ? `<button class="ghost" onclick="Tasks.pauseTimer('${t.id}')">${Lang.t("pause")}</button>`
              : `<button class="ghost" onclick="Tasks.startTimer('${t.id}')">${Lang.t("start")}</button>`}
            <button class="ghost" onclick="Tasks.resetTimer('${t.id}')">${Lang.t("reset")}</button>
          ` : ""}
        ` : ""}
        ${canWrite ? `<button class="ghost" onclick="Tasks.remove('${t.id}')">${Lang.t("remove")}</button>` : ""}
      </div>
    `).join("") || `<p class="small">–</p>`;
  },
};
