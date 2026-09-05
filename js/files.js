window.Files = {
  list: [],

  async open() {
    await this.load();
    this._render();
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
    this._render();
  },

  async remove(id) {
    await sb.from("log_attachments").delete().eq("id", id);
    await this.load();
    this._render();
  },

  async _url(path) {
    const { data } = await sb.storage.from("attachments").createSignedUrl(path, 3600);
    return data?.signedUrl;
  },

  _render() {
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
                  <td><a id="file-link-${f.id}" href="#" target="_blank">📎 ${f.file_name}</a></td>
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
    this.list.forEach(async (f) => {
      const url = await this._url(f.file_path);
      const link = document.getElementById(`file-link-${f.id}`);
      if (link && url) link.href = url;
    });
  },
};
