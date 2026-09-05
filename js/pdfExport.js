window.PDFExport = {
  async exportEvent(eventId, eventName) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    let y = margin;

    const ensureSpace = (needed) => {
      if (y + needed > pageH - margin) { doc.addPage(); y = margin; }
    };
    // lineHeight er tettere enn tidligere (size*1.15 i stedet for size+4) - kompakt, men fortsatt lesbart
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

    const counts = {};
    (entries || []).forEach((e) => (counts[e.category] = (counts[e.category] || 0) + 1));
    text(`Totalt antall registreringer: ${(entries || []).length}`, 9, "bold");
    text(Object.entries(counts).map(([cat, n]) => `${cat}: ${n}`).join("   ·   "), 8);
    y += 4;
    rule();

    // ---- Hver hendelse (kompakt) ----
    for (const e of entries || []) {
      ensureSpace(30);
      // Header-linje: ID, kategori, status, tidspunkt - alt på én linje
      const headerLeft = `${e.display_id}  ${e.category}${e.status !== "avsluttet" ? "  ·  " + e.status : ""}`;
      const headerRight = new Date(e.created_at).toLocaleString("no-NO");
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor("#000000");
      ensureSpace(11);
      doc.text(headerLeft, margin, y);
      doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor("#666666");
      doc.text(headerRight, pageW - margin, y, { align: "right" });
      y += 11;

      // Meta-linje: lokasjon, kilde, registrert av - sammen på én kompakt linje
      const metaParts = [`Sted: ${e.location}`];
      if (e.reporter_source) metaParts.push(`Via: ${e.reporter_source}`);
      metaParts.push(`Reg. av: ${e.created_by_name}`);
      text(metaParts.join("   ·   "), 7.5, "normal", "#666666");

      text(e.description, 8.5);
      if (e.action_taken) text(`Tiltak: ${e.action_taken}`, 8);
      if (e.notified?.length) text(`Varslet: ${e.notified.join(", ")}`, 8);

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

    doc.save(`${eventName.replace(/[^a-z0-9]/gi, "_")}_logg.pdf`);
  },
};
