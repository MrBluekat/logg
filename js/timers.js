window.Timers = {
  list: [],
  containerEl: null,

  init(containerId) {
    this.containerEl = document.getElementById(containerId);
    setInterval(() => this._tick(), 1000);
  },

  add(name, type, minutes) {
    const id = "t" + Date.now() + Math.random().toString(36).slice(2, 6);
    const seconds = type === "countdown" ? Math.max(0, Math.round((minutes || 0) * 60)) : 0;
    this.list.push({
      id,
      name: name || (type === "countdown" ? Lang.t("timer_type_countdown") : Lang.t("timer_type_stopwatch")),
      type,
      remainingOrElapsed: seconds,
      running: false,
    });
    this._render();
  },

  remove(id) {
    this.list = this.list.filter((t) => t.id !== id);
    this._render();
  },

  toggle(id) {
    const t = this.list.find((x) => x.id === id);
    if (t) t.running = !t.running;
    this._render();
  },

  reset(id, minutes) {
    const t = this.list.find((x) => x.id === id);
    if (!t) return;
    t.running = false;
    t.remainingOrElapsed = t.type === "countdown" ? Math.max(0, Math.round((minutes ?? 0) * 60)) : 0;
    this._render();
  },

  _tick() {
    let changed = false;
    this.list.forEach((t) => {
      if (!t.running) return;
      changed = true;
      if (t.type === "stopwatch") {
        t.remainingOrElapsed += 1;
      } else {
        t.remainingOrElapsed = Math.max(0, t.remainingOrElapsed - 1);
        if (t.remainingOrElapsed === 0) t.running = false;
      }
    });
    if (changed) this._render();
  },

  _fmt(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  },

  _render() {
    if (!this.containerEl) return;
    this.containerEl.innerHTML = this.list.map((t) => `
      <div class="timer ${t.running ? "running" : ""} ${t.type === "countdown" && t.remainingOrElapsed === 0 ? "done" : ""}">
        <span class="name">${t.name}</span>
        <span class="display">${this._fmt(t.remainingOrElapsed)}</span>
        <button class="ghost" onclick="Timers.toggle('${t.id}')">${t.running ? Lang.t("pause") : Lang.t("start")}</button>
        <button class="ghost" onclick="Timers.reset('${t.id}')">${Lang.t("reset")}</button>
        <button class="ghost" onclick="Timers.remove('${t.id}')">${Lang.t("remove")}</button>
      </div>
    `).join("") || `<p class="small">–</p>`;
  },
};
