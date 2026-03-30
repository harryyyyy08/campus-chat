// ════════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════════

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text  = input.value.trim();
  const atts  = (typeof pendingAttachments !== "undefined" ? pendingAttachments : null) || [];

  if (!text && !atts.length) return;
  if (!currentConversation) { showToast("Select a conversation first."); return; }

  // Wait for any still-uploading items (no attachment_id yet)
  const uploading = atts.filter(a => !a.attachment_id);
  if (uploading.length) { showToast("Please wait — files are still uploading."); return; }

  const payload = { conversation_id: currentConversation, body: text };
  if (atts.length === 1) {
    payload.attachment_id  = atts[0].attachment_id;
    payload.attachment_ids = [atts[0].attachment_id];
  } else if (atts.length > 1) {
    payload.attachment_ids = atts.map(a => a.attachment_id);
    payload.attachment_id  = payload.attachment_ids[0];
  }
  // Pass metadata (duration for voice) so server can relay to recipients
  if (atts.length > 0) {
    payload.attachments_meta = atts.map(a => ({ duration: a.duration || 0 }));
  }

  // Clear state BEFORE emitting — prevents double-send on fast clicks
  input.value = "";
  input.style.height = "auto";
  clearAttachmentPreview();
  clearTimeout(typingTimer);
  socket.emit("typing", { conversation_id: currentConversation, is_typing: false });

  console.log("[sendMessage] payload:", JSON.stringify(payload));
  socket.emit("send_message", payload);
}

// ════════════════════════════════════════════
// UNREAD
// ════════════════════════════════════════════

async function loadUnreadCounts() {
  try {
    const res = await fetch(`${API_BASE}/conversations/unread`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (res.ok) unreadCounts = data.unread || {};
  } catch {}
}

// ════════════════════════════════════════════
// CONVERSATIONS
// ════════════════════════════════════════════

async function loadConversations() {
  try {
    const res = await fetch(`${API_BASE}/conversations`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load conversations.");
      return;
    }
    conversationsCache = data.conversations || [];
    renderConversationList();
    renderOnlineStrip();
  } catch (err) {
    showToast("Could not load conversations.");
    console.error(err);
  }
}

function renderConversationList() {
  document.getElementById("conversationList").innerHTML = "";
  conversationsCache.forEach((conv) => buildConversationItem(conv));
}

function buildConversationItem(conv) {
  const list = document.getElementById("conversationList");
  // Pending request conversations: only show for sender (requester)
  // Hide from recipient (they see it in Requests inbox instead)
  if (conv.is_request) {
    if (conv.requester_id !== myUserId) return; // recipient — don't show in main list
  }
  const isGroup = conv.type === "group";
  const title = isGroup
    ? conv.name || "Group"
    : (() => {
        const o = conv.members?.find((m) => m.id !== myUserId);
        return (
          o?.full_name || o?.username || "Conversation " + conv.conversation_id
        );
      })();
  const other = !isGroup ? conv.members?.find((m) => m.id !== myUserId) : null;
  const isOnline = other ? onlineSet.has(other.id) : false;

  const last = conv.last_message;
  let preview = last?.body || "No messages yet";
  if (last?.has_attachment && !preview) preview = "📎 Attachment";
  if (last?.has_attachment && preview) preview = "📎 " + preview;

  const lastTime = last?.created_at || null;
  const lastStatus = last?.status || null;
  const isMine = last?.sender_id === myUserId;
  const unread = unreadCounts[conv.conversation_id] || 0;

  const isPendingRequest = conv.is_request && conv.requester_id === myUserId;
  const dotHtml =
    !isGroup && isOnline ? `<span class="status-dot"></span>` : "";
  const groupBadge = isGroup ? `<span class="group-badge">Group</span>` : "";
  const pendingBadge = isPendingRequest ? `<span class="pending-badge">Pending</span>` : "";
  const badgeHtml =
    unread > 0 ? `<span class="unread-badge">${unread}</span>` : "";
  const statusHtml =
    isMine && lastStatus && !isGroup ? statusIcon(lastStatus) : "";

  let el = document.getElementById("conv-" + conv.conversation_id);
  if (!el) {
    el = document.createElement("div");
    el.id = "conv-" + conv.conversation_id;
    el.className = "conversation";
    el.dataset.type = conv.type || "direct";
    el.dataset.cid = conv.conversation_id;
    el.onclick = () => openConversation(conv.conversation_id);
    list.appendChild(el);
  }

  el.innerHTML = `
                <div class="conv-avatar ${isGroup ? "group" : ""}">${isGroup ? "👥" : escapeHtml(initials(title))}${dotHtml}</div>
                <div class="conv-info">
                  <div class="conv-name-row">
                    <span class="conv-name">${escapeHtml(title)}${groupBadge}${pendingBadge}</span>
                    <span class="conv-time">${formatTimeShort(lastTime)}</span>
                  </div>
                  <div class="conv-preview">
                    <span class="conv-preview-text">${statusHtml}${escapeHtml(preview)}</span>
                    ${badgeHtml}
                  </div>
                </div>`;
}

function refreshConversationItem(conversationId, latestMsg) {
  const conv = conversationsCache.find(
    (c) => c.conversation_id === conversationId,
  );
  if (!conv) return;
  if (latestMsg) conv.last_message = latestMsg;
  buildConversationItem(conv);
}

function renderConversationListOnline() {
  conversationsCache.forEach((c) => buildConversationItem(c));
}

function switchTab(btn, tab) {
  document
    .querySelectorAll(".tab-btn")
    .forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".conversation").forEach((el) => {
    el.style.display =
      tab === "all" || (el.dataset.type || "direct") === tab ? "" : "none";
  });
}

