window.Gps = {
  TARGET_ACCURACY_M: 5,
  TIMEOUT_MS: 15000,
  eventMap: null,

  // Prøver å oppnå ≤5 m nøyaktighet i inntil 15 sekunder, men gir ALDRI opp -
  // returnerer beste posisjon den rakk å finne innen tidsavbruddet.
  getAccuratePosition(onUpdate) {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) { reject(new Error("Denne enheten støtter ikke posisjonsdeling.")); return; }
      let best = null;
      let done = false;
      const finish = (pos) => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(watchId);
        clearTimeout(timer);
        resolve(pos);
      };
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
          if (onUpdate) onUpdate(best);
          if (pos.coords.accuracy <= this.TARGET_ACCURACY_M) finish(pos);
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: this.TIMEOUT_MS }
      );
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        navigator.geolocation.clearWatch(watchId);
        if (best) resolve(best);
        else reject(new Error("Kunne ikke hente posisjon."));
      }, this.TIMEOUT_MS);
    });
  },

  accuracyLabel(accM) {
    const rounded = Math.round(accM);
    const cls = accM <= this.TARGET_ACCURACY_M ? "gps-accuracy-good" : "gps-accuracy-bad";
    return `<span class="${cls}">±${rounded} m</span>`;
  },

  async loadEventMap() {
    const { data } = await sb.from("event_maps").select("*").eq("event_id", Auth.event.id);
    this.eventMap = (data && data[0]) || null;
  },

  // Regner om GPS-koordinat til prosentposisjon på et nord-opp kalibrert kart.
  // Returnerer null hvis punktet faller utenfor kartets dekningsområde.
  toMapPercent(lat, lng) {
    if (!this.eventMap) return null;
    const { top_left_lat, top_left_lng, bottom_right_lat, bottom_right_lng } = this.eventMap;
    const fracX = (lng - top_left_lng) / (bottom_right_lng - top_left_lng);
    const fracY = (top_left_lat - lat) / (top_left_lat - bottom_right_lat);
    if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return null;
    return { xPct: fracX * 100, yPct: fracY * 100 };
  },

  async openViewer(lat, lng, accuracyM) {
    const googleUrl = `https://www.google.com/maps?q=${lat},${lng}`;
    const pos = this.toMapPercent(lat, lng);
    if (!pos) { window.open(googleUrl, "_blank"); return; }

    const { data: signed } = await sb.storage.from("attachments").createSignedUrl(this.eventMap.image_path, 3600);
    const box = document.getElementById("history-modal");
    box.innerHTML = `
      <div class="panel" style="max-width:600px;margin:2rem auto;">
        <div class="panel-head">Posisjon <button class="ghost" onclick="document.getElementById('history-modal').classList.add('hidden')">✕</button></div>
        <div class="panel-body">
          <div style="position:relative">
            <img src="${signed?.signedUrl || ""}" style="width:100%;border-radius:8px;display:block">
            <div style="position:absolute;left:${pos.xPct}%;top:${pos.yPct}%;width:18px;height:18px;margin-left:-9px;margin-top:-18px;background:#e5595e;border:3px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 2px 6px rgba(0,0,0,.4)"></div>
          </div>
          <p class="small" style="margin-top:.6rem">Nøyaktighet: ${accuracyM != null ? this.accuracyLabel(accuracyM) : "ukjent"}</p>
          <a href="${googleUrl}" target="_blank"><button class="ghost" style="width:100%">Åpne i Google Maps i stedet</button></a>
        </div>
      </div>`;
    box.classList.remove("hidden");
  },
};
