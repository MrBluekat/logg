window.Contacts = {
  list: [],

  async open() {
    await this.load();
    this._render();
  },

  async load() {
    const { data } = await sb.from("contacts").select("*").eq("event_id", Auth.event.id).order("name");
    this.list = data || [];
  },

  async add() {
    const name = document.getElementById("contact-name").value.trim();
    const phone = document.getElementById("contact-phone").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const organization = document.getElementById("contact-org").value.trim();
    if (!name) return;
    await sb.from("contacts").insert({
      event_id: Auth.event.id, name, phone: phone || null, email: email || null, organization: organization || null,
    });
    await this.load();
    this._render();
  },

  async remove(id) {
    await sb.from("contacts").delete().eq("id", id);
    await this.load();
    this._render();
  },

  _render() {
    const box = document.getElementById("history-modal");
    const canWrite = Auth.canWrite();
    box.innerHTML = `
      <div class="panel" style="max-width:560px;margin:3rem auto;">
        <div class="panel-head">${Lang.t("contact_list")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <table class="data-table">
            <thead><tr><th>${Lang.t("contact_name")}</th><th>${Lang.t("contact_phone")}</th><th>${Lang.t("contact_email")}</th><th>${Lang.t("contact_org")}</th>${canWrite ? "<th></th>" : ""}</tr></thead>
            <tbody>
              ${this.list.map((c) => `
                <tr>
                  <td>${c.name}</td>
                  <td class="mono">${c.phone || "–"}</td>
                  <td>${c.email || "–"}</td>
                  <td>${c.organization || "–"}</td>
                  ${canWrite ? `<td><button class="ghost" onclick="Contacts.remove('${c.id}')">${Lang.t("remove")}</button></td>` : ""}
                </tr>`).join("") || `<tr><td colspan="5" class="small">–</td></tr>`}
            </tbody>
          </table>
          ${canWrite ? `
            <div class="grid-2" style="margin-top:1rem">
              <div class="field"><label>${Lang.t("contact_name")}</label><input id="contact-name"></div>
              <div class="field"><label>${Lang.t("contact_phone")}</label><input id="contact-phone"></div>
              <div class="field"><label>${Lang.t("contact_email")}</label><input id="contact-email"></div>
              <div class="field"><label>${Lang.t("contact_org")}</label><input id="contact-org"></div>
            </div>
            <button class="primary" onclick="Contacts.add()">${Lang.t("contact_add")}</button>
          ` : ""}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
