// ════════════════════════════════════════════
// ANNOUNCEMENTS — announcements.js
// ════════════════════════════════════════════

const token   = localStorage.getItem("cc_token");
const _ccUser = JSON.parse(localStorage.getItem("cc_user") || "{}");
const myUserId = Number(_ccUser.id);
const myRole   = _ccUser.role || "student";
const myDept   = _ccUser.department || "";

if (!token) { window.location.href = "index.html"; }

const _host = window.location.hostname;
const API   = `http://${_host}/campus-chat/api/index.php`;
const WS    = `http://${_host}:3001`;

let socket;
let announcements  = [];
let activeId       = null;
let currentFilter  = "all";

// Queue for multiple announcements arriving at the same time
let persistQueue   = [];
let persistShowing = false;

// ── Init ─────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  setupUI();
  loadAnnouncements();
  connectSocket();
});

// ── UI Setup ─────────────────────────────────
function setupUI() {
  if (["admin", "super_admin"].includes(myRole)) {
    document.querySelectorAll(".admin-only").forEach(el => el.classList.remove("hidden"));
  }

  document.querySelectorAll(".ann-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".ann-tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentFilter = tab.dataset.filter;
      renderList();
    });
  });

  document.getElementById("composeBtn").addEventListener("click", () => openModal());
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("cancelModal").addEventListener("click", closeModal);
  document.getElementById("submitAnn").addEventListener("click", submitAnnouncement);

  document.getElementById("annTarget").addEventListener("change", (e) => {
    document.getElementById("deptRow").classList.toggle("hidden", e.target.value !== "department");
  });

  if (myRole === "student") {
    document.getElementById("pendingNotice").classList.remove("hidden");
  }

  // ── Persistent modal buttons ──
  document.getElementById("annPersistOk").addEventListener("click", () => {
    closePersistModal(true);
  });

  document.getElementById("annPersistView").addEventListener("click", () => {
    const current = persistQueue[0];
    closePersistModal(true);
    if (current) {
      selectAnnouncement(current.id);
    }
  });
}

