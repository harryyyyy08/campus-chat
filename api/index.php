<?php
require_once __DIR__ . "/db.php";
require_once __DIR__ . "/helpers.php";
require_once __DIR__ . "/jwt.php";
require_once __DIR__ . "/auth.php";

header("Access-Control-Allow-Origin: http://localhost:3001");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

$cfg    = require __DIR__ . "/config.php";
$method = $_SERVER["REQUEST_METHOD"];
$path   = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$path   = preg_replace('#^/campus-chat/api#', '', $path);
$path   = preg_replace('#^/index\.php#',      '', $path);
if ($path === '') $path = '/';

define('UPLOAD_DIR',      __DIR__ . '/../uploads/');
define('UPLOAD_MAX_BYTES', 25 * 1024 * 1024);
define('ALLOWED_MIME', [
  'image/jpeg','image/png','image/gif','image/webp',
  'application/pdf','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

if (!is_dir(UPLOAD_DIR)) mkdir(UPLOAD_DIR, 0755, true);

// Helper: check if role is any kind of admin
function is_admin(string $role): bool {
  return in_array($role, ['admin', 'super_admin']);
}

// Helper: check if role is super_admin only
function is_super_admin(string $role): bool {
  return $role === 'super_admin';
}

// ── POST /login ──────────────────────────────────────────────────
if ($method === "POST" && $path === "/login") {
  $in = json_input();
  $username = trim($in["username"] ?? "");
  $password = (string)($in["password"] ?? "");
  if ($username === "" || $password === "") json_response(["error" => "username and password required"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT id, username, full_name, password_hash, status, role FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();
  if (!$user || !password_verify($password, $user["password_hash"])) json_response(["error" => "Invalid credentials"], 401);
  if ($user["status"] === "pending")  json_response(["error" => "Your account is pending admin approval"], 403);
  if ($user["status"] === "disabled") json_response(["error" => "Your account has been disabled"], 403);

  $now = time();
  $token = jwt_sign([
    "iss" => $cfg["jwt"]["issuer"], "sub" => (int)$user["id"],
    "username" => $user["username"], "iat" => $now, "exp" => $now + $cfg["jwt"]["ttl_seconds"]
  ], $cfg["jwt"]["secret"]);

  json_response([
    "access_token" => $token,
    "user" => [
      "id"        => (int)$user["id"],
      "username"  => $user["username"],
      "full_name" => $user["full_name"],
      "role"      => $user["role"]
    ],
    "ws_url" => $cfg["ws"]["url"]
  ]);
}

// ── GET /me ──────────────────────────────────────────────────────
if ($method === "GET" && $path === "/me") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT id, username, full_name, created_at FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $me = $stmt->fetch();
  if (!$me) json_response(["error" => "User not found"], 404);
  $me["id"] = (int)$me["id"];
  json_response(["user" => $me]);
}

// ── GET /users/search ────────────────────────────────────────────
if ($method === "GET" && $path === "/users/search") {
  $claims = require_auth(); $user_id = (int)$claims["sub"];
  $q = trim($_GET["q"] ?? "");
  if (strlen($q) < 1) json_response(["users" => []]);
  $pdo = db(); $like = "%" . $q . "%";
  $stmt = $pdo->prepare("SELECT id, username, full_name FROM users WHERE id <> ? AND status = 'active' AND (username LIKE ? OR full_name LIKE ?) ORDER BY full_name, username LIMIT 20");
  $stmt->execute([$user_id, $like, $like]);
  $users = $stmt->fetchAll();
  foreach ($users as &$u) $u["id"] = (int)$u["id"];
  json_response(["users" => $users]);
}

// ── POST /register ───────────────────────────────────────────────
if ($method === "POST" && $path === "/register") {
  $pdo = db(); $in = json_input();
  $full_name  = trim((string)($in["full_name"]  ?? ""));
  $username   = strtolower(trim((string)($in["username"] ?? "")));
  $password   = (string)($in["password"]   ?? "");
  $role       = (string)($in["role"]       ?? "student");
  $department = trim((string)($in["department"] ?? ""));

  if ($full_name === "")  json_response(["error" => "Full name is required"], 400);
  if ($username === "")   json_response(["error" => "Username is required"], 400);
  if (!preg_match('/^[a-z0-9_]+$/', $username)) json_response(["error" => "Username: lowercase letters, numbers, underscores only"], 400);
  if (strlen($username) < 3) json_response(["error" => "Username must be at least 3 characters"], 400);
  if (strlen($password) < 8) json_response(["error" => "Password must be at least 8 characters"], 400);
  // Users can only self-register as student or faculty — never admin/super_admin
  if (!in_array($role, ["student","faculty"])) $role = "student";

  $stmt = $pdo->prepare("SELECT 1 FROM users WHERE username = ?");
  $stmt->execute([$username]);
  if ($stmt->fetchColumn()) json_response(["error" => "Username is already taken"], 409);

  $hash = password_hash($password, PASSWORD_DEFAULT);
  $pdo->prepare("INSERT INTO users (username, full_name, password_hash, status, role, department) VALUES (?, ?, ?, 'pending', ?, ?)")
      ->execute([$username, $full_name, $hash, $role, $department ?: null]);
  json_response(["registered" => true, "message" => "Registration submitted. Please wait for admin approval."], 201);
}

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

// ── POST /upload ─────────────────────────────────────────────────
if ($method === "POST" && $path === "/upload") {
  $claims          = require_auth();
  $pdo             = db();
  $uploader_id     = (int)$claims["sub"];
  $conversation_id = (int)($_POST["conversation_id"] ?? 0);

  if ($conversation_id <= 0) json_response(["error" => "conversation_id required"], 400);
  if (empty($_FILES["file"])) json_response(["error" => "No file uploaded"], 400);

  $stmt = $pdo->prepare("SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?");
  $stmt->execute([$conversation_id, $uploader_id]);
  if (!$stmt->fetchColumn()) json_response(["error" => "Not a member of this conversation"], 403);

  $file       = $_FILES["file"];
  $tmp_path   = $file["tmp_name"];
  $orig_name  = basename($file["name"]);
  $file_size  = (int)$file["size"];
  $upload_err = $file["error"];

  if ($upload_err !== UPLOAD_ERR_OK) json_response(["error" => "Upload error code: " . $upload_err], 400);
  if ($file_size > UPLOAD_MAX_BYTES)  json_response(["error" => "File exceeds 25 MB limit"], 400);
  if ($file_size === 0)               json_response(["error" => "Empty file"], 400);

  $finfo     = new finfo(FILEINFO_MIME_TYPE);
  $mime_type = $finfo->file($tmp_path);
  if (!in_array($mime_type, ALLOWED_MIME)) json_response(["error" => "File type not allowed: " . $mime_type], 400);

  $file_hash = hash_file('sha256', $tmp_path);

  // Duplicate detection: check if same physical file exists already
  $stmt = $pdo->prepare("SELECT stored_name FROM attachments WHERE file_hash = ? LIMIT 1");
  $stmt->execute([$file_hash]);
  $existing_stored = $stmt->fetchColumn();

  if ($existing_stored && file_exists(UPLOAD_DIR . $existing_stored)) {
    // Reuse same physical file — just point to same stored_name
    $stored_name = $existing_stored;
    // No need to move the tmp file
  } else {
    // Save new physical file
    $ext         = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));
    $stored_name = bin2hex(random_bytes(16)) . ($ext ? ".$ext" : "");
    $dest        = UPLOAD_DIR . $stored_name;
    if (!move_uploaded_file($tmp_path, $dest)) json_response(["error" => "Failed to save file"], 500);
  }

  // Always insert a new attachment record (even for duplicates)
  // stored_name is no longer UNIQUE — physical dedup via file_hash only
  $pdo->prepare("INSERT INTO attachments (conversation_id, uploader_id, original_name, stored_name, file_hash, mime_type, file_size) VALUES (?, ?, ?, ?, ?, ?, ?)")
      ->execute([$conversation_id, $uploader_id, $orig_name, $stored_name, $file_hash, $mime_type, $file_size]);

  $attachment_id = (int)$pdo->lastInsertId();

  json_response([
    "attachment_id" => $attachment_id,
    "original_name" => $orig_name,
    "stored_name"   => $stored_name,
    "mime_type"     => $mime_type,
    "file_size"     => $file_size,
    "url"           => "/campus-chat/api/index.php/uploads/" . $stored_name,
  ], 201);
}

// ── GET /admin/uploads/{filename} ─── super_admin only ─────────
// Admin version of file serving — no membership check required
if ($method === "GET" && preg_match('#^/admin/uploads/([a-zA-Z0-9_.\-]+)$#', $path, $m)) {
  $pdo         = db();
  $stored_name = $m[1];

  // Accept token from Authorization header OR ?token= query param
  $bearer = null;
  $auth_header = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/^Bearer\s+(.+)$/i', $auth_header, $bm)) {
    $bearer = $bm[1];
  } elseif (!empty($_GET["token"])) {
    $bearer = $_GET["token"];
  }
  if (!$bearer) json_response(["error" => "Unauthorized"], 401);

  try {
    $jwt_cfg = $cfg["jwt"];
    $claims  = jwt_verify($bearer, $jwt_cfg["secret"]);
  } catch (Exception $e) {
    json_response(["error" => "Unauthorized: " . $e->getMessage()], 401);
  }

  // Super admin only
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $stmt = $pdo->prepare("SELECT original_name, mime_type FROM attachments WHERE stored_name = ? LIMIT 1");
  $stmt->execute([$stored_name]); $att = $stmt->fetch();
  if (!$att) json_response(["error" => "File not found"], 404);

  $file_path = UPLOAD_DIR . $stored_name;
  if (!file_exists($file_path)) json_response(["error" => "File not found on disk"], 404);

  header("Content-Type: " . $att["mime_type"]);
  header("Content-Length: " . filesize($file_path));
  header('Content-Disposition: inline; filename="' . addslashes($att["original_name"]) . '"');
  header("Cache-Control: private, max-age=3600");
  readfile($file_path);
  exit;
}

