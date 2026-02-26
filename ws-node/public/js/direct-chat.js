// ════════════════════════════════════════════
// DIRECT CHAT
// ════════════════════════════════════════════

function openNewChatModal() {
  document.getElementById("newChatUsername").value = "";
  const resultsEl = document.getElementById("directSearchResults");
  if (resultsEl) { resultsEl.innerHTML = ""; resultsEl.classList.add("hidden"); }
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
          `<div class="search-result-item" onclick="selectDirectUser('${escapeHtml(u.username)}','${escapeHtml(u.full_name || u.username)}')">
            <span>${escapeHtml(u.full_name || u.username)}</span>
            <span class="username-hint">@${escapeHtml(u.username)}</span>
          </div>`
        ).join("")
      : `<div class="search-result-item muted">No users found</div>`;
  } catch (err) {
    console.error("Direct search error:", err);
  }
}

function selectDirectUser(username, fullName) {
  document.getElementById("newChatUsername").value = username;
  const resultsEl = document.getElementById("directSearchResults");
  if (resultsEl) { resultsEl.innerHTML = ""; resultsEl.classList.add("hidden"); }
}

async function startChat() {
  const username = document.getElementById("newChatUsername").value.trim();
  if (!username) {
    showToast("Please enter a username.");
    return;
  }
  closeModal("newChatModal");
  try {
    const res = await fetch(`${API_BASE}/conversations/direct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ other_username: username }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not start chat.");
      return;
    }
    socket.emit("join_conversation", { conversation_id: data.conversation_id });
    await loadConversations();
    openConversation(data.conversation_id);
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function quickChat(username) {
  document.getElementById("newChatUsername").value = username;
  await startChat();
}