// ── Load Announcements ────────────────────────
async function loadAnnouncements() {
  try {
    const res  = await fetch(`${API}/announcements`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Load failed");
    announcements = data.announcements || [];
    renderList();
    updatePendingBadge();
    showUnreadOnLoad();
  } catch (err) {
    document.getElementById("annList").innerHTML =
      `<div class="ann-no-items">Failed to load: ${err.message}</div>`;
  }
}

// ── Show unread announcements on first load ───
function showUnreadOnLoad() {
  const sessionKey = `cc_ann_shown_${myUserId}`;
  if (sessionStorage.getItem(sessionKey)) return;
  sessionStorage.setItem(sessionKey, "1");

  const isAdmin = ["admin", "super_admin"].includes(myRole);
  const unread  = announcements.filter(a => {
    if (a.status !== "approved") return false;
    if (a.is_read) return false;
    if (a.target_type === "all") return true;
    if (a.target_type === "department" && a.department === myDept) return true;
    return isAdmin;
  });

  if (!unread.length) return;

  // Sort by newest first, queue all unread
  unread.sort((a, b) =>
    new Date(b.created_at.replace(" ", "T")) - new Date(a.created_at.replace(" ", "T"))
  );

  unread.forEach(a => queuePersistModal(a));
}

// ── Persistent Modal Queue ────────────────────
function queuePersistModal(announcement) {
  persistQueue.push(announcement);
  if (!persistShowing) showNextPersistModal();
}

function showNextPersistModal() {
  if (persistQueue.length === 0) {
    persistShowing = false;
    return;
  }

  persistShowing = true;
  const a = persistQueue[0];

  document.getElementById("annPersistTitle").textContent = a.title || "";
  document.getElementById("annPersistMeta").textContent  =
    `By ${a.author_name || "Admin"} · ${formatAnnTimeFull(a.created_at)}`;
  document.getElementById("annPersistBody").textContent  = a.body || "";

  const overlay = document.getElementById("annPersistOverlay");
  overlay.classList.remove("hidden");
  overlay.removeAttribute("aria-hidden");
  requestAnimationFrame(() => overlay.classList.add("visible"));
}

function closePersistModal(markRead = false) {
  const overlay = document.getElementById("annPersistOverlay");
  overlay.classList.remove("visible");

  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");

    // Mark as read
    if (markRead && persistQueue.length > 0) {
      const a = persistQueue[0];
      if (!a.is_read && a.status === "approved") {
        a.is_read = true;
        fetch(`${API}/announcements/${a.id}/read`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    }

    // Remove from queue and show next
    persistQueue.shift();
    renderList();

    if (persistQueue.length > 0) {
      setTimeout(() => showNextPersistModal(), 150);
    } else {
      persistShowing = false;
    }
  }, 200);
}

// ── Render List ───────────────────────────────
function renderList() {
  const list = document.getElementById("annList");
  let filtered = announcements;

  if (currentFilter === "unread")  filtered = filtered.filter(a => !a.is_read && a.status === "approved");
  if (currentFilter === "mine")    filtered = filtered.filter(a => a.author_id === myUserId);
  if (currentFilter === "pending") filtered = filtered.filter(a => a.status === "pending");

  if (filtered.length === 0) {
    list.innerHTML = `<div class="ann-no-items">No announcements here.</div>`;
    return;
  }

  list.innerHTML = filtered.map(a => {
    const isUnread = !a.is_read && a.status === "approved";
    const isAdmin  = ["admin","super_admin"].includes(myRole);
    const showStatus = a.author_id === myUserId || isAdmin;
    return `
      <div class="ann-item ${isUnread ? "unread" : ""} ${activeId === a.id ? "active" : ""}"
           data-id="${a.id}" onclick="selectAnnouncement(${a.id})">
        <div class="ann-item-header">
          <span class="ann-priority-dot urgent"></span>
          <span class="ann-item-title">${escAnn(a.title)}</span>
          ${showStatus && a.status !== "approved"
            ? `<span class="ann-status-badge ${a.status}">${a.status}</span>` : ""}
        </div>
        <div class="ann-item-preview">${escAnn(a.body.slice(0, 60))}${a.body.length > 60 ? "…" : ""}</div>
        <div class="ann-item-meta">
          <span class="ann-item-author">${escAnn(a.author_name)}</span>
          <span class="ann-item-time">${formatAnnTime(a.created_at)}</span>
        </div>
      </div>`;
  }).join("");
}

// ── Select / Show Detail ──────────────────────
function selectAnnouncement(id) {
  activeId = id;
  const a = announcements.find(x => x.id === id);
  if (!a) return;

  if (!a.is_read && a.status === "approved") {
    a.is_read = true;
    fetch(`${API}/announcements/${id}/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    });
  }

  renderList();
  renderDetail(a);
}

function renderDetail(a) {
  const detail   = document.getElementById("annDetail");
  const isMe     = a.author_id === myUserId;
  const isAdmin  = ["admin","super_admin"].includes(myRole);
  const canEdit  = isMe || isAdmin;
  const canApprove = isAdmin && a.status === "pending";

  const targetLabel = a.target_type === "all"
    ? "📢 All Users"
    : `🏫 ${escAnn(a.department || "Department")}`;

  detail.innerHTML = `
    <div class="ann-detail-header">
      <div class="ann-detail-priority urgent">🔴 Urgent</div>
      <div class="ann-detail-title">${escAnn(a.title)}</div>
      <div class="ann-detail-info">
        <span>By <strong>${escAnn(a.author_name)}</strong></span>
        <span class="sep">·</span>
        <span>${formatAnnTimeFull(a.created_at)}</span>
        <span class="sep">·</span>
        <span class="ann-detail-target">${targetLabel}</span>
        ${a.status !== "approved"
          ? `<span class="ann-status-badge ${a.status}">${a.status}</span>` : ""}
      </div>
    </div>
    <hr class="ann-detail-divider" />
    <div class="ann-detail-body">${escAnn(a.body)}</div>
    <div class="ann-detail-actions">
      ${canEdit    ? `<button class="ann-btn ann-btn-edit"   onclick="openModal(${a.id})">✏️ Edit</button>` : ""}
      ${canEdit    ? `<button class="ann-btn ann-btn-delete" onclick="deleteAnn(${a.id})">🗑️ Delete</button>` : ""}
      ${canApprove ? `<button class="ann-btn ann-btn-approve" onclick="approveAnn(${a.id})">✅ Approve</button>` : ""}
      ${canApprove ? `<button class="ann-btn ann-btn-reject"  onclick="rejectAnn(${a.id})">❌ Reject</button>` : ""}
    </div>`;
}

// ── Modal ─────────────────────────────────────
function openModal(editId = null) {
  const modal = document.getElementById("composeModal");
  document.getElementById("modalTitle").textContent = editId ? "Edit Announcement" : "New Announcement";
  document.getElementById("editingId").value = editId || "";

  if (editId) {
    const a = announcements.find(x => x.id === editId);
    if (a) {
      document.getElementById("annTitle").value  = a.title;
      document.getElementById("annBody").value   = a.body;
      document.getElementById("annTarget").value = a.target_type;
      document.getElementById("annDept").value   = a.department || "";
      document.getElementById("deptRow").classList.toggle("hidden", a.target_type !== "department");
    }
  } else {
    document.getElementById("annTitle").value  = "";
    document.getElementById("annBody").value   = "";
    document.getElementById("annTarget").value = "all";
    document.getElementById("annDept").value   = myDept;
    document.getElementById("deptRow").classList.add("hidden");
  }

  document.getElementById("pendingNotice").classList.toggle("hidden", myRole !== "student");
  modal.classList.remove("hidden");
  document.getElementById("annTitle").focus();
}

function closeModal() {
  document.getElementById("composeModal").classList.add("hidden");
}

async function submitAnnouncement() {
  const editId  = document.getElementById("editingId").value;
  const title   = document.getElementById("annTitle").value.trim();
  const body    = document.getElementById("annBody").value.trim();
  const target  = document.getElementById("annTarget").value;
  const dept    = document.getElementById("annDept").value.trim();

  if (!title || !body) { showToast("Title and body are required."); return; }
  if (target === "department" && !dept) { showToast("Please enter a department."); return; }

  const btn = document.getElementById("submitAnn");
  btn.disabled = true; btn.textContent = "Posting…";

  // Priority is always urgent
  const payload = { title, body, priority: "urgent", target_type: target, department: dept || null };
  const url     = editId ? `${API}/announcements/${editId}` : `${API}/announcements`;
  const method  = editId ? "PATCH" : "POST";

  try {
    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    closeModal();

    if (!editId && data.announcement) {
      if (data.auto_approved) {
        socket?.emit("post_announcement", { announcement: data.announcement });
        announcements.unshift(data.announcement);
      } else {
        announcements.unshift(data.announcement);
        showToast("✅ Submitted for admin approval.");
      }
    } else if (editId) {
      await loadAnnouncements();
      showToast("Announcement updated.");
    }

    renderList();
    updatePendingBadge();
    if (!editId && data.announcement) selectAnnouncement(data.announcement.id);
  } catch (err) {
    showToast("Error: " + err.message);
  } finally {
    btn.disabled = false; btn.textContent = "Post Announcement";
  }
}

// ── Approve / Reject ──────────────────────────
function approveAnn(id) {
  socket?.emit("approve_announcement", { announcement_id: id }, (ack) => {
    if (ack?.ok) {
      showToast("✅ Announcement approved and published.");
      loadAnnouncements().then(() => {
        if (activeId === id) {
          const a = announcements.find(x => x.id === id);
          if (a) renderDetail(a);
        }
      });
    } else {
      showToast("Error: " + (ack?.error || "Failed"));
    }
  });
}

function rejectAnn(id) {
  if (!confirm("Reject this announcement?")) return;
  const a = announcements.find(x => x.id === id);
  socket?.emit("reject_announcement", { announcement_id: id, author_id: a?.author_id }, (ack) => {
    if (ack?.ok) {
      showToast("Announcement rejected.");
      loadAnnouncements().then(renderList);
    } else {
      showToast("Error: " + (ack?.error || "Failed"));
    }
  });
}

// ── Delete ────────────────────────────────────
function deleteAnn(id) {
  if (!confirm("Delete this announcement?")) return;
  socket?.emit("delete_announcement", { announcement_id: id }, (ack) => {
    if (ack?.ok) {
      announcements = announcements.filter(a => a.id !== id);
      if (activeId === id) {
        activeId = null;
        document.getElementById("annDetail").innerHTML = `
          <div class="ann-empty-state">
            <span class="ann-empty-icon">📋</span>
            <p>This announcement was deleted.</p>
          </div>`;
      }
      renderList();
      showToast("Announcement deleted.");
    } else {
      showToast("Error: " + (ack?.error || "Failed"));
    }
  });
}

// ── Socket ────────────────────────────────────
function connectSocket() {
  const script = document.createElement("script");
  script.src = `${WS}/socket.io/socket.io.js`;
  script.onload = () => {
    socket = io(WS, { auth: { token } });

    socket.on("new_announcement", ({ announcement }) => {
      if (!announcement) return;

      const isForMe = announcement.target_type === "all"
        || (announcement.target_type === "department" && announcement.department === myDept);
      const isAdmin = ["admin","super_admin"].includes(myRole);
      if (!isForMe && !isAdmin) return;

      // Add or update in list
      const idx = announcements.findIndex(a => a.id === announcement.id);
      if (idx >= 0) announcements[idx] = { ...announcements[idx], ...announcement };
      else announcements.unshift({ ...announcement, is_read: false });

      renderList();
      updatePendingBadge();

      // Notification sound
      playAnnouncementSound();

      // Show persistent modal — cannot be dismissed without button click
      queuePersistModal({ ...announcement, is_read: false });
    });

    socket.on("announcement_deleted", ({ announcement_id }) => {
      announcements = announcements.filter(a => a.id !== announcement_id);
      if (activeId === announcement_id) {
        activeId = null;
        document.getElementById("annDetail").innerHTML = `
          <div class="ann-empty-state">
            <span class="ann-empty-icon">📋</span>
            <p>This announcement was deleted.</p>
          </div>`;
      }
      renderList();
    });

    socket.on("announcement_status", ({ announcement_id, status }) => {
      const a = announcements.find(x => x.id === announcement_id);
      if (a) a.status = status;
      renderList();
      if (status === "approved") showToast("✅ Your announcement was approved!");
      if (status === "rejected") showToast("❌ Your announcement was rejected.");
    });

    socket.on("connect_error", (err) => {
      console.warn("Socket error:", err.message);
    });
  };
  document.head.appendChild(script);
}

// ── Pending Badge ─────────────────────────────
function updatePendingBadge() {
  const badge   = document.getElementById("pendingBadge");
  const pending = announcements.filter(a => a.status === "pending").length;
  if (badge) badge.textContent = pending > 0 ? pending : "";
}

// ── Helpers ───────────────────────────────────
function escAnn(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatAnnTime(dateStr) {
  const d   = new Date(dateStr.replace(" ", "T"));
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return Math.floor(diff/60) + "m ago";
  if (diff < 86400) return Math.floor(diff/3600) + "h ago";
  return d.toLocaleDateString();
}

function formatAnnTimeFull(dateStr) {
  const d = new Date(dateStr.replace(" ", "T"));
  return d.toLocaleString();
}

function showToast(msg) {
  const toast = document.getElementById("annToast");
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => toast.classList.add("hidden"), 3000);
}