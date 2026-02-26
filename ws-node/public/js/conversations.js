// ════════════════════════════════════════════
// SEND MESSAGE
// ════════════════════════════════════════════

function sendMessage() {
  const input = document.getElementById("messageInput");
  const text = input.value.trim();

  if (!text && !pendingAttachment) return;
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }

  const payload = { conversation_id: currentConversation, body: text };
  if (pendingAttachment)
    payload.attachment_id = pendingAttachment.attachment_id;

  socket.emit("send_message", payload);

  input.value = "";
  input.style.height = "auto";
  clearAttachmentPreview();
  clearTimeout(typingTimer);
  socket.emit("typing", {
    conversation_id: currentConversation,
    is_typing: false,
  });
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

  const dotHtml =
    !isGroup && isOnline ? `<span class="status-dot"></span>` : "";
  const groupBadge = isGroup ? `<span class="group-badge">Group</span>` : "";
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
                    <span class="conv-name">${escapeHtml(title)}${groupBadge}</span>
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

  document.getElementById("messages").innerHTML = "";

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
    (data.messages || []).forEach(renderMessage);
    scrollToBottom();
    socket.emit("mark_seen", { conversation_id: id });
  } catch (err) {
    showToast("Could not load messages.");
    console.error(err);
  }
}