/**
 * CampusChat Main Application Logic
 * 
 * Purpose: Frontend controller handling UI state, API communication, and WebSocket events
 * Type: JavaScript Frontend Application (Single Page App)
 * 
 * Core Modules:
 * - THEME: Light/dark mode toggle with localStorage persistence
 * - AUTH: Login, registration, session management, JWT token handling
 * - CHAT: Message sending/receiving, conversation switching
 * - UI: Real-time UI updates (messages, typing indicators, online status)
 * - ATTACHMENTS: File upload, image preview, drag-and-drop handling
 * - SEARCH: Conversation search and user lookup
 * - ADMIN: Admin panel access and moderation features
 * 
 * Key Features:
 * - Direct and group messaging
 * - Read receipts (Sent → Delivered → Seen)
 * - Unread message counter per conversation
 * - Live typing indicators
 * - Online presence tracking
 * - File and image attachments with preview
 * - Image lightbox for expanded viewing
 * - Drag & drop file upload
 * - Conversation history pagination
 * - User search and mention support
 * - Role-based UI (Student/Faculty/Admin/Super Admin)
 * 
 * API Integration: Communicates with api/index.php backend
 * WebSocket: Connected to ws://localhost:3001 for real-time events
 * Storage: Uses localStorage for session persistence and preferences
 * 
 * Dependencies: Socket.IO client library (/socket.io/socket.io.js)
 * Stylesheets: chat.css, admin.css
 */

/* ════════════════════════════════════════════════════════════════════════════════════
   CampusChat — app.js
   Features: direct/group chat, read receipts,
             unread counter, typing, online strip,
             file & image attachments
   ════════════════════════════════════════════════════════════════════════════════════ */

const API_BASE = "http://localhost/campus-chat/api/index.php";
const WS_BASE = "http://localhost:3001";

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
  return (
    absUrl +
    (absUrl.includes("?") ? "&" : "?") +
    "token=" +
    encodeURIComponent(token)
  );
}

// Load a protected image by setting src to a ?token= URL directly.
async function loadProtectedImage(imgEl, url) {
  imgEl.src = protectedImgUrl(url);
  return new Promise((resolve, reject) => {
    imgEl.onload = () => resolve();
    imgEl.onerror = () => {
      const wrap = imgEl.closest(".attach-image-wrap");
      if (wrap)
        wrap.innerHTML =
          '<div class="attach-img-err">Could not load image</div>';
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

// ════════════════════════════════════════════
// SOCKET
// ════════════════════════════════════════════

function connectSocket() {
  socket = io(WS_BASE, { auth: { token } });
  socket.on("connect", () => socket.emit("who_is_online"));

  socket.on("new_message", (msg) => {
    if (msg.conversation_id === currentConversation) {
      renderMessage(msg);
      socket.emit("mark_seen", { conversation_id: msg.conversation_id });
    } else {
      unreadCounts[msg.conversation_id] =
        (unreadCounts[msg.conversation_id] || 0) + 1;
      refreshConversationItem(msg.conversation_id, msg);
    }
  });

  socket.on("message_status", ({ message_id, conversation_id, status }) => {
    updateMessageStatusInDOM(message_id, status);
    const conv = conversationsCache.find(
      (c) => c.conversation_id === conversation_id,
    );
    if (conv?.last_message?.id === message_id) {
      conv.last_message.status = status;
      refreshConversationItem(conversation_id);
    }
  });

  socket.on("presence", (p) => {
    if (p.online) onlineSet.add(p.user_id);
    else onlineSet.delete(p.user_id);
    renderOnlineStrip();
    renderConversationListOnline();
    updateChatHeaderStatus();
  });

  socket.on("online_list", (list) => {
    onlineSet = new Set(list || []);
    renderOnlineStrip();
    renderConversationListOnline();
  });

  socket.on("typing", (t) => {
    if (t.conversation_id !== currentConversation || t.user_id === myUserId)
      return;
    updateTypingIndicator(t.is_typing ? getTypingName(t.user_id) : null);
  });

  socket.on("added_to_group", async () => {
    await loadConversations();
    showToast("You were added to a group!");
  });

  socket.on("group_updated", async ({ conversation_id }) => {
    await loadConversations();
    if (
      document.getElementById("groupInfoModal").classList.contains("open") &&
      currentConversation === conversation_id
    )
      renderGroupInfoModal();
  });

  socket.on("removed_from_group", ({ conversation_id }) => {
    showToast("You were removed from a group.");
    if (currentConversation === conversation_id) {
      currentConversation = null;
      document.getElementById("emptyState").style.display = "";
      document.getElementById("chatContent").classList.add("hidden");
    }
    loadConversations();
  });

  // ── message_edited ──────────────────────────────────────────
  socket.on(
    "message_edited",
    ({ message_id, conversation_id, body, is_edited, edited_at }) => {
      const row = document.querySelector(
        `.msgRow[data-msg-id="${message_id}"]`,
      );
      if (!row) return;
      const bubble = row.querySelector(".bubble");
      if (bubble) bubble.textContent = body;
      // Add or update "edited" label
      let editedLabel = row.querySelector(".msg-edited-label");
      if (!editedLabel) {
        editedLabel = document.createElement("span");
        editedLabel.className = "msg-edited-label";
        row.querySelector(".meta")?.prepend(editedLabel);
      }
      editedLabel.textContent = "edited · ";
      row.dataset.isEdited = "1";
      row.dataset.body = body;
    },
  );

  // ── message_deleted ──────────────────────────────────────────
  socket.on("message_deleted", ({ message_id, conversation_id }) => {
    const row = document.querySelector(`.msgRow[data-msg-id="${message_id}"]`);
    if (!row) return;
    applyDeletedStyle(row);
  });

  socket.on("connect_error", (err) => {
    showToast("Connection error: " + (err?.message || err));
    console.error(err);
  });
}

function getTypingName(userId) {
  const conv = conversationsCache.find(
    (c) => c.conversation_id === currentConversation,
  );
  const m = conv?.members?.find((m) => m.id === userId);
  return m ? m.full_name || m.username : "Someone";
}

// ════════════════════════════════════════════
// INPUT LISTENERS
// ════════════════════════════════════════════

function setupInputListeners() {
  if (setupInputListeners._done) return;
  setupInputListeners._done = true;
  const inputEl = document.getElementById("messageInput");
  const fileInput = document.getElementById("fileInput");

  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputEl.addEventListener("input", () => {
    if (!currentConversation || !socket) return;
    socket.emit("typing", {
      conversation_id: currentConversation,
      is_typing: true,
    });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(
      () =>
        socket.emit("typing", {
          conversation_id: currentConversation,
          is_typing: false,
        }),
      700,
    );
  });

  document
    .getElementById("newChatUsername")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") startChat();
    });

  // File input change handler
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFileSelected(fileInput.files[0]);
  });

  // Drag and drop on messages area
  const messagesEl = document.getElementById("messages");
  messagesEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    messagesEl.classList.add("drag-over");
  });
  messagesEl.addEventListener("dragleave", () =>
    messagesEl.classList.remove("drag-over"),
  );
  messagesEl.addEventListener("drop", (e) => {
    e.preventDefault();
    messagesEl.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });
}

