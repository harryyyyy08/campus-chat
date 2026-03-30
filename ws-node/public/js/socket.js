// ════════════════════════════════════════════
// SOCKET
// ════════════════════════════════════════════

let _indexPersistQueue = [];
let _indexPersistShowing = false;

function queueIndexAnnouncementModal(announcement) {
  if (!announcement) return;
  _indexPersistQueue.push(announcement);
  if (!_indexPersistShowing) showNextIndexAnnouncementModal();
}

function showNextIndexAnnouncementModal() {
  if (_indexPersistQueue.length === 0) {
    _indexPersistShowing = false;
    return;
  }

  const overlay = document.getElementById("annPersistOverlay");
  const titleEl = document.getElementById("annPersistTitle");
  const metaEl = document.getElementById("annPersistMeta");
  const bodyEl = document.getElementById("annPersistBody");
  const okBtn = document.getElementById("annPersistOk");
  const viewBtn = document.getElementById("annPersistView");
  if (!overlay || !titleEl || !metaEl || !bodyEl || !okBtn || !viewBtn) {
    _indexPersistQueue = [];
    _indexPersistShowing = false;
    return;
  }

  _indexPersistShowing = true;
  const a = _indexPersistQueue[0];
  const rawCreatedAt = String(a.created_at || "").replace(" ", "T");
  const createdAt = new Date(rawCreatedAt);
  const metaTime = isNaN(createdAt.getTime())
    ? String(a.created_at || "")
    : createdAt.toLocaleString();

  titleEl.textContent = a.title || "";
  metaEl.textContent = `By ${a.author_name || "Admin"}${metaTime ? ` · ${metaTime}` : ""}`;
  bodyEl.textContent = a.body || "";

  overlay.classList.remove("hidden");
  overlay.removeAttribute("aria-hidden");
  requestAnimationFrame(() => overlay.classList.add("visible"));

  okBtn.onclick = () => closeIndexAnnouncementModal();
  viewBtn.onclick = () => {
    closeIndexAnnouncementModal();
    window.location.href = "announcements.html";
  };
}

function closeIndexAnnouncementModal() {
  const overlay = document.getElementById("annPersistOverlay");
  if (!overlay) {
    _indexPersistQueue.shift();
    _indexPersistShowing = false;
    return;
  }

  overlay.classList.remove("visible");
  setTimeout(() => {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    _indexPersistQueue.shift();
    if (_indexPersistQueue.length > 0) {
      setTimeout(() => showNextIndexAnnouncementModal(), 150);
    } else {
      _indexPersistShowing = false;
    }
  }, 200);
}

window.queueIndexAnnouncementModal = queueIndexAnnouncementModal;

function connectSocket() {
  socket = io(WS_BASE, { auth: { token } });
  socket.on("connect", () => socket.emit("who_is_online"));

  socket.on("new_message", (msg) => {
    // DEBUG: log attachments received
    console.log(
      "[new_message] attachments:",
      msg.attachments?.length,
      msg.attachments,
      "attachment:",
      msg.attachment,
    );
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

  // ── message_reacted ─────────────────────────────────────────
  socket.on(
    "message_reacted",
    ({ message_id, reactions, my_reactions, reactor_id }) => {
      console.log(
        "[message_reacted] reactions:",
        JSON.stringify(reactions),
        "my_reactions:",
        my_reactions,
        "reactor_id:",
        reactor_id,
        "myUserId:",
        myUserId,
      );
      const row = document.querySelector(
        `.msgRow[data-msg-id="${message_id}"]`,
      );
      if (!row) return;

      let finalMyReactions;
      if (reactor_id === myUserId) {
        // I was the one who reacted — use server's response
        finalMyReactions = my_reactions || [];
      } else {
        // Someone else reacted — keep MY existing reactions from dataset
        try {
          finalMyReactions = JSON.parse(row.dataset.myReactions || "[]");
        } catch {
          finalMyReactions = [];
        }
      }

      // ✅ Always update the dataset BEFORE rendering
      row.dataset.myReactions = JSON.stringify(finalMyReactions);
      renderReactions(row, reactions, finalMyReactions);
    },
  );

  // ── message_hidden (delete for me) ───────────────────────────
  socket.on("message_hidden", ({ message_id }) => {
    const row = document.querySelector(`.msgRow[data-msg-id="${message_id}"]`);
    if (!row) return;
    row.style.transition = "opacity 0.25s";
    row.style.opacity = "0";
    setTimeout(() => row.remove(), 260);
  });

  // ── new_announcement ─────────────────────────────────────────
  socket.on("new_announcement", ({ announcement }) => {
    if (!announcement) return;

    const myDept = String(myUser?.department || "").trim();
    const myRole = String(myUser?.role || window.myRole || "student").trim();

    const isForMe =
      announcement.target_type === "all" ||
      (announcement.target_type === "department" &&
        announcement.department === myDept);
    const isAdminUser = ["admin", "super_admin"].includes(myRole);
    if (!isForMe && !isAdminUser) return;

    // Notification sound
    playAnnouncementSound();

    // Toast notification
    showToast("📢 " + announcement.title);

    // Update nav badge
    const badge = document.getElementById("annNavBadge");
    if (badge) {
      const count = (parseInt(badge.textContent) || 0) + 1;
      badge.textContent = count;
      badge.classList.remove("hidden");
    }

    // Show floating popup if element exists (auto-hide after 6s)
    const popup = document.getElementById("annPopup");
    if (popup) {
      const titleEl = document.getElementById("annPopupTitle");
      const authorEl = document.getElementById("annPopupAuthor");
      if (titleEl) titleEl.textContent = announcement.title;
      if (authorEl)
        authorEl.textContent = "By " + (announcement.author_name || "Admin");
      popup.classList.remove("hidden");
      clearTimeout(window._annPopupTimer);
      window._annPopupTimer = setTimeout(
        () => popup.classList.add("hidden"),
        6000,
      );
    }

    // Show persistent modal
    queueIndexAnnouncementModal(announcement);
  });

  // ── message_request_sent (recipient gets notified) ──────────
  socket.on("new_message_request", ({ request_id, from_name }) => {
    loadRequestCount();
    showToast(`New message request from ${from_name}`);
  });

  // ── request_accepted (sender gets notified) ──────────────────
  socket.on("request_accepted", ({ conversation_id }) => {
    socket.emit("join_conversation", { conversation_id });
    loadConversations().then(() => {
      showToast("Your message request was accepted!");
      // If currently viewing this conversation, clear pending banner
      if (currentConversation === conversation_id) {
        showPendingRequestBanner(false);
      }
      // Refresh conversation item to remove Pending badge
      const conv = getConversation(conversation_id);
      if (conv) {
        conv.is_request = false;
        buildConversationItem(conv);
      }
    });
  });

  // ── request_declined (sender gets notified) ──────────────────
  socket.on("request_declined", () => {
    showToast("Your message request was declined.");
  });

  socket.on("connect_error", (err) => {
    const msg = err?.message || String(err);
    if (
      msg.toLowerCase().includes("jwt expired") ||
      msg.toLowerCase().includes("unauthorized") ||
      msg.toLowerCase().includes("token expired")
    ) {
      handleTokenExpired();
    } else {
      showToast("Connection error: " + msg);
    }
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
