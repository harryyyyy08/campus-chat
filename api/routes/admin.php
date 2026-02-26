<?php
// ── GET /admin/users ─────────────────────────────────────────────
if ($method === "GET" && $path === "/admin/users") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);
  $stmt = $pdo->prepare("SELECT id, username, full_name, status, role, department, created_at FROM users ORDER BY status ASC, created_at DESC");
  $stmt->execute(); $users = $stmt->fetchAll();
  foreach ($users as &$u) $u["id"] = (int)$u["id"];
  json_response(["users" => $users]);
}

// ── POST /admin/users/approve ────────────────────────────────────
if ($method === "POST" && $path === "/admin/users/approve") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);
  $user_id = (int)($in["user_id"] ?? 0); $role = $in["role"] ?? "student";
  if (!$user_id) json_response(["error" => "user_id required"], 400);
  $allowed_roles = is_super_admin($my_role) ? ["student","faculty","admin","super_admin"] : ["student","faculty"];
  if (!in_array($role, $allowed_roles)) $role = "student";
  $pdo->prepare("UPDATE users SET status = 'active', role = ? WHERE id = ?")->execute([$role, $user_id]);
  json_response(["approved" => true, "user_id" => $user_id, "role" => $role]);
}

// ── POST /admin/users/disable ────────────────────────────────────
if ($method === "POST" && $path === "/admin/users/disable") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);
  $user_id = (int)($in["user_id"] ?? 0);
  if (!$user_id) json_response(["error" => "user_id required"], 400);
  if ($user_id === (int)$claims["sub"]) json_response(["error" => "Cannot disable your own account"], 400);
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([$user_id]); $target_role = $stmt->fetchColumn();
  if (is_super_admin($target_role) && !is_super_admin($my_role)) json_response(["error" => "Cannot disable a super admin"], 403);
  $pdo->prepare("UPDATE users SET status = 'disabled' WHERE id = ?")->execute([$user_id]);
  json_response(["disabled" => true, "user_id" => $user_id]);
}

// ── POST /admin/users/role ───────────────────────────────────────
if ($method === "POST" && $path === "/admin/users/role") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Only super admins can change roles"], 403);
  $user_id = (int)($in["user_id"] ?? 0); $role = $in["role"] ?? "";
  if (!$user_id) json_response(["error" => "user_id required"], 400);
  if (!in_array($role, ["student","faculty","admin","super_admin"])) json_response(["error" => "Invalid role"], 400);
  $pdo->prepare("UPDATE users SET role = ? WHERE id = ?")->execute([$role, $user_id]);
  json_response(["updated" => true, "user_id" => $user_id, "role" => $role]);
}

// ── GET /admin/storage ─── super_admin only ──────────────────────
if ($method === "GET" && $path === "/admin/storage") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $stmt = $pdo->prepare("SELECT COUNT(*) as total_files, COALESCE(SUM(file_size),0) AS total_bytes FROM attachments"); $stmt->execute(); $stats = $stmt->fetch();
  $stmt = $pdo->prepare("SELECT a.id, a.original_name, a.stored_name, a.mime_type, a.file_size, a.last_accessed, a.created_at, u.full_name AS uploader_name, u.username AS uploader_username FROM attachments a JOIN users u ON u.id = a.uploader_id WHERE a.last_accessed < DATE_SUB(NOW(), INTERVAL 6 MONTH) ORDER BY a.last_accessed ASC LIMIT 200");
  $stmt->execute(); $stale = $stmt->fetchAll();
  foreach ($stale as &$s) { $s["id"] = (int)$s["id"]; $s["file_size"] = (int)$s["file_size"]; }
  $disk_used = 0;
  if (is_dir(UPLOAD_DIR)) { foreach (new DirectoryIterator(UPLOAD_DIR) as $f) { if ($f->isFile()) $disk_used += $f->getSize(); } }
  json_response(["total_files" => (int)$stats["total_files"], "total_bytes" => (int)$stats["total_bytes"], "disk_bytes" => $disk_used, "stale_files" => $stale, "stale_count" => count($stale), "stale_bytes" => array_sum(array_column($stale, "file_size"))]);
}