// ════════════════════════════════════════════
// FILE ATTACHMENT
// ════════════════════════════════════════════

function triggerFileInput() {
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }
  document.getElementById("fileInput").click();
}

async function handleFileSelected(file) {
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }

  const MAX = 25 * 1024 * 1024;
  const ALLOWED = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (file.size > MAX) {
    showToast("File exceeds 25 MB limit.");
    return;
  }
  if (!ALLOWED.includes(file.type)) {
    showToast("File type not allowed.");
    return;
  }

  // Show preview bar
  showAttachmentPreview(file);

  // Upload immediately
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversation_id", currentConversation);

    showUploadProgress(true);

    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });
    const data = await res.json();
    showUploadProgress(false);

    if (!res.ok) {
      showToast(data.error || "Upload failed.");
      clearAttachmentPreview();
      return;
    }

    pendingAttachment = data;
    updateAttachmentPreviewReady(data);
  } catch (err) {
    showUploadProgress(false);
    showToast("Upload error.");
    clearAttachmentPreview();
    console.error(err);
  }

  // Reset file input so same file can be selected again
  document.getElementById("fileInput").value = "";
}

function showAttachmentPreview(file) {
  const bar = document.getElementById("attachmentPreviewBar");
  const name = document.getElementById("attachPreviewName");
  const size = document.getElementById("attachPreviewSize");
  const thumb = document.getElementById("attachPreviewThumb");

  name.textContent = file.name;
  size.textContent = formatBytes(file.size);

  // Show image thumbnail if image
  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      thumb.src = e.target.result;
      thumb.style.display = "block";
    };
    reader.readAsDataURL(file);
  } else {
    thumb.style.display = "none";
    thumb.src = "";
  }

  bar.classList.remove("hidden");
  bar.dataset.ready = "false";
}

function updateAttachmentPreviewReady(data) {
  const bar = document.getElementById("attachmentPreviewBar");
  bar.dataset.ready = "true";
  document.getElementById("attachPreviewName").textContent = data.original_name;
}

function showUploadProgress(loading) {
  document
    .getElementById("attachUploadSpinner")
    .classList.toggle("hidden", !loading);
}

function clearAttachmentPreview() {
  pendingAttachment = null;
  const bar = document.getElementById("attachmentPreviewBar");
  bar.classList.add("hidden");
  bar.dataset.ready = "false";
  const thumb = document.getElementById("attachPreviewThumb");
  thumb.src = "";
  thumb.style.display = "none";
}