function filterConversations(q) {
  q = q.toLowerCase();
  document.querySelectorAll(".conversation").forEach((el) => {
    const name =
      el.querySelector(".conv-name")?.textContent.toLowerCase() || "";
    el.style.display = name.includes(q) ? "" : "none";
  });
}

function renderOnlineStrip() {
  const strip = document.getElementById("onlineStrip");
  const list = [];
  conversationsCache.forEach((conv) => {
    if (conv.type === "group") return;
    const o = conv.members?.find((m) => m.id !== myUserId);
    if (o && onlineSet.has(o.id) && !list.find((u) => u.id === o.id))
      list.push(o);
  });
  if (!list.length) {
    strip.innerHTML = `<span style="font-size:12px;color:var(--text-muted)">No one online</span>`;
    return;
  }
  strip.innerHTML = list
    .map((u) => {
      const name = u.full_name || u.username;
      return `<div class="online-avatar" title="${escapeHtml(name)}" onclick="quickChat('${escapeHtml(u.username)}')">
                  <div class="online-avatar-img"><div class="avatar-circle">${escapeHtml(initials(name))}</div><span class="status-dot"></span></div>
                  <div class="online-name">${escapeHtml(name.split(" ")[0])}</div>
                </div>`;
    })
    .join("");
}

function setActiveConversationUI(id) {
  document
    .querySelectorAll(".conversation")
    .forEach((el) =>
      el.classList.toggle("active", Number(el.dataset.cid) === Number(id)),
    );
}

function getConversation(id) {
  return conversationsCache.find((c) => c.conversation_id === id);
}
function conversationTitle(id) {
  const conv = getConversation(id);
  if (!conv) return "Conversation " + id;
  if (conv.type === "group") return conv.name || "Group";
  const o = conv.members?.find((m) => m.id !== myUserId);
  return o?.full_name || o?.username || "Conversation " + id;
}
function conversationOtherUser(id) {
  const c = getConversation(id);
  return c?.members?.find((m) => m.id !== myUserId) || null;
}

function updateChatHeaderStatus() {
  if (!currentConversation) return;
  const conv = getConversation(currentConversation);
  if (!conv || conv.type === "group") return;
  const other = conversationOtherUser(currentConversation);
  if (!other) return;
  const online = onlineSet.has(other.id);
  const el = document.getElementById("chatHeaderStatus");
  el.textContent = online ? "● Online" : "Offline";
  el.className = online ? "online" : "";
}

// ════════════════════════════════════════════
// OPEN CONVERSATION
// ════════════════════════════════════════════


function showPendingRequestBanner(show) {
  let banner = document.getElementById("pendingRequestBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "pendingRequestBanner";
    banner.className = "pending-request-banner hidden";
    banner.innerHTML = `<span>⏳ Waiting for the other person to accept your message request.</span>`;
    const messages = document.getElementById("messages");
    messages?.parentNode?.insertBefore(banner, messages);
  }
  banner.classList.toggle("hidden", !show);
}

