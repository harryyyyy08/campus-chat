/**
 * Admin — Password Reset Requests
 * Handles loading, approving, and rejecting password reset requests.
 */

const resetReqState = {
  requests: [],
  query: "",
  loginPopupShown: false,
};

function bindResetReqSearchInput() {
  const searchEl = document.getElementById("resetReqSearch");
  if (!searchEl || searchEl.dataset.bound === "1") return;

  searchEl.dataset.bound = "1";
  searchEl.addEventListener("input", () => {
    resetReqState.query = searchEl.value || "";
    renderResetRequests();
  });
}

function matchesResetReqSearch(req, query) {
  if (!query) return true;

  const haystack = [
    req.full_name,
    req.username,
    req.user_role,
    req.department,
    req.id,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return haystack.includes(query);
}

function renderResetRequests() {
  const listEl = document.getElementById("resetReqList");
  if (!listEl) return;

  if (resetReqState.requests.length === 0) {
    listEl.innerHTML =
      '<div style="text-align:center;padding:48px 0;color:var(--text-muted);font-size:13px;">No pending password reset requests.</div>';
    return;
  }

  const query = (resetReqState.query || "").trim().toLowerCase();
  const filtered = query
    ? resetReqState.requests.filter((req) => matchesResetReqSearch(req, query))
    : resetReqState.requests;

  if (filtered.length === 0) {
    listEl.innerHTML =
      '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px;">No matching reset requests.</div>';
    return;
  }

  listEl.innerHTML = filtered
    .map((r) => {
      const requestedAt = r.requested_at
        ? formatRequestedAt(r.requested_at)
        : "";
      const ageBadge = getAgeBadge(r.requested_at);

      return `
      <div style="background:var(--bg-elevated);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:12px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
        <div style="flex:1;min-width:180px;">
          <div style="font-size:14px;font-weight:600;color:var(--text-primary);">${escHtml(r.full_name)}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">@${escHtml(r.username)} &middot; ${escHtml(r.user_role || "")}${r.department ? " &middot; " + escHtml(r.department) : ""}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>Requested: ${requestedAt}</span>
            ${ageBadge}
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button onclick="approveResetRequest(${r.id})" style="padding:8px 16px;border-radius:8px;border:none;background:var(--accent,#16a34a);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Approve</button>
          <button onclick="rejectResetRequest(${r.id}, this)" style="padding:8px 14px;border-radius:8px;border:1px solid var(--border-strong);background:transparent;color:var(--text-secondary);font-size:13px;font-weight:500;cursor:pointer;">Reject</button>
        </div>
      </div>
    `;
    })
    .join("");
}

function getAgeBadge(requestedAt) {
  if (!requestedAt) return "";
  const dt = new Date(requestedAt);
  if (Number.isNaN(dt.getTime())) return "";

  const now = new Date();
  const diffMs = now - dt;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  let label, style;

  if (diffDays >= 5) {
    label = `${diffDays}d ago — expiring soon`;
    style =
      "background:rgba(234,179,8,0.15);color:#b45309;border:1px solid rgba(234,179,8,0.3);";
  } else if (diffDays >= 1) {
    label = `${diffDays}d ago`;
    style =
      "background:var(--accent-soft,rgba(139,92,246,0.08));color:var(--text-secondary);border:1px solid var(--border);";
  } else {
    label = diffHours > 0 ? `${diffHours}h ago` : "Just now";
    style =
      "background:rgba(34,197,94,0.1);color:#16a34a;border:1px solid rgba(34,197,94,0.25);";
  }

  return `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 8px;border-radius:6px;${style}">${label}</span>`;
}

function formatRequestedAt(value) {
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return "";

  const datePart = dt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
}

async function loadResetRequests(options = {}) {
  const { showLoginPopup = false } = options;
  const listEl = document.getElementById("resetReqList");
  const badge = document.getElementById("resetReqCount");
  const searchEl = document.getElementById("resetReqSearch");

  bindResetReqSearchInput();
  resetReqState.query = searchEl ? searchEl.value || "" : "";

  listEl.innerHTML =
    '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px;">Loading…</div>';

  try {
    const res = await fetch(`${API_BASE}/admin/reset-requests`, {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) {
      listEl.innerHTML = `<div style="text-align:center;padding:40px 0;color:var(--error,#ef4444);font-size:13px;">${data.error || "Failed to load."}</div>`;
      return;
    }

    const reqs = data.requests || [];

    // Update badge on tab
    if (reqs.length > 0) {
      badge.textContent = reqs.length;
      badge.classList.remove("hidden");
    } else {
      badge.classList.add("hidden");
      resetReqState.loginPopupShown = false;
    }

    if (showLoginPopup && reqs.length > 0 && !resetReqState.loginPopupShown) {
      const noun = reqs.length === 1 ? "request" : "requests";
      if (typeof showToast === "function") {
        showToast(`You have ${reqs.length} pending password reset ${noun}.`);
      }
      resetReqState.loginPopupShown = true;
    }

    resetReqState.requests = reqs;
    renderResetRequests();
  } catch {
    listEl.innerHTML =
      '<div style="text-align:center;padding:40px 0;color:var(--error,#ef4444);font-size:13px;">Connection error.</div>';
  }
}

async function approveResetRequest(id) {
  try {
    const res = await fetch(`${API_BASE}/admin/reset-requests/${id}/approve`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to approve.");
      return;
    }

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
    const res = await fetch(`${API_BASE}/admin/reset-requests/${id}/reject`, {
      method: "POST",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Failed to reject.");
      return;
    }
    loadResetRequests();
  } catch {
    alert("Connection error.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Reject";
  }
}

function copyTempPw() {
  const pw = document.getElementById("tempPwValue").textContent;
  const btn = document.getElementById("tempPwCopyBtn");
  navigator.clipboard.writeText(pw).then(() => {
    btn.textContent = "Copied!";
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 2000);
  });
}

function closeTempPwModal() {
  document.getElementById("tempPwModal").classList.add("hidden");
  document.getElementById("tempPwValue").textContent = "";
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
