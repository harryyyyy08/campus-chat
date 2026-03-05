// ════════════════════════════════════════════
// INPUT LISTENERS
// ════════════════════════════════════════════

function setupInputListeners() {
  if (setupInputListeners._done) return;
  setupInputListeners._done = true;
  const inputEl   = document.getElementById("messageInput");
  const fileInput = document.getElementById("fileInput");

  inputEl.addEventListener("input", () => {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  inputEl.addEventListener("input", () => {
    if (!currentConversation || !socket) return;
    socket.emit("typing", { conversation_id: currentConversation, is_typing: true });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(
      () => socket.emit("typing", { conversation_id: currentConversation, is_typing: false }),
      700,
    );
  });

  document.getElementById("newChatUsername")
    .addEventListener("keydown", (e) => { if (e.key === "Enter") startChat(); });

  // Allow multiple file selection
  fileInput.setAttribute("multiple", "true");
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFilesSelected(Array.from(fileInput.files));
  });

  // Drag and drop — support multiple files
  const messagesEl = document.getElementById("messages");
  messagesEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    messagesEl.classList.add("drag-over");
  });
  messagesEl.addEventListener("dragleave", () => messagesEl.classList.remove("drag-over"));
  messagesEl.addEventListener("drop", (e) => {
    e.preventDefault();
    messagesEl.classList.remove("drag-over");
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleFilesSelected(files);
  });
}

// ════════════════════════════════════════════
// FILE ATTACHMENT — MULTI-FILE
// ════════════════════════════════════════════

const MAX_FILES      = 5;
const MAX_IMAGE_SIZE = 25  * 1024 * 1024;  // 25 MB for images/docs
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB for videos

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime", "video/x-msvideo",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

// pendingAttachments is now an array
// (pendingAttachment kept for backward compat — points to first item or null)

function triggerFileInput() {
  if (!currentConversation) { showToast("Select a conversation first."); return; }
  document.getElementById("fileInput").click();
}

async function handleFilesSelected(files) {
  if (!currentConversation) { showToast("Select a conversation first."); return; }

  // Clamp to max files total (existing + new)
  const currentCount = (pendingAttachments || []).length;
  const remaining    = MAX_FILES - currentCount;
  if (remaining <= 0) { showToast(`Max ${MAX_FILES} files per message.`); return; }
  files = files.slice(0, remaining);

  // Validate each file
  const valid = [];
  for (const file of files) {
    const isVideo = file.type.startsWith("video/");
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
    if (!ALLOWED_TYPES.includes(file.type)) {
      showToast(`${file.name}: file type not allowed.`); continue;
    }
    if (file.size > maxSize) {
      showToast(`${file.name}: exceeds ${isVideo ? "100 MB" : "25 MB"} limit.`); continue;
    }
    valid.push(file);
  }
  if (!valid.length) return;

  // Upload all valid files in parallel
  const uploadPromises = valid.map(file => uploadSingleFile(file));
  const results = await Promise.allSettled(uploadPromises);

  results.forEach((r) => {
    if (r.status === "fulfilled" && r.value) {
      if (!pendingAttachments) pendingAttachments = [];
      pendingAttachments.push(r.value);
      pendingAttachment = pendingAttachments[0]; // legacy compat
      // NOTE: preview item already added inside uploadSingleFile — do NOT add again
    }
  });

  document.getElementById("fileInput").value = "";
}

async function uploadSingleFile(file) {
  const itemId = "att-" + Date.now() + "-" + Math.random().toString(36).slice(2);
  addAttachmentPreviewItem(null, file, itemId); // show loading state

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversation_id", currentConversation);

    const res  = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });
    const data = await res.json();

    if (!res.ok) {
      removeAttachmentPreviewItem(itemId);
      showToast(data.error || `Upload failed: ${file.name}`);
      return null;
    }

    // Update preview item to show ready state
    updateAttachmentPreviewItem(itemId, data);
    return { ...data, _itemId: itemId };
  } catch (err) {
    removeAttachmentPreviewItem(itemId);
    showToast(`Upload error: ${file.name}`);
    console.error(err);
    return null;
  }
}

// ── Preview bar ──────────────────────────────────────────────────

