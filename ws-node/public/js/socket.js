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
  socket.on("message_edited", ({ message_id, conversation_id, body, is_edited, edited_at }) => {
    const row = document.querySelector(`.msgRow[data-msg-id="${message_id}"]`);
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
  });

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