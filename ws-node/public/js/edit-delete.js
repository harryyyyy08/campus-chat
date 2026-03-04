// ════════════════════════════════════════════
// EDIT / DELETE / REACT — Context Menu
// ════════════════════════════════════════════

const EDIT_DELETE_WINDOW_MS = 15 * 60 * 1000;

// ── Attach context menu to a message row ─────────────────────────
function attachMsgContextMenu(row, msg) {
  // Store msg data on the row so it's always fresh when menu opens
  row.dataset.msgId           = msg.id;
  row.dataset.msgSenderId     = msg.sender_id;
  row.dataset.msgConvId       = msg.conversation_id;
  row.dataset.msgBody         = msg.body || "";
  row.dataset.msgCreatedAt    = msg.created_at || "";

  const trigger = (e) => {
    e.preventDefault();
    // Rebuild msg from dataset so it's always current
    const freshMsg = {
      id:              Number(row.dataset.msgId),
      sender_id:       Number(row.dataset.msgSenderId),
      conversation_id: Number(row.dataset.msgConvId),
      body:            row.dataset.msgBody,
      created_at:      row.dataset.msgCreatedAt,
    };
    showMsgContextMenu(e, freshMsg, row);
  };
  row.addEventListener("contextmenu", trigger);

  // ── Hover action buttons (desktop) ──────────────────────────
  // Wire up after a tick so the DOM is ready
  setTimeout(() => {
    const btns = row.querySelectorAll(".msg-hover-btn");
    if (btns.length >= 2) {
      const reactBtn = btns[0];
      const moreBtn  = btns[1];
      reactBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const freshMsg = {
          id: Number(row.dataset.msgId),
          sender_id: Number(row.dataset.msgSenderId),
          conversation_id: Number(row.dataset.msgConvId),
          body: row.dataset.msgBody,
          created_at: row.dataset.msgCreatedAt,
        };
        openEmojiPicker(freshMsg, row);
      });
      moreBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const freshMsg = {
          id: Number(row.dataset.msgId),
          sender_id: Number(row.dataset.msgSenderId),
          conversation_id: Number(row.dataset.msgConvId),
          body: row.dataset.msgBody,
          created_at: row.dataset.msgCreatedAt,
        };
        showMsgContextMenu(
          { preventDefault: () => {}, clientX: e.clientX, clientY: e.clientY },
          freshMsg, row
        );
      });
    }
  }, 0);

  // Long press for mobile
  let pressTimer;
  row.addEventListener("touchstart", (e) => {
    pressTimer = setTimeout(() => {
      trigger({ preventDefault: () => {}, clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }, 500);
  }, { passive: true });
  row.addEventListener("touchend",   () => clearTimeout(pressTimer), { passive: true });
  row.addEventListener("touchmove",  () => clearTimeout(pressTimer), { passive: true });
}

// ── Build & show context menu ────────────────────────────────────
function showMsgContextMenu(e, msg, row) {
  document.querySelector(".msg-ctx-menu")?.remove();

  const isMe = msg.sender_id === myUserId;
  const isDeleted = row.dataset.deleted === "1";
  const createdAt = new Date((msg.created_at || "").replace(" ", "T")).getTime();
  const withinWindow = (Date.now() - createdAt) < EDIT_DELETE_WINDOW_MS;

  const menu = document.createElement("div");
  menu.className = "msg-ctx-menu";

  // React button — always available (unless globally deleted)
  if (!isDeleted) {
    const reactBtn = makeCtxBtn("😊 React", "react", () => {
      menu.remove();
      openEmojiPicker(msg, row);
    });
    menu.appendChild(reactBtn);
  }

  // Edit — only sender, within window, has text body
  if (isMe && !isDeleted && withinWindow && msg.body) {
    const editBtn = makeCtxBtn("✏️ Edit", "edit", () => {
      menu.remove();
      startInlineEdit(msg, row);
    });
    menu.appendChild(editBtn);
  }

  // Delete for everyone — sender only, within window
  if (isMe && !isDeleted && withinWindow) {
    const delBtn = makeCtxBtn("🗑️ Delete for everyone", "delete", () => {
      menu.remove();
      confirmDeleteMessage(msg, row);
    });
    menu.appendChild(delBtn);
  }

  // Delete for me — any message, any time, not globally deleted
  if (!isDeleted) {
    const hideBtn = makeCtxBtn("🚫 Delete for me", "hide", () => {
      menu.remove();
      hideMessageForMe(msg, row);
    });
    menu.appendChild(hideBtn);
  }

  // If no actions (expired window + not mine), show label
  if (menu.children.length === 0) {
    const noOp = document.createElement("div");
    noOp.className = "msg-ctx-noaction";
    noOp.textContent = "No actions available";
    menu.appendChild(noOp);
  }

  positionMenu(menu, e);
  document.body.appendChild(menu);

  // Close on outside click or scroll
  const close = (ev) => {
    if (!menu.contains(ev.target)) { menu.remove(); cleanup(); }
  };
  const cleanup = () => {
    document.removeEventListener("click", close);
    document.removeEventListener("scroll", cleanup, true);
  };
  setTimeout(() => {
    document.addEventListener("click", close);
    document.addEventListener("scroll", cleanup, true);
  }, 0);
}

function makeCtxBtn(label, type, onClick) {
  const btn = document.createElement("button");
  btn.className = `msg-ctx-btn msg-ctx-${type}`;
  btn.innerHTML = label;
  btn.onclick = onClick;
  return btn;
}

function positionMenu(menu, e) {
  const x = e.clientX ?? 0;
  const y = e.clientY ?? 0;
  menu.style.cssText = `position:fixed;z-index:9999;left:${x}px;top:${y}px;`;
  document.body.appendChild(menu);
  requestAnimationFrame(() => {
    const r = menu.getBoundingClientRect();
    if (r.right  > window.innerWidth)  menu.style.left = (x - r.width)  + "px";
    if (r.bottom > window.innerHeight) menu.style.top  = (y - r.height) + "px";
    if (parseFloat(menu.style.left) < 0) menu.style.left = "4px";
    if (parseFloat(menu.style.top)  < 0) menu.style.top  = "4px";
  });
}

// ── Inline Edit ──────────────────────────────────────────────────
function startInlineEdit(msg, row) {
  const bubble = row.querySelector(".bubble");
  if (!bubble) return;
  const originalText = bubble.textContent;
  bubble.style.display = "none";

  const wrap     = document.createElement("div");
  wrap.className = "msg-edit-wrap";
  const textarea = document.createElement("textarea");
  textarea.className = "msg-edit-input";
  textarea.value = originalText;
  textarea.rows  = Math.min(Math.max(1, Math.ceil(originalText.length / 38)), 6);

  const actions  = document.createElement("div");
  actions.className = "msg-edit-actions";

  const saveBtn   = document.createElement("button");
  saveBtn.className = "msg-edit-save";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "msg-edit-cancel";
  cancelBtn.textContent = "Cancel";

  const cancel = () => { wrap.remove(); bubble.style.display = ""; };

  saveBtn.onclick = async () => {
    const newBody = textarea.value.trim();
    if (!newBody || newBody === originalText) { cancel(); return; }
    saveBtn.disabled = true; saveBtn.textContent = "Saving…";
    socket.emit("edit_message", { message_id: msg.id, conversation_id: msg.conversation_id, body: newBody }, (ack) => {
      if (ack?.ok) { wrap.remove(); bubble.style.display = ""; }
      else { showToast(ack?.error || "Edit failed."); saveBtn.disabled = false; saveBtn.textContent = "Save"; }
    });
  };
  cancelBtn.onclick = cancel;
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

// ── Delete for everyone ──────────────────────────────────────────
function confirmDeleteMessage(msg, row) {
  if (!confirm("Delete this message for everyone? This cannot be undone.")) return;
  console.log("[delete] msg_id:", msg.id, "conv_id:", msg.conversation_id);
  socket.emit("delete_message", { message_id: msg.id, conversation_id: msg.conversation_id }, (ack) => {
    console.log("[delete] ack:", ack);
    if (!ack?.ok) showToast(ack?.error || "Delete failed.");
  });
}

// ── Delete for me ────────────────────────────────────────────────
function hideMessageForMe(msg, row) {
  if (!confirm("Remove this message from your view? Others can still see it.")) return;
  socket.emit("hide_message", { message_id: msg.id, conversation_id: msg.conversation_id }, (ack) => {
    if (ack?.ok) {
      row.style.transition = "opacity 0.25s";
      row.style.opacity = "0";
      setTimeout(() => row.remove(), 260);
    } else {
      showToast(ack?.error || "Could not remove message.");
    }
  });
}

// ── Emoji Picker ─────────────────────────────────────────────────
const EMOJI_LIST = [
  "😀","😂","😍","🥰","😎","🤔","😮","😢","😡","🥳",
  "👍","👎","👏","🙌","🤝","🤜","💪","🙏","👀","🫡",
  "❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❤️‍🔥",
  "🔥","⭐","✨","🎉","🎊","🎯","💯","✅","❌","⚡",
  "😴","🤣","😅","😭","🫠","🤯","🥹","😇","🤩","😏",
  "🍕","🍔","🍜","🍣","🍰","🎂","🍫","🧋","☕","🍺",
];

function openEmojiPicker(msg, row) {
  document.querySelector(".emoji-picker-popup")?.remove();

  const picker = document.createElement("div");
  picker.className = "emoji-picker-popup";

  // Search
  const search = document.createElement("input");
  search.className = "emoji-picker-search";
  search.placeholder = "Search emoji…";
  search.type = "text";
  picker.appendChild(search);

  const grid = document.createElement("div");
  grid.className = "emoji-picker-grid";

  const renderEmojis = (list) => {
    grid.innerHTML = "";
    list.forEach(em => {
      const btn = document.createElement("button");
      btn.className = "emoji-btn";
      btn.textContent = em;
      const myReactions = row.dataset.myReactions ? JSON.parse(row.dataset.myReactions) : [];
      if (myReactions.includes(em)) btn.classList.add("reacted");
      btn.onclick = () => {
        picker.remove();
        sendReaction(msg, row, em);
      };
      grid.appendChild(btn);
    });
  };

  renderEmojis(EMOJI_LIST);
  picker.appendChild(grid);

  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) { renderEmojis(EMOJI_LIST); return; }
    // Simple filter by emoji character
    renderEmojis(EMOJI_LIST.filter(e => e.includes(q)));
  });

  // Position near the message row
  const rowRect = row.getBoundingClientRect();
  picker.style.cssText = `position:fixed;z-index:9999;`;
  document.body.appendChild(picker);

  requestAnimationFrame(() => {
    const pr = picker.getBoundingClientRect();
    let top  = rowRect.top - pr.height - 8;
    let left = rowRect.left;
    if (top < 8) top = rowRect.bottom + 8;
    if (left + pr.width > window.innerWidth) left = window.innerWidth - pr.width - 8;
    if (left < 8) left = 8;
    picker.style.top  = top  + "px";
    picker.style.left = left + "px";
    search.focus();
  });

  const close = (ev) => {
    if (!picker.contains(ev.target)) { picker.remove(); cleanup(); }
  };
  const cleanup = () => { document.removeEventListener("click", close); };
  setTimeout(() => document.addEventListener("click", close), 0);
}

