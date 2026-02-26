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

    // Save session to localStorage so page refresh doesn't log out
    localStorage.setItem("cc_token", token);
    localStorage.setItem("cc_user", JSON.stringify(data.user));

    initApp();
  } catch (err) {
    errEl.textContent = "Connection error. Is the server running?";
    console.error(err);
  }
}

// Shared post-login setup (used by login() and session restore)
async function initApp() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("login").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("myName").textContent =
    myUser.full_name || myUser.username;
  document.getElementById("myAvatar").textContent = initials(
    myUser.full_name || myUser.username,
  );

  connectSocket();
  setupInputListeners();
  await loadUnreadCounts();
  await loadConversations();
}

// ════════════════════════════════════════════
// SESSION RESTORE (on page load)
// ════════════════════════════════════════════
(async function restoreSession() {
  const savedToken = localStorage.getItem("cc_token");
  const savedUserStr = localStorage.getItem("cc_user");

  if (!savedToken || !savedUserStr) {
    // No saved session — show login
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

  // Restore session immediately — no network call
  // If token expired, the first API call will fail and we handle it there
  token = savedToken;
  myUserId = savedUser.id;
  myUser = savedUser;

  await initApp();
})();