// ════════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════════

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text && !pendingAttachment) return;
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }

  const payload = { conversation_id: currentConversation, body: text };
  if (pendingAttachment)
    payload.attachment_id = pendingAttachment.attachment_id;

  socket.emit("send_message", payload);

  input.value = "";
  input.style.height = "auto";
  clearAttachmentPreview();
  clearTimeout(typingTimer);
  socket.emit("typing", {
    conversation_id: currentConversation,
    is_typing: false,
  });
}

// ════════════════════════════════════════════
// UNREAD
// ════════════════════════════════════════════

async function loadUnreadCounts() {
  try {
    const res = await fetch(`${API_BASE}/conversations/unread`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (res.ok) unreadCounts = data.unread || {};
  } catch {}
}

// ════════════════════════════════════════════
// CONVERSATIONS
// ════════════════════════════════════════════

async function loadConversations() {
  try {
    const res = await fetch(`${API_BASE}/conversations`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load conversations.");
      return;
    }
    conversationsCache = data.conversations || [];
    renderConversationList();
    renderOnlineStrip();
  } catch (err) {
    showToast("Could not load conversations.");
    console.error(err);
  }
}

function renderConversationList() {
  document.getElementById("conversationList").innerHTML = "";
  conversationsCache.forEach((conv) => buildConversationItem(conv));
}

function buildConversationItem(conv) {
  const list = document.getElementById("conversationList");
  const isGroup = conv.type === "group";
  const title = isGroup
    ? conv.name || "Group"
    : (() => {
        const o = conv.members?.find((m) => m.id !== myUserId);
        return (
          o?.full_name || o?.username || "Conversation " + conv.conversation_id
        );
      })();
  const other = !isGroup ? conv.members?.find((m) => m.id !== myUserId) : null;
  const isOnline = other ? onlineSet.has(other.id) : false;

  const last = conv.last_message;
  let preview = last?.body || "No messages yet";
  if (last?.has_attachment && !preview) preview = "📎 Attachment";
  if (last?.has_attachment && preview) preview = "📎 " + preview;

  const lastTime = last?.created_at || null;
  const lastStatus = last?.status || null;
  const isMine = last?.sender_id === myUserId;
  const unread = unreadCounts[conv.conversation_id] || 0;

  const dotHtml =
    !isGroup && isOnline ? `<span class="status-dot"></span>` : "";
  const groupBadge = isGroup ? `<span class="group-badge">Group</span>` : "";
  const badgeHtml =
    unread > 0 ? `<span class="unread-badge">${unread}</span>` : "";
  const statusHtml =
    isMine && lastStatus && !isGroup ? statusIcon(lastStatus) : "";

  let el = document.getElementById("conv-" + conv.conversation_id);
  if (!el) {
    el = document.createElement("div");
    el.id = "conv-" + conv.conversation_id;
    el.className = "conversation";
    el.dataset.type = conv.type || "direct";
    el.dataset.cid = conv.conversation_id;
    el.onclick = () => openConversation(conv.conversation_id);
    list.appendChild(el);
  }

  el.innerHTML = `
                   <div class="conv-avatar ${isGroup ? "group" : ""}">${isGroup ? "👥" : escapeHtml(initials(title))}${dotHtml}</div>
                   <div class="conv-info">
                     <div class="conv-name-row">
                       <span class="conv-name">${escapeHtml(title)}${groupBadge}</span>
                       <span class="conv-time">${formatTimeShort(lastTime)}</span>
                     </div>
                     <div class="conv-preview">
                       <span class="conv-preview-text">${statusHtml}${escapeHtml(preview)}</span>
                       ${badgeHtml}
                     </div>
                   </div>`;
}

function refreshConversationItem(conversationId, latestMsg) {
  const conv = conversationsCache.find(
    (c) => c.conversation_id === conversationId,
  );
  if (!conv) return;
  if (latestMsg) conv.last_message = latestMsg;
  buildConversationItem(conv);
}

function renderConversationListOnline() {
  conversationsCache.forEach((c) => buildConversationItem(c));
}

function switchTab(btn, tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".conversation").forEach((el) => {
    el.style.display =
      tab === "all" || (el.dataset.type || "direct") === tab ? "" : "none";
  });
}

function filterConversations(q) {
  q = q.toLowerCase();
  document.querySelectorAll(".conversation").forEach((el) => {
    const name =
      el.querySelector(".conv-name")?.textContent.toLowerCase() || "";
    el.style.display = name.includes(q) ? "" : "none";
  });
}

