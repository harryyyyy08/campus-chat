// ── Login ──────────────────────────────────────────────
      async function adminLogin() {
        const username = document.getElementById("adminUsername").value.trim();
        const password = document.getElementById("adminPassword").value;
        const errEl = document.getElementById("adminLoginError");
        errEl.textContent = "";

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

          const role = data.user.role;
          if (role !== "admin" && role !== "super_admin") {
            errEl.textContent = "Access denied — admin accounts only.";
            return;
          }

          adminToken = data.access_token;
          myRole = role;

          // Save admin session to localStorage
          localStorage.setItem("cc_admin_token", adminToken);
          localStorage.setItem("cc_admin_user", JSON.stringify(data.user));

          await initAdminApp(data.user);
        } catch (err) {
          errEl.textContent = "Connection error.";
          console.error(err);
        }
      }

      document.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !adminToken) adminLogin();
      });

      function adminLogout() {
        adminToken = null;
        myRole = null;
        localStorage.removeItem("cc_admin_token");
        localStorage.removeItem("cc_admin_user");
        location.reload();
      }

      // ── Tab switching ─────────────────────────────────────
      function switchAdminTab(btn, tab) {
        document
          .querySelectorAll(".admin-tab")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentTab = tab;
        document.getElementById("adminSearch").value = "";

        const isStorage = tab === "storage";
        const isChats = tab === "chats";
        const isFlagged = tab === "flagged";
        const isUserTab = !isStorage && !isChats && !isFlagged;

        document
          .getElementById("userTableWrap")
          .classList.toggle("hidden", !isUserTab);
        document
          .getElementById("adminToolbar")
          .classList.toggle("hidden", !isUserTab);
        document
          .getElementById("storagePanel")
          .classList.toggle("hidden", !isStorage);
        document
          .getElementById("chatsPanel")
          .classList.toggle("hidden", !isChats);
        document
          .getElementById("flaggedPanel")
          .classList.toggle("hidden", !isFlagged);

        if (isStorage) loadStorage();
        else if (isChats) {
          loadConversations();
          loadFlaggedMessages();
        } else if (isFlagged) loadFlaggedMessages();
        else renderUsers();
      }

      // ── Load users ────────────────────────────────────────
      async function loadUsers() {
        try {
          const res = await fetch(`${API_BASE}/admin/users`, {
            headers: { Authorization: "Bearer " + adminToken },
          });
          const data = await res.json();
          if (!res.ok) {
            if (res.status === 401) {
              // Token expired — clear session and reload to show login
              localStorage.removeItem("cc_admin_token");
              localStorage.removeItem("cc_admin_user");
              location.reload();
              return;
            }
            showToast(data.error || "Failed to load users.");
            return;
          }
          allUsers = data.users || [];
          renderUsers();
          updatePendingBadge();
        } catch (err) {
          showToast("Connection error.");
          console.error(err);
        }
      }

      function updatePendingBadge() {
        const count = allUsers.filter((u) => u.status === "pending").length;
        const badge = document.getElementById("pendingCount");
        badge.textContent = count;
        badge.classList.toggle("hidden", count === 0);
      }

      function filterUsers(q) {
        q = q.toLowerCase();
        document
          .querySelectorAll("#userTableBody tr[data-uid]")
          .forEach((row) => {
            row.style.display = row.textContent.toLowerCase().includes(q)
              ? ""
              : "none";
          });
      }

      function renderUsers() {
        const tbody = document.getElementById("userTableBody");
        const filtered = allUsers.filter((u) => u.status === currentTab);

        if (filtered.length === 0) {
          const msgs = {
            pending: "No pending registrations 🎉",
            active: "No active users yet",
            disabled: "No disabled accounts",
          };
          tbody.innerHTML = `<tr><td colspan="6" class="table-empty">${msgs[currentTab] || "No users"}</td></tr>`;
          return;
        }

        tbody.innerHTML = filtered
          .map(
            (u) => `
          <tr data-uid="${u.id}">
            <td>
              <div class="user-cell">
                <div class="user-avatar-sm">${initials(u.full_name || u.username)}</div>
                <span>${escapeHtml(u.full_name || "—")}</span>
              </div>
            </td>
            <td><span class="mono">@${escapeHtml(u.username)}</span></td>
            <td>${roleCell(u)}</td>
            <td>${escapeHtml(u.department || "—")}</td>
            <td><span class="mono">${formatDate(u.created_at)}</span></td>
            <td>${actionButtons(u)}</td>
          </tr>
        `,
          )
          .join("");
      }

      // Role cell: super_admin sees dropdown, admin sees read-only badge
      function roleCell(u) {
        if (myRole === "super_admin") {
          return `<select class="role-select" onchange="changeRole(${u.id}, this.value)">
            <option value="student"     ${u.role === "student" ? "selected" : ""}>Student</option>
            <option value="faculty"     ${u.role === "faculty" ? "selected" : ""}>Faculty</option>
            <option value="admin"       ${u.role === "admin" ? "selected" : ""}>Admin</option>
            <option value="super_admin" ${u.role === "super_admin" ? "selected" : ""}>Super Admin</option>
          </select>`;
        }
        // Normal admin: read-only role badge
        const labels = {
          student: "Student",
          faculty: "Faculty",
          admin: "Admin",
          super_admin: "Super Admin",
        };
        const cls =
          u.role === "super_admin"
            ? "role-badge-display super"
            : u.role === "admin"
              ? "role-badge-display admin"
              : "role-badge-display";
        return `<span class="${cls}">${labels[u.role] || u.role}</span>`;
      }

      function actionButtons(u) {
        // Prevent normal admin from acting on super_admin accounts
        const isProtected =
          u.role === "super_admin" && myRole !== "super_admin";

        if (u.status === "pending") {
          return `<div class="action-btns">
            <button class="action-btn approve" onclick="approveUser(${u.id})" ${isProtected ? "disabled" : ""}>✓ Approve</button>
            <button class="action-btn reject"  onclick="disableUser(${u.id})" ${isProtected ? "disabled" : ""}>✕ Reject</button>
          </div>`;
        }
        if (u.status === "active") {
          return `<div class="action-btns">
            <button class="action-btn disable" onclick="disableUser(${u.id})" ${isProtected ? "disabled" : ""}>Disable</button>
          </div>`;
        }
        if (u.status === "disabled") {
          return `<div class="action-btns">
            <button class="action-btn approve" onclick="approveUser(${u.id})" ${isProtected ? "disabled" : ""}>Re-enable</button>
          </div>`;
        }
        return "";
      }

      // ── User actions ──────────────────────────────────────
      async function approveUser(userId) {
        // For normal admin approvals, role is locked to student/faculty only
        // The dropdown in the row shows the current value
        const roleEl = document.querySelector(
          `tr[data-uid="${userId}"] .role-select`,
        );
        const role = roleEl ? roleEl.value : "student";

        try {
          const res = await fetch(`${API_BASE}/admin/users/approve`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ user_id: userId, role }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          showToast("User approved!");
          await loadUsers();
        } catch {
          showToast("Connection error.");
        }
      }

      async function disableUser(userId) {
        if (!confirm("Disable this account?")) return;
        try {
          const res = await fetch(`${API_BASE}/admin/users/disable`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ user_id: userId }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          showToast("Account disabled.");
          await loadUsers();
        } catch {
          showToast("Connection error.");
        }
      }

      async function changeRole(userId, newRole) {
        try {
          const res = await fetch(`${API_BASE}/admin/users/role`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ user_id: userId, role: newRole }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            await loadUsers();
            return;
          }
          showToast("Role updated.");
          const u = allUsers.find((u) => u.id === userId);
          if (u) u.role = newRole;
        } catch {
          showToast("Connection error.");
        }
      }