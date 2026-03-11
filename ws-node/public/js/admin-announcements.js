// ════════════════════════════════════════════
// ADMIN — ANNOUNCEMENTS
// js/admin-announcements.js
// ════════════════════════════════════════════

async function loadAdminAnnouncements() {
  const list   = document.getElementById("annAdminList");
  const status = document.getElementById("annFilterStatus")?.value ?? "pending";
  if (!list) return;
  list.innerHTML = `<div class="table-empty" style="padding:48px">Loading…</div>`;

  try {
    const res  = await fetch(`${API_BASE}/announcements`, {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");

    let items = data.announcements || [];
    if (status) items = items.filter(a => a.status === status);

    // Update pending badge
    const pending = (data.announcements || []).filter(a => a.status === "pending").length;
    const badge   = document.getElementById("annPendingCount");
    if (badge) {
      badge.textContent = pending;
      badge.classList.toggle("hidden", pending === 0);
    }

    if (items.length === 0) {
      list.innerHTML = `<div class="table-empty" style="padding:48px">No ${status || ""} announcements.</div>`;
      return;
    }

    list.innerHTML = items.map(a => `
      <div class="ann-admin-card" id="annCard-${a.id}">
        <div class="ann-admin-card-header">
          <span class="ann-admin-priority ann-priority-${a.priority}">${
            { low:"🟢 Low", normal:"🔵 Normal", high:"🟠 High", urgent:"🔴 Urgent" }[a.priority]
          }</span>
          <span class="ann-admin-status ann-status-${a.status}">${a.status.toUpperCase()}</span>
          <span class="ann-admin-target">${a.target_type === "all" ? "📢 All Users" : `🏫 ${a.department || "Department"}`}</span>
          <span class="ann-admin-time">${formatAnnAdminTime(a.created_at)}</span>
        </div>
        <div class="ann-admin-title">${escAnnAdmin(a.title)}</div>
        <div class="ann-admin-body">${escAnnAdmin(a.body)}</div>
        <div class="ann-admin-meta">By <strong>${escAnnAdmin(a.author_name)}</strong> (${a.author_role})</div>
        <div class="ann-admin-actions">
          ${a.status === "pending" ? `
            <button class="action-btn approve" onclick="adminApproveAnn(${a.id}, ${a.author_id})">✅ Approve</button>
            <button class="action-btn reject"  onclick="adminRejectAnn(${a.id},  ${a.author_id})">❌ Reject</button>
          ` : ""}
          ${a.status === "rejected" ? `
            <button class="action-btn approve" onclick="adminApproveAnn(${a.id}, ${a.author_id})">✅ Approve</button>
          ` : ""}
          <button class="action-btn reject" onclick="adminDeleteAnn(${a.id})">🗑️ Delete</button>
        </div>
      </div>
    `).join("");

  } catch (err) {
    list.innerHTML = `<div class="table-empty" style="padding:48px;color:var(--danger)">Error: ${err.message}</div>`;
  }
}

async function adminApproveAnn(id, authorId) {
  try {
    const res  = await fetch(`${API_BASE}/announcements/${id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showAdminToast("✅ Announcement approved and published!");
    loadAdminAnnouncements();
  } catch (err) {
    showAdminToast("Error: " + err.message);
  }
}

async function adminRejectAnn(id, authorId) {
  if (!confirm("Reject this announcement?")) return;
  try {
    const res  = await fetch(`${API_BASE}/announcements/${id}/reject`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showAdminToast("Announcement rejected.");
    loadAdminAnnouncements();
  } catch (err) {
    showAdminToast("Error: " + err.message);
  }
}

async function adminDeleteAnn(id) {
  if (!confirm("Permanently delete this announcement?")) return;
  try {
    const res  = await fetch(`${API_BASE}/announcements/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed");
    showAdminToast("Announcement deleted.");
    loadAdminAnnouncements();
  } catch (err) {
    showAdminToast("Error: " + err.message);
  }
}

// ── Helpers ───────────────────────────────────
function escAnnAdmin(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatAnnAdminTime(dateStr) {
  const d = new Date(dateStr.replace(" ", "T"));
  return d.toLocaleString();
}

function showAdminToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.className = "show";
  clearTimeout(window._adminToastTimer);
  window._adminToastTimer = setTimeout(() => toast.className = "", 3000);
}