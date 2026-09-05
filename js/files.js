window.Files = {
  list: [],

  async open() {
    await this.load();
    this._renderList();
  },

  async load() {
    const { data } = await sb.from("log_attachments").select("*").eq("event_id", Auth.event.id).order("uploaded_at", { ascending: false });
    this.list = data || [];
  },

  async uploadManual(fileList) {
    for (const file of fileList) {
      const path = `${Auth.event.id}/manual/${Date.now()}_${file.name}`;
      const { error } = await sb.storage.from("attachments").upload(path, file);
      if (error) { console.error(error); continue; }
      await sb.from("log_attachments").insert({
        event_id: Auth.event.id, log_entry_id: null, file_path: path, file_name: file.name,
        file_type: file.type, uploaded_by: Auth.profile.id, uploaded_by_name: Auth.profile.full_name,
      });
    }
    await this.load();
    this._renderList();
  },

  async remove(id) {
    await sb.from("log_attachments").delete().eq("id", id);
    await this.load();
    this._renderList();
  },

  async _url(path) {
    const { data } = await sb.storage.from("attachments").createSignedUrl(path, 3600);
    return data?.signedUrl;
  },

  async preview(id) {
    const file = this.list.find((f) => f.id === id);
    if (!file) return;
    const url = await this._url(file.file_path);
    const box = document.getElementById("history-modal");
    let body;
    if (!url) {
      body = `<p class="small">Kunne ikke åpne filen.</p>`;
    } else if (file.file_type && file.file_type.startsWith("image/")) {
      body = `<img src="${url}" style="max-width:100%; max-height:70vh; display:block; margin:0 auto">`;
    } else if (file.file_type === "application/pdf") {
      body = `<iframe src="${url}" style="width:100%; height:70vh; border:none"></iframe>`;
    } else {
      body = `<p class="small">Denne filtypen kan ikke forhåndsvises her.</p><a href="${url}" target="_blank"><button class="primary">Åpne / last ned</button></a>`;
    }
    box.innerHTML = `
      <div class="panel" style="max-width:800px;margin:2rem auto;">
        <div class="panel-head">
          <button class="ghost" onclick="Files._renderList()">← ${Lang.t("files")}</button>
          <span>${file.file_name}</span>
          <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button>
        </div>
        <div class="panel-body">${body}</div>
      </div>`;
    box.classList.remove("hidden");
  },

  _renderList() {
    const box = document.getElementById("history-modal");
    const canWrite = Auth.canWrite();
    box.innerHTML = `
      <div class="panel" style="max-width:600px;margin:3rem auto;">
        <div class="panel-head" data-i18n="files">Filer <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <table class="data-table">
            <thead><tr><th>${Lang.t("file_name")}</th><th>${Lang.t("file_source")}</th><th>${Lang.t("file_uploaded_by")}</th><th>${Lang.t("file_uploaded_at")}</th>${canWrite ? "<th></th>" : ""}</tr></thead>
            <tbody>
              ${this.list.map((f) => `
                <tr>
                  <td><a href="#" onclick="Files.preview('${f.id}'); return false;">📎 ${f.file_name}</a></td>
                  <td class="small">${f.log_entry_id ? Lang.t("file_source_log") : Lang.t("file_source_manual")}</td>
                  <td class="small">${f.uploaded_by_name || "–"}</td>
                  <td class="small mono">${new Date(f.uploaded_at).toLocaleString("no-NO")}</td>
                  ${canWrite ? `<td><button class="ghost" onclick="Files.remove('${f.id}')">${Lang.t("remove")}</button></td>` : ""}
                </tr>`).join("") || `<tr><td colspan="5" class="small">–</td></tr>`}
            </tbody>
          </table>
          ${canWrite ? `
            <div class="field" style="margin-top:1rem">
              <label>${Lang.t("file_upload_manual")}</label>
              <input type="file" id="manual-file-input" multiple>
            </div>
            <button class="primary" onclick="Files.uploadManual(document.getElementById('manual-file-input').files)">${Lang.t("file_upload_btn")}</button>
          ` : ""}
        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