function renderOnlineStrip() {
  const strip = document.getElementById("onlineStrip");
  const list = [];
  conversationsCache.forEach((conv) => {
    if (conv.type === "group") return;
    const o = conv.members?.find((m) => m.id !== myUserId);
    if (o && onlineSet.has(o.id) && !list.find((u) => u.id === o.id))
      list.push(o);
  });
  if (!list.length) {
    strip.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">No one online</span>`;
    return;
  }
  strip.innerHTML = list
    .map((u) => {
      const name = u.full_name || u.username;
      return `<div class="online-avatar" title="${escapeHtml(name)}" onclick="quickChat('${escapeHtml(u.username)}')">
                     <div class="online-avatar-img"><div class="avatar-circle">${escapeHtml(initials(name))}</div><span class="status-dot"></span></div>
                     <div class="online-name">${escapeHtml(name.split(" ")[0])}</div>
                   </div>`;
    })
    .join("");
}

function setActiveConversationUI(id) {
  document
    .querySelectorAll(".conversation")
    .forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.cid) === Number(id)),
    );
}

function getConversation(id) {
  return conversationsCache.find((c) => c.conversation_id === id);
}
function conversationTitle(id) {
  const conv = getConversation(id);
  if (!conv) return "Conversation " + id;
  if (conv.type === "group") return conv.name || "Group";
  const o = conv.members?.find((m) => m.id !== myUserId);
  return o?.full_name || o?.username || "Conversation " + id;
}
function conversationOtherUser(id) {
  const c = getConversation(id);
  return c?.members?.find((m) => m.id !== myUserId) || null;
}

function updateChatHeaderStatus() {
  if (!currentConversation) return;
  const conv = getConversation(currentConversation);
  if (!conv || conv.type === "group") return;
  const other = conversationOtherUser(currentConversation);
  if (!other) return;
  const online = onlineSet.has(other.id);
  const el = document.getElementById("chatHeaderStatus");
  el.textContent = online ? "● Online" : "Offline";
  el.className = online ? "online" : "";
}

// ════════════════════════════════════════════
// OPEN CONVERSATION
// ════════════════════════════════════════════

async function openConversation(id) {
  currentConversation = id;
  unreadCounts[id] = 0;
  clearAttachmentPreview();
  refreshConversationItem(id);
  setActiveConversationUI(id);
  updateTypingIndicator(null);

  document.getElementById("emptyState").style.display = "none";
  const content = document.getElementById("chatContent");
  content.classList.remove("hidden");
  content.style.cssText =
    "display:flex;flex-direction:column;flex:1;min-height:0;";

  const conv = getConversation(id);
  const isGroup = conv?.type === "group";
  const title = conversationTitle(id);
  const other = !isGroup ? conversationOtherUser(id) : null;
  const online = other ? onlineSet.has(other.id) : false;

  document.getElementById("chatHeaderAvatar").textContent = isGroup
    ? "👥"
    : initials(title);
  document.getElementById("chatHeaderName").textContent = title;
  const statusEl = document.getElementById("chatHeaderStatus");
  if (isGroup) {
    statusEl.textContent = `${conv?.members?.length || 0} members`;
    statusEl.className = "";
  } else {
    statusEl.textContent = online ? "● Online" : "Offline";
    statusEl.className = online ? "online" : "";
  }
  document.getElementById("groupInfoBtn").classList.toggle("hidden", !isGroup);

  document.getElementById("messages").innerHTML = "";

  try {
    const res = await fetch(
      `${API_BASE}/messages?conversation_id=${id}&limit=50`,
      { headers: { Authorization: "Bearer " + token } },
    );
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load messages.");
      return;
    }
    (data.messages || []).forEach(renderMessage);
    scrollToBottom();
    socket.emit("mark_seen", { conversation_id: id });
  } catch (err) {
    showToast("Could not load messages.");
    console.error(err);
  }
}

// ════════════════════════════════════════════
// RENDER MESSAGE
// ════════════════════════════════════════════

