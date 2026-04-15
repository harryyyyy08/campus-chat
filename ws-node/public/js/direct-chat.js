// ════════════════════════════════════════════
// DIRECT CHAT
// ════════════════════════════════════════════

function openNewChatModal() {
  document.getElementById("newChatUsername").value = "";
  document.getElementById("newChatFirstMsg").value = "";
  const resultsEl = document.getElementById("directSearchResults");
  if (resultsEl) { resultsEl.innerHTML = ""; resultsEl.classList.add("hidden"); }
  document.getElementById("newChatNormalRow").classList.remove("hidden");
  document.getElementById("newChatRequestRow").classList.add("hidden");
  const sel = document.getElementById("newChatSelectedUser");
  sel.dataset.username = ""; sel.dataset.role = ""; sel.textContent = "";
  openModal("newChatModal");
  setTimeout(() => document.getElementById("newChatUsername").focus(), 60);
}

async function searchUsersForDirect(q) {
  const resultsEl = document.getElementById("directSearchResults");
  if (!resultsEl) return;
  q = q.trim();
  if (q.length < 1) { resultsEl.innerHTML = ""; resultsEl.classList.add("hidden"); return; }
  try {
    const res = await fetch(`${API_BASE}/users/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    const users = data.users || [];
    resultsEl.classList.remove("hidden");
    resultsEl.innerHTML = users.length
      ? users.map(u =>
          `<div class="search-result-item" onclick="selectDirectUser('${escapeHtml(u.username)}','${escapeHtml(u.full_name || u.username)}','${escapeHtml(u.role || "student")}')">
            <span>${escapeHtml(u.full_name || u.username)}</span>
            <span class="username-hint">@${escapeHtml(u.username)}</span>
          </div>`).join("")
      : `<div class="search-result-item muted">No users found</div>`;
  } catch (err) { console.error("Direct search error:", err); }
}

function selectDirectUser(username, fullName, role) {
  document.getElementById("newChatUsername").value = username;
  const resultsEl = document.getElementById("directSearchResults");
  if (resultsEl) { resultsEl.innerHTML = ""; resultsEl.classList.add("hidden"); }

  const myRole = window.myRole || "student";
  const needsRequest = myRole === "student" && role === "student";
  const sel = document.getElementById("newChatSelectedUser");
  sel.dataset.username = username;
  sel.dataset.role = role;

  if (needsRequest) {
    // Check if existing conversation (accepted OR pending sent by me)
    const existing = conversationsCache.find(conv => {
      if (conv.type !== "direct") return false;
      const other = conv.members?.find(m => m.id !== myUserId);
      if (other?.username !== username) return false;
      // Include if: normal conversation, OR pending request I sent
      return !conv.is_request || conv.requester_id === myUserId;
    });
    if (existing) {
      closeModal("newChatModal");
      if (existing.is_request) {
        // Already sent a request — show toast and open the pending conversation
        showToast("Request already sent. Waiting for acceptance.");
      }
      openConversation(existing.conversation_id);
      return;
    }
    document.getElementById("newChatNormalRow").classList.add("hidden");
    document.getElementById("newChatRequestRow").classList.remove("hidden");
    sel.textContent = fullName + " (@" + username + ")";
    setTimeout(() => document.getElementById("newChatFirstMsg").focus(), 60);
  } else {
    document.getElementById("newChatNormalRow").classList.remove("hidden");
    document.getElementById("newChatRequestRow").classList.add("hidden");
  }
}

async function startChat() {
  const username = document.getElementById("newChatUsername").value.trim();
  if (!username) { showToast("Please enter a username."); return; }

  const requestRowVisible = !document.getElementById("newChatRequestRow").classList.contains("hidden");

  if (requestRowVisible) {
    const firstMsg = document.getElementById("newChatFirstMsg").value.trim();
    if (!firstMsg) { showToast("Write a message to send with your request."); return; }
    await sendMessageRequest(username, firstMsg);
    return;
  }

  closeModal("newChatModal");
  try {
    const res = await fetch(`${API_BASE}/conversations/direct`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ other_username: username }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Could not start chat."); return; }
    // Un-hide if conversation was previously deleted for me
    if (!data.created) {
      await fetch(`${API_BASE}/conversations/${data.conversation_id}/hidden`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      }).catch(() => {});
    }
    socket.emit("join_conversation", { conversation_id: data.conversation_id });
    await loadConversations();
    openConversation(data.conversation_id);
  } catch (err) { showToast("Connection error."); console.error(err); }
}

async function sendMessageRequest(username, firstMsg) {
  try {
    const res = await fetch(`${API_BASE}/conversations/request`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ other_username: username, body: firstMsg }),
    });
    const data = await res.json();
    if (res.status === 409 && data.conversation_id) {
      closeModal("newChatModal");
      // Un-hide the existing conversation in case it was deleted for me
      await fetch(`${API_BASE}/conversations/${data.conversation_id}/hidden`, {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token },
      }).catch(() => {});
      await loadConversations();
      openConversation(data.conversation_id);
      return;
    }
    if (!res.ok) { showToast(data.error || "Could not send request."); return; }
    closeModal("newChatModal");
    socket.emit("message_request_sent", {
      conversation_id: data.conversation_id,
      request_id: data.request_id,
      recipient_id: data.recipient_id,
    });
    await loadConversations();
    openConversation(data.conversation_id);
    showToast("Message request sent!");
  } catch (err) { showToast("Connection error."); console.error(err); }
}

async function quickChat(username) {
  document.getElementById("newChatUsername").value = username;
  const myRole = window.myRole || "student";
  // For quickChat from online strip, just go direct if not student-to-student
  await startChat();
}