<?php
/**
 * Conversations Routes Module
 * 
 * Purpose: Manages direct and group chat conversations
 * Type: PHP Route Handler
 * 
 * Routes:
 * - POST /conversations/direct - Create one-on-one direct message conversation
 * - POST /conversations/group - Create group chat with multiple members
 * - GET /conversations - List all conversations for the logged-in user
 * - GET /conversations/{id} - Get specific conversation details
 * - POST /conversations/{id}/members - Add members to group chat
 * - DELETE /conversations/{id}/members/{user_id} - Remove member from group
 * 
 * Behaviors:
 * - Direct: Creates 2-member conversation, prevents self-chat, checks for existing
 * - Group: Creates multi-member conversation with admin/member roles
 * - List: Returns all active conversations with last message and unread count
 * 
 * Dependencies: db.php, auth.php, helpers.php
 * Usage: Included by api/index.php to handle /conversations/* endpoints
 */

// ── POST /conversations/direct ───────────────────────────────────
if ($method === "POST" && $path === "/conversations/direct") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $me_id = (int)$claims["sub"];
  $other_username = trim((string)($in["other_username"] ?? ""));
  if ($other_username === "") json_response(["error" => "other_username required"], 400);

  $stmt = $pdo->prepare("SELECT id, username, full_name FROM users WHERE username = ? AND status = 'active'");
  $stmt->execute([$other_username]); $other = $stmt->fetch();
  if (!$other) json_response(["error" => "User not found"], 404);
  $other_id = (int)$other["id"];
  if ($other_id === $me_id) json_response(["error" => "Cannot create conversation with yourself"], 400);

  $stmt = $pdo->prepare("SELECT c.id AS conversation_id FROM conversations c JOIN conversation_members cm1 ON cm1.conversation_id = c.id AND cm1.user_id = ? JOIN conversation_members cm2 ON cm2.conversation_id = c.id AND cm2.user_id = ? WHERE c.type = 'direct' LIMIT 1");
  $stmt->execute([$me_id, $other_id]); $existing = $stmt->fetch();
  if ($existing) json_response(["conversation_id" => (int)$existing["conversation_id"], "created" => false, "other_user" => ["id" => $other_id, "username" => $other["username"], "full_name" => $other["full_name"]]]);

  $pdo->beginTransaction();
  try {
    $pdo->prepare("INSERT INTO conversations (type) VALUES ('direct')")->execute();
    $cid = (int)$pdo->lastInsertId();
    $ins = $pdo->prepare("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')");
    $ins->execute([$cid, $me_id]); $ins->execute([$cid, $other_id]);
    $pdo->commit();
    json_response(["conversation_id" => $cid, "created" => true, "other_user" => ["id" => $other_id, "username" => $other["username"], "full_name" => $other["full_name"]]], 201);
  } catch (Exception $e) { $pdo->rollBack(); json_response(["error" => "Failed: " . $e->getMessage()], 500); }
}

// ── POST /conversations/group ────────────────────────────────────
if ($method === "POST" && $path === "/conversations/group") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $me_id = (int)$claims["sub"];
  $name  = trim((string)($in["name"] ?? ""));
  $member_ids = array_values(array_unique(array_filter(array_map('intval', (array)($in["member_ids"] ?? [])), fn($id) => $id !== $me_id)));
  if ($name === "") json_response(["error" => "Group name is required"], 400);
  if (count($member_ids) < 1) json_response(["error" => "Add at least 1 other member"], 400);
  $ph = implode(',', array_fill(0, count($member_ids), '?'));
  $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE id IN ({$ph}) AND status = 'active'");
  $stmt->execute($member_ids);
  if ((int)$stmt->fetchColumn() !== count($member_ids)) json_response(["error" => "One or more users not found"], 404);
  $pdo->beginTransaction();
  try {
    $pdo->prepare("INSERT INTO conversations (type, name) VALUES ('group', ?)")->execute([$name]);
    $cid = (int)$pdo->lastInsertId();
    $pdo->prepare("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'admin')")->execute([$cid, $me_id]);
    $ins = $pdo->prepare("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')");
    foreach ($member_ids as $uid) $ins->execute([$cid, $uid]);
    $pdo->commit();
    json_response(["conversation_id" => $cid, "created" => true, "name" => $name], 201);
  } catch (Exception $e) { $pdo->rollBack(); json_response(["error" => "Failed: " . $e->getMessage()], 500); }
}

// ── POST /conversations/members ──────────────────────────────────
if ($method === "POST" && $path === "/conversations/members") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $me_id = (int)$claims["sub"]; $cid = (int)($in["conversation_id"] ?? 0); $new_uid = (int)($in["user_id"] ?? 0);
  if (!$cid || !$new_uid) json_response(["error" => "conversation_id and user_id required"], 400);
  $stmt = $pdo->prepare("SELECT type FROM conversations WHERE id = ?"); $stmt->execute([$cid]); $conv = $stmt->fetch();
  if (!$conv || $conv["type"] !== "group") json_response(["error" => "Not a group conversation"], 400);
  $stmt = $pdo->prepare("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?"); $stmt->execute([$cid, $me_id]);
  if ($stmt->fetchColumn() !== "admin") json_response(["error" => "Only admins can add members"], 403);
  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?"); $stmt->execute([$cid, $new_uid]);
  if ($stmt->fetchColumn()) json_response(["error" => "User is already a member"], 409);
  $pdo->prepare("INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')")->execute([$cid, $new_uid]);
  $stmt = $pdo->prepare("SELECT id, username, full_name FROM users WHERE id = ?"); $stmt->execute([$new_uid]); $u = $stmt->fetch(); $u["id"] = (int)$u["id"];
  json_response(["added" => true, "user" => $u, "conversation_id" => $cid], 201);
}

