// Initialiserer Supabase-klienten (krever config.js lastet først)
window.sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const INACTIVITY_LIMIT_MS = 60 * 60 * 1000; // 1 time

window.Auth = {
  profile: null, // { id, full_name, username, role, event_id }
  event: null,   // { id, name, event_date, status }

  async requireSession(redirectIfMissing = "index.html") {
    const { data } = await sb.auth.getSession();
    if (!data.session) {
      window.location.href = redirectIfMissing;
      return null;
    }
    const profile = await this.loadProfile();
    if (profile && !this._isActive(profile)) {
      await sb.auth.signOut();
      window.location.href = "index.html?deactivated=1";
      return null;
    }
    this._resetInactivityTimer();
    return data.session;
  },

  _isActive(profile) {
    const now = new Date();
    if (profile.active_from && new Date(profile.active_from) > now) return false;
    if (profile.active_until && new Date(profile.active_until) < now) return false;
    return true;
  },

  async loadProfile() {
    const { data: userData } = await sb.auth.getUser();
    if (!userData?.user) return null;
    const { data: profile, error } = await sb
      .from("profiles")
      .select("*")
      .eq("id", userData.user.id)
      .single();
    if (error) { console.error(error); return null; }
    this.profile = profile;
    if (profile.event_id) {
      const { data: ev } = await sb.from("events").select("*").eq("id", profile.event_id).single();
      this.event = ev;
    }
    return profile;
  },

  async login(username, password) {
    const email = `${username.trim().toLowerCase()}@${window.EMAIL_DOMAIN}`;
    return sb.auth.signInWithPassword({ email, password });
  },

  async logout() {
    await sb.auth.signOut();
    window.location.href = "index.html";
  },

  _resetInactivityTimer() {
    if (this._inactivityTimeout) clearTimeout(this._inactivityTimeout);
    this._inactivityTimeout = setTimeout(() => this.logout(), INACTIVITY_LIMIT_MS);
    ["click", "keydown", "touchstart", "mousemove"].forEach((evt) => {
      document.addEventListener(evt, () => {
        if (this._inactivityTimeout) clearTimeout(this._inactivityTimeout);
        this._inactivityTimeout = setTimeout(() => this.logout(), INACTIVITY_LIMIT_MS);
      }, { passive: true });
    });
  },

  isAdmin() { return this.profile?.role === "admin"; },
  isLogger() { return this.profile?.role === "logger"; },
  isObserver() { return this.profile?.role === "observator"; },
  canWrite() { return this.isAdmin() || this.isLogger(); },
};