async function sendReaction(msg, row, emoji) {
  console.log("[react] msg_id:", msg.id, "conv_id:", msg.conversation_id, "emoji:", emoji);

  // Remove any existing reaction from this user on this message first
  const myReactions = (() => {
    try { return JSON.parse(row.dataset.myReactions || "[]"); } catch { return []; }
  })();

  // If clicking same emoji = toggle off, different emoji = remove old then add new
  const removePromises = myReactions
    .filter(existing => existing !== emoji)
    .map(existing => new Promise(resolve => {
      socket.emit("react_message", {
        message_id: msg.id,
        conversation_id: msg.conversation_id,
        emoji: existing,
      }, resolve);
    }));

  if (removePromises.length > 0) await Promise.all(removePromises);

  // Now add the new reaction (or toggle off if same emoji clicked)
  socket.emit("react_message", {
    message_id: msg.id,
    conversation_id: msg.conversation_id,
    emoji,
  }, (ack) => {
    console.log("[react] ack:", ack);
    if (!ack?.ok) showToast(ack?.error || "React failed.");
  });
}

// ── Render reactions bar on a message row ────────────────────────
function renderReactions(row, reactions, myReactions) {
  let bar = row.querySelector(".msg-reactions");
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "msg-reactions";
    // Insert BEFORE meta (timestamp) — right below the bubble
    const meta = row.querySelector(".meta");
    if (meta) meta.before(bar);
    else {
      const msgBody = row.querySelector(".msg-body");
      if (msgBody) msgBody.appendChild(bar);
    }
  }
  if (!reactions || reactions.length === 0) { bar.remove(); return; }
  bar.innerHTML = "";
  reactions.forEach(({ emoji, count }) => {
    const pill = document.createElement("span");
    const isMine = myReactions?.includes(emoji);
    pill.className = "reaction-pill" + (isMine ? " my-reaction" : "");
    pill.textContent = `${emoji} ${count}`;
    pill.title = `${count} reaction${count > 1 ? "s" : ""}`;
    bar.appendChild(pill);
  });
  // Store for emoji picker toggle state
  row.dataset.myReactions = JSON.stringify(myReactions || []);
}

