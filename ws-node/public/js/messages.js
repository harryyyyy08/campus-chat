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
    const images  = attachList.filter(a => isImageMime(a.mime_type));
    const videos  = attachList.filter(a => a.is_video || a.mime_type?.startsWith("video/"));
    const docs    = attachList.filter(a => !isImageMime(a.mime_type) && !a.is_video && !a.mime_type?.startsWith("video/"));

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

  // Set video src via blob URL so auth header is sent
  row.querySelectorAll("video[data-protected]").forEach((videoEl) => {
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

// Apply visual style for deleted message
function applyDeletedStyle(row) {
  const msgBody = row.querySelector(".msg-body");
  if (!msgBody) return;
  // Remove attachment and bubble
  msgBody.querySelectorAll(".attach-image-wrap, .attach-doc, .bubble").forEach(el => el.remove());
  // Add deleted placeholder if not already there
  if (!row.querySelector(".msg-deleted")) {
    const del = document.createElement("div");
    del.className = "msg-deleted";
    del.textContent = "🚫 This message was deleted";
    const meta = msgBody.querySelector(".meta");
    if (meta) msgBody.insertBefore(del, meta);
    else msgBody.appendChild(del);
  }
  // Remove context menu trigger
  row.oncontextmenu = null;
  row.dataset.deleted = "1";
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