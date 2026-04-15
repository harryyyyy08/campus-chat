// ════════════════════════════════════════════
// DEPARTMENT CRUD — Admin Panel
// ════════════════════════════════════════════

let allDepartments = [];

// ── Load departments ───────────────────────────────────
async function loadDepartments() {
  try {
    const res = await fetch(`${API_BASE}/departments`);
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load departments.");
      return;
    }
    allDepartments = data.departments || [];
  } catch (err) {
    console.error("loadDepartments error:", err);
  }
}

// ── Open department management modal ───────────────────
function openDepartmentModal() {
  // Remove existing modal if any
  const existing = document.getElementById("deptModal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "deptModal";
  overlay.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.5);backdrop-filter:blur(4px);z-index:1000;display:flex;align-items:center;justify-content:center;padding:16px;";
  overlay.innerHTML = `
    <div class="dept-modal-card" style="background:var(--bg-modal);border:1px solid var(--border);border-radius:16px;padding:0;width:100%;max-width:520px;box-shadow:var(--shadow-lg);max-height:85vh;display:flex;flex-direction:column;overflow:hidden;">
      <div style="padding:24px 24px 16px;border-bottom:1px solid var(--border);flex-shrink:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
          <div style="font-size:17px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Manage Departments
          </div>
          <button onclick="closeDepartmentModal()" style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:20px;padding:4px 8px;border-radius:6px;transition:all 0.15s;" onmouseover="this.style.background='var(--bg-sidebar-hover)';this.style.color='var(--text-primary)'" onmouseout="this.style.background='none';this.style.color='var(--text-muted)'">&times;</button>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <input id="deptNewName" type="text" placeholder="New department name…" style="flex:1;background:var(--bg-input);border:1px solid var(--border-strong);border-radius:8px;padding:9px 14px;color:var(--text-primary);font-family:var(--font-body);font-size:13px;outline:none;transition:border-color 0.15s;" onfocus="this.style.borderColor='var(--accent)'" onblur="this.style.borderColor='var(--border-strong)'" />
          <button onclick="addDepartment()" class="btn-modal-primary" style="padding:9px 16px;font-size:13px;white-space:nowrap;border-radius:8px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline;vertical-align:middle;margin-right:3px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </button>
        </div>
      </div>
      <div id="deptListContainer" style="flex:1;overflow-y:auto;padding:8px 16px 16px;min-height:120px;">
        <div style="text-align:center;padding:32px 0;color:var(--text-muted);font-size:13px;">Loading…</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeDepartmentModal();
  });

  // Enter key to add
  document.getElementById("deptNewName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addDepartment();
  });

  loadAndRenderDeptList();
}

function closeDepartmentModal() {
  const modal = document.getElementById("deptModal");
  if (modal) modal.remove();
}

// ── Load + render department list inside modal ─────────
async function loadAndRenderDeptList() {
  try {
    const res = await fetch(`${API_BASE}/admin/departments`, {
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load departments.");
      return;
    }
    allDepartments = data.departments || [];
    renderDeptList();
  } catch (err) {
    showToast("Connection error loading departments.");
    console.error(err);
  }
}

function renderDeptList() {
  const container = document.getElementById("deptListContainer");
  if (!container) return;

  if (allDepartments.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:32px 0;color:var(--text-muted);font-size:13px;">No departments yet. Add one above.</div>`;
    return;
  }

  container.innerHTML = allDepartments
    .map(
      (d) => `
    <div class="dept-row" data-dept-id="${d.id}" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;border:1px solid var(--border);margin-bottom:6px;background:var(--bg-elevated);transition:all 0.15s;">
      <div style="flex:1;display:flex;align-items:center;gap:8px;overflow:hidden;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span class="dept-name-text" style="font-size:13px;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(d.name)}</span>
      </div>
      <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);flex-shrink:0;">${d.user_count || 0} users</span>
      <button onclick="startEditDept(${d.id}, '${escapeHtml(d.name).replace(/'/g, "\\'")}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px 6px;border-radius:4px;transition:all 0.15s;font-size:13px;" title="Edit" onmouseover="this.style.background='var(--accent-soft)';this.style.color='var(--accent)'" onmouseout="this.style.background='none';this.style.color='var(--text-muted)'">✏️</button>
      <button onclick="deleteDept(${d.id}, '${escapeHtml(d.name).replace(/'/g, "\\'")}')" style="background:none;border:none;cursor:pointer;color:var(--text-muted);padding:4px 6px;border-radius:4px;transition:all 0.15s;font-size:13px;" title="Delete" onmouseover="this.style.background='rgba(239,68,68,0.1)';this.style.color='var(--red)'" onmouseout="this.style.background='none';this.style.color='var(--text-muted)'">🗑️</button>
    </div>
  `,
    )
    .join("");
}

// ── Add department ─────────────────────────────────────
async function addDepartment() {
  const input = document.getElementById("deptNewName");
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    showToast("Department name is required.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/admin/departments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to add department.");
      return;
    }
    showToast("Department added!");
    input.value = "";
    await loadAndRenderDeptList();
  } catch {
    showToast("Connection error.");
  }
}

// ── Edit department (inline) ───────────────────────────
function startEditDept(id, currentName) {
  const row = document.querySelector(`.dept-row[data-dept-id="${id}"]`);
  if (!row) return;
  const nameEl = row.querySelector(".dept-name-text");
  if (!nameEl) return;

  // Replace text with input
  const oldName = currentName;
  nameEl.outerHTML = `<input class="dept-edit-input" value="${escapeHtml(oldName)}" style="flex:1;background:var(--bg-input);border:1px solid var(--accent);border-radius:6px;padding:5px 10px;color:var(--text-primary);font-family:var(--font-body);font-size:13px;outline:none;min-width:0;" />`;

  const editInput = row.querySelector(".dept-edit-input");
  editInput.focus();
  editInput.select();

  // Save on Enter, cancel on Escape
  editInput.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      await saveDeptEdit(id, editInput.value.trim());
    } else if (e.key === "Escape") {
      await loadAndRenderDeptList();
    }
  });

  editInput.addEventListener("blur", async () => {
    const newName = editInput.value.trim();
    if (newName && newName !== oldName) {
      await saveDeptEdit(id, newName);
    } else {
      await loadAndRenderDeptList();
    }
  });
}

async function saveDeptEdit(id, newName) {
  if (!newName) {
    showToast("Name cannot be empty.");
    return;
  }
  try {
    const res = await fetch(`${API_BASE}/admin/departments/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + adminToken,
      },
      body: JSON.stringify({ name: newName }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to update.");
      return;
    }
    showToast("Department updated!");
    await loadAndRenderDeptList();
  } catch {
    showToast("Connection error.");
  }
}

// ── Delete department ──────────────────────────────────
async function deleteDept(id, name) {
  if (
    !confirm(
      `Delete department "${name}"?\n\nUsers in this department will have their department set to empty.`,
    )
  )
    return;
  try {
    const res = await fetch(`${API_BASE}/admin/departments/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to delete.");
      return;
    }
    showToast(
      `Deleted "${name}" — ${data.users_cleared || 0} user(s) cleared.`,
    );
    await loadAndRenderDeptList();
    // Reload users to reflect cleared departments
    if (typeof loadUsers === "function") await loadUsers();
  } catch {
    showToast("Connection error.");
  }
}