// ── Mobile back / scroll helpers ─────────────────────────────────
function closeChatMobile() {
  document.getElementById("app").classList.remove("chat-open");
  currentConversation = null;
  document.getElementById("chatContent").classList.add("hidden");
  document.getElementById("emptyState").style.display = "";
}

window.addEventListener("popstate", () => {
  if (window.innerWidth > 900) return;
  if (document.getElementById("app").classList.contains("chat-open")) {
    closeChatMobile();
    history.pushState(null, "");
  }
});

window.addEventListener("load", () => {
  history.replaceState({ chatOpen: false }, "");
  initScrollArrow();
});

function scrollToBottom(smooth = false) {
  const c = document.getElementById("messages");
  c.scrollTo({ top: c.scrollHeight, behavior: smooth ? "smooth" : "instant" });
}

function updateTypingIndicator(username) {
  const line = document.getElementById("typingLine");
  line.innerHTML = username
    ? `<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span> <span style="font-size:11px;color:var(--text-muted)">${escapeHtml(username)} is typing…</span>`
    : "";
}

// ── Scroll-to-bottom arrow ────────────────────────────────────────
function initScrollArrow() {
  const messagesEl = document.getElementById("messages");
  if (!messagesEl) return;

  // Create arrow button
  const arrow = document.createElement("button");
  arrow.id = "scrollArrowBtn";
  arrow.className = "scroll-arrow-btn hidden";
  arrow.innerHTML = `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" 
     stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <polyline points="6 9 12 15 18 9"/>
</svg>`;
  arrow.title = "Scroll to latest";
  arrow.onclick = () => scrollToBottom(true);

  const chatEl = document.getElementById("chat");
  if (chatEl) chatEl.appendChild(arrow);

  messagesEl.addEventListener("scroll", () => {
    const distFromBottom = messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight;
    if (distFromBottom > 150) {
      arrow.classList.remove("hidden");
    } else {
      arrow.classList.add("hidden");
    }
  });
}