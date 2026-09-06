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

  // ------------------------------------------------------------------------
  // Send manuell melding til en bruker tilknyttet arrangementet (envis - mottaker kan ikke svare)
  // ------------------------------------------------------------------------
  async openCompose() {
    const { data } = await sb.from("profiles").select("id, full_name")
      .or(`event_id.eq.${Auth.event.id},role.eq.admin`).order("full_name");
    const users = (data || []).filter((u) => u.id !== Auth.profile.id);

    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:460px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("send_message")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <div class="field"><label>${Lang.t("recipient")}</label>
            <select id="msg-recipient">${users.map((u) => `<option value="${u.id}">${u.full_name}</option>`).join("") || `<option value="">–</option>`}</select>
          </div>
          <div class="field"><label>${Lang.t("message_text")}</label>
            <textarea id="msg-text" placeholder="${Lang.t("message_placeholder")}"></textarea>
          </div>
          <button class="primary" onclick="Notifications.sendCompose()">${Lang.t("send")}</button>
          <div id="msg-error" class="error-text"></div>
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async sendCompose() {
    const recipientId = document.getElementById("msg-recipient").value;
    const text = document.getElementById("msg-text").value.trim();
    if (!recipientId || !text) {
      document.getElementById("msg-error").textContent = Lang.t("message_missing_fields");
      return;
    }
    await this.notifyUser(recipientId, Auth.event.id, `${Lang.t("message_from")} ${Auth.profile.full_name}`, text);
    document.getElementById("history-modal").classList.add("hidden");
  },
};
