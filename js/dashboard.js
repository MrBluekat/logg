window.Dashboard = {
  update(entries) {
    const el = document.getElementById("dashboard");
    if (!el) return;

    const total = entries.length;
    const notified = entries.filter((e) => e.notified && e.notified.length).length;
    const ongoing = entries.filter((e) => e.status === "pagaende").length;
    const latest = entries[0] ? new Date(entries[0].created_at).toLocaleString("no-NO") : "–";

    const counts = {};
    Log.CATEGORIES.forEach((c) => (counts[c] = 0));
    entries.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    const max = Math.max(1, ...Object.values(counts));

    el.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><div class="num mono">${total}</div><div class="label">${Lang.t("total_entries")}</div></div>
        <div class="stat-card"><div class="num mono">${notified}</div><div class="label">${Lang.t("notifications_sent")}</div></div>
        <div class="stat-card"><div class="num mono">${ongoing}</div><div class="label">${Lang.t("ongoing")}</div></div>
      </div>
      <p class="small" style="margin-top:.8rem">${Lang.t("latest")}: <span class="mono">${latest}</span></p>
      <div style="margin-top:1rem; display:flex; flex-direction:column; gap:.5rem">
        ${Log.CATEGORIES.map((c) => `
          <div>
            <div class="small" style="display:flex; justify-content:space-between">
              <span>${Log.CATEGORY_LABELS[c]}</span><span class="mono">${counts[c]}</span>
            </div>
            <div style="background:var(--border); border-radius:3px; height:6px; overflow:hidden">
              <div style="width:${(counts[c] / max) * 100}%; background:var(--accent); height:100%"></div>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  },
};
