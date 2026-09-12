/**
 * Sign-in page: account login/register only. Redirects to profile when signed in.
 */
(function accountsAuthPage() {
  const accounts = window.GlobbleAccounts;
  if (!accounts) {
    return;
  }

  const PROFILE_URL = "./profile.html";
  const authForm = document.getElementById("authForm");
  const forgotForm = document.getElementById("forgotForm");
  const authUsername = document.getElementById("authUsername");
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authPasswordToggle = document.getElementById("authPasswordToggle");
  const authError = document.getElementById("authError");
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");
  const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
  const forgotLogin = document.getElementById("forgotLogin");
  const forgotSubmitBtn = document.getElementById("forgotSubmitBtn");
  const forgotBackBtn = document.getElementById("forgotBackBtn");
  const forgotError = document.getElementById("forgotError");
  const forgotDevLinkWrap = document.getElementById("forgotDevLinkWrap");
  const forgotDevLink = document.getElementById("forgotDevLink");

  function setAuthError(message) {
    if (authError) authError.textContent = message || "";
  }

  function setForgotError(message) {
    if (forgotError) forgotError.textContent = message || "";
  }

  function setForgotDevLink(url) {
    if (!forgotDevLinkWrap || !forgotDevLink) {
      return;
    }
    if (url) {
      forgotDevLink.href = url;
      forgotDevLinkWrap.hidden = false;
    } else {
      forgotDevLink.removeAttribute("href");
      forgotDevLinkWrap.hidden = true;
    }
  }

  function setAuthPasswordVisible(visible) {
    if (!authPassword || !authPasswordToggle) {
      return;
    }
    authPassword.type = visible ? "text" : "password";
    authPasswordToggle.textContent = visible ? "Hide" : "Show";
    authPasswordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    authPasswordToggle.setAttribute("aria-pressed", visible ? "true" : "false");
  }

  function showForgot(show) {
    if (authForm) authForm.hidden = !!show;
    if (forgotForm) forgotForm.hidden = !show;
    setForgotError("");
    setForgotDevLink("");
    setAuthError("");
    if (show && forgotLogin && authUsername?.value) {
      forgotLogin.value = authUsername.value.trim();
    }
  }

  function goToProfile() {
    location.href = PROFILE_URL;
  }

  async function doAuth(mode) {
    setAuthError("");
    const login = (authUsername?.value || "").trim();
    const password = authPassword?.value || "";
    const email = (authEmail?.value || "").trim();
    if (!login || !password) {
      setAuthError(
        mode === "register"
          ? "Enter a username, email, and password."
          : "Enter username or email, and password."
      );
      return;
    }
    if (mode === "register" && login.includes("@")) {
      setAuthError("Choose a username for your account (email goes in the email field).");
      return;
    }
    if (mode === "register" && !email) {
      setAuthError("Email is required to create an account.");
      return;
    }
    if (loginBtn) loginBtn.disabled = true;
    if (registerBtn) registerBtn.disabled = true;
    try {
      const body =
        mode === "register"
          ? { username: login, password, email }
          : { login, password };
      const data = await accounts.api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          method: "POST",
          body: JSON.stringify(body)
        }
      );
      accounts.setSession(data.token, data.user);
      goToProfile();
    } catch (err) {
      let message = err.message || "Could not sign in.";
      if (err.status === 401 && /no account/i.test(message)) {
        message =
          "No account found. Use Create account, or check you are on the same site where you registered.";
      } else if (err.status === 401 && /password/i.test(message)) {
        message = "Incorrect password. Passwords are case-sensitive.";
      } else if (err.status === 409) {
        message = err.message || "That username or email is already taken.";
      } else if (!err.status) {
        message =
          "Could not reach the account server. Use npm run start:local (or start:static with the API-enabled server), not opening HTML files directly.";
      }
      setAuthError(message);
    } finally {
      if (loginBtn) loginBtn.disabled = false;
      if (registerBtn) registerBtn.disabled = false;
    }
  }

  async function doForgot() {
    setForgotError("");
    setForgotDevLink("");
    const login = (forgotLogin?.value || "").trim();
    if (!login) {
      setForgotError("Enter your username or email.");
      return;
    }
    if (forgotSubmitBtn) forgotSubmitBtn.disabled = true;
    try {
      const data = await accounts.api("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ login })
      });
      setForgotError(data.message || "If that account has an email, we sent a reset link.");
      if (data.devResetUrl) {
        setForgotDevLink(data.devResetUrl);
      }
    } catch (err) {
      setForgotError(err.message || "Could not send reset email.");
    } finally {
      if (forgotSubmitBtn) forgotSubmitBtn.disabled = false;
    }
  }

  authPasswordToggle?.addEventListener("click", () => {
    setAuthPasswordVisible(authPassword?.type === "password");
  });

  loginBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  registerBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    doAuth("register");
  });
  authForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doAuth("login");
  });
  forgotPasswordBtn?.addEventListener("click", () => showForgot(true));
  forgotBackBtn?.addEventListener("click", () => showForgot(false));
  forgotForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    doForgot();
  });

  accounts.refreshMe().then((user) => {
    if (user) {
      const params = new URLSearchParams(location.search);
      if (params.get("dictionary") === "1") {
        location.href = "./profile.html?dictionary=1";
        return;
      }
      goToProfile();
    }
  });
})();