function renderMessage(msg) {
  const container = document.getElementById("messages");
  const isMe = msg.sender_id === myUserId;
  const conv = getConversation(msg.conversation_id);
  const isGroup = conv?.type === "group";
  const sender = conv?.members?.find((m) => m.id === msg.sender_id);
  const senderName = sender?.full_name || sender?.username || "Unknown";

  // System messages
  if (msg.body?.startsWith("[") && msg.body?.endsWith("]")) {
    const sys = document.createElement("div");
    sys.className = "system-msg";
    sys.textContent = `${senderName} ${msg.body.slice(1, -1)}`;
    container.appendChild(sys);
    scrollToBottom();
    return;
  }

  const row = document.createElement("div");
  row.className = "msgRow " + (isMe ? "me" : "them");
  row.dataset.msgId = msg.id;

  const avatarHtml = isMe
    ? ""
    : `<div class="msg-avatar">${escapeHtml(initials(senderName))}</div>`;
  const senderLabel =
    !isMe && isGroup
      ? `<div class="msg-sender">${escapeHtml(senderName)}</div>`
      : "";
  const statusHtml = isMe ? statusIcon(msg.status || "sent") : "";

  // Build attachment HTML
  let attachHtml = "";
  if (msg.attachment) {
    const att = msg.attachment;
    if (isImageMime(att.mime_type)) {
      // Inline image — use ?token= URL directly so <img> can load without fetch
      attachHtml = `
                       <div class="attach-image-wrap" data-imgurl="${escapeHtml(att.url)}" data-imgname="${escapeHtml(att.original_name)}">
                         <img class="attach-image" src="" alt="${escapeHtml(att.original_name)}"
                              data-protected="${escapeHtml(att.url)}" />
                         <div class="attach-img-loading">
                           <div class="img-spinner"></div>
                         </div>
                         <div class="attach-image-overlay">🔍</div>
                       </div>`;
    } else {
      // Document download — use JS download so auth header can be sent
      const icon = fileIcon(att.mime_type);
      attachHtml = `
                       <div class="attach-doc" onclick="downloadProtectedFile('${escapeHtml(att.url)}','${escapeHtml(att.original_name)}')" style="cursor:pointer;">
                         <span class="attach-doc-icon">${icon}</span>
                         <div class="attach-doc-info">
                           <div class="attach-doc-name">${escapeHtml(att.original_name)}</div>
                           <div class="attach-doc-size">${formatBytes(att.file_size)}</div>
                         </div>
                         <span class="attach-doc-dl">⬇</span>
                       </div>`;
    }
  }

  // Body text (may be empty if attachment-only)
  const bodyHtml = msg.body
    ? `<div class="bubble">${escapeHtml(msg.body)}</div>`
    : "";

  row.innerHTML = `
                   ${avatarHtml}
                   <div class="msg-body">
                     ${senderLabel}
                     ${attachHtml}
                     ${bodyHtml}
                     <div class="meta"><span>${formatTimeFull(msg.created_at)}</span>${statusHtml}</div>
                   </div>`;

  container.appendChild(row);

  // After DOM insertion, set ?token= src on protected images
  row.querySelectorAll("img[data-protected]").forEach((imgEl) => {
    const url = imgEl.dataset.protected;
    const wrap = imgEl.closest(".attach-image-wrap");
    const imgName = wrap?.dataset.imgname || "";
    const spinner = wrap?.querySelector(".attach-img-loading");

    imgEl.onload = () => {
      if (spinner) spinner.style.display = "none";
      if (wrap) {
        wrap.style.cursor = "zoom-in";
        wrap.onclick = () => openLightboxBlob(url, imgName);
      }
    };
    imgEl.onerror = () => {
      if (wrap)
        wrap.innerHTML =
          '<div class="attach-img-err">Could not load image</div>';
    };
    imgEl.src = protectedImgUrl(url);
  });

  // Store body for edit reference
  row.dataset.body = msg.body || "";
  row.dataset.conversationId = msg.conversation_id;

  // Handle deleted messages
  if (msg.is_deleted) {
    applyDeletedStyle(row);
  }

  // Show "edited" label
  if (msg.is_edited && !msg.is_deleted) {
    const meta = row.querySelector(".meta");
    if (meta) {
      const label = document.createElement("span");
      label.className = "msg-edited-label";
      label.textContent = "edited · ";
      meta.prepend(label);
    }
    row.dataset.isEdited = "1";
  }

  // Attach context menu to own messages only
  if (isMe) attachMsgContextMenu(row, msg);

  scrollToBottom();
}

// Apply visual style for deleted message
function applyDeletedStyle(row) {
  const msgBody = row.querySelector(".msg-body");
  if (!msgBody) return;
  // Remove attachment and bubble
  msgBody
    .querySelectorAll(".attach-image-wrap, .attach-doc, .bubble")
    .forEach((el) => el.remove());
  // Add deleted placeholder if not already there
  if (!row.querySelector(".msg-deleted")) {
    const del = document.createElement("div");
    del.className = "msg-deleted";
    del.textContent = "🚫 This message was deleted";
    const meta = msgBody.querySelector(".meta");
    if (meta) msgBody.insertBefore(del, meta);
    else msgBody.appendChild(del);
  }
  // Remove context menu trigger
  row.oncontextmenu = null;
  row.dataset.deleted = "1";
}

function fileIcon(mime) {
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📑";
  return "📎";
}

