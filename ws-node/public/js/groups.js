// ════════════════════════════════════════════
// GROUP CHAT — CREATE
// ════════════════════════════════════════════

function openCreateGroupModal() {
  selectedMembers = [];
  document.getElementById("groupName").value = "";
  document.getElementById("memberSearchInput").value = "";
  document.getElementById("userSearchResults").classList.add("hidden");
  document.getElementById("userSearchResults").innerHTML = "";
  renderSelectedMembers();
  openModal("createGroupModal");
  setTimeout(() => document.getElementById("groupName").focus(), 60);
}

let searchDebounce = null;
async function searchUsers(q) {
  clearTimeout(searchDebounce);
  const resultsEl = document.getElementById("userSearchResults");
  if (!q.trim()) {
    resultsEl.classList.add("hidden");
    return;
  }
  searchDebounce = setTimeout(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/users/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: "Bearer " + token } },
      );
      const data = await res.json();
      const users = (data.users || []).filter(
        (u) => !selectedMembers.find((s) => s.id === u.id),
      );
      resultsEl.innerHTML = users.length
        ? users
            .map(
              (u) =>
                `<div class="search-result-item" onclick="addMemberToGroup(${u.id},'${escapeHtml(u.username)}','${escapeHtml(u.full_name || u.username)}')">${escapeHtml(u.full_name || u.username)} <span class="username-hint">@${escapeHtml(u.username)}</span></div>`,
            )
            .join("")
        : `<div class="search-result-item muted">No users found</div>`;
      resultsEl.classList.remove("hidden");
    } catch {}
  }, 300);
}

function addMemberToGroup(id, username, full_name) {
  if (!selectedMembers.find((m) => m.id === id))
    selectedMembers.push({ id, username, full_name });
  document.getElementById("memberSearchInput").value = "";
  document.getElementById("userSearchResults").classList.add("hidden");
  renderSelectedMembers();
}

function removeMemberFromGroup(id) {
  selectedMembers = selectedMembers.filter((m) => m.id !== id);
  renderSelectedMembers();
}

function renderSelectedMembers() {
  const el = document.getElementById("selectedMembers");
  el.innerHTML = selectedMembers.length
    ? selectedMembers
        .map(
          (m) =>
            `<span class="member-chip">${escapeHtml(m.full_name || m.username)}<button onclick="removeMemberFromGroup(${m.id})">✕</button></span>`,
        )
        .join("")
    : `<span class="muted-hint">No members selected yet</span>`;
}

async function createGroup() {
  const name = document.getElementById("groupName").value.trim();
  if (!name) {
    showToast("Please enter a group name.");
    return;
  }
  if (selectedMembers.length < 1) {
    showToast("Add at least 1 member.");
    return;
  }
  const member_ids = selectedMembers.map((m) => m.id);
  try {
    const res = await fetch(`${API_BASE}/conversations/group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ name, member_ids }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not create group.");
      return;
    }
    closeModal("createGroupModal");
    socket.emit("group_created", {
      conversation_id: data.conversation_id,
      member_ids,
    });
    await loadConversations();
    openConversation(data.conversation_id);
    showToast(`Group "${name}" created!`);
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

// ════════════════════════════════════════════
// GROUP CHAT — INFO / MANAGE
// ════════════════════════════════════════════

function openGroupInfoModal() {
  if (!currentConversation) return;
  renderGroupInfoModal();
  openModal("groupInfoModal");
}

function renderGroupInfoModal() {
  const conv = getConversation(currentConversation);
  if (!conv || conv.type !== "group") return;
  const isAdmin = conv.my_role === "admin";
  document.getElementById("groupInfoTitle").textContent = conv.name || "Group";
  document
    .getElementById("addMemberSection")
    .classList.toggle("hidden", !isAdmin);
  document.getElementById("addMemberInput").value = "";
  document.getElementById("addMemberResults").classList.add("hidden");

  const listEl = document.getElementById("groupMemberList");
  listEl.innerHTML = (conv.members || [])
    .map((m) => {
      const isMe = m.id === myUserId;
      const roleBadge =
        m.role === "admin" ? `<span class="role-badge admin">Admin</span>` : "";
      const removeBtn =
        isAdmin && !isMe
          ? `<button class="member-remove-btn" onclick="removeMember(${m.id})" title="Remove">✕</button>`
          : "";
      return `<div class="group-member-item">
                  <div class="gm-avatar">${escapeHtml(initials(m.full_name || m.username))}</div>
                  <div class="gm-info"><span class="gm-name">${escapeHtml(m.full_name || m.username)}${isMe ? " (you)" : ""}</span>${roleBadge}</div>
                  ${removeBtn}
                </div>`;
    })
    .join("");
}

let addMemberDebounce = null;
async function searchUsersForAdd(q) {
  clearTimeout(addMemberDebounce);
  const resultsEl = document.getElementById("addMemberResults");
  if (!q.trim()) {
    resultsEl.classList.add("hidden");
    return;
  }
  const conv = getConversation(currentConversation);
  const existingIds = conv?.members?.map((m) => m.id) || [];
  addMemberDebounce = setTimeout(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/users/search?q=${encodeURIComponent(q)}`,
        { headers: { Authorization: "Bearer " + token } },
      );
      const data = await res.json();
      const users = (data.users || []).filter(
        (u) => !existingIds.includes(u.id),
      );
      resultsEl.innerHTML = users.length
        ? users
            .map(
              (u) =>
                `<div class="search-result-item" onclick="addMember(${u.id})">${escapeHtml(u.full_name || u.username)} <span class="username-hint">@${escapeHtml(u.username)}</span></div>`,
            )
            .join("")
        : `<div class="search-result-item muted">No users found</div>`;
      resultsEl.classList.remove("hidden");
    } catch {}
  }, 300);
}

async function addMember(userId) {
  document.getElementById("addMemberResults").classList.add("hidden");
  document.getElementById("addMemberInput").value = "";
  try {
    const res = await fetch(`${API_BASE}/conversations/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        conversation_id: currentConversation,
        user_id: userId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not add member.");
      return;
    }
    socket.emit("member_added", {
      conversation_id: currentConversation,
      user_id: userId,
    });
    await loadConversations();
    renderGroupInfoModal();
    showToast("Member added!");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function removeMember(userId) {
  if (!confirm("Remove this member from the group?")) return;
  try {
    const res = await fetch(`${API_BASE}/conversations/members`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        conversation_id: currentConversation,
        user_id: userId,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not remove member.");
      return;
    }
    socket.emit("member_removed", {
      conversation_id: currentConversation,
      user_id: userId,
    });
    await loadConversations();
    renderGroupInfoModal();
    showToast("Member removed.");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}

async function leaveGroup() {
  if (!confirm("Leave this group?")) return;
  const cid = currentConversation;
  try {
    const res = await fetch(`${API_BASE}/conversations/leave`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ conversation_id: cid }),
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Could not leave group.");
      return;
    }
    closeModal("groupInfoModal");
    socket.emit("user_left_group", { conversation_id: cid });
    currentConversation = null;
    document.getElementById("emptyState").style.display = "";
    document.getElementById("chatContent").classList.add("hidden");
    await loadConversations();
    showToast("You left the group.");
  } catch (err) {
    showToast("Connection error.");
    console.error(err);
  }
}