// ── POST /admin/cleanup ─── super_admin only ─────────────────────
if ($method === "POST" && $path === "/admin/cleanup") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $ids = array_map('intval', (array)($in["ids"] ?? []));
  $deleted = 0; $freed = 0;
  if (empty($ids)) {
    $stmt = $pdo->prepare("SELECT id, stored_name, file_size FROM attachments WHERE last_accessed < DATE_SUB(NOW(), INTERVAL 6 MONTH)"); $stmt->execute(); $rows = $stmt->fetchAll();
  } else {
    $ph = implode(',', array_fill(0, count($ids), '?')); $stmt = $pdo->prepare("SELECT id, stored_name, file_size FROM attachments WHERE id IN ({$ph})"); $stmt->execute($ids); $rows = $stmt->fetchAll();
  }
  foreach ($rows as $row) {
    $file_path = UPLOAD_DIR . $row["stored_name"];
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM attachments WHERE stored_name = ? AND id <> ?"); $stmt->execute([$row["stored_name"], $row["id"]]);
    if ((int)$stmt->fetchColumn() === 0 && file_exists($file_path)) unlink($file_path);
    $pdo->prepare("UPDATE messages SET attachment_id = NULL WHERE attachment_id = ?")->execute([$row["id"]]);
    $pdo->prepare("DELETE FROM attachments WHERE id = ?")->execute([$row["id"]]);
    $freed += (int)$row["file_size"]; $deleted++;
  }
  json_response(["deleted" => $deleted, "freed_bytes" => $freed]);
}

// ── GET /admin/conversations ─── super_admin only ────────────────
if ($method === "GET" && $path === "/admin/conversations") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $type_filter = $_GET["type"] ?? null;
  $search      = trim($_GET["q"] ?? "");
  $sql = "SELECT c.id, c.type, c.name, c.created_at, COUNT(DISTINCT cm.user_id) AS member_count, MAX(m.created_at) AS last_message_at, COUNT(DISTINCT mf.id) AS flag_count FROM conversations c LEFT JOIN conversation_members cm ON cm.conversation_id = c.id LEFT JOIN messages m ON m.conversation_id = c.id LEFT JOIN message_flags mf ON mf.message_id = m.id WHERE 1=1";
  $params = [];
  if ($type_filter && in_array($type_filter, ["direct","group"])) { $sql .= " AND c.type = ?"; $params[] = $type_filter; }
  if ($search !== "") { $sql .= " AND (c.name LIKE ? OR c.id IN (SELECT DISTINCT conversation_id FROM messages WHERE body LIKE ?))"; $params[] = "%$search%"; $params[] = "%$search%"; }
  $sql .= " GROUP BY c.id, c.type, c.name, c.created_at ORDER BY last_message_at DESC, c.id DESC LIMIT 200";
  $stmt = $pdo->prepare($sql); $stmt->execute($params); $convs = $stmt->fetchAll();
  foreach ($convs as &$c) {
    $c["id"] = (int)$c["id"]; $c["member_count"] = (int)$c["member_count"]; $c["flag_count"] = (int)$c["flag_count"];
    $ms = $pdo->prepare("SELECT u.id, u.username, u.full_name FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY u.full_name LIMIT 10");
    $ms->execute([$c["id"]]); $members = $ms->fetchAll();
    foreach ($members as &$m) $m["id"] = (int)$m["id"];
    $c["members"] = $members;
  }
  json_response(["conversations" => $convs]);
}

