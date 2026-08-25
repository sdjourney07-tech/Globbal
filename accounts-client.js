/**
 * Shared account session helpers for menu + online play.
 */
(function accountsClient() {
  const TOKEN_KEY = "globble-auth-token-v1";
  const USER_KEY = "globble-auth-user-v1";

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setSession(token, user) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
  }

  function clearSession() {
    setSession("", null);
  }

  async function api(path, options = {}) {
    const headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (options.body && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(path, {
      ...options,
      headers,
      cache: "no-store"
    });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    if (!response.ok) {
      const err = new Error((data && data.error) || `Request failed (${response.status})`);
      err.status = response.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function refreshMe() {
    if (!getToken()) {
      clearSession();
      return null;
    }
    try {
      const data = await api("/api/me");
      setSession(getToken(), data.user);
      return data.user;
    } catch {
      clearSession();
      return null;
    }
  }

  window.GlobbleAccounts = {
    getToken,
    getUser,
    setSession,
    clearSession,
    api,
    refreshMe
  };
})();