// ── GET /uploads/{filename} — serve file with token support ──────
// FIX: Accept token both from Authorization header AND ?token= query param
// (needed because <img> tags cannot send custom headers)
if ($method === "GET" && preg_match('#^/uploads/([a-zA-Z0-9_.\-]+)$#', $path, $m)) {
  $pdo         = db();
  $stored_name = $m[1];

  // Try Authorization header first, then ?token= query param
  $bearer = null;
  $auth_header = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/^Bearer\s+(.+)$/i', $auth_header, $bm)) {
    $bearer = $bm[1];
  } elseif (!empty($_GET["token"])) {
    $bearer = $_GET["token"];
  }

  if (!$bearer) json_response(["error" => "Unauthorized"], 401);

  // Verify JWT manually (require_auth() uses headers only)
  try {
    $jwt_cfg = $cfg["jwt"];
    $claims  = jwt_verify($bearer, $jwt_cfg["secret"]);
  } catch (Exception $e) {
    json_response(["error" => "Unauthorized: " . $e->getMessage()], 401);
  }

  $user_id = (int)$claims["sub"];

  $stmt = $pdo->prepare("SELECT id, original_name, mime_type, file_size, conversation_id FROM attachments WHERE stored_name = ? LIMIT 1");
  $stmt->execute([$stored_name]); $att = $stmt->fetch();
  if (!$att) json_response(["error" => "File not found"], 404);

  // Access control: valid JWT is sufficient — no membership check needed.
  // The token proves the user is authenticated. Users can only obtain attachment
  // URLs through the /messages endpoint, which already enforces membership.

  $file_path = UPLOAD_DIR . $stored_name;
  if (!file_exists($file_path)) json_response(["error" => "File not found on disk"], 404);

  // Update last_accessed
  $pdo->prepare("UPDATE attachments SET last_accessed = NOW() WHERE stored_name = ?")->execute([$stored_name]);

  // Serve the file
  header("Content-Type: " . $att["mime_type"]);
  header("Content-Length: " . filesize($file_path));
  header('Content-Disposition: inline; filename="' . addslashes($att["original_name"]) . '"');
  header("Cache-Control: private, max-age=3600");
  readfile($file_path);
  exit;
}

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
      // Deleted messages: hide body and attachment
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