// ── GET /admin/conversations/messages ─── super_admin only ───────
if ($method === "GET" && $path === "/admin/conversations/messages") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $cid   = (int)($_GET["conversation_id"] ?? 0);
  $limit = min((int)($_GET["limit"] ?? 80), 200);
  if (!$cid) json_response(["error" => "conversation_id required"], 400);
  $stmt = $pdo->prepare("SELECT m.id, m.conversation_id, m.sender_id, m.body, m.status, m.created_at, m.attachment_id, m.is_edited, m.edited_at, m.is_deleted, u.username, u.full_name, a.original_name, a.mime_type, a.file_size, a.stored_name, (SELECT COUNT(*) FROM message_flags mf WHERE mf.message_id = m.id) AS flag_count, (SELECT reason FROM message_flags mf WHERE mf.message_id = m.id LIMIT 1) AS flag_reason FROM messages m JOIN users u ON u.id = m.sender_id LEFT JOIN attachments a ON a.id = m.attachment_id WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT ?");
  $stmt->bindValue(1, $cid, PDO::PARAM_INT); $stmt->bindValue(2, $limit, PDO::PARAM_INT); $stmt->execute();
  $rows = array_reverse($stmt->fetchAll());
  foreach ($rows as &$r) {
    $r["id"]         = (int)$r["id"];
    $r["sender_id"]  = (int)$r["sender_id"];
    $r["flag_count"] = (int)$r["flag_count"];
    $r["is_flagged"] = $r["flag_count"] > 0;
    $r["is_edited"]  = (bool)$r["is_edited"];
    $r["is_deleted"] = (bool)$r["is_deleted"];
    $r["attachment"] = null;
    if ($r["is_deleted"]) {
      $r["body"] = null; $r["attachment_id"] = null;
    } elseif ($r["attachment_id"]) {
      $r["attachment"] = ["original_name" => $r["original_name"], "mime_type" => $r["mime_type"], "file_size" => (int)$r["file_size"], "url" => "/campus-chat/api/index.php/uploads/" . $r["stored_name"]];
    }
    unset($r["original_name"], $r["mime_type"], $r["file_size"], $r["stored_name"]);
  }
  json_response(["messages" => $rows]);
}

// ── GET /admin/messages/search ─── super_admin only ──────────────
if ($method === "GET" && $path === "/admin/messages/search") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $q = trim($_GET["q"] ?? "");
  if (strlen($q) < 2) json_response(["messages" => [], "note" => "Query too short"], 200);
  $like = "%" . $q . "%";
  $stmt = $pdo->prepare("SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, c.type AS conv_type, c.name AS conv_name, u.username, u.full_name, (SELECT COUNT(*) FROM message_flags mf WHERE mf.message_id = m.id) AS flag_count FROM messages m JOIN users u ON u.id = m.sender_id JOIN conversations c ON c.id = m.conversation_id WHERE m.body LIKE ? ORDER BY m.created_at DESC LIMIT 100");
  $stmt->execute([$like]); $rows = $stmt->fetchAll();
  foreach ($rows as &$r) { $r["id"] = (int)$r["id"]; $r["sender_id"] = (int)$r["sender_id"]; $r["flag_count"] = (int)$r["flag_count"]; $r["is_flagged"] = $r["flag_count"] > 0; }
  json_response(["messages" => $rows, "query" => $q, "total" => count($rows)]);
}

// ── GET /admin/messages/flagged ─── super_admin only ─────────────
if ($method === "GET" && $path === "/admin/messages/flagged") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $stmt = $pdo->prepare("SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at, c.type AS conv_type, c.name AS conv_name, u.username, u.full_name, mf.reason AS flag_reason, mf.created_at AS flagged_at, fa.full_name AS flagged_by_name, fa.username AS flagged_by_username FROM message_flags mf JOIN messages m ON m.id = mf.message_id JOIN users u ON u.id = m.sender_id JOIN conversations c ON c.id = m.conversation_id JOIN users fa ON fa.id = mf.flagged_by ORDER BY mf.created_at DESC LIMIT 200");
  $stmt->execute(); $rows = $stmt->fetchAll();
  foreach ($rows as &$r) { $r["id"] = (int)$r["id"]; $r["sender_id"] = (int)$r["sender_id"]; }
  json_response(["flagged" => $rows]);
}

// ── POST /admin/messages/flag ─────────────────────────────────────
if ($method === "POST" && $path === "/admin/messages/flag") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $message_id = (int)($in["message_id"] ?? 0); $reason = trim((string)($in["reason"] ?? ""));
  if (!$message_id) json_response(["error" => "message_id required"], 400);
  $pdo->prepare("INSERT INTO message_flags (message_id, flagged_by, reason) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = NOW()")
      ->execute([$message_id, (int)$claims["sub"], $reason ?: null]);
  json_response(["flagged" => true, "message_id" => $message_id]);
}

// ── DELETE /admin/messages/flag ───────────────────────────────────
if ($method === "DELETE" && $path === "/admin/messages/flag") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);
  $message_id = (int)($in["message_id"] ?? 0);
  if (!$message_id) json_response(["error" => "message_id required"], 400);
  $pdo->prepare("DELETE FROM message_flags WHERE message_id = ?")->execute([$message_id]);
  json_response(["unflagged" => true, "message_id" => $message_id]);
}