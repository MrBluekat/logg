window.Contacts = {
  list: [],
  _dragId: null,

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

  // --- Drag-and-drop reordering ---
  _onDragStart(id) { this._dragId = id; },

  async _onDrop(targetId) {
    if (!this._dragId || this._dragId === targetId) return;
    const fromIdx = this.list.findIndex((c) => c.id === this._dragId);
    const toIdx = this.list.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = this.list.splice(fromIdx, 1);
    this.list.splice(toIdx, 0, moved);
    this._dragId = null;
    // Skriv ny rekkefølge til alle rader (enkelt og trygt fremfor å regne ut minimal diff)
    await Promise.all(this.list.map((c, i) => sb.from("contacts").update({ sort_order: i }).eq("id", c.id)));
    await this.load();
    this._render();
  },

  _render() {
    const box = document.getElementById("history-modal");
    const canWrite = Auth.canWrite();
    box.innerHTML = `
      <div class="panel" style="max-width:760px;margin:2rem auto;">
        <div class="panel-head">${Lang.t("contact_list")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <div style="max-height:50vh; overflow-y:auto; border:1px solid var(--border); border-radius:6px">
            <div style="display:grid; grid-template-columns:${canWrite ? "20px" : ""} 1.3fr 1fr 1.3fr 1fr ${canWrite ? "auto" : ""}; gap:0 .6rem; padding:.4rem .6rem; font-size:.78rem; color:var(--text-muted); border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--panel)">
              ${canWrite ? "<span></span>" : ""}
              <span>${Lang.t("contact_name")}</span><span>${Lang.t("contact_phone")}</span><span>${Lang.t("contact_email")}</span><span>${Lang.t("contact_org")}</span>
              ${canWrite ? "<span></span>" : ""}
            </div>
            ${this.list.map((c) => {
              if (c.is_divider) {
                return `<div ${canWrite ? `draggable="true" ondragstart="Contacts._onDragStart('${c.id}')" ondragover="event.preventDefault()" ondrop="Contacts._onDrop('${c.id}')"` : ""}
                  style="display:flex; align-items:center; gap:.5rem; padding:.5rem .6rem; border-bottom:1px solid var(--border); cursor:${canWrite ? "grab" : "default"}">
                  ${canWrite ? `<span class="small">⠿</span>` : ""}
                  <strong style="white-space:nowrap; font-size:.85rem">${c.name}</strong>
                  <div style="flex:1; border-top:1px solid var(--border)"></div>
                  ${canWrite ? `<button class="ghost" style="padding:.1rem .4rem" onclick="Contacts.remove('${c.id}')">${Lang.t("remove")}</button>` : ""}
                </div>`;
              }
              return `<div ${canWrite ? `draggable="true" ondragstart="Contacts._onDragStart('${c.id}')" ondragover="event.preventDefault()" ondrop="Contacts._onDrop('${c.id}')"` : ""}
                style="display:grid; grid-template-columns:${canWrite ? "20px" : ""} 1.3fr 1fr 1.3fr 1fr ${canWrite ? "auto" : ""}; gap:0 .6rem; align-items:center; padding:.35rem .6rem; border-bottom:1px solid var(--border); font-size:.88rem; cursor:${canWrite ? "grab" : "default"}">
                ${canWrite ? `<span class="small">⠿</span>` : ""}
                <span>${c.name}</span>
                <span class="mono small">${c.phone || "–"}</span>
                <span class="small">${c.email || "–"}</span>
                <span class="small">${c.organization || "–"}</span>
                ${canWrite ? `<button class="ghost" style="padding:.1rem .4rem" onclick="Contacts.remove('${c.id}')">${Lang.t("remove")}</button>` : ""}
              </div>`;
            }).join("") || `<div class="small" style="padding:.6rem">–</div>`}
          </div>
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
