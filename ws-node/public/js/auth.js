// ════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════

async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errEl = document.getElementById("loginError");
  errEl.textContent = "";
  if (!username || !password) {
    errEl.textContent = "Please enter username and password.";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || "Login failed.";
      return;
    }

    token = data.access_token;
    myUserId = data.user.id;
    myUser = data.user;

    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_user", JSON.stringify(data.user));
    // Save login time so we can detect expiry client-side
    localStorage.setItem("cc_login_at", Date.now().toString());

    initApp();
  } catch (err) {
    errEl.textContent = "Connection error. Is the server running?";
    console.error(err);
  }
}

// ════════════════════════════════════════════
// LOGOUT / SESSION EXPIRED
// ════════════════════════════════════════════

function logout() {
  clearInterval(window._tokenCheckInterval);
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_login_at");
  if (socket) { socket.disconnect(); socket = null; }
  token = null; myUserId = null; myUser = null;
  document.getElementById("app").classList.remove("visible");
  document.getElementById("login").style.display = "flex";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("loginError").textContent = "";
}

function handleTokenExpired() {
  clearInterval(window._tokenCheckInterval);
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_login_at");
  if (socket) { socket.disconnect(); socket = null; }
  token = null; myUserId = null; myUser = null;
  document.getElementById("app").classList.remove("visible");
  document.getElementById("login").style.display = "flex";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("loginError").textContent = "Your session has expired. Please log in again.";
}

// Check if API response is a 401 — call this on every fetch
function checkAuthError(res) {
  if (res.status === 401) {
    handleTokenExpired();
    return true;
  }
  return false;
}

// Periodically check if token is still valid (every 5 minutes)
function startTokenWatcher(ttlSeconds = 86400) {
  clearInterval(window._tokenCheckInterval);
  const loginAt = parseInt(localStorage.getItem("cc_login_at") || "0");
  if (!loginAt) return;

  window._tokenCheckInterval = setInterval(async () => {
    try {
      const res = await fetch(`${API_BASE}/conversations/unread`, {
        headers: { Authorization: "Bearer " + token },
      });
      if (res.status === 401) {
        handleTokenExpired();
      }
    } catch {}
  }, 5 * 60 * 1000); // check every 5 minutes
}

// ════════════════════════════════════════════
// SHARED POST-LOGIN SETUP
// ════════════════════════════════════════════

async function initApp() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("login").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("myName").textContent =
    myUser.full_name || myUser.username;
  document.getElementById("myAvatar").textContent = initials(
    myUser.full_name || myUser.username,
  );

  window.myRole = myUser.role || "student";
  connectSocket();
  setupInputListeners();
  await loadUnreadCounts();
  await loadConversations();
  loadRequestCount();
  startTokenWatcher();
}

// ════════════════════════════════════════════
// SESSION RESTORE (on page load)
// ════════════════════════════════════════════
(async function restoreSession() {
  const savedToken = localStorage.getItem("cc_token");
  const savedUserStr = localStorage.getItem("cc_user");

  if (!savedToken || !savedUserStr) {
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("login").style.display = "flex";
    return;
  }

  let savedUser;
  try {
    savedUser = JSON.parse(savedUserStr);
  } catch {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("login").style.display = "flex";
    return;
  }

  token = savedToken;
  myUserId = savedUser.id;
  myUser = savedUser;

  // Verify token is still valid before restoring session
  try {
    const res = await fetch(`${API_BASE}/conversations/unread`, {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem("cc_token");
      localStorage.removeItem("cc_user");
      localStorage.removeItem("cc_login_at");
      document.getElementById("loadingScreen").style.display = "none";
      document.getElementById("login").style.display = "flex";
      document.getElementById("loginError").textContent = "Your session has expired. Please log in again.";
      return;
    }
  } catch {
    // Network error — still try to restore (offline scenario)
  }

  await initApp();
})();