function showToast(msg) {
        const t = document.getElementById("toast");
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(t._t);
        t._t = setTimeout(() => t.classList.remove("show"), 3000);
      }

      // ══════════════════════════════════════════════
      // CHAT MONITORING (super_admin only)
      // ══════════════════════════════════════════════

      let allConversations = [];
      let convTypeFilter = "all";
      let currentMonitorCid = null;
      let msgSearchDebounce = null;

      // ── Conversations ─────────────────────────────
      async function loadConversations() {
        const listEl = document.getElementById("monitorConvList");
        listEl.innerHTML = `<div class="table-empty" style="padding:32px;">Loading…</div>`;
        try {
          const params = new URLSearchParams();
          if (convTypeFilter !== "all") params.set("type", convTypeFilter);
          const res = await fetch(`${API_BASE}/admin/conversations?${params}`, {
            headers: { Authorization: "Bearer " + adminToken },
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          allConversations = data.conversations || [];
          renderConversationList();
        } catch (err) {
          showToast("Connection error.");
          console.error(err);
        }
      }

      function setConvFilter(btn, type) {
        document
          .querySelectorAll(".filter-btn")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        convTypeFilter = type;
        loadConversations();
      }

      function renderConversationList() {
        const listEl = document.getElementById("monitorConvList");
        if (!allConversations.length) {
          listEl.innerHTML = `<div class="table-empty" style="padding:32px;">No conversations found.</div>`;
          return;
        }
        listEl.innerHTML = allConversations
          .map((c) => {
            const isGroup = c.type === "group";
            const title = isGroup
              ? c.name || "Group #" + c.id
              : c.members.map((m) => m.full_name || m.username).join(" & ");
            const flagBadge =
              c.flag_count > 0
                ? `<span class="conv-flag-badge">🚩 ${c.flag_count}</span>`
                : "";
            const typeBadge = isGroup
              ? `<span class="conv-type-badge group">Group</span>`
              : `<span class="conv-type-badge">Direct</span>`;
            const active = c.id === currentMonitorCid ? "active" : "";
            return `<div class="monitor-conv-item ${active}" onclick="openMonitorConv(${c.id})" data-cid="${c.id}">
            <div class="monitor-conv-avatar">${isGroup ? "👥" : "👤"}</div>
            <div class="monitor-conv-info">
              <div class="monitor-conv-title">${escapeHtml(truncate(title, 40))} ${typeBadge} ${flagBadge}</div>
              <div class="monitor-conv-meta">${c.member_count} members · ${c.last_message_at ? formatDate(c.last_message_at) : "No messages"}</div>
            </div>
          </div>`;
          })
          .join("");
      }

      // ── Messages viewer ───────────────────────────
      async function openMonitorConv(cid) {
        currentMonitorCid = cid;
        // Highlight active conv
        document
          .querySelectorAll(".monitor-conv-item")
          .forEach((el) =>
            el.classList.toggle("active", Number(el.dataset.cid) === cid),
          );

        const pane = document.getElementById("monitorMsgPane");
        const conv = allConversations.find((c) => c.id === cid);
        const isGroup = conv?.type === "group";
        const title = isGroup
          ? conv?.name || "Group"
          : conv?.members?.map((m) => m.full_name || m.username).join(" & ") ||
            "Conversation";

        pane.innerHTML = `
          <div class="monitor-msg-header">
            <div>
              <div class="monitor-msg-title">${escapeHtml(title)}</div>
              <div class="monitor-msg-meta">
                ${conv?.members?.map((m) => `<span class="member-pill">${escapeHtml(m.full_name || m.username)}</span>`).join("") || ""}
              </div>
            </div>
          </div>
          <div class="monitor-msg-list" id="monitorMsgList"><div class="table-empty" style="padding:32px;">Loading messages…</div></div>`;

        try {
          const res = await fetch(
            `${API_BASE}/admin/conversations/messages?conversation_id=${cid}&limit=80`,
            { headers: { Authorization: "Bearer " + adminToken } },
          );
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          renderMonitorMessages(data.messages || [], cid);
        } catch (err) {
          showToast("Connection error.");
          console.error(err);
        }
      }

      function renderMonitorMessages(messages, cid) {
        const listEl = document.getElementById("monitorMsgList");
        if (!messages.length) {
          listEl.innerHTML = `<div class="table-empty" style="padding:32px;">No messages yet.</div>`;
          return;
        }
        listEl.innerHTML = messages.map((m) => buildMonitorMsgHtml(m)).join("");
        listEl.scrollTop = listEl.scrollHeight;
      }

      // Convert regular uploads URL to admin uploads URL
      function toAdminFileUrl(url) {
        if (!url) return url;
        // Rewrite /uploads/filename to /admin/uploads/filename
        return url.replace(/\/uploads\//, "/admin/uploads/");
      }

      // Fetch a file as blob using admin token (for images in monitor view)
      const adminBlobCache = new Map();
      async function loadAdminImage(imgEl, url) {
        const absUrl = "http://localhost" + url;
        if (adminBlobCache.has(absUrl)) {
          imgEl.src = adminBlobCache.get(absUrl);
          return;
        }
        try {
          const res = await fetch(absUrl, {
            headers: { Authorization: "Bearer " + adminToken },
          });
          if (!res.ok) throw new Error("HTTP " + res.status);
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          adminBlobCache.set(absUrl, blobUrl);
          imgEl.src = blobUrl;
        } catch (err) {
          imgEl.parentElement.innerHTML = `<div class="attach-err">Could not load image</div>`;
        }
      }

      async function downloadAdminFile(url, filename) {
        try {
          const absUrl = "http://localhost" + url;
          const res = await fetch(absUrl, {
            headers: { Authorization: "Bearer " + adminToken },
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
        } catch {
          showToast("Download error.");
        }
      }

      function buildAttachmentHtml(att) {
        if (!att) return "";
        const adminUrl = toAdminFileUrl(att.url);
        const isImage = [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ].includes(att.mime_type);
        if (isImage) {
          const uid = "adminimg_" + Math.random().toString(36).slice(2);
          // Load image after render using setTimeout
          setTimeout(() => {
            const el = document.getElementById(uid);
            if (el) loadAdminImage(el, adminUrl);
          }, 50);
          return `<div class="monitor-attach-image-wrap">
            <img id="${uid}" src="" alt="${escapeHtml(att.original_name)}"
                 class="monitor-attach-image" />
          </div>`;
        }
        // Document
        const icons = {
          "application/pdf": "📄",
          "application/msword": "📝",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            "📝",
          "application/vnd.ms-excel": "📊",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            "📊",
          "application/vnd.ms-powerpoint": "📑",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            "📑",
        };
        const icon = icons[att.mime_type] || "📎";
        const size =
          att.file_size < 1048576
            ? (att.file_size / 1024).toFixed(1) + " KB"
            : (att.file_size / 1048576).toFixed(1) + " MB";
        return `<div class="monitor-attach-doc" onclick="downloadAdminFile('${escapeHtml(adminUrl)}','${escapeHtml(att.original_name)}')">
          <span>${icon}</span>
          <div>
            <div class="attach-doc-name">${escapeHtml(att.original_name)}</div>
            <div class="attach-doc-size">${size}</div>
          </div>
          <span>⬇</span>
        </div>`;
      }

      function buildMonitorMsgHtml(m, highlight = "") {
        const flagged   = m.is_flagged || m.flag_count > 0;
        const isDeleted = m.is_deleted;
        const isEdited  = m.is_edited && !isDeleted;
        const bodyText  = m.body || "";

        let displayBody = "";
        if (isDeleted) {
          displayBody = `<div class="monitor-msg-deleted">🚫 This message was deleted</div>`;
        } else if (bodyText) {
          const escaped = highlight
            ? escapeHtml(bodyText).replace(
                new RegExp(`(${escapeRegex(highlight)})`, "gi"),
                `<mark>$1</mark>`,
              )
            : escapeHtml(bodyText);
          displayBody = `<div class="monitor-msg-body">${escaped}</div>`;
        }

        const attachHtml = isDeleted ? "" : buildAttachmentHtml(m.attachment);
        const editedLabel = isEdited
          ? `<span class="monitor-msg-edited" title="Edited at ${escapeHtml(m.edited_at || "")}">✏️ edited</span>`
          : "";

        return `<div class="monitor-msg-row ${flagged ? "flagged" : ""} ${isDeleted ? "deleted" : ""}" data-mid="${m.id}">
          <div class="monitor-msg-sender">
            <span class="monitor-sender-name">${escapeHtml(m.full_name || m.username)}</span>
            <span class="monitor-sender-handle">@${escapeHtml(m.username)}</span>
            <span class="monitor-msg-time">${formatDateTime(m.created_at)}</span>
            ${editedLabel}
            ${flagged ? `<span class="flag-indicator" title="${escapeHtml(m.flag_reason || "")}">🚩 Flagged</span>` : ""}
          </div>
          ${attachHtml}
          ${displayBody}
          <div class="monitor-msg-actions">
            ${
              flagged
                ? `<button class="monitor-btn unflag" onclick="unflagMessage(${m.id}, this)">Remove Flag</button>`
                : `<button class="monitor-btn flag" onclick="showFlagDialog(${m.id}, this)">🚩 Flag</button>`
            }
          </div>
        </div>`;
      }

      // ── Flag / Unflag ─────────────────────────────
      async function showFlagDialog(messageId, btn) {
        const reason =
          prompt(
            "Optional: Enter reason for flagging this message (or leave blank):",
          ) ?? null;
        if (reason === null) return; // cancelled
        try {
          const res = await fetch(`${API_BASE}/admin/messages/flag`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ message_id: messageId, reason }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          showToast("Message flagged.");
          // Update row in DOM
          const row = document.querySelector(
            `.monitor-msg-row[data-mid="${messageId}"]`,
          );
          if (row) {
            row.classList.add("flagged");
            row.querySelector(".monitor-msg-actions").innerHTML =
              `<button class="monitor-btn unflag" onclick="unflagMessage(${messageId}, this)">Remove Flag</button>`;
          }
          updateFlaggedBadge(1);
          loadFlaggedMessages();
        } catch {
          showToast("Connection error.");
        }
      }

      async function unflagMessage(messageId, btn) {
        if (!confirm("Remove flag from this message?")) return;
        try {
          const res = await fetch(`${API_BASE}/admin/messages/flag`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ message_id: messageId }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          showToast("Flag removed.");
          const row = document.querySelector(
            `.monitor-msg-row[data-mid="${messageId}"]`,
          );
          if (row) {
            row.classList.remove("flagged");
            row.querySelector(".monitor-msg-actions").innerHTML =
              `<button class="monitor-btn flag" onclick="showFlagDialog(${messageId}, this)">🚩 Flag</button>`;
            row.querySelector(".flag-indicator")?.remove();
          }
          updateFlaggedBadge(-1);
          loadFlaggedMessages();
        } catch {
          showToast("Connection error.");
        }
      }

      function updateFlaggedBadge(delta) {
        const badge = document.getElementById("flaggedCount");
        let count = parseInt(badge.textContent || "0") + delta;
        if (count < 0) count = 0;
        badge.textContent = count;
        badge.classList.toggle("hidden", count === 0);
      }

      // ── Flagged messages panel ────────────────────
      async function loadFlaggedMessages() {
        try {
          const res = await fetch(`${API_BASE}/admin/messages/flagged`, {
            headers: { Authorization: "Bearer " + adminToken },
          });
          const data = await res.json();
          if (!res.ok) return;
          const flagged = data.flagged || [];

          // Update badge on Flagged tab
          const badge = document.getElementById("flaggedCount");
          badge.textContent = flagged.length;
          badge.classList.toggle("hidden", flagged.length === 0);

          const listEl = document.getElementById("flaggedList");
          if (!flagged.length) {
            listEl.innerHTML = `<div class="table-empty" style="padding:48px;">🎉 No flagged messages.</div>`;
            return;
          }
          listEl.innerHTML = flagged
            .map(
              (m) => `
            <div class="flagged-msg-card" data-mid="${m.id}">
              <div class="flagged-msg-header">
                <div>
                  <span class="monitor-sender-name">${escapeHtml(m.full_name || m.username)}</span>
                  <span class="monitor-sender-handle">@${escapeHtml(m.username)}</span>
                  <span class="conv-type-badge ${m.conv_type === "group" ? "group" : ""}" style="margin-left:6px;">${m.conv_type === "group" ? escapeHtml(m.conv_name || "Group") : "Direct"}</span>
                </div>
                <div style="display:flex;gap:8px;align-items:center;">
                  <span class="monitor-msg-time">${formatDateTime(m.created_at)}</span>
                  <button class="monitor-btn unflag" onclick="unflagMessage(${m.id}, this)">Remove Flag</button>
                  <button class="monitor-btn view" onclick="viewConvFromFlag(${m.conversation_id})">View Chat</button>
                </div>
              </div>
              <div class="flagged-msg-body">${escapeHtml(m.body || "[attachment]")}</div>
              ${m.flag_reason ? `<div class="flag-reason">Reason: ${escapeHtml(m.flag_reason)}</div>` : ""}
              <div class="flag-meta">Flagged by ${escapeHtml(m.flagged_by_name || m.flagged_by_username)} · ${formatDateTime(m.flagged_at)}</div>
            </div>`,
            )
            .join("");
        } catch (err) {
          console.error(err);
        }
      }

      async function viewConvFromFlag(cid) {
        // 1. Clear search so we don't stay in search-results mode
        const searchInput = document.getElementById("msgSearchInput");
        if (searchInput) searchInput.value = "";
        document.getElementById("msgSearchResults").classList.add("hidden");
        document.getElementById("monitorLayout").classList.remove("hidden");

        // 2. Switch to Chat Monitor tab (but DON'T let it auto-call loadConversations —
        //    we'll do it ourselves so we can await it properly)
        document
          .querySelectorAll(".admin-tab")
          .forEach((b) => b.classList.remove("active"));
        const chatsBtn = document.querySelector('[data-tab="chats"]');
        if (chatsBtn) chatsBtn.classList.add("active");
        currentTab = "chats";
        document.getElementById("userTableWrap").classList.add("hidden");
        document.getElementById("adminToolbar").classList.add("hidden");
        document.getElementById("storagePanel").classList.add("hidden");
        document.getElementById("chatsPanel").classList.remove("hidden");
        document.getElementById("flaggedPanel").classList.add("hidden");

        // 3. Load conversations if not yet loaded, then open target conversation
        if (!allConversations.length) {
          await loadConversations();
        }
        await openMonitorConv(cid);

        // 4. Scroll the conversation item into view in the left panel
        setTimeout(() => {
          const el = document.querySelector(
            `.monitor-conv-item[data-cid="${cid}"]`,
          );
          if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 100);
      }

      // ── Refresh chats (conv list + current open conversation) ──
      async function refreshChats() {
        await loadConversations();
        if (currentMonitorCid) {
          await openMonitorConv(currentMonitorCid);
        }
      }

      // ── Message Search ────────────────────────────
      function debounceMessageSearch(q) {
        clearTimeout(msgSearchDebounce);
        if (q.trim().length < 2) {
          document.getElementById("msgSearchResults").classList.add("hidden");
          document.getElementById("monitorLayout").classList.remove("hidden");
          return;
        }
        msgSearchDebounce = setTimeout(() => runMessageSearch(q.trim()), 400);
      }

      async function runMessageSearch(q) {
        document.getElementById("monitorLayout").classList.add("hidden");
        document.getElementById("msgSearchResults").classList.remove("hidden");
        document.getElementById("msgSearchList").innerHTML =
          `<div class="table-empty" style="padding:24px;">Searching…</div>`;

        try {
          const res = await fetch(
            `${API_BASE}/admin/messages/search?q=${encodeURIComponent(q)}`,
            { headers: { Authorization: "Bearer " + adminToken } },
          );
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }

          const msgs = data.messages || [];
          document.getElementById("searchResultCount").textContent =
            `${msgs.length} result${msgs.length !== 1 ? "s" : ""} for "${q}"`;

          if (!msgs.length) {
            document.getElementById("msgSearchList").innerHTML =
              `<div class="table-empty" style="padding:24px;">No messages found.</div>`;
            return;
          }

          document.getElementById("msgSearchList").innerHTML = msgs
            .map((m) => {
              const convLabel =
                m.conv_type === "group" ? m.conv_name || "Group" : "Direct";
              return `<div class="search-msg-row ${m.is_flagged ? "flagged" : ""}" data-mid="${m.id}">
              <div class="search-msg-meta">
                <span class="monitor-sender-name">${escapeHtml(m.full_name || m.username)}</span>
                <span class="monitor-sender-handle">@${escapeHtml(m.username)}</span>
                <span class="conv-type-badge ${m.conv_type === "group" ? "group" : ""}">${escapeHtml(convLabel)}</span>
                <span class="monitor-msg-time">${formatDateTime(m.created_at)}</span>
                ${m.is_flagged ? '<span class="flag-indicator">🚩</span>' : ""}
              </div>
              <div class="search-msg-body">${escapeHtml(m.body || "[attachment]").replace(new RegExp("(" + escapeRegex(q) + ")", "gi"), "<mark>$1</mark>")}</div>
              <div class="monitor-msg-actions">
                <button class="monitor-btn view" onclick="viewConvFromFlag(${m.conversation_id})">View Chat</button>
                ${
                  m.is_flagged
                    ? `<button class="monitor-btn unflag" onclick="unflagMessage(${m.id},this)">Remove Flag</button>`
                    : `<button class="monitor-btn flag" onclick="showFlagDialog(${m.id},this)">🚩 Flag</button>`
                }
              </div>
            </div>`;
            })
            .join("");
        } catch (err) {
          showToast("Connection error.");
          console.error(err);
        }
      }

      // ── Helpers ───────────────────────────────────
      function formatDateTime(dt) {
        if (!dt) return "—";
        const d = new Date(dt.replace(" ", "T"));
        return (
          d.toLocaleDateString([], { month: "short", day: "numeric" }) +
          " " +
          d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        );
      }
      function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      }