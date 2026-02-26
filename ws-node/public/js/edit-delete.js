// ════════════════════════════════════════════
// EDIT / DELETE — Context Menu
// ════════════════════════════════════════════

const EDIT_DELETE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function attachMsgContextMenu(row, msg) {
  const trigger = (e) => {
    e.preventDefault();
    if (row.dataset.deleted === "1") return;
    const createdAt = new Date(msg.created_at.replace(" ", "T")).getTime();
    const withinWindow = (Date.now() - createdAt) < EDIT_DELETE_WINDOW_MS;
    showMsgContextMenu(e, msg, row, withinWindow);
  };
  row.addEventListener("contextmenu", trigger);
  // Long press for mobile
  let pressTimer;
  row.addEventListener("touchstart", () => {
    pressTimer = setTimeout(() => trigger({ preventDefault: () => {}, clientX: 0, clientY: 0, touches: [{ clientX: 0, clientY: 0 }] }), 500);
  }, { passive: true });
  row.addEventListener("touchend", () => clearTimeout(pressTimer), { passive: true });
}

function showMsgContextMenu(e, msg, row, withinWindow) {
  // Remove any existing menu
  document.querySelector(".msg-context-menu")?.remove();

  const menu = document.createElement("div");
  menu.className = "msg-context-menu";

  if (withinWindow && msg.body && !msg.is_deleted) {
    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️ Edit";
    editBtn.onclick = () => { menu.remove(); startInlineEdit(msg, row); };
    menu.appendChild(editBtn);
  }

  if (withinWindow && !msg.is_deleted) {
    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️ Delete";
    delBtn.className = "danger";
    delBtn.onclick = () => { menu.remove(); confirmDeleteMessage(msg, row); };
    menu.appendChild(delBtn);
  }

  if (menu.children.length === 0) {
    const noOp = document.createElement("div");
    noOp.className = "msg-context-noaction";
    noOp.textContent = "Edit/delete window has expired";
    menu.appendChild(noOp);
  }

  // Position near click/touch
  const x = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const y = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  menu.style.cssText = `position:fixed;z-index:9999;left:${x}px;top:${y}px;`;
  document.body.appendChild(menu);

  // Adjust if off-screen
  const rect = menu.getBoundingClientRect();
  if (rect.right > window.innerWidth) menu.style.left = (x - rect.width) + "px";
  if (rect.bottom > window.innerHeight) menu.style.top = (y - rect.height) + "px";

  // Close on outside click
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", close); } };
  setTimeout(() => document.addEventListener("click", close), 0);
}

function startInlineEdit(msg, row) {
  const bubble = row.querySelector(".bubble");
  if (!bubble) return;
  const originalText = bubble.textContent;

  bubble.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "msg-edit-wrap";

  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-input";
  textarea.value = originalText;
  textarea.rows = Math.max(1, Math.ceil(originalText.length / 40));

  const actions = document.createElement("div");
  actions.className = "msg-edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.className = "msg-edit-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "msg-edit-cancel";
  cancelBtn.textContent = "Cancel";

  const cancel = () => {
    wrap.remove();
    bubble.style.display = "";
  };

  saveBtn.onclick = async () => {
    const newBody = textarea.value.trim();
    if (!newBody || newBody === originalText) { cancel(); return; }
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving…";

    socket.emit("edit_message", {
      message_id: msg.id,
      conversation_id: msg.conversation_id,
      body: newBody,
    }, (ack) => {
      if (ack?.ok) {
        // UI update handled by message_edited socket event
        wrap.remove();
        bubble.style.display = "";
      } else {
        showToast(ack?.error || "Edit failed.");
        saveBtn.disabled = false;
        saveBtn.textContent = "Save";
      }
    });
  };

  cancelBtn.onclick = cancel;

  // Ctrl+Enter to save, Escape to cancel
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveBtn.click(); }
    if (e.key === "Escape") cancel();
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  wrap.appendChild(textarea);
  wrap.appendChild(actions);
  bubble.after(wrap);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

function confirmDeleteMessage(msg, row) {
  if (!confirm("Delete this message? This cannot be undone.")) return;
  socket.emit("delete_message", {
    message_id: msg.id,
    conversation_id: msg.conversation_id,
  }, (ack) => {
    if (!ack?.ok) showToast(ack?.error || "Delete failed.");
    // UI update handled by message_deleted socket event
  });
}

// Mobile: go back to conversation list
function closeChatMobile() {
  document.getElementById("app").classList.remove("chat-open");
  currentConversation = null;
  document.getElementById("chatContent").classList.add("hidden");
  document.getElementById("emptyState").style.display = "";
}

// Handle phone back button — intercept popstate so app doesn't close
window.addEventListener("popstate", (e) => {
  if (window.innerWidth > 900) return; // desktop lang, ignore
  // If a chat was open, close it instead of navigating away
  const appEl = document.getElementById("app");
  if (appEl.classList.contains("chat-open")) {
    closeChatMobile();
    // Push a neutral state again so back button always works consistently
    history.pushState(null, "");
  }
});

// On first load, push an initial state so popstate fires on first back press
window.addEventListener("load", () => {
  if (window.innerWidth <= 900) {
    history.replaceState({ chatOpen: false }, "");
  }
});

function scrollToBottom() {
  const c = document.getElementById("messages");
  c.scrollTop = c.scrollHeight;
}
function updateTypingIndicator(username) {
  const line = document.getElementById("typingLine");
  line.innerHTML = username
    ? `<div class="typing-dots"><span></span><span></span><span></span></div><span>${escapeHtml(username)} is typing…</span>`
    : "";
}