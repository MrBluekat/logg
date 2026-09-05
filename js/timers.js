window.Timers = {
  list: [],
  containerEl: null,

  init(containerId) {
    this.containerEl = document.getElementById(containerId);
    setInterval(() => this._tick(), 1000);
  },

  // opts: { hours, minutes, target } - kun relevante felt brukes avhengig av type
  add(name, type, opts = {}) {
    const id = "t" + Date.now() + Math.random().toString(36).slice(2, 6);
    const timer = {
      id,
      name: name || this._defaultName(type),
      type,
      running: type !== "countdown_to", // countdown_to går alltid, har ingen pause
      remainingOrElapsed: 0,
      targetTime: null,
    };
    if (type === "countdown_duration") {
      const totalSeconds = Math.max(0, Math.round((opts.hours || 0) * 3600 + (opts.minutes || 0) * 60));
      timer.remainingOrElapsed = totalSeconds;
      timer._initialSeconds = totalSeconds;
    } else if (type === "countdown_to") {
      if (!opts.target) return; // trenger et tidspunkt
      timer.targetTime = new Date(opts.target).getTime();
    }
    this.list.push(timer);
    this._render();
  },

  _defaultName(type) {
    if (type === "countdown_duration") return Lang.t("timer_type_countdown_duration");
    if (type === "countdown_to") return Lang.t("timer_type_countdown_to");
    return Lang.t("timer_type_stopwatch");
  },

  remove(id) {
    this.list = this.list.filter((t) => t.id !== id);
    this._render();
  },

  toggle(id) {
    const t = this.list.find((x) => x.id === id);
    if (t && t.type !== "countdown_to") t.running = !t.running;
    this._render();
  },

  reset(id) {
    const t = this.list.find((x) => x.id === id);
    if (!t) return;
    if (t.type === "stopwatch") {
      t.running = false;
      t.remainingOrElapsed = 0;
    } else if (t.type === "countdown_duration") {
      t.running = false;
      t.remainingOrElapsed = t._initialSeconds || 0;
    }
    this._render();
  },

  _tick() {
    let changed = false;
    const now = Date.now();
    this.list.forEach((t) => {
      if (t.type === "countdown_to") {
        const remaining = Math.max(0, Math.round((t.targetTime - now) / 1000));
        t.remainingOrElapsed = remaining;
        t.running = remaining > 0;
        changed = true;
        return;
      }
      if (!t.running) return;
      changed = true;
      if (t.type === "stopwatch") {
        t.remainingOrElapsed += 1;
      } else if (t.type === "countdown_duration") {
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
      <div class="timer ${t.running ? "running" : ""} ${t.type !== "stopwatch" && t.remainingOrElapsed === 0 ? "done" : ""}">
        <span class="name">${t.name}</span>
        <span class="display">${this._fmt(t.remainingOrElapsed)}</span>
        ${t.type !== "countdown_to" ? `
          <button class="ghost" onclick="Timers.toggle('${t.id}')">${t.running ? Lang.t("pause") : Lang.t("start")}</button>
          <button class="ghost" onclick="Timers.reset('${t.id}')">${Lang.t("reset")}</button>
        ` : ""}
        <button class="ghost" onclick="Timers.remove('${t.id}')">${Lang.t("remove")}</button>
      </div>
    `).join("") || `<p class="small">–</p>`;
  },
};
