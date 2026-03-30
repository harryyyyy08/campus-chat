// ════════════════════════════════════════════
// AUTH — js/auth.js
// ════════════════════════════════════════════

// ── Redirect to login page ────────────────────
function goToLogin(expiredMsg = "") {
  if (expiredMsg) {
    // Store message to show on login page
    sessionStorage.setItem("cc_login_msg", expiredMsg);
  }
  window.location.href = "login.html";
}

// ════════════════════════════════════════════
// LOGOUT / SESSION EXPIRED
// ════════════════════════════════════════════

function logout() {
  clearInterval(window._tokenCheckInterval);
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_login_at");
  if (socket) {
    socket.disconnect();
    socket = null;
  }

  // Reset global state
  token = null;
  myUserId = null;
  myUser = null;
  currentConversation = null;
  conversationsCache = [];
  pendingAttachments = [];
  pendingAttachment = null;
  onlineSet = new Set();
  unreadCounts = {};

  goToLogin();
}

function handleTokenExpired() {
  clearInterval(window._tokenCheckInterval);
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_login_at");
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  token = null;
  myUserId = null;
  myUser = null;

  goToLogin("Your session has expired. Please log in again.");
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
function startTokenWatcher() {
  clearInterval(window._tokenCheckInterval);
  const loginAt = parseInt(localStorage.getItem("cc_login_at") || "0");
  if (!loginAt) return;

  window._tokenCheckInterval = setInterval(
    async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations/unread`, {
          headers: { Authorization: "Bearer " + token },
        });
        if (res.status === 401) handleTokenExpired();
      } catch {}
    },
    5 * 60 * 1000,
  );
}

// ════════════════════════════════════════════
// SHARED POST-LOGIN SETUP
// ════════════════════════════════════════════

async function initApp() {
  document.getElementById("loadingScreen").style.display = "none";
  document.getElementById("app").classList.add("visible");
  document.getElementById("myName").textContent =
    myUser.full_name || myUser.username;
  document.getElementById("myAvatar").textContent = initials(
    myUser.full_name || myUser.username,
  );

  const myDeptEl = document.getElementById("myDepartment");
  if (myDeptEl) {
    const department = String(myUser.department || "").trim();
    const deptText = department || "Not set";
    myDeptEl.textContent = deptText;
    myDeptEl.title = deptText;
  }

  window.myRole = myUser.role || "student";
  connectSocket();
  setupInputListeners();
  await loadUnreadCounts();
  await loadConversations();
  loadRequestCount();
  startTokenWatcher();
  if (typeof showAutoAnnouncementModal === "function") {
    showAutoAnnouncementModal();
  }
}

// ════════════════════════════════════════════
// SESSION RESTORE (on page load)
// ════════════════════════════════════════════
(async function restoreSession() {
  const savedToken = localStorage.getItem("cc_token");
  const savedUserStr = localStorage.getItem("cc_user");

  if (!savedToken || !savedUserStr) {
    document.getElementById("loadingScreen").style.display = "none";
    goToLogin();
    return;
  }

  let savedUser;
  try {
    savedUser = JSON.parse(savedUserStr);
  } catch {
    localStorage.removeItem("cc_token");
    localStorage.removeItem("cc_user");
    document.getElementById("loadingScreen").style.display = "none";
    goToLogin();
    return;
  }

  token = savedToken;
  myUserId = savedUser.id;
  myUser = savedUser;

  // Verify token is still valid
  try {
    const res = await fetch(`${API_BASE}/conversations/unread`, {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      localStorage.removeItem("cc_token");
      localStorage.removeItem("cc_user");
      localStorage.removeItem("cc_login_at");
      document.getElementById("loadingScreen").style.display = "none";
      goToLogin("Your session has expired. Please log in again.");
      return;
    }
  } catch {
    // Network error — still try to restore (offline scenario)
  }

  await initApp();
})();
