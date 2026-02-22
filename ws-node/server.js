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

app.use(express.static("public"));
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

/** Notify all connected sockets of a given userId about a new room to join */
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

  // ── join_conversation (manual, after creating new chat) ───────
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
      const client_msg_id = payload?.client_msg_id || null;
      const attachment_id = payload?.attachment_id || null;

      if (!conversation_id || (!body && !attachment_id)) {
        if (ack) ack({ ok: false, error: "conversation_id and body required" });
        return;
      }

      const resp = await fetch(`${PHP_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ conversation_id, body, attachment_id }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "PHP API error" });
        return;
      }

      const msg = {
        id: data.message_id,
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        body: data.body,
        attachment: data.attachment || null,
        status: "sent",
        created_at: data.created_at,
        client_msg_id,
      };

      // Broadcast to all room members
      io.to(`conv:${conversation_id}`).emit("new_message", msg);

      // Check if any recipient is connected → mark delivered immediately
      const room = io.sockets.adapter.rooms.get(`conv:${conversation_id}`);
      const others = room
        ? [...room].filter((sid) => {
            const s = io.sockets.sockets.get(sid);
            return s && s.user.id !== userId;
          })
        : [];

      if (others.length > 0) {
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
  // After creating a group, client emits this so Node can push
  // a "you were added to a group" event to all new members and
  // have them auto-join the socket room.
  socket.on("group_created", async ({ conversation_id, member_ids }) => {
    const cid = Number(conversation_id);
    if (!cid || !Array.isArray(member_ids)) return;

    // Join creator
    socket.join(`conv:${cid}`);

    // For each member, join their active sockets to the room
    // and emit a notification so they reload conversations
    for (const uid of member_ids) {
      joinUserToRoom(uid, `conv:${cid}`);
      io.to(`user:${uid}`).emit("added_to_group", { conversation_id: cid });
    }
  });

  // ── member_added ──────────────────────────────────────────────
  // Admin adds a member to existing group
  socket.on("member_added", ({ conversation_id, user_id }) => {
    const cid = Number(conversation_id);
    const uid = Number(user_id);
    if (!cid || !uid) return;

    joinUserToRoom(uid, `conv:${cid}`);
    io.to(`user:${uid}`).emit("added_to_group", { conversation_id: cid });

    // Notify everyone in room that membership changed
    io.to(`conv:${cid}`).emit("group_updated", { conversation_id: cid });
  });

  // ── member_removed ────────────────────────────────────────────
  socket.on("member_removed", ({ conversation_id, user_id }) => {
    const cid = Number(conversation_id);
    const uid = Number(user_id);
    if (!cid || !uid) return;

    // Remove from room
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

  // ── disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    onlineUsers.delete(userId);
    io.emit("presence", { user_id: userId, online: false });
  });
});

server.listen(PORT, () =>
  console.log(`✅  CampusChat WS server → http://localhost:${PORT}`),
);
