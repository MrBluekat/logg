// Nøytraliserer HTML-spesialtegn i brukerinnhold (beskrivelser, kommentarer, navn osv.)
// før det settes inn i siden - hindrer at noen kan kjøre skript ved å skrive
// f.eks. <img src=x onerror=...> som tekst i et felt.
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
