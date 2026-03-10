const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// ── Config ────────────────────────────────────────────────────────
const JWT_SECRET = "CHANGE_ME_super_long_random_secret_123456789"; // must match api/config.php
const PORT = 3001;
const PHP_API_BASE = "http://localhost/campus-chat/api/index.php";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Serve static files from the campus-chat web root
// so localhost:3001 also works (not just localhost/campus-chat)
const path = require("path");
const STATIC_DIR = path.join(__dirname, "..", "campus-chat");
app.use(express.static(STATIC_DIR));
app.use(express.static(path.join(__dirname, "public")));
// Fallback: serve index.html for SPA routing
app.get("/", (_req, res) => {
  const idx = path.join(STATIC_DIR, "index.html");
  res.sendFile(idx, (err) => {
    if (err) res.status(404).json({ error: "index.html not found" });
  });
});
app.get("/health", (_req, res) => res.json({ ok: true }));

const onlineUsers = new Set();

// ── JWT auth middleware ───────────────────────────────────────────
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Missing token"));
    const claims = jwt.verify(token, JWT_SECRET);
    socket.user = { id: Number(claims.sub), username: claims.username };
    return next();
  } catch (err) {
    return next(new Error("Unauthorized: " + err.message));
  }
});

// ── Helpers ───────────────────────────────────────────────────────
function joinUserToRoom(userId, roomName) {
  for (const [, socket] of io.sockets.sockets) {
    if (socket.user?.id === userId) socket.join(roomName);
  }
}