// ── GET /admin/users ─────────────────────────────────────────────
// Both admin and super_admin can view and manage users
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
  // Only super_admin can assign admin/super_admin role
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
  // Prevent admin from disabling super_admin
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([$user_id]); $target_role = $stmt->fetchColumn();
  if (is_super_admin($target_role) && !is_super_admin($my_role)) json_response(["error" => "Cannot disable a super admin"], 403);
  $pdo->prepare("UPDATE users SET status = 'disabled' WHERE id = ?")->execute([$user_id]);
  json_response(["disabled" => true, "user_id" => $user_id]);
}

// ── POST /admin/users/role ───────────────────────────────────────
// Only super_admin can change roles
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
// List all conversations with member count, last message, flag count
if ($method === "GET" && $path === "/admin/conversations") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $type_filter = $_GET["type"] ?? null; // 'direct' or 'group'
  $search      = trim($_GET["q"] ?? "");

  $sql = "SELECT c.id, c.type, c.name, c.created_at,
    COUNT(DISTINCT cm.user_id) AS member_count,
    MAX(m.created_at) AS last_message_at,
    COUNT(DISTINCT mf.id) AS flag_count
  FROM conversations c
  LEFT JOIN conversation_members cm ON cm.conversation_id = c.id
  LEFT JOIN messages m ON m.conversation_id = c.id
  LEFT JOIN message_flags mf ON mf.message_id = m.id
  WHERE 1=1";
  $params = [];

  if ($type_filter && in_array($type_filter, ["direct","group"])) { $sql .= " AND c.type = ?"; $params[] = $type_filter; }
  if ($search !== "") { $sql .= " AND (c.name LIKE ? OR c.id IN (SELECT DISTINCT conversation_id FROM messages WHERE body LIKE ?))"; $params[] = "%$search%"; $params[] = "%$search%"; }

  $sql .= " GROUP BY c.id, c.type, c.name, c.created_at ORDER BY last_message_at DESC, c.id DESC LIMIT 200";
  $stmt = $pdo->prepare($sql); $stmt->execute($params);
  $convs = $stmt->fetchAll();

  foreach ($convs as &$c) {
    $c["id"]           = (int)$c["id"];
    $c["member_count"] = (int)$c["member_count"];
    $c["flag_count"]   = (int)$c["flag_count"];

    // For direct chats, get both member names
    $ms = $pdo->prepare("SELECT u.id, u.username, u.full_name FROM conversation_members cm JOIN users u ON u.id = cm.user_id WHERE cm.conversation_id = ? ORDER BY u.full_name LIMIT 10");
    $ms->execute([$c["id"]]); $members = $ms->fetchAll();
    foreach ($members as &$m) $m["id"] = (int)$m["id"];
    $c["members"] = $members;
  }

  json_response(["conversations" => $convs]);
}

