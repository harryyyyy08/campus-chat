// ════════════════════════════════════════════
// INPUT LISTENERS
// ════════════════════════════════════════════

function setupInputListeners() {
  if (setupInputListeners._done) return;
  setupInputListeners._done = true;
  const inputEl = document.getElementById("messageInput");
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
    socket.emit("typing", {
      conversation_id: currentConversation,
      is_typing: true,
    });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(
      () =>
        socket.emit("typing", {
          conversation_id: currentConversation,
          is_typing: false,
        }),
      700,
    );
  });

  document
    .getElementById("newChatUsername")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") startChat();
    });

  // File input change handler
  fileInput.addEventListener("change", () => {
    if (fileInput.files.length > 0) handleFileSelected(fileInput.files[0]);
  });

  // Drag and drop on messages area
  const messagesEl = document.getElementById("messages");
  messagesEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    messagesEl.classList.add("drag-over");
  });
  messagesEl.addEventListener("dragleave", () =>
    messagesEl.classList.remove("drag-over"),
  );
  messagesEl.addEventListener("drop", (e) => {
    e.preventDefault();
    messagesEl.classList.remove("drag-over");
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelected(file);
  });
}

// ════════════════════════════════════════════
// FILE ATTACHMENT
// ════════════════════════════════════════════

function triggerFileInput() {
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }
  document.getElementById("fileInput").click();
}

async function handleFileSelected(file) {
  if (!currentConversation) {
    showToast("Select a conversation first.");
    return;
  }

  const MAX = 25 * 1024 * 1024;
  const ALLOWED = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ];

  if (file.size > MAX) {
    showToast("File exceeds 25 MB limit.");
    return;
  }
  if (!ALLOWED.includes(file.type)) {
    showToast("File type not allowed.");
    return;
  }

  // Show preview bar
  showAttachmentPreview(file);

  // Upload immediately
  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("conversation_id", currentConversation);

    showUploadProgress(true);

    const res = await fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: formData,
    });
    const data = await res.json();
    showUploadProgress(false);

    if (!res.ok) {
      showToast(data.error || "Upload failed.");
      clearAttachmentPreview();
      return;
    }

    pendingAttachment = data;
    updateAttachmentPreviewReady(data);
  } catch (err) {
    showUploadProgress(false);
    showToast("Upload error.");
    clearAttachmentPreview();
    console.error(err);
  }

  // Reset file input so same file can be selected again
  document.getElementById("fileInput").value = "";
}

function showAttachmentPreview(file) {
  const bar = document.getElementById("attachmentPreviewBar");
  const name = document.getElementById("attachPreviewName");
  const size = document.getElementById("attachPreviewSize");
  const thumb = document.getElementById("attachPreviewThumb");

  name.textContent = file.name;
  size.textContent = formatBytes(file.size);

  // Show image thumbnail if image
  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      thumb.src = e.target.result;
      thumb.style.display = "block";
    };
    reader.readAsDataURL(file);
  } else {
    thumb.style.display = "none";
    thumb.src = "";
  }

  bar.classList.remove("hidden");
  bar.dataset.ready = "false";
}

function updateAttachmentPreviewReady(data) {
  const bar = document.getElementById("attachmentPreviewBar");
  bar.dataset.ready = "true";
  document.getElementById("attachPreviewName").textContent = data.original_name;
}

function showUploadProgress(loading) {
  document
    .getElementById("attachUploadSpinner")
    .classList.toggle("hidden", !loading);
}

function clearAttachmentPreview() {
  pendingAttachment = null;
  const bar = document.getElementById("attachmentPreviewBar");
  bar.classList.add("hidden");
  bar.dataset.ready = "false";
  const thumb = document.getElementById("attachPreviewThumb");
  thumb.src = "";
  thumb.style.display = "none";
}