// Download a protected file by fetching with auth header then triggering save
async function downloadProtectedFile(url, filename) {
  try {
    showToast("Downloading…");
    const res = await fetch(toAbsoluteUrl(url), {
      headers: { Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      showToast("Download failed.");
      return;
    }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  } catch (err) {
    showToast("Download error.");
    console.error(err);
  }
}

function updateMessageStatusInDOM(messageId, status) {
  const row = document.querySelector(`.msgRow[data-msg-id="${messageId}"]`);
  if (!row || !row.classList.contains("me")) return;
  const existing = row.querySelector(".msg-status");
  if (existing) existing.outerHTML = statusIcon(status);
}

// ════════════════════════════════════════════
// EDIT / DELETE — Context Menu
// ════════════════════════════════════════════

const EDIT_DELETE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function attachMsgContextMenu(row, msg) {
  const trigger = (e) => {
    e.preventDefault();
    if (row.dataset.deleted === "1") return;
    const createdAt = new Date(msg.created_at.replace(" ", "T")).getTime();
    const withinWindow = Date.now() - createdAt < EDIT_DELETE_WINDOW_MS;
    showMsgContextMenu(e, msg, row, withinWindow);
  };
  row.addEventListener("contextmenu", trigger);
  // Long press for mobile
  let pressTimer;
  row.addEventListener(
    "touchstart",
    () => {
      pressTimer = setTimeout(
        () =>
          trigger({
            preventDefault: () => {},
            clientX: 0,
            clientY: 0,
            touches: [{ clientX: 0, clientY: 0 }],
          }),
        500,
      );
    },
    { passive: true },
  );
  row.addEventListener("touchend", () => clearTimeout(pressTimer), {
    passive: true,
  });
}

function showMsgContextMenu(e, msg, row, withinWindow) {
  // Remove any existing menu
  document.querySelector(".msg-context-menu")?.remove();

  const menu = document.createElement("div");
  menu.className = "msg-context-menu";

  if (withinWindow && msg.body && !msg.is_deleted) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit";
    editBtn.onclick = () => {
      menu.remove();
      startInlineEdit(msg, row);
    };
    menu.appendChild(editBtn);
  }

  if (withinWindow && !msg.is_deleted) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️ Delete";
    delBtn.className = "danger";
    delBtn.onclick = () => {
      menu.remove();
      confirmDeleteMessage(msg, row);
    };
    menu.appendChild(delBtn);
  }

  if (menu.children.length === 0) {
    const noOp = document.createElement("div");
    noOp.className = "msg-context-noaction";
    noOp.textContent = "Edit/delete window has expired";
    menu.appendChild(noOp);
  }

  // Position near click/touch
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  menu.style.cssText = `position:fixed;z-index:9999;left:${x}px;top:${y}px;`;
  document.body.appendChild(menu);

  // Adjust if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = x - rect.width + "px";
  if (rect.bottom > window.innerHeight) menu.style.top = y - rect.height + "px";

  // Close on outside click
  const close = (ev) => {
    if (!menu.contains(ev.target)) {
      menu.remove();
      document.removeEventListener("click", close);
    }
  };
  setTimeout(() => document.addEventListener("click", close), 0);
}

function startInlineEdit(msg, row) {
  const bubble = row.querySelector(".bubble");
  if (!bubble) return;
  const originalText = bubble.textContent;

  bubble.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "msg-edit-wrap";

  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-input";
  textarea.value = originalText;
  textarea.rows = Math.max(1, Math.ceil(originalText.length / 40));

  const actions = document.createElement("div");
  actions.className = "msg-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "msg-edit-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "msg-edit-cancel";
  cancelBtn.textContent = "Cancel";

  const cancel = () => {
    wrap.remove();
    bubble.style.display = "";
  };

  saveBtn.onclick = async () => {
    const newBody = textarea.value.trim();
    if (!newBody || newBody === originalText) {
      cancel();
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    socket.emit(
      "edit_message",
      {
        message_id: msg.id,
        conversation_id: msg.conversation_id,
        body: newBody,
      },
      (ack) => {
        if (ack?.ok) {
          // UI update handled by message_edited socket event
          wrap.remove();
          bubble.style.display = "";
        } else {
          showToast(ack?.error || "Edit failed.");
          saveBtn.disabled = false;
          saveBtn.textContent = "Save";
        }
      },
    );
  };

  cancelBtn.onclick = cancel;

  // Ctrl+Enter to save, Escape to cancel
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      saveBtn.click();
    }
    if (e.key === "Escape") cancel();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  wrap.appendChild(textarea);
  wrap.appendChild(actions);
  bubble.after(wrap);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function confirmDeleteMessage(msg, row) {
  if (!confirm("Delete this message? This cannot be undone.")) return;
  socket.emit(
    "delete_message",
    {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
    },
    (ack) => {
      if (!ack?.ok) showToast(ack?.error || "Delete failed.");
      // UI update handled by message_deleted socket event
    },
  );
}

function scrollToBottom() {
  const c = document.getElementById("messages");
  c.scrollTop = c.scrollHeight;
}
function updateTypingIndicator(username) {
  const line = document.getElementById("typingLine");
  line.innerHTML = username
    ? `<div class="typing-dots"><span></span><span></span><span></span></div><span>${escapeHtml(username)} is typing…</span>`
    : "";
}

// ════════════════════════════════════════════
// LIGHTBOX (image viewer)
// ════════════════════════════════════════════

function ensureLightbox() {
  let lb = document.getElementById("lightbox");
  if (!lb) {
    lb = document.createElement("div");
    lb.id = "lightbox";
    lb.innerHTML = `
                     <div id="lightboxBackdrop"></div>
                     <div id="lightboxContent">
                       <button id="lightboxClose" onclick="closeLightbox()">✕</button>
                       <div id="lightboxSpinner"><div class="img-spinner"></div></div>
                       <img id="lightboxImg" src="" alt="" style="display:none;" />
                       <div id="lightboxName"></div>
                     </div>`;
    document.body.appendChild(lb);
    document.getElementById("lightboxBackdrop").onclick = closeLightbox;
  }
  return lb;
}

// Open lightbox using ?token= URL directly
function openLightboxBlob(url, name) {
  const lb = ensureLightbox();
  const img = document.getElementById("lightboxImg");
  const spinner = document.getElementById("lightboxSpinner");
  document.getElementById("lightboxName").textContent = name;

  img.style.display = "none";
  spinner.style.display = "flex";
  lb.classList.add("open");
  document.body.style.overflow = "hidden";

  img.onload = () => {
    img.style.display = "block";
    spinner.style.display = "none";
  };
  img.onerror = () => {
    spinner.style.display = "none";
    img.style.display = "none";
  };
  img.src = protectedImgUrl(url);
}

function closeLightbox() {
  const lb = document.getElementById("lightbox");
  if (lb) lb.classList.remove("open");
  document.body.style.overflow = "";
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeLightbox();
});

