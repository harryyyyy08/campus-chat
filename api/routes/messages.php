<?php
/**
 * Messages Routes Module
 * 
 * Purpose: Handles message sending and retrieval in conversations
 * Type: PHP Route Handler
 * 
 * Routes:
 * - POST /messages - Send a new message to a conversation
 * - GET /messages - Retrieve message history with pagination
 * - PATCH /messages/{id} - Update message read status (mark as delivered/seen)
 * - DELETE /messages/{id} - Delete a message
 * 
 * Features:
 * - Message status tracking (sent → delivered → seen)
 * - Optional file attachment linking
 * - Pagination support for loading message history
 * - Read receipt calculation for group conversations
 * - Timestamp recording for all messages
 * 
 * Behaviors:
 * - Sends: Validates sender is conversation member, links attachment if provided
 * - Get: Returns paginated messages with sender info and attachment details
 * - Status: Updates read receipts and notifies all members via WebSocket
 * 
 * Dependencies: db.php, auth.php, helpers.php
 * Usage: Included by api/index.php to handle /messages/* endpoints
 */

// ── POST /messages ───────────────────────────────────────────────
if ($method === "POST" && $path === "/messages") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $conversation_id = (int)($in["conversation_id"] ?? 0);
  $body            = trim((string)($in["body"] ?? ""));
  $attachment_id   = isset($in["attachment_id"]) ? (int)$in["attachment_id"] : null;
  if ($conversation_id <= 0 || ($body === "" && !$attachment_id)) json_response(["error" => "conversation_id and body (or attachment) required"], 400);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, (int)$claims["sub"]]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member of this conversation"], 403);
  if ($attachment_id) {
    $stmt = $pdo->prepare("SELECT 1 FROM attachments WHERE id = ? AND conversation_id = ? AND uploader_id = ? AND message_id IS NULL");
    $stmt->execute([$attachment_id, $conversation_id, (int)$claims["sub"]]);
    if (!$stmt->fetchColumn()) json_response(["error" => "Invalid attachment"], 400);
  }
  $pdo->prepare("INSERT INTO messages (conversation_id, sender_id, body, attachment_id, status) VALUES (?, ?, ?, ?, 'sent')")
      ->execute([$conversation_id, (int)$claims["sub"], $body, $attachment_id]);
  $message_id = (int)$pdo->lastInsertId();
  if ($attachment_id) $pdo->prepare("UPDATE attachments SET message_id = ? WHERE id = ?")->execute([$message_id, $attachment_id]);

  $stmt = $pdo->prepare("SELECT id, conversation_id, sender_id, body, attachment_id, status, created_at FROM messages WHERE id = ?");
  $stmt->execute([$message_id]); $row = $stmt->fetch();
  $row["id"] = (int)$row["id"]; $row["conversation_id"] = (int)$row["conversation_id"]; $row["sender_id"] = (int)$row["sender_id"];
  $row["attachment"] = null;
  if ($attachment_id) {
    $stmt = $pdo->prepare("SELECT original_name, stored_name, mime_type, file_size FROM attachments WHERE id = ?");
    $stmt->execute([$attachment_id]); $att = $stmt->fetch();
    if ($att) $row["attachment"] = ["id" => $attachment_id, "original_name" => $att["original_name"], "mime_type" => $att["mime_type"], "file_size" => (int)$att["file_size"], "url" => "/campus-chat/api/index.php/uploads/" . $att["stored_name"]];
  }
  json_response(["message_id" => $row["id"], "conversation_id" => $row["conversation_id"], "sender_id" => $row["sender_id"], "body" => $row["body"], "attachment" => $row["attachment"], "status" => $row["status"], "created_at" => $row["created_at"]], 201);
}

// ── GET /messages ────────────────────────────────────────────────
if ($method === "GET" && $path === "/messages") {
  $claims = require_auth(); $pdo = db();
  $conversation_id = (int)($_GET["conversation_id"] ?? 0);
  $limit = min(max((int)($_GET["limit"] ?? 50), 1), 200);
  $user_id = (int)$claims["sub"];
  if ($conversation_id <= 0) json_response(["error" => "conversation_id required"], 400);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, $user_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member of this conversation"], 403);
  $stmt = $pdo->prepare("SELECT m.id, m.conversation_id, m.sender_id, m.body, m.attachment_id, m.status, m.created_at, m.is_edited, m.edited_at, m.is_deleted, a.original_name, a.stored_name, a.mime_type, a.file_size FROM messages m LEFT JOIN attachments a ON a.id = m.attachment_id WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?");
  $stmt->bindValue(1, $conversation_id, PDO::PARAM_INT); $stmt->bindValue(2, $limit, PDO::PARAM_INT); $stmt->execute();
  $rows = array_reverse($stmt->fetchAll());
  $result = [];
  foreach ($rows as $r) {
    $r["id"] = (int)$r["id"]; $r["conversation_id"] = (int)$r["conversation_id"]; $r["sender_id"] = (int)$r["sender_id"];
    $r["is_edited"]  = (bool)$r["is_edited"];
    $r["is_deleted"] = (bool)$r["is_deleted"];
    $r["attachment"] = null;
    if ($r["is_deleted"]) {
      $r["body"] = null; $r["attachment_id"] = null;
    } elseif ($r["attachment_id"]) {
      $r["attachment"] = ["id" => (int)$r["attachment_id"], "original_name" => $r["original_name"], "mime_type" => $r["mime_type"], "file_size" => (int)$r["file_size"], "url" => "/campus-chat/api/index.php/uploads/" . $r["stored_name"]];
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

  json_response([
    "edited"          => true,
    "message_id"      => $msg_id,
    "conversation_id" => (int)$row["conversation_id"],
    "body"            => $new_body,
    "is_edited"       => true,
    "edited_at"       => date("Y-m-d H:i:s"),
  ]);
}

// ── DELETE /messages/{id} — delete (sender only, 15 min limit) ───
if ($method === "DELETE" && preg_match('#^/messages/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];

  $stmt = $pdo->prepare("SELECT sender_id, created_at, is_deleted, conversation_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);
  if ((int)$msg["sender_id"] !== $user_id) json_response(["error" => "Cannot delete another user's message"], 403);
  if ($msg["is_deleted"]) json_response(["error" => "Message already deleted"], 400);
  if ((time() - strtotime($msg["created_at"])) > 15 * 60) json_response(["error" => "Delete window has expired (15 minutes)"], 403);

  $pdo->prepare("UPDATE messages SET is_deleted = 1, body = NULL, attachment_id = NULL WHERE id = ?")->execute([$msg_id]);
  json_response(["deleted" => true, "message_id" => $msg_id, "conversation_id" => (int)$msg["conversation_id"]]);
}