// ── DELETE /conversations/members ────────────────────────────────
if ($method === "DELETE" && $path === "/conversations/members") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $me_id = (int)$claims["sub"]; $cid = (int)($in["conversation_id"] ?? 0); $rem_uid = (int)($in["user_id"] ?? 0);
  if (!$cid || !$rem_uid) json_response(["error" => "conversation_id and user_id required"], 400);
  $stmt = $pdo->prepare("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?"); $stmt->execute([$cid, $me_id]); $my_role = $stmt->fetchColumn();
  if ($my_role !== "admin" && $rem_uid !== $me_id) json_response(["error" => "Only admins can remove members"], 403);
  $pdo->prepare("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?")->execute([$cid, $rem_uid]);
  json_response(["removed" => true, "conversation_id" => $cid, "user_id" => $rem_uid]);
}

// ── POST /conversations/leave ────────────────────────────────────
if ($method === "POST" && $path === "/conversations/leave") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $me_id = (int)$claims["sub"]; $cid = (int)($in["conversation_id"] ?? 0);
  if (!$cid) json_response(["error" => "conversation_id required"], 400);
  $stmt = $pdo->prepare("SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?"); $stmt->execute([$cid, $me_id]); $my_role = $stmt->fetchColumn();
  if (!$my_role) json_response(["error" => "Not a member"], 403);
  if ($my_role === "admin") {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND role = 'admin'"); $stmt->execute([$cid]);
    if ((int)$stmt->fetchColumn() <= 1) {
      $stmt = $pdo->prepare("SELECT COUNT(*) FROM conversation_members WHERE conversation_id = ? AND user_id <> ?"); $stmt->execute([$cid, $me_id]);
      if ((int)$stmt->fetchColumn() > 0) json_response(["error" => "Promote another admin before leaving"], 400);
    }
  }
  $pdo->prepare("DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?")->execute([$cid, $me_id]);
  $pdo->prepare("INSERT INTO messages (conversation_id, sender_id, body, status) VALUES (?, ?, '[left the group]', 'seen')")->execute([$cid, $me_id]);
  json_response(["left" => true, "conversation_id" => $cid]);
}

// ── GET /conversations/unread ────────────────────────────────────
if ($method === "GET" && $path === "/conversations/unread") {
  $claims = require_auth(); $pdo = db(); $user_id = (int)$claims["sub"];
  $stmt = $pdo->prepare("SELECT m.conversation_id, COUNT(m.id) AS unread_count FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ? LEFT JOIN conversation_read_status crs ON crs.conversation_id = m.conversation_id AND crs.user_id = ? WHERE m.sender_id <> ? AND (crs.last_read_msg_id IS NULL OR m.id > crs.last_read_msg_id) GROUP BY m.conversation_id");
  $stmt->execute([$user_id, $user_id, $user_id]);
  $counts = []; foreach ($stmt->fetchAll() as $r) $counts[(int)$r["conversation_id"]] = (int)$r["unread_count"];
  json_response(["unread" => $counts]);
}

// ── GET /conversations ───────────────────────────────────────────
if ($method === "GET" && $path === "/conversations") {
  $claims = require_auth(); $pdo = db(); $user_id = (int)$claims["sub"];
  $stmt = $pdo->prepare("SELECT c.id AS conversation_id, c.type, c.name, MAX(m.created_at) AS last_message_time FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id LEFT JOIN messages m ON m.conversation_id = c.id WHERE cm.user_id = ? GROUP BY c.id, c.type, c.name ORDER BY last_message_time DESC, c.id DESC");
  $stmt->execute([$user_id]); $convs = $stmt->fetchAll();
  foreach ($convs as &$c) {
    $cid = (int)$c["conversation_id"]; $c["conversation_id"] = $cid;
    $mstmt = $pdo->prepare("SELECT u.id, u.username, u.full_name, cm.role FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY cm.role DESC, u.full_name");
    $mstmt->execute([$cid]); $members = $mstmt->fetchAll();
    foreach ($members as &$m) { $m["id"] = (int)$m["id"]; if ($m["id"] === $user_id) $c["my_role"] = $m["role"]; }
    $c["members"] = $members;
    $lstmt = $pdo->prepare("SELECT id, sender_id, body, attachment_id, status, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1");
    $lstmt->execute([$cid]); $last = $lstmt->fetch();
    if ($last) { $last["id"] = (int)$last["id"]; $last["sender_id"] = (int)$last["sender_id"]; $last["has_attachment"] = !empty($last["attachment_id"]); }
    $c["last_message"] = $last ?: null;
  }
  json_response(["conversations" => $convs]);
}