// ── GET /admin/conversations/messages ─── super_admin only ───────
// View all messages inside a specific conversation
if ($method === "GET" && $path === "/admin/conversations/messages") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $cid   = (int)($_GET["conversation_id"] ?? 0);
  $limit = min((int)($_GET["limit"] ?? 80), 200);
  if (!$cid) json_response(["error" => "conversation_id required"], 400);

  $stmt = $pdo->prepare("
    SELECT m.id, m.conversation_id, m.sender_id, m.body, m.status, m.created_at,
           m.attachment_id, u.username, u.full_name,
           a.original_name, a.mime_type, a.file_size, a.stored_name,
           (SELECT COUNT(*) FROM message_flags mf WHERE mf.message_id = m.id) AS flag_count,
           (SELECT reason FROM message_flags mf WHERE mf.message_id = m.id LIMIT 1) AS flag_reason
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    LEFT JOIN attachments a ON a.id = m.attachment_id
    WHERE m.conversation_id = ?
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ?
  ");
  $stmt->bindValue(1, $cid, PDO::PARAM_INT);
  $stmt->bindValue(2, $limit, PDO::PARAM_INT);
  $stmt->execute();
  $rows = array_reverse($stmt->fetchAll());

  foreach ($rows as &$r) {
    $r["id"]           = (int)$r["id"];
    $r["sender_id"]    = (int)$r["sender_id"];
    $r["flag_count"]   = (int)$r["flag_count"];
    $r["is_flagged"]   = $r["flag_count"] > 0;
    $r["attachment"]   = null;
    if ($r["attachment_id"]) {
      $r["attachment"] = ["original_name" => $r["original_name"], "mime_type" => $r["mime_type"], "file_size" => (int)$r["file_size"], "url" => "/campus-chat/api/index.php/uploads/" . $r["stored_name"]];
    }
    unset($r["original_name"], $r["mime_type"], $r["file_size"], $r["stored_name"]);
  }

  json_response(["messages" => $rows]);
}

