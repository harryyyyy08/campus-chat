<?php
// ── POST /messages ───────────────────────────────────────────────
if ($method === "POST" && $path === "/messages") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $conversation_id = (int)($in["conversation_id"] ?? 0);
  $body            = trim((string)($in["body"] ?? ""));
  $user_id         = (int)$claims["sub"];

  // Support both single attachment_id (legacy) and attachment_ids[] array
  $attachment_ids = [];
  if (!empty($in["attachment_ids"]) && is_array($in["attachment_ids"])) {
    $attachment_ids = array_map("intval", array_slice($in["attachment_ids"], 0, 5)); // max 5
  } elseif (!empty($in["attachment_id"])) {
    $attachment_ids = [(int)$in["attachment_id"]];
  }

  if ($conversation_id <= 0 || ($body === "" && empty($attachment_ids)))
    json_response(["error" => "conversation_id and body (or attachment) required"], 400);

  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, $user_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member of this conversation"], 403);

  // Validate all attachments — allow already-linked ones (parallel upload race condition)
  foreach ($attachment_ids as $att_id) {
    $stmt = $pdo->prepare("SELECT 1 FROM attachments WHERE id = ? AND conversation_id = ? AND uploader_id = ?");
    $stmt->execute([$att_id, $conversation_id, $user_id]);
    if (!$stmt->fetchColumn()) json_response(["error" => "Invalid attachment: $att_id"], 400);
  }

  // Use first attachment_id in legacy column for backward compat
  $primary_att = !empty($attachment_ids) ? $attachment_ids[0] : null;
  $pdo->prepare("INSERT INTO messages (conversation_id, sender_id, body, attachment_id, status) VALUES (?, ?, ?, ?, 'sent')")
      ->execute([$conversation_id, $user_id, $body, $primary_att]);
  $message_id = (int)$pdo->lastInsertId();

  // Link all attachments via message_attachments table + update message_id
  foreach ($attachment_ids as $sort => $att_id) {
    $pdo->prepare("UPDATE attachments SET message_id = ? WHERE id = ?")->execute([$message_id, $att_id]);
    try {
      $pdo->prepare("INSERT INTO message_attachments (message_id, attachment_id, sort_order) VALUES (?, ?, ?)")
          ->execute([$message_id, $att_id, $sort]);
    } catch (PDOException $e) { /* table may not exist yet — graceful fallback */ }
  }

  // Build attachments array for response
  $attachments_out = [];
  foreach ($attachment_ids as $att_id) {
    $stmt = $pdo->prepare("SELECT original_name, stored_name, mime_type, file_size, COALESCE(is_video,0) AS is_video FROM attachments WHERE id = ?");
    $stmt->execute([$att_id]); $att = $stmt->fetch();
    if ($att) $attachments_out[] = [
      "id"            => $att_id,
      "original_name" => $att["original_name"],
      "mime_type"     => $att["mime_type"],
      "file_size"     => (int)$att["file_size"],
      "is_video"      => (bool)$att["is_video"],
      "is_voice"      => (bool)($att["is_voice"] ?? str_starts_with((string)$att["mime_type"], "audio/")),
      "url"           => "/campus-chat/api/index.php/uploads/" . $att["stored_name"],
    ];
  }

  $stmt = $pdo->prepare("SELECT id, conversation_id, sender_id, body, status, created_at FROM messages WHERE id = ?");
  $stmt->execute([$message_id]); $row = $stmt->fetch();
  $row["id"] = (int)$row["id"]; $row["conversation_id"] = (int)$row["conversation_id"]; $row["sender_id"] = (int)$row["sender_id"];

  // Check if conversation is a pending request
  $rqCheck = $pdo->prepare("SELECT COALESCE(is_request, 0) AS is_request FROM conversations WHERE id = ?");
  $rqCheck->execute([$conversation_id]); $rqRow = $rqCheck->fetch();
  $is_pending_request = $rqRow ? (bool)$rqRow["is_request"] : false;

  json_response([
    "message_id"         => $row["id"],
    "conversation_id"    => $row["conversation_id"],
    "sender_id"          => $row["sender_id"],
    "body"               => $row["body"],
    "attachment"         => $attachments_out[0] ?? null,   // legacy single
    "attachments"        => $attachments_out,              // new multi
    "status"             => $row["status"],
    "created_at"         => $row["created_at"],
    "is_pending_request" => $is_pending_request,
  ], 201);
}

