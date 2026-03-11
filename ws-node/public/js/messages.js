// ════════════════════════════════════════════
// RENDER MESSAGE
// ════════════════════════════════════════════

function renderMessage(msg) {
  const container = document.getElementById("messages");
  const isMe = msg.sender_id === myUserId;
  const conv = getConversation(msg.conversation_id);
  const isGroup = conv?.type === "group";
  const sender = conv?.members?.find((m) => m.id === msg.sender_id);
  const senderName = sender?.full_name || sender?.username || "Unknown";

  // System messages
  if (msg.body?.startsWith("[") && msg.body?.endsWith("]")) {
    const sys = document.createElement("div");
    sys.className = "system-msg";
    sys.textContent = `${senderName} ${msg.body.slice(1, -1)}`;
    container.appendChild(sys);
    scrollToBottom();
    return;
  }

  const row = document.createElement("div");
  row.className = "msgRow " + (isMe ? "me" : "them");
  row.dataset.msgId = msg.id;

  const avatarHtml = isMe
    ? ""
    : `<div class="msg-avatar">${escapeHtml(initials(senderName))}</div>`;
  const senderLabel =
    !isMe && isGroup
      ? `<div class="msg-sender">${escapeHtml(senderName)}</div>`
      : "";
  const statusHtml = isMe ? statusIcon(msg.status || "sent") : "";

  // Build attachment HTML — supports multiple attachments + video
  let attachHtml = "";
  const attachList = msg.attachments?.length ? msg.attachments
                   : msg.attachment          ? [msg.attachment]
                   : [];

  if (attachList.length > 0) {
    const isAudio = (a) => a.is_voice || a.mime_type?.startsWith("audio/");
    const voices  = attachList.filter(a => isAudio(a));
    const images  = attachList.filter(a => !isAudio(a) && isImageMime(a.mime_type));
    const videos  = attachList.filter(a => !isAudio(a) && (a.is_video || a.mime_type?.startsWith("video/")));
    const docs    = attachList.filter(a => !isAudio(a) && !isImageMime(a.mime_type) && !a.is_video && !a.mime_type?.startsWith("video/"));

    // Voice message players — Messenger style
    voices.forEach(att => {
      const bars = Array.from({length: 30}, (_, i) => {
        const h = 20 + Math.abs(Math.sin(i * 0.8 + att.id * 0.3) * 55) | 0;
        return `<span class="voice-bar" style="height:${h}%"></span>`;
      }).join("");
      const dur = att.duration || 0;
      attachHtml += `
        <div class="voice-player" data-att-id="${att.id}" data-audio-src="${escapeHtml(att.url)}" data-duration="${dur}">
          <button class="voice-play-btn" title="Play"></button>
          <div class="voice-player-body">
            <div class="voice-wave-wrap">${bars}</div>
            <span class="voice-time">${formatAudioTime ? formatAudioTime(dur) : "0:00"}</span>
          </div>
        </div>`;
    });

    // Image grid
    if (images.length > 0) {
      const gridClass = images.length === 1 ? "attach-grid single"
                      : images.length === 2 ? "attach-grid two"
                      : images.length === 3 ? "attach-grid three"
                      : "attach-grid four";
      const imgItems = images.map(att => `
        <div class="attach-image-wrap" data-imgurl="${escapeHtml(att.url)}" data-imgname="${escapeHtml(att.original_name)}">
          <img class="attach-image" src="" alt="${escapeHtml(att.original_name)}" data-protected="${escapeHtml(att.url)}" />
          <div class="attach-img-loading"><div class="img-spinner"></div></div>
          <div class="attach-image-overlay">🔍</div>
        </div>`).join("");
      attachHtml += `<div class="${gridClass}">${imgItems}</div>`;
    }

    // Video player
    videos.forEach(att => {
      attachHtml += `
        <div class="attach-video-wrap">
          <video class="attach-video" controls preload="metadata"
                 data-src="${escapeHtml(att.url)}"
                 data-protected="${escapeHtml(att.url)}">
            Your browser does not support video.
          </video>
          <div class="attach-video-name">${escapeHtml(att.original_name)} · ${formatBytes(att.file_size)}</div>
        </div>`;
    });

    // Docs
    docs.forEach(att => {
      const icon = fileIcon(att.mime_type);
      attachHtml += `
        <div class="attach-doc" onclick="downloadProtectedFile('${escapeHtml(att.url)}','${escapeHtml(att.original_name)}')" style="cursor:pointer;">
          <span class="attach-doc-icon">${icon}</span>
          <div class="attach-doc-info">
            <div class="attach-doc-name">${escapeHtml(att.original_name)}</div>
            <div class="attach-doc-size">${formatBytes(att.file_size)}</div>
          </div>
          <span class="attach-doc-dl">⬇</span>
        </div>`;
    });
  }

  // Body text (may be empty if attachment-only)
  const bodyHtml = msg.body
    ? `<div class="bubble">${escapeHtml(msg.body)}</div>`
    : "";

  // ── Date separator — insert BEFORE the message row ──
  const msgDate = new Date((msg.created_at || "").replace(" ", "T"));
  const msgDateStr = msgDate.toDateString();
  // ✅ BAGO
  const allSeparators = container.querySelectorAll(".date-separator");
  const lastSeparator = allSeparators[allSeparators.length - 1];
  const lastSepDate = lastSeparator?.dataset.date;

  if (lastSepDate !== msgDateStr) {
    const sep = document.createElement("div");
    sep.className = "date-separator";
    sep.dataset.date = msgDateStr;
    sep.textContent = formatDateSeparator(msgDate);
    container.appendChild(sep);
  }

  row.innerHTML = `
                ${avatarHtml}
                <div class="msg-body">
                  ${senderLabel}
                  ${attachHtml}
                  ${bodyHtml}
                  <div class="meta"><span>${formatTimeFull(msg.created_at)}</span>${statusHtml}</div>
                </div>
                <div class="msg-hover-actions">
                  <button class="msg-hover-btn" title="React" onclick="event.stopPropagation()">😊</button>
                  <button class="msg-hover-btn" title="More actions" onclick="event.stopPropagation()">⋯</button>
                </div>`;

  container.appendChild(row);

  // After DOM insertion, set auth token src on protected images
  row.querySelectorAll("img[data-protected]").forEach((imgEl) => {
    const url     = imgEl.dataset.protected;
    const wrap    = imgEl.closest(".attach-image-wrap");
    const imgName = wrap?.dataset.imgname || "";
    const spinner = wrap?.querySelector(".attach-img-loading");
    imgEl.onload = () => {
      if (spinner) spinner.style.display = "none";
      if (wrap) { wrap.style.cursor = "zoom-in"; wrap.onclick = () => openLightboxBlob(url, imgName); }
    };
    imgEl.onerror = () => {
      if (wrap) wrap.innerHTML = '<div class="attach-img-err">Could not load image</div>';
    };
    imgEl.src = protectedImgUrl(url);
  });

  // Init voice players in this message row
  if (typeof initVoicePlayers === "function") initVoicePlayers();

  // Set video src via blob URL so auth header is sent (skip audio — handled by voice.js)
  row.querySelectorAll("video[data-protected]").forEach((videoEl) => {
    const mime = videoEl.dataset.mime || "";
    if (mime.startsWith("audio/")) return;
    const url = videoEl.dataset.protected;
    fetch(toAbsoluteUrl(url), { headers: { Authorization: "Bearer " + token } })
      .then(r => r.blob())
      .then(blob => { videoEl.src = URL.createObjectURL(blob); })
      .catch(() => { videoEl.closest(".attach-video-wrap")?.insertAdjacentHTML("beforeend",
        '<div class="attach-img-err">Could not load video</div>'); });
  });

  // Store body for edit reference
  row.dataset.body = msg.body || "";
  row.dataset.conversationId = msg.conversation_id;
  row.dataset.deleted = msg.is_deleted ? "1" : "0";
  row.dataset.myReactions = JSON.stringify(msg.my_reactions || []);

  // Handle deleted messages
  if (msg.is_deleted) {
    applyDeletedStyle(row);
  }

  // Show "edited" label
  if (msg.is_edited && !msg.is_deleted) {
    const meta = row.querySelector(".meta");
    if (meta) {
      const label = document.createElement("span");
      label.className = "msg-edited-label";
      label.textContent = "edited · ";
      meta.prepend(label);
    }
    row.dataset.isEdited = "1";
  }

  // Render reactions if any
  if (msg.reactions && msg.reactions.length > 0) {
    renderReactions(row, msg.reactions, msg.my_reactions || []);
  }

  // Attach context menu to ALL messages (react, delete-for-me, edit/delete for own)
  attachMsgContextMenu(row, msg);

  scrollToBottom();
}

