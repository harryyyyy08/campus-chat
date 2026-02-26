// ════════════════════════════════════════════
// THEME
// ════════════════════════════════════════════

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("cc_theme", theme);
  const icon = document.getElementById("themeIcon");
  if (!icon) return;
  if (theme === "light") {
    // Moon icon for switching to dark
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
    icon.setAttribute("viewBox", "0 0 24 24");
  } else {
    // Sun icon for switching to light
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  applyTheme(current === "dark" ? "light" : "dark");
}

// Load saved theme on startup
(function () {
  const saved = localStorage.getItem("cc_theme") || "dark";
  applyTheme(saved);
})();

// ════════════════════════════════════════════
// SIDEBAR TOGGLE
// ════════════════════════════════════════════

let sidebarCollapsed = false;

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  const sidebar = document.getElementById("sidebar");
  const fabBtn = document.getElementById("sidebarOpenBtn");
  sidebar.classList.toggle("collapsed", sidebarCollapsed);
  if (fabBtn) fabBtn.classList.toggle("hidden", !sidebarCollapsed);
}

// File URLs from PHP are relative paths (e.g. /campus-chat/api/index.php/uploads/...)
// They must be fetched from Apache (port 80), NOT from Node.js (port 3001).
function toAbsoluteUrl(url) {
  if (!url) return url;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  // Extract origin from API_BASE e.g. "http://localhost"
  const apiOrigin = API_BASE.replace(/^(https?:\/\/[^\/]+).*/, "$1");
  return apiOrigin + url;
}

let token = null;
let socket = null;
let currentConversation = null;
let myUserId = null;
let myUser = null;
let conversationsCache = [];
let onlineSet = new Set();
let typingTimer = null;
let unreadCounts = {};
let selectedMembers = [];

// Pending attachment (uploaded but not yet sent)
let pendingAttachment = null;

// ════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════

function showToast(msg, duration = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), duration);
}

function openModal(id) {
  document.getElementById(id).classList.add("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

document.querySelectorAll(".modal-overlay").forEach((el) => {
  el.addEventListener("click", (e) => {
    if (e.target === el) el.classList.remove("open");
  });
});

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(" ");
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function formatTimeShort(dt) {
  if (!dt) return "";
  const d = new Date(dt.replace(" ", "T")),
    now = new Date();
  return d.toDateString() === now.toDateString()
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatTimeFull(dt) {
  if (!dt) return "";
  const d = new Date(dt.replace(" ", "T"));
  return isNaN(d.getTime())
    ? dt
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function isImageMime(mime) {
  return ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(mime);
}

// Cache of url → blob URL so we don't re-fetch the same image repeatedly
// Build a token-authenticated image URL using ?token= query param.
// Allows <img src="..."> to work without fetch + Blob — no membership issues.
function protectedImgUrl(url) {
  const absUrl = toAbsoluteUrl(url);
  return absUrl + (absUrl.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
}

// Load a protected image by setting src to a ?token= URL directly.
async function loadProtectedImage(imgEl, url) {
  imgEl.src = protectedImgUrl(url);
  return new Promise((resolve, reject) => {
    imgEl.onload  = () => resolve();
    imgEl.onerror = () => {
      const wrap = imgEl.closest(".attach-image-wrap");
      if (wrap) wrap.innerHTML = '<div class="attach-img-err">Could not load image</div>';
      reject(new Error("Image load failed: " + url));
    };
  });
}

function logout() {
  if (socket) socket.disconnect();
  token = null;
  localStorage.removeItem("cc_token");
  localStorage.removeItem("cc_user");
  location.reload();
}

function statusIcon(status) {
  if (status === "seen")
    return `<span class="msg-status seen" title="Seen"><svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M1 5l3 3 5-6" stroke="#1a6cf5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 5l3 3 5-6" stroke="#1a6cf5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  if (status === "delivered")
    return `<span class="msg-status delivered" title="Delivered"><svg width="16" height="10" viewBox="0 0 16 10" fill="none"><path d="M1 5l3 3 5-6" stroke="#8b95a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 5l3 3 5-6" stroke="#8b95a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  return `<span class="msg-status sent" title="Sent"><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 5l3 3 5-6" stroke="#8b95a8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
}