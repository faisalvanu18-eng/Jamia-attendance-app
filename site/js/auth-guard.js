// Simple auth guard for file:// protocol (non-module, works everywhere)
// This runs BEFORE ES modules load as a safety net.
(function() {
  var SESSION_KEY = "jamia_demo_session";
  var DB_KEY = "jamia_demo_db_v2";
  // API_MODE (PostgreSQL backend) session keys
  var API_TOKEN_KEY = "jamia_api_token";
  var API_USER_KEY = "jamia_api_user";

  window.JamiaAuth = {
    getCurrentUser: function() {
      // Prefer the API-mode session if present.
      var token = localStorage.getItem(API_TOKEN_KEY);
      var apiUserRaw = localStorage.getItem(API_USER_KEY);
      if (token && apiUserRaw) {
        try {
          var au = JSON.parse(apiUserRaw);
          return { uid: au.uid, name: au.name, role: au.role };
        } catch (e) { /* fall through to demo */ }
      }
      // Fallback: demo/localStorage session.
      var uid = localStorage.getItem(SESSION_KEY);
      if (!uid) return null;
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return null;
      var db = JSON.parse(raw);
      var u = db.users[uid];
      return u ? { uid: uid, name: u.name, role: u.role } : null;
    },
    requireLogin: function() {
      var user = this.getCurrentUser();
      if (!user) {
        window.location.replace("index.html");
        return null;
      }
      this._armPageShowGuard(null);
      return user;
    },
    requireRole: function(role) {
      var user = this.getCurrentUser();
      if (!user) {
        window.location.replace("index.html");
        return null;
      }
      if (role && user.role !== role) {
        window.location.replace(user.role === "admin" ? "admin-dashboard.html" : "dashboard.html");
        return null;
      }
      this._armPageShowGuard(role);
      return user;
    },
    // Re-check auth when this page is restored from the browser's back-forward
    // cache (e.g. the user logs out, then presses BACK). Without this, the
    // frozen protected page would reappear. If the session is gone, send the
    // user to the login page. Applies to both teacher and admin pages.
    _armPageShowGuard: function(role) {
      if (this._pageShowGuardArmed) return;
      this._pageShowGuardArmed = true;
      var self = this;
      window.addEventListener("pageshow", function(event) {
        if (!event.persisted) return; // only when restored from bfcache
        var user = self.getCurrentUser();
        if (!user) {
          window.location.replace("index.html");
          return;
        }
        if (role && user.role !== role) {
          window.location.replace(user.role === "admin" ? "admin-dashboard.html" : "dashboard.html");
        }
      });
    },
    logout: function() {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(API_TOKEN_KEY);
      localStorage.removeItem(API_USER_KEY);
      window.location.replace("index.html");
    }
  };
})();