// ════════════════════════════════════════════
// DIRECT CHAT
// ════════════════════════════════════════════

function openNewChatModal() {
  document.getElementById("newChatUsername").value = "";
  openModal("newChatModal");
  setTimeout(() => document.getElementById("newChatUsername").focus(), 60);
}

async function startChat() {
  const username = document.getElementById("newChatUsername").value.trim();
  if (!username) {
    showToast("Please enter a username.");
    return;
  }
  closeModal("newChatModal");
  try {
    const res = await fetch(`${API_BASE}/conversations/direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ other_username: username }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not start chat.");
      return;
    }
    socket.emit("join_conversation", { conversation_id: data.conversation_id });
    await loadConversations();
    openConversation(data.conversation_id);
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function quickChat(username) {
  document.getElementById("newChatUsername").value = username;
  await startChat();
}

// ════════════════════════════════════════════
// GROUP CHAT — CREATE
// ════════════════════════════════════════════

function openCreateGroupModal() {
  selectedMembers = [];
  document.getElementById("groupName").value = "";
  document.getElementById("memberSearchInput").value = "";
  document.getElementById("userSearchResults").classList.add("hidden");
  document.getElementById("userSearchResults").innerHTML = "";
  renderSelectedMembers();
  openModal("createGroupModal");
  setTimeout(() => document.getElementById("groupName").focus(), 60);
}

let searchDebounce = null;
async function searchUsers(q) {
  clearTimeout(searchDebounce);
  const resultsEl = document.getElementById("userSearchResults");
  if (!q.trim()) {
    resultsEl.classList.add("hidden");
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/users/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: "Bearer " + token } },
      );
      const data = await res.json();
      const users = (data.users || []).filter(
        (u) => !selectedMembers.find((s) => s.id === u.id),
      );
      resultsEl.innerHTML = users.length
        ? users
            .map(
              (u) =>
                `<div class="search-result-item" onclick="addMemberToGroup(${u.id},'${escapeHtml(u.username)}','${escapeHtml(u.full_name || u.username)}')">${escapeHtml(u.full_name || u.username)} <span class="username-hint">@${escapeHtml(u.username)}</span></div>`,
            )
            .join("")
        : `<div class="search-result-item muted">No users found</div>`;
      resultsEl.classList.remove("hidden");
    } catch {}
  }, 300);
}

function addMemberToGroup(id, username, full_name) {
  if (!selectedMembers.find((m) => m.id === id))
    selectedMembers.push({ id, username, full_name });
  document.getElementById("memberSearchInput").value = "";
  document.getElementById("userSearchResults").classList.add("hidden");
  renderSelectedMembers();
}

function removeMemberFromGroup(id) {
  selectedMembers = selectedMembers.filter((m) => m.id !== id);
  renderSelectedMembers();
}

function renderSelectedMembers() {
  const el = document.getElementById("selectedMembers");
  el.innerHTML = selectedMembers.length
    ? selectedMembers
        .map(
          (m) =>
            `<span class="member-chip">${escapeHtml(m.full_name || m.username)}<button onclick="removeMemberFromGroup(${m.id})">✕</button></span>`,
        )
        .join("")
    : `<span class="muted-hint">No members selected yet</span>`;
}

async function createGroup() {
  const name = document.getElementById("groupName").value.trim();
  if (!name) {
    showToast("Please enter a group name.");
    return;
  }
  if (selectedMembers.length < 1) {
    showToast("Add at least 1 member.");
    return;
  }
  const member_ids = selectedMembers.map((m) => m.id);
  try {
    const res = await fetch(`${API_BASE}/conversations/group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ name, member_ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not create group.");
      return;
    }
    closeModal("createGroupModal");
    socket.emit("group_created", {
      conversation_id: data.conversation_id,
      member_ids,
    });
    await loadConversations();
    openConversation(data.conversation_id);
    showToast(`Group "${name}" created!`);
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

// ════════════════════════════════════════════
// GROUP CHAT — INFO / MANAGE
// ════════════════════════════════════════════

function openGroupInfoModal() {
  if (!currentConversation) return;
  renderGroupInfoModal();
  openModal("groupInfoModal");
}

function renderGroupInfoModal() {
  const conv = getConversation(currentConversation);
  if (!conv || conv.type !== "group") return;
  const isAdmin = conv.my_role === "admin";
  document.getElementById("groupInfoTitle").textContent = conv.name || "Group";
  document
    .getElementById("addMemberSection")
    .classList.toggle("hidden", !isAdmin);
  document.getElementById("addMemberInput").value = "";
  document.getElementById("addMemberResults").classList.add("hidden");

  const listEl = document.getElementById("groupMemberList");
  listEl.innerHTML = (conv.members || [])
    .map((m) => {
      const isMe = m.id === myUserId;
      const roleBadge =
        m.role === "admin" ? `<span class="role-badge admin">Admin</span>` : "";
      const removeBtn =
        isAdmin && !isMe
          ? `<button class="member-remove-btn" onclick="removeMember(${m.id})" title="Remove">✕</button>`
          : "";
      return `<div class="group-member-item">
                     <div class="gm-avatar">${escapeHtml(initials(m.full_name || m.username))}</div>
                     <div class="gm-info"><span class="gm-name">${escapeHtml(m.full_name || m.username)}${isMe ? " (you)" : ""}</span>${roleBadge}</div>
                     ${removeBtn}
                   </div>`;
    })
    .join("");
}

let addMemberDebounce = null;
async function searchUsersForAdd(q) {
  clearTimeout(addMemberDebounce);
  const resultsEl = document.getElementById("addMemberResults");
  if (!q.trim()) {
    resultsEl.classList.add("hidden");
    return;
  }
  const conv = getConversation(currentConversation);
  const existingIds = conv?.members?.map((m) => m.id) || [];
  addMemberDebounce = setTimeout(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/users/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: "Bearer " + token } },
      );
      const data = await res.json();
      const users = (data.users || []).filter(
        (u) => !existingIds.includes(u.id),
      );
      resultsEl.innerHTML = users.length
        ? users
            .map(
              (u) =>
                `<div class="search-result-item" onclick="addMember(${u.id})">${escapeHtml(u.full_name || u.username)} <span class="username-hint">@${escapeHtml(u.username)}</span></div>`,
            )
            .join("")
        : `<div class="search-result-item muted">No users found</div>`;
      resultsEl.classList.remove("hidden");
    } catch {}
  }, 300);
}