// ── GET /admin/messages/search ─── super_admin only ──────────────
// Search messages by keyword across all conversations
if ($method === "GET" && $path === "/admin/messages/search") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $q = trim($_GET["q"] ?? "");
  if (strlen($q) < 2) json_response(["messages" => [], "note" => "Query too short"], 200);

  $like = "%" . $q . "%";
  $stmt = $pdo->prepare("
    SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
           c.type AS conv_type, c.name AS conv_name,
           u.username, u.full_name,
           (SELECT COUNT(*) FROM message_flags mf WHERE mf.message_id = m.id) AS flag_count
    FROM messages m
    JOIN users u ON u.id = m.sender_id
    JOIN conversations c ON c.id = m.conversation_id
    WHERE m.body LIKE ?
    ORDER BY m.created_at DESC
    LIMIT 100
  ");
  $stmt->execute([$like]);
  $rows = $stmt->fetchAll();
  foreach ($rows as &$r) { $r["id"] = (int)$r["id"]; $r["sender_id"] = (int)$r["sender_id"]; $r["flag_count"] = (int)$r["flag_count"]; $r["is_flagged"] = $r["flag_count"] > 0; }

  json_response(["messages" => $rows, "query" => $q, "total" => count($rows)]);
}

// ── GET /admin/messages/flagged ─── super_admin only ─────────────
// List all flagged messages
if ($method === "GET" && $path === "/admin/messages/flagged") {
  $claims = require_auth(); $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $stmt = $pdo->prepare("
    SELECT m.id, m.conversation_id, m.sender_id, m.body, m.created_at,
           c.type AS conv_type, c.name AS conv_name,
           u.username, u.full_name,
           mf.reason AS flag_reason, mf.created_at AS flagged_at,
           fa.full_name AS flagged_by_name, fa.username AS flagged_by_username
    FROM message_flags mf
    JOIN messages m ON m.id = mf.message_id
    JOIN users u ON u.id = m.sender_id
    JOIN conversations c ON c.id = m.conversation_id
    JOIN users fa ON fa.id = mf.flagged_by
    ORDER BY mf.created_at DESC
    LIMIT 200
  ");
  $stmt->execute();
  $rows = $stmt->fetchAll();
  foreach ($rows as &$r) { $r["id"] = (int)$r["id"]; $r["sender_id"] = (int)$r["sender_id"]; }

  json_response(["flagged" => $rows]);
}

// ── POST /admin/messages/flag ─── super_admin only ────────────────
if ($method === "POST" && $path === "/admin/messages/flag") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $message_id = (int)($in["message_id"] ?? 0);
  $reason     = trim((string)($in["reason"] ?? ""));
  if (!$message_id) json_response(["error" => "message_id required"], 400);

  $pdo->prepare("INSERT INTO message_flags (message_id, flagged_by, reason) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_at = NOW()")
      ->execute([$message_id, (int)$claims["sub"], $reason ?: null]);

  json_response(["flagged" => true, "message_id" => $message_id]);
}