async function openConversation(id) {
  currentConversation = id;
  unreadCounts[id] = 0;
  // Mobile: show chat pane, hide sidebar + push history state
  if (window.innerWidth <= 900) {
    document.getElementById("app").classList.add("chat-open");
    // Push a state so the phone's back button triggers popstate instead of closing the app
    history.pushState({ chatOpen: true, conversationId: id }, "");
  }
  clearAttachmentPreview();
  refreshConversationItem(id);
  setActiveConversationUI(id);
  updateTypingIndicator(null);

  document.getElementById("emptyState").style.display = "none";
  const content = document.getElementById("chatContent");
  content.classList.remove("hidden");
  content.style.cssText =
    "display:flex;flex-direction:column;flex:1;min-height:0;";

  const conv = getConversation(id);
  // Show/hide pending request banner
  if (conv?.is_request && conv.requester_id === myUserId) {
    showPendingRequestBanner(true);
  } else {
    showPendingRequestBanner(false);
  }
  const isGroup = conv?.type === "group";
  const title = conversationTitle(id);
  const other = !isGroup ? conversationOtherUser(id) : null;
  const online = other ? onlineSet.has(other.id) : false;

  document.getElementById("chatHeaderAvatar").textContent = isGroup
    ? "👥"
    : initials(title);
  document.getElementById("chatHeaderName").textContent = title;
  const statusEl = document.getElementById("chatHeaderStatus");
  if (isGroup) {
    statusEl.textContent = `${conv?.members?.length || 0} members`;
    statusEl.className = "";
  } else {
    statusEl.textContent = online ? "● Online" : "Offline";
    statusEl.className = online ? "online" : "";
  }
  document.getElementById("groupInfoBtn").classList.toggle("hidden", !isGroup);

  // Fully wipe messages DOM — prevents stale messages from previous session/user
  const messagesEl = document.getElementById("messages");
  messagesEl.innerHTML = "";

  try {
    const res = await fetch(
      `${API_BASE}/messages?conversation_id=${id}&limit=50`,
      { headers: { Authorization: "Bearer " + token } },
    );
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || "Failed to load messages.");
      return;
    }
    // Safety check: only render if we're still viewing the same conversation
    if (currentConversation !== id) return;
    (data.messages || []).forEach(renderMessage);
    scrollToBottom();
    socket.emit("mark_seen", { conversation_id: id });
  } catch (err) {
    showToast("Could not load messages.");
    console.error(err);
  }
}

// ════════════════════════════════════════════
// MESSAGE REQUESTS INBOX
// ════════════════════════════════════════════

let requestsCache = [];

async function loadRequestCount() {
  try {
    const res = await fetch(`${API_BASE}/conversations/requests/count`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    const count = data.count || 0;
    const badge = document.getElementById("requestBadge");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("hidden", count === 0);
    }
  } catch {}
}

async function openRequestsInbox() {
  try {
    const res = await fetch(`${API_BASE}/conversations/requests`, {
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    requestsCache = data.requests || [];
  } catch {
    requestsCache = [];
  }
  renderRequestsModal();
  openModal("requestsModal");
}

function renderRequestsModal() {
  const list = document.getElementById("requestsList");
  if (!requestsCache.length) {
    list.innerHTML = '<div class="requests-empty">No pending message requests</div>';
    return;
  }
  list.innerHTML = requestsCache.map(r => `
    <div class="request-card" id="req-${r.request_id}">
      <div class="request-avatar">${escapeHtml(initials(r.full_name || r.username))}</div>
      <div class="request-info">
        <div class="request-name">${escapeHtml(r.full_name || r.username)}</div>
        <div class="request-handle">@${escapeHtml(r.username)}</div>
        <div class="request-preview">${escapeHtml(r.preview_message || "")}</div>
        <div class="request-time">${formatTimeShort(r.created_at)}</div>
      </div>
      <div class="request-actions">
        <button class="request-btn accept" onclick="acceptRequest(${r.request_id}, ${r.conversation_id})">Accept</button>
        <button class="request-btn decline" onclick="declineRequest(${r.request_id})">Delete</button>
      </div>
    </div>
  `).join("");
}

async function acceptRequest(reqId, convId) {
  try {
    const res = await fetch(`${API_BASE}/conversations/requests/${reqId}/accept`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed"); return; }
    requestsCache = requestsCache.filter(r => r.request_id !== reqId);
    renderRequestsModal();
    loadRequestCount();
    socket.emit("request_accepted", { conversation_id: convId, requester_id: data.requester_id });
    await loadConversations();
    closeModal("requestsModal");
    openConversation(convId);
  } catch { showToast("Connection error."); }
}

async function declineRequest(reqId) {
  try {
    const res = await fetch(`${API_BASE}/conversations/requests/${reqId}/decline`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed"); return; }
    socket.emit("request_declined", {
      requester_id: data.requester_id,
      conversation_id: data.conversation_id,
    });
    requestsCache = requestsCache.filter(r => r.request_id !== reqId);
    renderRequestsModal();
    loadRequestCount();
  } catch { showToast("Connection error."); }
}