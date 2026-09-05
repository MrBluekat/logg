window.Dashboard = {
  latestEntries: [],
  isOpen: false,
  _catChart: null,
  _timeChart: null,
  _notifiedChart: null,

  // Kalles av Log.refresh() hver gang data endres (også via sanntid) - oppdaterer
  // modalen live dersom den står åpen.
  update(entries) {
    this.latestEntries = entries;
    if (this.isOpen) this._renderInto();
  },

  open() {
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:820px;margin:1.5rem auto;">
        <div class="panel-head">${Lang.t("dashboard")} <button class="ghost" onclick="Dashboard.close()">✕</button></div>
        <div class="panel-body" id="dashboard-body"></div>
      </div>`;
    box.classList.remove("hidden");
    this.isOpen = true;
    this._renderInto();
  },

  close() {
    this.isOpen = false;
    if (this._catChart) { this._catChart.destroy(); this._catChart = null; }
    if (this._timeChart) { this._timeChart.destroy(); this._timeChart = null; }
    if (this._notifiedChart) { this._notifiedChart.destroy(); this._notifiedChart = null; }
    document.getElementById("history-modal").classList.add("hidden");
  },

  _chartColors: ["#4c93d1", "#e8a23d", "#e5595e", "#3dbe7b", "#8b6fd1", "#d16fa8", "#6fc3d1", "#d1a56f"],

  _buildTimeline(entries) {
    if (!entries.length) return { labels: [], data: [] };

    let start, end;
    if (Auth.event.active_from) start = new Date(Auth.event.active_from);
    if (Auth.event.active_until) end = new Date(Auth.event.active_until);
    if (!start) start = new Date(Math.min(...entries.map((e) => new Date(e.created_at).getTime())));
    if (!end) end = new Date(Math.max(...entries.map((e) => new Date(e.created_at).getTime())));
    if (end < start) end = start;

    const rangeMs = end.getTime() - start.getTime();
    const rangeHours = rangeMs / 3600000;
    const byDay = rangeHours > 72; // bucket per dag hvis arrangementet strekker seg over mer enn ~3 døgn

    const bucketMs = byDay ? 86400000 : 3600000;
    const startBucket = Math.floor(start.getTime() / bucketMs) * bucketMs;
    const endBucket = Math.ceil(end.getTime() / bucketMs) * bucketMs;
    const bucketCount = Math.max(1, Math.round((endBucket - startBucket) / bucketMs));

    const labels = [];
    const counts = new Array(bucketCount).fill(0);
    for (let i = 0; i < bucketCount; i++) {
      const d = new Date(startBucket + i * bucketMs);
      labels.push(byDay
        ? d.toLocaleDateString("no-NO", { day: "2-digit", month: "2-digit" })
        : d.toLocaleTimeString("no-NO", { hour: "2-digit", minute: "2-digit" }));
    }
    entries.forEach((e) => {
      const t = new Date(e.created_at).getTime();
      const idx = Math.floor((t - startBucket) / bucketMs);
      if (idx >= 0 && idx < bucketCount) counts[idx]++;
    });
    return { labels, data: counts };
  },

  _renderInto() {
    const el = document.getElementById("dashboard-body");
    if (!el) return;
    const entries = this.latestEntries;
    const total = entries.length;
    const notified = entries.filter((e) => e.notified && e.notified.length).length;
    const ongoing = entries.filter((e) => e.status === "pagaende").length;
    const latest = entries[0] ? new Date(entries[0].created_at).toLocaleString("no-NO") : "–";

    const counts = {};
    Log.CATEGORIES.forEach((c) => (counts[c] = 0));
    entries.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));

    const notifiedCounts = {};
    Log.NOTIFY_OPTIONS.forEach((n) => (notifiedCounts[n] = 0));
    entries.forEach((e) => (e.notified || []).forEach((n) => (notifiedCounts[n] = (notifiedCounts[n] || 0) + 1)));

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="num mono">${total}</div><div class="label">${Lang.t("total_entries")}</div></div>
        <div class="stat-card"><div class="num mono">${notified}</div><div class="label">${Lang.t("notifications_sent")}</div></div>
        <div class="stat-card"><div class="num mono">${ongoing}</div><div class="label">${Lang.t("ongoing")}</div></div>
      </div>
      <p class="small" style="margin:.6rem 0 1rem">${Lang.t("latest")}: <span class="mono">${latest}</span></p>
      <div class="grid-2" style="gap:1.2rem">
        <div><p class="small" style="margin-bottom:.3rem">Hendelser per type</p><canvas id="chart-category" height="200"></canvas></div>
        <div><p class="small" style="margin-bottom:.3rem">Varslinger per mottaker</p><canvas id="chart-notified" height="200"></canvas></div>
      </div>
      <div style="margin-top:1.2rem">
        <p class="small" style="margin-bottom:.3rem">Hendelser over tid${Auth.event.active_from ? " (basert på arrangementets aktive periode)" : ""}</p>
        <canvas id="chart-timeline" height="110"></canvas>
      </div>
    `;

    const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const gridColor = cssVar("--border");
    const textColor = cssVar("--text-muted");

    if (this._catChart) this._catChart.destroy();
    if (this._notifiedChart) this._notifiedChart.destroy();
    if (this._timeChart) this._timeChart.destroy();

    this._catChart = new Chart(document.getElementById("chart-category"), {
      type: "bar",
      data: {
        labels: Log.CATEGORIES.map((c) => Log.CATEGORY_LABELS[c]),
        datasets: [{ data: Log.CATEGORIES.map((c) => counts[c]), backgroundColor: this._chartColors }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
        },
      },
    });

    this._notifiedChart = new Chart(document.getElementById("chart-notified"), {
      type: "doughnut",
      data: {
        labels: Log.NOTIFY_OPTIONS,
        datasets: [{ data: Log.NOTIFY_OPTIONS.map((n) => notifiedCounts[n]), backgroundColor: this._chartColors }],
      },
      options: {
        plugins: { legend: { position: "bottom", labels: { color: textColor, font: { size: 9 }, boxWidth: 10 } } },
      },
    });

    const timeline = this._buildTimeline(entries);
    this._timeChart = new Chart(document.getElementById("chart-timeline"), {
      type: "bar",
      data: {
        labels: timeline.labels,
        datasets: [{ label: "Hendelser", data: timeline.data, backgroundColor: cssVar("--accent") }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 8 }, maxRotation: 60, minRotation: 45 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } },
        },
      },
    });
  },
};
