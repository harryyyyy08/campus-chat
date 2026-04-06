require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

// ── Config ────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const PORT = 3001;
const PHP_API_BASE =
  process.env.PHP_API_BASE || "http://localhost/campus-chat/api/index.php";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // same-origin requests
      const ok =
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        );
      cb(ok ? null : new Error("CORS blocked"), ok);
    },
  },
});

app.use(express.json({ limit: "128kb" }));

async function forwardAltchaResponse(upstreamResponse, res) {
  const contentType =
    upstreamResponse.headers.get("content-type") ||
    "application/json; charset=utf-8";
  const cacheControl = upstreamResponse.headers.get("cache-control");

  res.status(upstreamResponse.status);
  res.setHeader("Content-Type", contentType);
  if (cacheControl) {
    res.setHeader("Cache-Control", cacheControl);
  }

  const body = await upstreamResponse.text();
  res.send(body);
}

async function forwardPhpJsonRequest(req, res, phpPath) {
  const headers = {
    Accept: "application/json",
  };

  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.trim() !== "") {
    headers.Authorization = authHeader;
  }

  const method = String(req.method || "GET").toUpperCase();
  const options = {
    method,
    headers,
  };

  if (!["GET", "HEAD"].includes(method)) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(req.body || {});
  }

  const upstream = await fetch(`${PHP_API_BASE}${phpPath}`, options);
  await forwardAltchaResponse(upstream, res);
}

// Same-origin proxy for ALTCHA on Node pages (e.g. localhost:3001) to avoid browser-specific
// cross-origin issues while keeping PHP as the source of truth for challenge/verification.
app.get("/api/altcha/challenge", async (req, res) => {
  try {
    const queryIndex = req.originalUrl.indexOf("?");
    const query = queryIndex >= 0 ? req.originalUrl.slice(queryIndex) : "";
    const upstream = await fetch(`${PHP_API_BASE}/altcha/challenge${query}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    await forwardAltchaResponse(upstream, res);
  } catch (err) {
    res.status(502).json({
      verified: false,
      reason: `ALTCHA challenge proxy error: ${err.message}`,
    });
  }
});

app.post("/api/altcha/verify-code", async (req, res) => {
  try {
    const upstream = await fetch(`${PHP_API_BASE}/altcha/verify-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(req.body || {}),
    });
    await forwardAltchaResponse(upstream, res);
  } catch (err) {
    res.status(502).json({
      verified: false,
      reason: `ALTCHA verify proxy error: ${err.message}`,
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/login");
  } catch (err) {
    res.status(502).json({ error: `Login proxy error: ${err.message}` });
  }
});

app.post("/api/register", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/register");
  } catch (err) {
    res.status(502).json({ error: `Register proxy error: ${err.message}` });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/forgot-password");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Forgot-password proxy error: ${err.message}` });
  }
});

app.post("/api/change-password", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/change-password");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Change-password proxy error: ${err.message}` });
  }
});

app.get("/api/departments", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/departments");
  } catch (err) {
    res.status(502).json({ error: `Departments proxy error: ${err.message}` });
  }
});

// Security questions endpoints
app.get("/api/security-questions/list", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/security-questions/list");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Security questions proxy error: ${err.message}` });
  }
});

app.post("/api/security-questions/setup", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/security-questions/setup");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Security questions setup proxy error: ${err.message}` });
  }
});

app.post("/api/forgot-password/questions", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/forgot-password/questions");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Forgot password questions proxy error: ${err.message}` });
  }
});

app.post("/api/forgot-password/verify", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/forgot-password/verify");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Forgot password verify proxy error: ${err.message}` });
  }
});

app.post("/api/forgot-password/reset", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/forgot-password/reset");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Forgot password reset proxy error: ${err.message}` });
  }
});

app.post("/api/forgot-username", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/forgot-username");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Forgot username proxy error: ${err.message}` });
  }
});

