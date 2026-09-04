window.PDFExport = {
  async exportEvent(eventId, eventName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    const ensureSpace = (needed) => {
      if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
    };
    const text = (str, size = 10, style = "normal", color = "#000000") => {
      doc.setFont("helvetica", style);
      doc.setFontSize(size);
      doc.setTextColor(color);
      const lines = doc.splitTextToSize(String(str ?? ""), pageW - margin * 2);
      lines.forEach((line) => {
        ensureSpace(size + 4);
        doc.text(line, margin, y);
        y += size + 4;
      });
    };
    const rule = () => {
      ensureSpace(10);
      doc.setDrawColor(200);
      doc.line(margin, y, pageW - margin, y);
      y += 12;
    };

    // ---- Forside / oppsummering ----
    text(eventName, 20, "bold");
    text("Full hendelseslogg – eksportert " + new Date().toLocaleString("no-NO"), 10, "italic", "#555555");
    y += 6;
    rule();

    const { data: entries } = await sb.from("log_entries").select("*").eq("event_id", eventId).order("created_at");
    const ids = (entries || []).map((e) => e.id);
    const { data: comments } = ids.length ? await sb.from("log_comments").select("*").in("log_entry_id", ids).order("created_at") : { data: [] };
    const { data: attachments } = ids.length ? await sb.from("log_attachments").select("*").in("log_entry_id", ids) : { data: [] };
    const { data: history } = ids.length ? await sb.from("log_edit_history").select("*").in("log_entry_id", ids).order("changed_at") : { data: [] };

    const counts = {};
    (entries || []).forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    text(`Totalt antall registreringer: ${(entries || []).length}`, 11, "bold");
    Object.entries(counts).forEach(([cat, n]) => text(`  ${cat}: ${n}`, 10));
    y += 10;
    rule();

    // ---- Hver hendelse ----
    for (const e of entries || []) {
      ensureSpace(60);
      text(`${e.display_id}  —  ${e.category}  —  ${new Date(e.created_at).toLocaleString("no-NO")}`, 12, "bold");
      text(`Status: ${e.status}   Type: ${e.entry_kind}   Lokasjon: ${e.location}`, 9, "normal", "#555555");
      if (e.reporter_source) text(`Meldt via: ${e.reporter_source}`, 9, "normal", "#555555");
      text(e.description, 10);
      if (e.action_taken) text(`Tiltak utført: ${e.action_taken}`, 10);
      if (e.notified?.length) text(`Varslet/kontaktet: ${e.notified.join(", ")}`, 10);
      text(`Registrert av: ${e.created_by_name}`, 9, "italic", "#555555");

      const myComments = (comments || []).filter((c) => c.log_entry_id === e.id);
      if (myComments.length) {
        text("Oppdateringer:", 10, "bold");
        myComments.forEach((c) => text(`  [${new Date(c.created_at).toLocaleString("no-NO")}] ${c.created_by_name}: ${c.comment_text}`, 9));
      }

      const myHistory = (history || []).filter((h) => h.log_entry_id === e.id);
      if (myHistory.length) {
        text("Endringshistorikk:", 10, "bold");
        myHistory.forEach((h) => text(`  [${new Date(h.changed_at).toLocaleString("no-NO")}] ${h.changed_by_name} – forrige tekst: "${h.previous_data.description}"`, 9));
      }

      const myAttachments = (attachments || []).filter((a) => a.log_entry_id === e.id);
      for (const a of myAttachments) {
        text(`Vedlegg: ${a.file_name}`, 9, "italic", "#555555");
        if (a.file_type && a.file_type.startsWith("image/")) {
          try {
            const { data: signed } = await sb.storage.from("attachments").createSignedUrl(a.file_path, 60);
            const resp = await fetch(signed.signedUrl);
            const blob = await resp.blob();
            const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
            ensureSpace(160);
            doc.addImage(dataUrl, "JPEG", margin, y, 160, 120);
            y += 130;
          } catch (err) { console.error("Kunne ikke bygge inn bilde", err); }
        }
      }
      y += 6;
      rule();
    }

    doc.save(`${eventName.replace(/[^a-z0-9]/gi, "_")}_logg.pdf`);
  },
};
