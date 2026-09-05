window.Contacts = {
  list: [],

  async open() {
    await this.load();
    this._render();
  },

  async load() {
    const { data } = await sb.from("contacts").select("*").eq("event_id", Auth.event.id).order("sort_order");
    this.list = data || [];
  },

  async _nextSortOrder() {
    const max = this.list.reduce((m, c) => Math.max(m, c.sort_order || 0), 0);
    return max + 1;
  },

  async add() {
    const name = document.getElementById("contact-name").value.trim();
    const phone = document.getElementById("contact-phone").value.trim();
    const email = document.getElementById("contact-email").value.trim();
    const organization = document.getElementById("contact-org").value.trim();
    if (!name) return;
    const sort_order = await this._nextSortOrder();
    await sb.from("contacts").insert({
      event_id: Auth.event.id, name, phone: phone || null, email: email || null,
      organization: organization || null, is_divider: false, sort_order,
    });
    await this.load();
    this._render();
  },

  async addDivider() {
    const label = prompt("Tekst på skillestreken (f.eks. «Sikkerhet», «Medisinsk»):");
    if (label === null) return;
    const sort_order = await this._nextSortOrder();
    await sb.from("contacts").insert({
      event_id: Auth.event.id, name: label.trim() || "—", is_divider: true, sort_order,
    });
    await this.load();
    this._render();
  },

  async remove(id) {
    await sb.from("contacts").delete().eq("id", id);
    await this.load();
    this._render();
  },

  async move(id, direction) {
    const idx = this.list.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= this.list.length) return;
    const a = this.list[idx];
    const b = this.list[swapIdx];
    await sb.from("contacts").update({ sort_order: b.sort_order }).eq("id", a.id);
    await sb.from("contacts").update({ sort_order: a.sort_order }).eq("id", b.id);
    await this.load();
    this._render();
  },

  _render() {
    const box = document.getElementById("history-modal");
    const canWrite = Auth.canWrite();
    box.innerHTML = `
      <div class="panel" style="max-width:600px;margin:3rem auto;">
        <div class="panel-head">${Lang.t("contact_list")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <table class="data-table">
            <thead><tr><th>${Lang.t("contact_name")}</th><th>${Lang.t("contact_phone")}</th><th>${Lang.t("contact_email")}</th><th>${Lang.t("contact_org")}</th>${canWrite ? "<th></th>" : ""}</tr></thead>
            <tbody>
              ${this.list.map((c, i) => {
                if (c.is_divider) {
                  return `<tr><td colspan="${canWrite ? 5 : 4}" style="padding-top:1rem">
                    <div style="display:flex;align-items:center;gap:.6rem">
                      <strong style="white-space:nowrap">${c.name}</strong>
                      <div style="flex:1;border-top:1px solid var(--border)"></div>
                      ${canWrite ? `
                        <button class="ghost" onclick="Contacts.move('${c.id}',-1)" ${i === 0 ? "disabled" : ""}>▲</button>
                        <button class="ghost" onclick="Contacts.move('${c.id}',1)" ${i === this.list.length - 1 ? "disabled" : ""}>▼</button>
                        <button class="ghost" onclick="Contacts.remove('${c.id}')">${Lang.t("remove")}</button>
                      ` : ""}
                    </div>
                  </td></tr>`;
                }
                return `<tr>
                  <td>${c.name}</td>
                  <td class="mono">${c.phone || "–"}</td>
                  <td>${c.email || "–"}</td>
                  <td>${c.organization || "–"}</td>
                  ${canWrite ? `<td class="row" style="gap:.3rem">
                    <button class="ghost" onclick="Contacts.move('${c.id}',-1)" ${i === 0 ? "disabled" : ""}>▲</button>
                    <button class="ghost" onclick="Contacts.move('${c.id}',1)" ${i === this.list.length - 1 ? "disabled" : ""}>▼</button>
                    <button class="ghost" onclick="Contacts.remove('${c.id}')">${Lang.t("remove")}</button>
                  </td>` : ""}
                </tr>`;
              }).join("") || `<tr><td colspan="5" class="small">–</td></tr>`}
            </tbody>
          </table>
          ${canWrite ? `
            <div class="grid-2" style="margin-top:1rem">
              <div class="field"><label>${Lang.t("contact_name")}</label><input id="contact-name"></div>
              <div class="field"><label>${Lang.t("contact_phone")}</label><input id="contact-phone"></div>
              <div class="field"><label>${Lang.t("contact_email")}</label><input id="contact-email"></div>
              <div class="field"><label>${Lang.t("contact_org")}</label><input id="contact-org"></div>
            </div>
            <div class="row">
              <button class="primary" onclick="Contacts.add()">${Lang.t("contact_add")}</button>
              <button class="ghost" onclick="Contacts.addDivider()">${Lang.t("contact_add_divider")}</button>
            </div>
          ` : ""}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