app.post("/api/request-admin-reset", async (req, res) => {
  try {
    await forwardPhpJsonRequest(req, res, "/request-admin-reset");
  } catch (err) {
    res
      .status(502)
      .json({ error: `Admin reset request proxy error: ${err.message}` });
  }
});

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
    socket.user = {
      id: Number(claims.sub),
      username: claims.username,
      role: claims.role,
    };
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

  // ── post_announcement ─────────────────────────────────────────
  // Called after PHP creates/approves an announcement
  // Broadcasts to all relevant users in real-time
  socket.on("post_announcement", async ({ announcement }) => {
    const role = socket.user.role;
    if (!["admin", "super_admin", "faculty"].includes(role)) return;
    if (!announcement) return;

    // Broadcast to all connected users
    // Client will filter visibility (target_type + department)
    io.emit("new_announcement", { announcement });
  });

  // ── approve_announcement ──────────────────────────────────────
  socket.on("approve_announcement", async ({ announcement_id }, ack) => {
    const aid = Number(announcement_id);
    if (!aid) {
      if (ack) ack({ ok: false, error: "announcement_id required" });
      return;
    }

    try {
      const resp = await fetch(`${PHP_API_BASE}/announcements/${aid}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "Approve failed" });
        return;
      }

      // Broadcast approved announcement to all users
      io.emit("new_announcement", { announcement: data.announcement });
      // Notify original poster
      io.to(`user:${data.announcement.author_id}`).emit("announcement_status", {
        announcement_id: aid,
        status: "approved",
      });
      if (ack) ack({ ok: true });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // ── reject_announcement ───────────────────────────────────────
  socket.on(
    "reject_announcement",
    async ({ announcement_id, author_id }, ack) => {
      const aid = Number(announcement_id);
      if (!aid) {
        if (ack) ack({ ok: false, error: "announcement_id required" });
        return;
      }

      try {
        const resp = await fetch(
          `${PHP_API_BASE}/announcements/${aid}/reject`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const data = await resp.json();
        if (!resp.ok) {
          if (ack) ack({ ok: false, error: data?.error || "Reject failed" });
          return;
        }

        // Notify the author their announcement was rejected
        if (author_id) {
          io.to(`user:${Number(author_id)}`).emit("announcement_status", {
            announcement_id: aid,
            status: "rejected",
          });
        }
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, error: err.message });
      }
    },
  );

  // ── delete_announcement ───────────────────────────────────────
  socket.on("delete_announcement", async ({ announcement_id }, ack) => {
    const aid = Number(announcement_id);
    if (!aid) {
      if (ack) ack({ ok: false, error: "announcement_id required" });
      return;
    }

    try {
      const resp = await fetch(`${PHP_API_BASE}/announcements/${aid}`, {
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

      // Broadcast deletion to all users
      io.emit("announcement_deleted", { announcement_id: aid });
      if (ack) ack({ ok: true });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  onlineUsers.add(userId);
  socket.join(`user:${userId}`);
  io.emit("presence", { user_id: userId, online: true });

  // Update last_ip for geomapping — fire-and-forget, non-critical
  (async () => {
    try {
      await fetch(`${PHP_API_BASE}/internal/update-ip`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Real-IP": socket.handshake.address.replace(/^::ffff:/, ""),
        },
      });
    } catch (_) {
      /* non-critical */
    }
  })();

  // Auto-join all conversation rooms on connect (includes hidden — so messages still arrive)
  (async () => {
    try {
      const resp = await fetch(`${PHP_API_BASE}/conversations/member-ids`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await resp.json();
      if (resp.ok && Array.isArray(data.conversation_ids)) {
        for (const cid of data.conversation_ids) socket.join(`conv:${cid}`);
        socket.emit("joined_conversations", data.conversation_ids);
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
      const client_msg_id = payload?.client_msg_id || null;
      const attachment_id = payload?.attachment_id || null;
      const attachment_ids = Array.isArray(payload?.attachment_ids)
        ? payload.attachment_ids
        : attachment_id
          ? [attachment_id]
          : [];

      if (
        !conversation_id ||
        (!body && !attachment_id && !attachment_ids.length)
      ) {
        if (ack) ack({ ok: false, error: "conversation_id and body required" });
        return;
      }

      const resp = await fetch(`${PHP_API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          conversation_id,
          body,
          attachment_id,
          attachment_ids,
        }),
      });
      const data = await resp.json();
      console.log(
        "[server] PHP response keys:",
        Object.keys(data),
        "attachments:",
        data.attachments,
      );
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "PHP API error" });
        return;
      }

      // Normalize attachments — PHP may return attachments as array or null
      const phpAttachments = Array.isArray(data.attachments)
        ? data.attachments
        : [];
      const phpAttachment = data.attachment || (phpAttachments[0] ?? null);
      // Carry over duration from client payload (voice messages)
      const clientAtts = Array.isArray(payload?.attachment_ids)
        ? payload.attachment_ids
        : [];
      const allAttachments = (
        phpAttachments.length > 0
          ? phpAttachments
          : phpAttachment
            ? [phpAttachment]
            : []
      ).map((a, i) => ({
        ...a,
        duration: payload?.attachments_meta?.[i]?.duration || 0,
      }));

      const msg = {
        id: data.message_id,
        conversation_id: data.conversation_id,
        sender_id: data.sender_id,
        body: data.body,
        attachment: phpAttachment,
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
  socket.on(
    "edit_message",
    async ({ message_id, conversation_id, body }, ack) => {
      const mid = Number(message_id);
      const cid = Number(conversation_id);
      if (!mid || !cid || !body?.trim()) {
        if (ack)
          ack({
            ok: false,
            error: "message_id, conversation_id, and body required",
          });
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
    },
  );

  // ── react_message ────────────────────────────────────────────
  socket.on(
    "react_message",
    async ({ message_id, conversation_id, emoji }, ack) => {
      const mid = Number(message_id);
      const cid = Number(conversation_id);
      if (!mid || !cid || !emoji) {
        if (ack)
          ack({
            ok: false,
            error: "message_id, conversation_id, emoji required",
          });
        return;
      }
      try {
        const resp = await fetch(`${PHP_API_BASE}/messages/${mid}/react`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emoji }),
        });
        const data = await resp.json();
        console.log("[server] react data:", JSON.stringify(data)); // debug
        if (!resp.ok) {
          if (ack) ack({ ok: false, error: data?.error || "React failed" });
          return;
        }

        // Broadcast reactions to ALL members — each client keeps their own my_reactions
        // We send reactor_id so each client can decide whose my_reactions to use
        io.to(`conv:${cid}`).emit("message_reacted", {
          message_id: mid,
          conversation_id: cid,
          reactions: data.reactions, // all reactions for this message
          my_reactions: data.my_reactions, // only the reactor's my_reactions
          reactor_id: userId,
        });
        if (ack) ack({ ok: true });
      } catch (err) {
        if (ack) ack({ ok: false, error: err.message });
      }
    },
  );

  // ── hide_message (delete for me) ──────────────────────────────
  socket.on("hide_message", async ({ message_id, conversation_id }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid) {
      if (ack)
        ack({ ok: false, error: "message_id and conversation_id required" });
      return;
    }
    try {
      const resp = await fetch(`${PHP_API_BASE}/messages/${mid}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ for_me: true }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (ack) ack({ ok: false, error: data?.error || "Hide failed" });
        return;
      }
      // Only emit to THIS user's socket — not to everyone
      io.to(`user:${userId}`).emit("message_hidden", {
        message_id: mid,
        conversation_id: cid,
      });
      if (ack) ack({ ok: true });
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  // ── delete_message ────────────────────────────────────────────
  socket.on("delete_message", async ({ message_id, conversation_id }, ack) => {
    const mid = Number(message_id);
    const cid = Number(conversation_id);
    if (!mid || !cid) {
      if (ack)
        ack({ ok: false, error: "message_id and conversation_id required" });
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
  socket.on(
    "message_request_sent",
    async ({ conversation_id, request_id, recipient_id }) => {
      const cid = Number(conversation_id);
      const rid = Number(recipient_id);
      if (!cid || !rid) return;
      // Join sender to the pending conversation room
      socket.join(`conv:${cid}`);
      // Notify via user room — always reliable regardless of when recipient connected
      io.to(`user:${rid}`).emit("new_message_request", {
        request_id,
        from_name: socket.user.username,
        conversation_id: cid,
      });
    },
  );

  // ── request_accepted ──────────────────────────────────────────
  // Recipient accepted — notify sender
  socket.on("request_accepted", ({ conversation_id, requester_id }) => {
    const cid = Number(conversation_id);
    const rid = Number(requester_id);
    if (!cid || !rid) return;
    joinUserToRoom(rid, `conv:${cid}`); // join requester (Carl) to conv room
    socket.join(`conv:${cid}`); // join acceptor (Jaymark) to conv room
    // Notify sender their request was accepted
    io.to(`user:${rid}`).emit("request_accepted", { conversation_id: cid });
  });

  // ── request_declined ──────────────────────────────────────────
  // Recipient declined — notify sender
  socket.on("request_declined", ({ requester_id, conversation_id }) => {
    const rid = Number(requester_id);
    const cid = Number(conversation_id);
    if (!rid) return;
    io.to(`user:${rid}`).emit("request_declined", { conversation_id: cid });
  });

  // ── conversation_deleted ──────────────────────────────────────
  // Broadcaster: notify all members to remove the conversation
  socket.on("conversation_deleted", ({ conversation_id, member_ids }) => {
    const cid = Number(conversation_id);
    if (!cid || !Array.isArray(member_ids)) return;
    member_ids.forEach((uid) => {
      io.to(`user:${uid}`).emit("conversation_deleted", {
        conversation_id: cid,
      });
    });
  });

  // ── disconnect ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    const stillConnected = [...io.sockets.sockets.values()].some(
      (s) => s.id !== socket.id && s.user?.id === userId,
    );
    if (!stillConnected) {
      onlineUsers.delete(userId);
      io.emit("presence", { user_id: userId, online: false });
    }
  });
});

// ── Auto-delete messages older than 1 month ───────────────────
async function deleteOldMessages() {
  const isProd = process.env.NODE_ENV === "production";
  const verboseCleanup = process.env.CLEANUP_VERBOSE === "1";
  try {
    const resp = await fetch(`${PHP_API_BASE}/messages/cleanup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cleanup-Secret": process.env.CLEANUP_SECRET,
      },
    });

    const raw = await resp.text();
    let data = {};
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        const snippet = raw.replace(/\s+/g, " ").slice(0, 180);
        console.error(
          `[cleanup] Non-JSON response (${resp.status}): ${snippet}${raw.length > 180 ? "..." : ""}`,
        );
        return;
      }
    }

    if (!resp.ok) {
      console.error(
        `[cleanup] API error ${resp.status}: ${data.error || "Unknown error"}`,
      );
      return;
    }

    const deleted = Number(data.deleted ?? 0);
    if (deleted > 0 || !isProd || verboseCleanup) {
      console.log(`[cleanup] Deleted ${deleted} old messages.`);
    }
    if (Array.isArray(data.skipped_tables) && data.skipped_tables.length) {
      console.warn(
        `[cleanup] Skipped missing tables: ${data.skipped_tables.join(", ")}`,
      );
    }
  } catch (err) {
    console.error("[cleanup] Error:", err.message);
  }
}

server.listen(PORT, () => {
  console.log(`✅  CampusChat WS server → http://localhost:${PORT}`);
  // Run once on startup, then every 24 hours
  deleteOldMessages();
  setInterval(deleteOldMessages, 24 * 60 * 60 * 1000);
});