async function addMember(userId) {
  document.getElementById("addMemberResults").classList.add("hidden");
  document.getElementById("addMemberInput").value = "";
  try {
    const res = await fetch(`${API_BASE}/conversations/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        conversation_id: currentConversation,
        user_id: userId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not add member.");
      return;
    }
    socket.emit("member_added", {
      conversation_id: currentConversation,
      user_id: userId,
    });
    await loadConversations();
    renderGroupInfoModal();
    showToast("Member added!");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function removeMember(userId) {
  if (!confirm("Remove this member from the group?")) return;
  try {
    const res = await fetch(`${API_BASE}/conversations/members`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        conversation_id: currentConversation,
        user_id: userId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not remove member.");
      return;
    }
    socket.emit("member_removed", {
      conversation_id: currentConversation,
      user_id: userId,
    });
    await loadConversations();
    renderGroupInfoModal();
    showToast("Member removed.");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function leaveGroup() {
  if (!confirm("Leave this group?")) return;
  const cid = currentConversation;
  try {
    const res = await fetch(`${API_BASE}/conversations/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ conversation_id: cid }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not leave group.");
      return;
    }
    closeModal("groupInfoModal");
    socket.emit("user_left_group", { conversation_id: cid });
    currentConversation = null;
    document.getElementById("emptyState").style.display = "";
    document.getElementById("chatContent").classList.add("hidden");
    await loadConversations();
    showToast("You left the group.");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}