// ── Connection ────────────────────────────────────────────────────
io.on("connection", (socket) => {
  const userId = socket.user.id;
  const token = socket.handshake.auth?.token;

  onlineUsers.add(userId);
  socket.join(`user:${userId}`);
  io.emit("presence", { user_id: userId, online: true });

  // Auto-join all conversation rooms on connect
  (async () => {
    try {
      const resp = await fetch(`${PHP_API_BASE}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.conversations)) {
        for (const c of data.conversations)
          socket.join(`conv:${c.conversation_id}`);
        socket.emit(
          "joined_conversations",
          data.conversations.map((c) => c.conversation_id),
        );
      } else {
        socket.emit("joined_conversations", []);
      }
    } catch {
      socket.emit("joined_conversations", []);
    }
  })();

  // ── who_is_online ─────────────────────────────────────────────
  socket.on("who_is_online", () =>
    socket.emit("online_list", Array.from(onlineUsers)),
  );

  // ── join_conversation ─────────────────────────────────────────
  socket.on("join_conversation", ({ conversation_id }) => {
    const cid = Number(conversation_id);
    if (cid) socket.join(`conv:${cid}`);
  });

  // ── typing ────────────────────────────────────────────────────
  socket.on("typing", ({ conversation_id, is_typing }) => {
    const cid = Number(conversation_id);
    if (!cid) return;
    socket.to(`conv:${cid}`).emit("typing", {
      conversation_id: cid,
      user_id: userId,
      is_typing: !!is_typing,
    });
  });

  // ── send_message ──────────────────────────────────────────────
  socket.on("send_message", async (payload, ack) => {
    try {
      const conversation_id = Number(payload?.conversation_id);
      const body = String(payload?.body || "").trim();
      const client_msg_id   = payload?.client_msg_id || null;
      const attachment_id   = payload?.attachment_id  || null;
      const attachment_ids  = Array.isArray(payload?.attachment_ids) ? payload.attachment_ids : (attachment_id ? [attachment_id] : []);

      if (!conversation_id || (!body && !attachment_id && !attachment_ids.length)) {
        if (ack) ack({ ok: false, error: "conversation_id and body required" });
        return;
      }

      const resp = await fetch(`${PHP_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id, body, attachment_id, attachment_ids }),
      });
      const data = await resp.json();
      console.log("[server] PHP response keys:", Object.keys(data), "attachments:", data.attachments);
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "PHP API error" });
        return;
      }

      // Normalize attachments — PHP may return attachments as array or null
      const phpAttachments = Array.isArray(data.attachments) ? data.attachments : [];
      const phpAttachment  = data.attachment || (phpAttachments[0] ?? null);
      // Carry over duration from client payload (voice messages)
      const clientAtts = Array.isArray(payload?.attachment_ids) ? payload.attachment_ids : [];
      const allAttachments = (phpAttachments.length > 0 ? phpAttachments
                           : phpAttachment ? [phpAttachment] : [])
                           .map((a, i) => ({ ...a, duration: payload?.attachments_meta?.[i]?.duration || 0 }));

      const msg = {
        id: data.message_id,
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        body: data.body,
        attachment:  phpAttachment,
        attachments: allAttachments,
        status: "sent",
        created_at: data.created_at,
        client_msg_id,
        is_edited: false,
        is_deleted: false,
      };

      io.to(`conv:${conversation_id}`).emit("new_message", msg);

      const room = io.sockets.adapter.rooms.get(`conv:${conversation_id}`);
      const others = room
        ? [...room].filter((sid) => {
            const s = io.sockets.sockets.get(sid);
            return s && s.user.id !== userId;
          })
        : [];

      // Only mark delivered if conversation is NOT a pending request
      // PHP already tells us this in data.is_pending_request
      if (others.length > 0 && !data.is_pending_request) {
        io.to(`user:${userId}`).emit("message_status", {
          message_id: msg.id,
          conversation_id,
          status: "delivered",
        });
      }

      if (ack) ack({ ok: true, message: msg });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // ── edit_message ──────────────────────────────────────────────
  socket.on("edit_message", async ({ message_id, conversation_id, body }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid || !body?.trim()) {
      if (ack) ack({ ok: false, error: "message_id, conversation_id, and body required" });
      return;
    }
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/${mid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: body.trim() }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "Edit failed" });
        return;
      }
      // Broadcast edit to all members of the conversation
      io.to(`conv:${cid}`).emit("message_edited", {
        message_id: mid,
        conversation_id: cid,
        body: data.body,
        is_edited: true,
        edited_at: data.edited_at,
      });
      if (ack) ack({ ok: true });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // ── react_message ────────────────────────────────────────────
  socket.on("react_message", async ({ message_id, conversation_id, emoji }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid || !emoji) {
      if (ack) ack({ ok: false, error: "message_id, conversation_id, emoji required" });
      return;
    }
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/${mid}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ emoji }),
      });
      const data = await resp.json();
      if (!resp.ok) { if (ack) ack({ ok: false, error: data?.error || "React failed" }); return; }
      io.to(`conv:${cid}`).emit("message_reacted", {
        message_id: mid,
        conversation_id: cid,
        reactions: data.reactions,
        my_reactions: data.my_reactions,
        reactor_id: userId,
      });
      if (ack) ack({ ok: true });
    } catch (err) { if (ack) ack({ ok: false, error: err.message }); }
  });

  // ── hide_message (delete for me) ──────────────────────────────
  socket.on("hide_message", async ({ message_id, conversation_id }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid) { if (ack) ack({ ok: false, error: "message_id and conversation_id required" }); return; }
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/${mid}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ for_me: true }),
      });
      const data = await resp.json();
      if (!resp.ok) { if (ack) ack({ ok: false, error: data?.error || "Hide failed" }); return; }
      // Only emit to THIS user's socket — not to everyone
      io.to(`user:${userId}`).emit("message_hidden", { message_id: mid, conversation_id: cid });
      if (ack) ack({ ok: true });
    } catch (err) { if (ack) ack({ ok: false, error: err.message }); }
  });

  // ── delete_message ────────────────────────────────────────────
  socket.on("delete_message", async ({ message_id, conversation_id }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid) {
      if (ack) ack({ ok: false, error: "message_id and conversation_id required" });
      return;
    }
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/${mid}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "Delete failed" });
        return;
      }
      // Broadcast delete to all members of the conversation
      io.to(`conv:${cid}`).emit("message_deleted", {
        message_id: mid,
        conversation_id: cid,
      });
      if (ack) ack({ ok: true });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // ── mark_seen ─────────────────────────────────────────────────
  socket.on("mark_seen", async ({ conversation_id }) => {
    const cid = Number(conversation_id);
    if (!cid) return;
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/seen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id: cid }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.unseen_ids?.length) return;
      for (const message_id of data.unseen_ids) {
        io.to(`conv:${cid}`).emit("message_status", {
          message_id,
          conversation_id: cid,
          status: "seen",
        });
      }
    } catch (err) {
      console.error("mark_seen error:", err.message);
    }
  });

  // ── group_created ─────────────────────────────────────────────
  socket.on("group_created", async ({ conversation_id, member_ids }) => {
    const cid = Number(conversation_id);
    if (!cid || !Array.isArray(member_ids)) return;
    socket.join(`conv:${cid}`);
    for (const uid of member_ids) {
      joinUserToRoom(uid, `conv:${cid}`);
      io.to(`user:${uid}`).emit("added_to_group", { conversation_id: cid });
    }
  });

  // ── member_added ──────────────────────────────────────────────
  socket.on("member_added", ({ conversation_id, user_id }) => {
    const cid = Number(conversation_id);
    const uid = Number(user_id);
    if (!cid || !uid) return;
    joinUserToRoom(uid, `conv:${cid}`);
    io.to(`user:${uid}`).emit("added_to_group", { conversation_id: cid });
    io.to(`conv:${cid}`).emit("group_updated", { conversation_id: cid });
  });

  // ── member_removed ────────────────────────────────────────────
  socket.on("member_removed", ({ conversation_id, user_id }) => {
    const cid = Number(conversation_id);
    const uid = Number(user_id);
    if (!cid || !uid) return;
    for (const [, s] of io.sockets.sockets) {
      if (s.user?.id === uid) s.leave(`conv:${cid}`);
    }
    io.to(`user:${uid}`).emit("removed_from_group", { conversation_id: cid });
    io.to(`conv:${cid}`).emit("group_updated", { conversation_id: cid });
  });

  // ── user_left_group ───────────────────────────────────────────
  socket.on("user_left_group", ({ conversation_id }) => {
    const cid = Number(conversation_id);
    if (!cid) return;
    socket.leave(`conv:${cid}`);
    io.to(`conv:${cid}`).emit("group_updated", { conversation_id: cid });
  });

  // ── message_request_sent ─────────────────────────────────────
  // Notify recipient that someone sent them a request
  socket.on("message_request_sent", async ({ conversation_id, request_id }) => {
    const cid = Number(conversation_id);
    if (!cid) return;
    // Join sender to the pending conversation room
    socket.join(`conv:${cid}`);
    // Get recipient info from PHP to notify them
    try {
      const resp = await fetch(`${PHP_API_BASE}/conversations/requests/count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Fetch recipient user id from the conversation
      const convResp = await fetch(`${PHP_API_BASE}/conversations/requests`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // We notify the recipient directly using PHP data
      // Find which user is the recipient from conversation members
      const membResp = await fetch(`${PHP_API_BASE}/conversations/${cid}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null);
    } catch {}
    // Simple approach: emit to the conversation room — recipient will be in it
    io.to(`conv:${cid}`).emit("new_message_request", {
      request_id,
      from_name: socket.user.username,
      conversation_id: cid,
    });
  });

  // ── request_accepted ──────────────────────────────────────────
  // Recipient accepted — notify sender
  socket.on("request_accepted", ({ conversation_id, requester_id }) => {
    const cid = Number(conversation_id);
    const rid = Number(requester_id);
    if (!cid || !rid) return;
    // Add both users to the conversation room
    joinUserToRoom(rid, `conv:${cid}`);
    // Notify sender their request was accepted
    io.to(`user:${rid}`).emit("request_accepted", { conversation_id: cid });
  });

  // ── disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("presence", { user_id: userId, online: false });
  });
});

server.listen(PORT, () =>
  console.log(`✅  CampusChat WS server → http://localhost:${PORT}`),
);