// ── DELETE /admin/messages/flag ─── super_admin only ─────────────
if ($method === "DELETE" && $path === "/admin/messages/flag") {
  $claims = require_auth(); $pdo = db(); $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?"); $stmt->execute([(int)$claims["sub"]]); $my_role = $stmt->fetchColumn();
  if (!is_super_admin($my_role)) json_response(["error" => "Super admin access required"], 403);

  $message_id = (int)($in["message_id"] ?? 0);
  if (!$message_id) json_response(["error" => "message_id required"], 400);

  $pdo->prepare("DELETE FROM message_flags WHERE message_id = ?")->execute([$message_id]);
  json_response(["unflagged" => true, "message_id" => $message_id]);
}


// ── PATCH /messages/{id} — edit message (sender only, 15 min limit) ──
if ($method === "PATCH" && preg_match('#^/messages/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $in      = json_input();
  $new_body = trim((string)($in["body"] ?? ""));

  if ($new_body === "") json_response(["error" => "body required"], 400);

  // Fetch message
  $stmt = $pdo->prepare("SELECT sender_id, body, created_at, is_deleted, attachment_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);

  // Only sender can edit
  if ((int)$msg["sender_id"] !== $user_id) json_response(["error" => "Cannot edit another user\'s message"], 403);

  // Cannot edit deleted messages
  if ($msg["is_deleted"]) json_response(["error" => "Cannot edit a deleted message"], 400);

  // 15-minute time limit
  $created = strtotime($msg["created_at"]);
  if ((time() - $created) > 15 * 60) json_response(["error" => "Edit window has expired (15 minutes)"], 403);

  // Cannot edit attachment-only messages (no text to edit)
  if (!$msg["body"] && $msg["attachment_id"]) json_response(["error" => "Cannot edit attachment-only messages"], 400);

  $pdo->prepare("UPDATE messages SET body = ?, is_edited = 1, edited_at = NOW() WHERE id = ?")
      ->execute([$new_body, $msg_id]);

  // Get conversation_id for broadcast
  $stmt = $pdo->prepare("SELECT conversation_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $row = $stmt->fetch();

  json_response([
    "edited"          => true,
    "message_id"      => $msg_id,
    "conversation_id" => (int)$row["conversation_id"],
    "body"            => $new_body,
    "is_edited"       => true,
    "edited_at"       => date("Y-m-d H:i:s"),
  ]);
}

// ── DELETE /messages/{id} — delete message (sender only, 15 min limit) ──
if ($method === "DELETE" && preg_match('#^/messages/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $msg_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];

  // Fetch message
  $stmt = $pdo->prepare("SELECT sender_id, created_at, is_deleted, conversation_id FROM messages WHERE id = ?");
  $stmt->execute([$msg_id]); $msg = $stmt->fetch();
  if (!$msg) json_response(["error" => "Message not found"], 404);

  // Only sender can delete
  if ((int)$msg["sender_id"] !== $user_id) json_response(["error" => "Cannot delete another user\'s message"], 403);

  // Already deleted
  if ($msg["is_deleted"]) json_response(["error" => "Message already deleted"], 400);

  // 15-minute time limit
  $created = strtotime($msg["created_at"]);
  if ((time() - $created) > 15 * 60) json_response(["error" => "Delete window has expired (15 minutes)"], 403);

  // Soft delete — keep record, just mark as deleted
  $pdo->prepare("UPDATE messages SET is_deleted = 1, body = NULL, attachment_id = NULL WHERE id = ?")
      ->execute([$msg_id]);

  json_response([
    "deleted"         => true,
    "message_id"      => $msg_id,
    "conversation_id" => (int)$msg["conversation_id"],
  ]);
}

json_response(["error" => "Not found", "path" => $path], 404);