function addAttachmentPreviewItem(data, file, itemId) {
  const bar = document.getElementById("attachmentPreviewBar");
  bar.classList.remove("hidden");

  const id  = itemId || (data?._itemId) || ("att-" + data?.attachment_id);
  const isVideo = file?.type?.startsWith("video/");
  const isImage = file?.type?.startsWith("image/");

  const item = document.createElement("div");
  item.className = "attach-preview-item";
  item.id        = id;

  if (!data) {
    // Loading state
    item.innerHTML = `
      <div class="attach-preview-thumb loading">
        <div class="upload-spinner"></div>
      </div>
      <div class="attach-preview-item-name">${escapeHtml(file.name)}</div>`;
  } else if (isImage) {
    // Image thumbnail
    const reader = new FileReader();
    item.innerHTML = `
      <div class="attach-preview-thumb">
        <img src="" alt="${escapeHtml(file.name)}" />
      </div>
      <button class="attach-preview-item-remove" onclick="removeAttachmentById('${id}')">✕</button>`;
    reader.onload = (e) => {
      const img = item.querySelector("img");
      if (img) img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  } else if (isVideo) {
    item.innerHTML = `
      <div class="attach-preview-thumb video">🎬</div>
      <div class="attach-preview-item-name">${escapeHtml(file.name)}</div>
      <button class="attach-preview-item-remove" onclick="removeAttachmentById('${id}')">✕</button>`;
  } else {
    const icon = filePreviewIcon(file.type);
    item.innerHTML = `
      <div class="attach-preview-thumb doc">${icon}</div>
      <div class="attach-preview-item-name">${escapeHtml(file.name)}</div>
      <button class="attach-preview-item-remove" onclick="removeAttachmentById('${id}')">✕</button>`;
  }

  document.getElementById("attachPreviewList").appendChild(item);
}

function updateAttachmentPreviewItem(itemId, data) {
  const item = document.getElementById(itemId);
  if (!item) return;
  // Replace spinner with file icon / keep existing image thumb
  const thumb = item.querySelector(".attach-preview-thumb.loading");
  if (thumb) {
    const isVideo = data.mime_type?.startsWith("video/");
    const isImage = data.mime_type?.startsWith("image/");
    if (isVideo) {
      thumb.className = "attach-preview-thumb video";
      thumb.innerHTML = "🎬";
    } else if (isImage) {
      thumb.className = "attach-preview-thumb";
      thumb.innerHTML = `<img src="${protectedImgUrl(data.url)}" alt="${escapeHtml(data.original_name)}" />`;
    } else {
      thumb.className = "attach-preview-thumb doc";
      thumb.textContent = filePreviewIcon(data.mime_type);
    }
    // Add remove button
    const removeBtn = document.createElement("button");
    removeBtn.className = "attach-preview-item-remove";
    removeBtn.textContent = "✕";
    removeBtn.onclick = () => removeAttachmentById(itemId);
    item.appendChild(removeBtn);
    // Remove filename label if it was added in loading
    const nameEl = item.querySelector(".attach-preview-item-name");
    if (nameEl) nameEl.textContent = data.original_name;
  }
  // Update data-id
  item.dataset.attachmentId = data.attachment_id;
}

function removeAttachmentPreviewItem(itemId) {
  document.getElementById(itemId)?.remove();
  checkPreviewBarEmpty();
}

function removeAttachmentById(itemId) {
  // Remove from pendingAttachments array
  if (pendingAttachments) {
    pendingAttachments = pendingAttachments.filter(a => a._itemId !== itemId);
    pendingAttachment  = pendingAttachments[0] || null;
  }
  document.getElementById(itemId)?.remove();
  checkPreviewBarEmpty();
}

function checkPreviewBarEmpty() {
  const list = document.getElementById("attachPreviewList");
  if (!list.children.length) {
    document.getElementById("attachmentPreviewBar").classList.add("hidden");
  }
}

function clearAttachmentPreview() {
  pendingAttachments = [];
  pendingAttachment  = null;
  const list = document.getElementById("attachPreviewList");
  if (list) list.innerHTML = "";
  document.getElementById("attachmentPreviewBar").classList.add("hidden");
}

function filePreviewIcon(mime) {
  if (!mime) return "📎";
  if (mime === "application/pdf") return "📄";
  if (mime.includes("word")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "📑";
  return "📎";
}

// Legacy stubs (kept so nothing else breaks)
function showAttachmentPreview() {}
function updateAttachmentPreviewReady() {}
function showUploadProgress() {}