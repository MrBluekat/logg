window.PDFExport = {
  _pendingLogoFile: null,

  // Spør om logo før selve eksporten starter
  promptAndExport(eventId, eventName) {
    this._pendingLogoFile = null;
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:440px;margin:3rem auto;">
        <div class="panel-head">${Lang.t("export_pdf")} <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <div class="field">
            <label>${Lang.t("pdf_logo_prompt")}</label>
            <input type="file" id="pdf-logo-input" accept="image/*">
          </div>
          <button class="primary" onclick="PDFExport._startExport('${eventId}','${eventName.replace(/'/g, "\\'")}')">${Lang.t("export_pdf")}</button>
        </div>
      </div>`;
    box.classList.remove("hidden");
  },

  async _startExport(eventId, eventName) {
    const fileInput = document.getElementById("pdf-logo-input");
    const logoFile = fileInput && fileInput.files.length ? fileInput.files[0] : null;
    document.getElementById("history-modal").classList.add("hidden");
    await this.exportEvent(eventId, eventName, logoFile);
  },

  async exportEvent(eventId, eventName, logoFile = null) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    const ensureSpace = (needed) => {
      if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
    };
    const text = (str, size = 8, style = "normal", color = "#000000", indent = 0) => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(String(str ?? ""), pageW - margin * 2 - indent);
      const lh = size * 1.25;
      lines.forEach((line) => {
        ensureSpace(lh);
        doc.text(line, margin + indent, y);
        y += lh;
      });
    };
    const rule = () => {
      ensureSpace(6);
      doc.setDrawColor(210);
      doc.line(margin, y, pageW - margin, y);
      y += 8;
    };
    const sectionHeading = (label) => {
      ensureSpace(20);
      y += 4;
      text(label, 12, "bold");
      rule();
    };

    // ---- Logo (valgfritt, øverst på forsiden) ----
    if (logoFile) {
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result);
          r.onerror = rej;
          r.readAsDataURL(logoFile);
        });
        const format = logoFile.type.includes("png") ? "PNG" : "JPEG";
        const maxW = 140, maxH = 70;
        doc.addImage(dataUrl, format, margin, y, maxW, maxH);
        y += maxH + 10;
      } catch (err) {
        console.error("Kunne ikke bygge inn logo", err);
      }
    }

    // ---- Forside / oppsummering ----
    text(eventName, 16, "bold");
    text("Full hendelseslogg – eksportert " + new Date().toLocaleString("no-NO"), 8, "italic", "#666666");
    y += 3;
    rule();

    const { data: entries } = await sb.from("log_entries").select("*").eq("event_id", eventId).order("created_at");
    const ids = (entries || []).map((e) => e.id);
    const { data: comments } = ids.length ? await sb.from("log_comments").select("*").in("log_entry_id", ids).order("created_at") : { data: [] };
    const { data: attachments } = ids.length ? await sb.from("log_attachments").select("*").in("log_entry_id", ids) : { data: [] };
    const { data: history } = ids.length ? await sb.from("log_edit_history").select("*").in("log_entry_id", ids).order("changed_at") : { data: [] };
    const { data: contacts } = await sb.from("contacts").select("*").eq("event_id", eventId).order("sort_order");

    // ---- Statistikk (før selve loggføringene) ----
    const rows = entries || [];
    const categories = window.Log?.CATEGORIES || [];
    const categoryLabels = window.Log?.CATEGORY_LABELS || {};
    const notifyOptions = window.Log?.NOTIFY_OPTIONS || [];

    const counts = {};
    categories.forEach((c) => (counts[c] = 0));
    rows.forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));

    const notifiedCounts = {};
    notifyOptions.forEach((n) => (notifiedCounts[n] = 0));
    rows.forEach((e) => (e.notified || []).forEach((n) => (notifiedCounts[n] = (notifiedCounts[n] || 0) + 1)));

    const totalNotified = rows.filter((e) => e.notified && e.notified.length).length;
    const ongoing = rows.filter((e) => e.status === "pagaende").length;
    const first = rows[0] ? new Date(rows[0].created_at).toLocaleString("no-NO") : "–";
    const last = rows.length ? new Date(rows[rows.length - 1].created_at).toLocaleString("no-NO") : "–";

    sectionHeading("Statistikk");
    text(`Totalt antall registreringer: ${rows.length}`, 9, "bold");
    text(`Varslinger sendt (antall hendelser med minst én varsling): ${totalNotified}`, 8);
    text(`Pågående saker ved eksporttidspunkt: ${ongoing}`, 8);
    text(`Første registrering: ${first}     Siste registrering: ${last}`, 8);
    y += 4;
    text("Fordeling per kategori:", 9, "bold");
    categories.forEach((c) => text(`  ${categoryLabels[c] || c}: ${counts[c]}`, 8));
    y += 2;
    text("Fordeling per varslingsmottaker:", 9, "bold");
    notifyOptions.forEach((n) => text(`  ${n}: ${notifiedCounts[n]}`, 8));
    y += 6;
    rule();

    // ---- Hver hendelse (kompakt) ----
    sectionHeading("Hendelseslogg");
    for (const e of rows) {
      ensureSpace(30);
      const headerLeft = `${e.display_id}  ${e.category}${e.status !== "avsluttet" ? "  ·  " + e.status : ""}`;
      const headerRight = new Date(e.created_at).toLocaleString("no-NO");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor("#000000");
      ensureSpace(11);
      doc.text(headerLeft, margin, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor("#666666");
      doc.text(headerRight, pageW - margin, y, { align: "right" });
      y += 11;

      const metaParts = [];
      if (e.location) metaParts.push(`Sted: ${e.location}`);
      if (e.reporter_source) metaParts.push(`Via: ${e.reporter_source}`);
      metaParts.push(`Reg. av: ${e.created_by_name}`);
      text(metaParts.join("   ·   "), 7.5, "normal", "#666666");

      text(e.description, 8.5);
      if (e.action_taken) text(`Tiltak: ${e.action_taken}`, 8);
      if (e.notified?.length) text(`Varslet: ${e.notified.join(", ")}`, 8);
      if (e.beredskapsniva) text(`Beredskapsnivå: ${e.beredskapsniva}`, 8, "bold");
      if (e.scene_farge) text(`Scenefarge: ${e.scene_farge}`, 8, "bold");

      const myComments = (comments || []).filter((c) => c.log_entry_id === e.id);
      myComments.forEach((c) => text(`↳ [${new Date(c.created_at).toLocaleString("no-NO")}] ${c.created_by_name}: ${c.comment_text}`, 7.5, "normal", "#333333", 6));

      const myHistory = (history || []).filter((h) => h.log_entry_id === e.id);
      myHistory.forEach((h) => text(`✎ [${new Date(h.changed_at).toLocaleString("no-NO")}] ${h.changed_by_name} – forrige: "${h.previous_data.description}"`, 7, "italic", "#888888", 6));

      const myAttachments = (attachments || []).filter((a) => a.log_entry_id === e.id);
      for (const a of myAttachments) {
        if (a.file_type && a.file_type.startsWith("image/")) {
          try {
            const { data: signed } = await sb.storage.from("attachments").createSignedUrl(a.file_path, 60);
            const resp = await fetch(signed.signedUrl);
            const blob = await resp.blob();
            const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
            ensureSpace(72);
            doc.addImage(dataUrl, "JPEG", margin + 6, y, 90, 65);
            y += 70;
          } catch (err) { console.error("Kunne ikke bygge inn bilde", err); }
        } else {
          text(`📎 ${a.file_name}`, 7.5, "italic", "#666666", 6);
        }
      }
      y += 2;
      rule();
    }

    // ---- Kontaktliste (etter loggføringene) ----
    sectionHeading("Kontaktliste");
    if (!contacts || !contacts.length) {
      text("Ingen kontakter lagt inn.", 8, "italic", "#666666");
    } else {
      contacts.forEach((c) => {
        if (c.is_divider) {
          y += 3;
          text(c.name, 9, "bold");
          return;
        }
        ensureSpace(12);
        const bits = [c.name];
        if (c.phone) bits.push(c.phone);
        if (c.email) bits.push(c.email);
        if (c.organization) bits.push(c.organization);
        text(bits.join("   ·   "), 8);
      });
    }

    doc.save(`${eventName.replace(/[^a-z0-9]/gi, "_")}_logg.pdf`);
  },
};