// ── Date separator label ─────────────────────────────────────────
function formatDateSeparator(date) {
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday     = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday)     return "Today";
  if (isYesterday) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// ── Timestamp format for message bubbles ─────────────────────────
function formatTimeFull(dateStr) {
  const d = new Date((dateStr || "").replace(" ", "T"));
  const today     = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isToday     = d.toDateString() === today.toDateString();
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (isToday)     return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + time;
}

// Apply visual style for deleted message
function applyDeletedStyle(row) {
  const msgBody = row.querySelector(".msg-body");
  if (!msgBody) return;
  msgBody.querySelectorAll(".attach-image-wrap, .attach-grid, .attach-doc, .attach-video-wrap, .voice-player, .bubble").forEach(el => el.remove());
  if (!row.querySelector(".msg-deleted")) {
    const del = document.createElement("div");
    del.className = "msg-deleted";
    del.textContent = "🚫 This message was deleted";
    const meta = msgBody.querySelector(".meta");
    if (meta) msgBody.insertBefore(del, meta);
    else msgBody.appendChild(del);
  }
  row.oncontextmenu = null;
  row.dataset.deleted = "1";
}

function formatAudioTime(secs) {
  if (!secs || isNaN(secs) || !isFinite(secs)) return "0:00";
  const s = Math.floor(secs);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}

function fileIcon(mime) {
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📑";
  return "📎";
}

// Download a protected file by fetching with auth header then triggering save
async function downloadProtectedFile(url, filename) {
  try {
    showToast("Downloading…");
    const res = await fetch(toAbsoluteUrl(url), {
      headers: { Authorization: "Bearer " + token },
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
  } catch (err) {
    showToast("Download error.");
    console.error(err);
  }
}

function updateMessageStatusInDOM(messageId, status) {
  const row = document.querySelector(`.msgRow[data-msg-id="${messageId}"]`);
  if (!row || !row.classList.contains("me")) return;
  const existing = row.querySelector(".msg-status");
  if (existing) existing.outerHTML = statusIcon(status);
}