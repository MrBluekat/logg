window.Notifications = {
  list: [],
  isOpen: false,

  async init() {
    await this.load();
    this._updateBadge();
    this._subscribeRealtime();
  },

  async load() {
    const { data } = await sb.from("notifications").select("*")
      .eq("user_id", Auth.profile.id).order("created_at", { ascending: false }).limit(50);
    this.list = data || [];
    this._updateBadge();
    if (this.isOpen) this._render();
  },

  _subscribeRealtime() {
    sb.channel("notifications-" + Auth.profile.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${Auth.profile.id}` }, () => this.load())
      .subscribe();
  },

  _updateBadge() {
    const badge = document.getElementById("notif-badge");
    if (!badge) return;
    const unread = this.list.filter((n) => !n.read).length;
    badge.classList.toggle("hidden", unread === 0);
  },

  async open() {
    this.isOpen = true;
    this._render();
    const unreadIds = this.list.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length) {
      await sb.from("notifications").update({ read: true }).in("id", unreadIds);
      await this.load();
    }
  },

  close() {
    this.isOpen = false;
    document.getElementById("history-modal").classList.add("hidden");
  },

  _render() {
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:520px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("notification_center")} <button class="ghost" onclick="Notifications.close()">✕</button></div>
        <div class="panel-body" style="max-height:60vh; overflow-y:auto">
          ${this.list.map((n) => `
            <div class="log-entry" style="${n.read ? "" : "border-left:3px solid var(--accent)"}">
              <div class="row1"><strong>${n.title}</strong><span class="timestamp mono">${new Date(n.created_at).toLocaleString("no-NO")}</span></div>
              ${n.body ? `<p class="desc">${n.body}</p>` : ""}
            </div>
          `).join("") || `<p class="small">${Lang.t("no_notifications")}</p>`}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  // Sender varsel + push til én bestemt bruker (f.eks. ved tildeling av en oppgave).
  async notifyUser(userId, eventId, title, body) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      await fetch(`${window.SUPABASE_URL}/functions/v1/send-push`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: userId, event_id: eventId, title, body }),
      });
    } catch (e) {
      console.error("Kunne ikke sende varsel:", e);
    }
  },
};