// ── GET /messages ────────────────────────────────────────────────
if ($method === "GET" && $path === "/messages") {
  $claims = require_auth(); $pdo = db();
  $conversation_id = (int)($_GET["conversation_id"] ?? 0);
  $limit   = min(max((int)($_GET["limit"] ?? 50), 1), 200);
  $user_id = (int)$claims["sub"];
  if ($conversation_id <= 0) json_response(["error" => "conversation_id required"], 400);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, $user_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member of this conversation"], 403);

  // Try with message_hidden filter; fall back gracefully if table doesn't exist yet
  try {
    $stmt = $pdo->prepare("
      SELECT m.id, m.conversation_id, m.sender_id, m.body, m.attachment_id,
             m.status, m.created_at, m.is_edited, m.edited_at, m.is_deleted,
             a.original_name, a.stored_name, a.mime_type, a.file_size
      FROM messages m
      LEFT JOIN attachments a ON a.id = m.attachment_id
      LEFT JOIN message_hidden mh ON mh.message_id = m.id AND mh.user_id = ?
      WHERE m.conversation_id = ? AND mh.id IS NULL
      ORDER BY m.created_at DESC, m.id DESC LIMIT ?");
    $stmt->bindValue(1, $user_id, PDO::PARAM_INT);
    $stmt->bindValue(2, $conversation_id, PDO::PARAM_INT);
    $stmt->bindValue(3, $limit, PDO::PARAM_INT);
    $stmt->execute();
  } catch (PDOException $e) {
    // message_hidden table not yet created — fall back without it
    $stmt = $pdo->prepare("
      SELECT m.id, m.conversation_id, m.sender_id, m.body, m.attachment_id,
             m.status, m.created_at, m.is_edited, m.edited_at, m.is_deleted,
             a.original_name, a.stored_name, a.mime_type, a.file_size
      FROM messages m
      LEFT JOIN attachments a ON a.id = m.attachment_id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at DESC, m.id DESC LIMIT ?");
    $stmt->bindValue(1, $conversation_id, PDO::PARAM_INT);
    $stmt->bindValue(2, $limit, PDO::PARAM_INT);
    $stmt->execute();
  }
  $rows = array_reverse($stmt->fetchAll());
  $result = [];
  foreach ($rows as $r) {
    $r["id"] = (int)$r["id"]; $r["conversation_id"] = (int)$r["conversation_id"]; $r["sender_id"] = (int)$r["sender_id"];
    $r["is_edited"]  = (bool)$r["is_edited"];
    $r["is_deleted"] = (bool)$r["is_deleted"];
    $r["attachment"]  = null;
    $r["attachments"] = [];
    if ($r["is_deleted"]) {
      $r["body"] = null; $r["attachment_id"] = null;
    } elseif ($r["attachment_id"]) {
      // Legacy single attachment
      $r["attachment"] = [
        "id"            => (int)$r["attachment_id"],
        "original_name" => $r["original_name"],
        "mime_type"     => $r["mime_type"],
        "file_size"     => (int)$r["file_size"],
        "is_video"      => str_starts_with((string)$r["mime_type"], "video/"),
        "is_voice"      => str_starts_with((string)$r["mime_type"], "audio/"),
        "url"           => "/campus-chat/api/index.php/uploads/" . $r["stored_name"],
      ];
      // Try to fetch all attachments from message_attachments table
      try {
        $ma = $pdo->prepare("SELECT a.id, a.original_name, a.stored_name, a.mime_type, a.file_size, COALESCE(a.is_video,0) AS is_video FROM message_attachments ma JOIN attachments a ON a.id = ma.attachment_id WHERE ma.message_id = ? ORDER BY ma.sort_order ASC");
        $ma->execute([(int)$r["id"]]);
        $multi = $ma->fetchAll();
        if ($multi) {
          $r["attachments"] = array_map(fn($a) => [
            "id"            => (int)$a["id"],
            "original_name" => $a["original_name"],
            "mime_type"     => $a["mime_type"],
            "file_size"     => (int)$a["file_size"],
            "is_video"      => (bool)$a["is_video"],
            "is_voice"      => (bool)($a["is_voice"] ?? str_starts_with((string)$a["mime_type"], "audio/")),
            "url"           => "/campus-chat/api/index.php/uploads/" . $a["stored_name"],
          ], $multi);
        } else {
          // Fallback: use single attachment
          $r["attachments"] = [$r["attachment"]];
        }
      } catch (PDOException $e) {
        $r["attachments"] = [$r["attachment"]];
      }
    }
    // Fetch reactions — safe fallback if table not yet created
    try {
      $rs = $pdo->prepare("SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC");
      $rs->execute([(int)$r["id"]]); $reactions = $rs->fetchAll();
      $ur = $pdo->prepare("SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?");
      $ur->execute([(int)$r["id"], $user_id]); $my_reactions = $ur->fetchAll(PDO::FETCH_COLUMN);
      $r["reactions"]    = array_map(fn($rx) => ["emoji" => $rx["emoji"], "count" => (int)$rx["count"]], $reactions);
      $r["my_reactions"] = $my_reactions;
    } catch (PDOException $e) {
      $r["reactions"]    = [];
      $r["my_reactions"] = [];
    }
    unset($r["original_name"], $r["stored_name"], $r["mime_type"], $r["file_size"]);
    $result[] = $r;
  }
  json_response(["messages" => $result]);
}

// ── POST /messages/seen ──────────────────────────────────────────
if ($method === "POST" && $path === "/messages/seen") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $conversation_id = (int)($in["conversation_id"] ?? 0); $user_id = (int)$claims["sub"];
  if ($conversation_id <= 0) json_response(["error" => "conversation_id required"], 400);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, $user_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member"], 403);
  $pdo->beginTransaction();
  try {
    $stmt = $pdo->prepare("SELECT m.id FROM messages m LEFT JOIN message_reads mr ON mr.message_id = m.id AND mr.user_id = ? WHERE m.conversation_id = ? AND m.sender_id <> ? AND mr.id IS NULL");
    $stmt->execute([$user_id, $conversation_id, $user_id]); $unseen = $stmt->fetchAll(PDO::FETCH_COLUMN);
    if (!empty($unseen)) {
      $ph = implode(',', array_fill(0, count($unseen), '(?,?,NOW())')); $params = [];
      foreach ($unseen as $mid) { $params[] = (int)$mid; $params[] = $user_id; }
      $pdo->prepare("INSERT IGNORE INTO message_reads (message_id, user_id, read_at) VALUES {$ph}")->execute($params);
      $ms = $pdo->prepare("SELECT user_id FROM conversation_members WHERE conversation_id = ?"); $ms->execute([$conversation_id]); $all_ids = $ms->fetchAll(PDO::FETCH_COLUMN);
      foreach ($unseen as $mid) {
        $mid = (int)$mid;
        $ss = $pdo->prepare("SELECT sender_id FROM messages WHERE id = ?"); $ss->execute([$mid]); $sid = (int)$ss->fetchColumn();
        $readers = array_values(array_filter($all_ids, fn($uid) => (int)$uid !== $sid));
        $rc = $pdo->prepare("SELECT COUNT(*) FROM message_reads WHERE message_id = ? AND user_id IN (" . implode(',', array_fill(0, count($readers), '?')) . ")");
        $rc->execute(array_merge([$mid], $readers));
        $new_status = ((int)$rc->fetchColumn() >= count($readers)) ? 'seen' : 'delivered';
        $pdo->prepare("UPDATE messages SET status = ? WHERE id = ? AND status <> 'seen'")->execute([$new_status, $mid]);
      }
    }
    $pdo->prepare("INSERT INTO conversation_read_status (conversation_id, user_id, last_read_at, last_read_msg_id) VALUES (?, ?, NOW(), (SELECT MAX(id) FROM messages WHERE conversation_id = ?)) ON DUPLICATE KEY UPDATE last_read_at = NOW(), last_read_msg_id = (SELECT MAX(id) FROM messages WHERE conversation_id = ?)")
        ->execute([$conversation_id, $user_id, $conversation_id, $conversation_id]);
    $pdo->commit();
    json_response(["conversation_id" => $conversation_id, "updated" => count($unseen), "unseen_ids" => array_values($unseen)]);
  } catch (Exception $e) { $pdo->rollBack(); json_response(["error" => $e->getMessage()], 500); }
}

// ── PATCH /messages/{id} — edit (sender only, 15 min limit) ──────
if ($method === "PATCH" && preg_match('#^/messages/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $in      = json_input();
  $new_body = trim((string)($in["body"] ?? ""));
  if ($new_body === "") json_response(["error" => "body required"], 400);
  $stmt = $pdo->prepare("SELECT sender_id, body, created_at, is_deleted, attachment_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);
  if ((int)$msg["sender_id"] !== $user_id) json_response(["error" => "Cannot edit another user's message"], 403);
  if ($msg["is_deleted"]) json_response(["error" => "Cannot edit a deleted message"], 400);
  if ((time() - strtotime($msg["created_at"])) > 15 * 60) json_response(["error" => "Edit window has expired (15 minutes)"], 403);
  if (!$msg["body"] && $msg["attachment_id"]) json_response(["error" => "Cannot edit attachment-only messages"], 400);
  $pdo->prepare("UPDATE messages SET body = ?, is_edited = 1, edited_at = NOW() WHERE id = ?")->execute([$new_body, $msg_id]);
  $stmt = $pdo->prepare("SELECT conversation_id FROM messages WHERE id = ?"); $stmt->execute([$msg_id]); $row = $stmt->fetch();
  json_response(["edited" => true, "message_id" => $msg_id, "conversation_id" => (int)$row["conversation_id"], "body" => $new_body, "is_edited" => true, "edited_at" => date("Y-m-d H:i:s")]);
}

// ── DELETE /messages/{id} — hard delete for everyone (sender, 15min) ─
if ($method === "DELETE" && preg_match('#^/messages/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $in      = json_input();
  $for_me_only = (bool)($in["for_me"] ?? false);

  $stmt = $pdo->prepare("SELECT sender_id, created_at, is_deleted, conversation_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);

  if ($for_me_only) {
    // Hide message for this user only — any message, no time limit
    $pdo->prepare("INSERT IGNORE INTO message_hidden (message_id, user_id) VALUES (?, ?)")->execute([$msg_id, $user_id]);
    json_response(["hidden" => true, "message_id" => $msg_id, "conversation_id" => (int)$msg["conversation_id"]]);
  }

  // Hard delete — sender only, 15 min limit
  if ((int)$msg["sender_id"] !== $user_id) json_response(["error" => "Cannot delete another user's message"], 403);
  if ($msg["is_deleted"]) json_response(["error" => "Message already deleted"], 400);
  if ((time() - strtotime($msg["created_at"])) > 15 * 60) json_response(["error" => "Delete window has expired (15 minutes)"], 403);
  $pdo->prepare("UPDATE messages SET is_deleted = 1, body = NULL, attachment_id = NULL WHERE id = ?")->execute([$msg_id]);
  json_response(["deleted" => true, "message_id" => $msg_id, "conversation_id" => (int)$msg["conversation_id"]]);
}

// ── POST /messages/{id}/react ─────────────────────────────────────
if ($method === "POST" && preg_match('#^/messages/(\d+)/react$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $in      = json_input();
  $emoji   = trim((string)($in["emoji"] ?? ""));
  if ($emoji === "") json_response(["error" => "emoji required"], 400);

  // Verify message exists and user is member of conversation
  $stmt = $pdo->prepare("SELECT conversation_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$msg["conversation_id"], $user_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member"], 403);

  // Toggle: if already reacted with same emoji, remove it
  $stmt = $pdo->prepare("SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?");
  $stmt->execute([$msg_id, $user_id, $emoji]); $existing = $stmt->fetchColumn();

  if ($existing) {
    $pdo->prepare("DELETE FROM message_reactions WHERE id = ?")->execute([$existing]);
    $toggled = "removed";
  } else {
    $pdo->prepare("INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)")->execute([$msg_id, $user_id, $emoji]);
    $toggled = "added";
  }

  // Get updated reaction counts for this message
  $rs = $pdo->prepare("SELECT emoji, COUNT(*) as count FROM message_reactions WHERE message_id = ? GROUP BY emoji ORDER BY count DESC");
  $rs->execute([$msg_id]); $reactions = $rs->fetchAll();
  $ur = $pdo->prepare("SELECT emoji FROM message_reactions WHERE message_id = ? AND user_id = ?");
  $ur->execute([$msg_id, $user_id]); $my_reactions = $ur->fetchAll(PDO::FETCH_COLUMN);

  json_response([
    "toggled"      => $toggled,
    "message_id"   => $msg_id,
    "conversation_id" => (int)$msg["conversation_id"],
    "reactions"    => array_map(fn($r) => ["emoji" => $r["emoji"], "count" => (int)$r["count"]], $reactions),
    "my_reactions" => $my_reactions,
  ]);
}