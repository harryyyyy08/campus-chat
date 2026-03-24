/**
 * Admin — Password Reset Requests
 * Handles loading, approving, and rejecting password reset requests.
 */

async function loadResetRequests() {
  const listEl = document.getElementById("resetReqList");
  const badge  = document.getElementById("resetReqCount");
  listEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px;">Loading…</div>';

  try {
    const res  = await fetch(`${API_BASE}/admin/reset-requests`, {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) { listEl.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--error,#ef4444);font-size:13px;">${data.error || "Failed to load."}</div>`; return; }

    const reqs = data.requests || [];

    // Update badge on tab
    if (reqs.length > 0) {
      badge.textContent = reqs.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
    }

    if (reqs.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;padding:48px 0;color:var(--text-muted);font-size:13px;">No pending password reset requests.</div>';
      return;
    }

    listEl.innerHTML = reqs.map(r => `
      <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(r.full_name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">@${escHtml(r.username)} &middot; ${escHtml(r.user_role || "")}${r.department ? " &middot; " + escHtml(r.department) : ""}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Requested: ${new Date(r.requested_at).toLocaleString()}</div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button onclick="approveResetRequest(${r.id})" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#16a34a);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Approve</button>
          <button onclick="rejectResetRequest(${r.id}, this)" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border-strong);background:transparent;color:var(--text-secondary);font-size:13px;font-weight:500;cursor:pointer;">Reject</button>
        </div>
      </div>
    `).join("");

  } catch {
    listEl.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--error,#ef4444);font-size:13px;">Connection error.</div>';
  }
}

async function approveResetRequest(id) {
  try {
    const res  = await fetch(`${API_BASE}/admin/reset-requests/${id}/approve`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed to approve."); return; }

    // Show the temp password modal (one-time)
    document.getElementById("tempPwValue").textContent = data.temp_password;
    document.getElementById("tempPwCopyBtn").textContent = "Copy";
    document.getElementById("tempPwModal").classList.remove("hidden");

    loadResetRequests();
  } catch {
    alert("Connection error.");
  }
}

async function rejectResetRequest(id, btn) {
  btn.disabled = true;
  btn.textContent = "Rejecting…";
  try {
    const res  = await fetch(`${API_BASE}/admin/reset-requests/${id}/reject`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || "Failed to reject."); return; }
    loadResetRequests();
  } catch {
    alert("Connection error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Reject";
  }
}

function copyTempPw() {
  const pw  = document.getElementById("tempPwValue").textContent;
  const btn = document.getElementById("tempPwCopyBtn");
  navigator.clipboard.writeText(pw).then(() => {
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = "Copy"; }, 2000);
  });
}

function closeTempPwModal() {
  document.getElementById("tempPwModal").classList.add("hidden");
  document.getElementById("tempPwValue").textContent = "";
}

function escHtml(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
