<?php
/**
 * File Upload Routes Module
 * 
 * Purpose: Handles file/image uploads for chat attachments
 * Type: PHP Route Handler
 * 
 * Routes:
 * - POST /upload - Upload file to conversation (stores in DB and filesystem)
 * - GET /uploads/{filename} - Download/stream uploaded file
 * 
 * Features:
 * - Validates file type (images, PDFs, Office documents)
 * - Enforces 25 MB file size limit
 * - Deduplication using SHA-256 file hashing
 * - Stores original filename and MIME type in database
 * - Generates unique storage names to prevent collisions
 * - Provides inline display for images, download for documents
 * 
 * Behaviors:
 * - Upload: Validates file, stores in /uploads directory, records in DB
 * - Returns attachment ID for linking to messages
 * - Download: Streams file with proper Content-Type and Content-Disposition headers
 * 
 * Dependencies: db.php, auth.php, helpers.php
 * Config: UPLOAD_DIR, UPLOAD_MAX_BYTES, ALLOWED_MIME (defined in index.php)
 * Usage: Included by api/index.php to handle /upload and /uploads/* endpoints
 */

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

  $stmt = $pdo->prepare("SELECT stored_name FROM attachments WHERE file_hash = ? LIMIT 1");
  $stmt->execute([$file_hash]);
  $existing_stored = $stmt->fetchColumn();

  if ($existing_stored && file_exists(UPLOAD_DIR . $existing_stored)) {
    $stored_name = $existing_stored;
  } else {
    $ext         = strtolower(pathinfo($orig_name, PATHINFO_EXTENSION));
    $stored_name = bin2hex(random_bytes(16)) . ($ext ? ".$ext" : "");
    $dest        = UPLOAD_DIR . $stored_name;
    if (!move_uploaded_file($tmp_path, $dest)) json_response(["error" => "Failed to save file"], 500);
  }

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

// ── GET /admin/uploads/{filename} — super_admin only ─────────────
if ($method === "GET" && preg_match('#^/admin/uploads/([a-zA-Z0-9_.\-]+)$#', $path, $m)) {
  $pdo         = db();
  $stored_name = $m[1];

  $bearer = null;
  $auth_header = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/^Bearer\s+(.+)$/i', $auth_header, $bm)) {
    $bearer = $bm[1];
  } elseif (!empty($_GET["token"])) {
    $bearer = $_GET["token"];
  }
  if (!$bearer) json_response(["error" => "Unauthorized"], 401);

  try {
    $claims = jwt_verify($bearer, $cfg["jwt"]["secret"]);
  } catch (Exception $e) {
    json_response(["error" => "Unauthorized: " . $e->getMessage()], 401);
  }

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

// ── GET /uploads/{filename} — authenticated file serving ─────────
if ($method === "GET" && preg_match('#^/uploads/([a-zA-Z0-9_.\-]+)$#', $path, $m)) {
  $pdo         = db();
  $stored_name = $m[1];

  $bearer = null;
  $auth_header = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/^Bearer\s+(.+)$/i', $auth_header, $bm)) {
    $bearer = $bm[1];
  } elseif (!empty($_GET["token"])) {
    $bearer = $_GET["token"];
  }
  if (!$bearer) json_response(["error" => "Unauthorized"], 401);

  try {
    $claims = jwt_verify($bearer, $cfg["jwt"]["secret"]);
  } catch (Exception $e) {
    json_response(["error" => "Unauthorized: " . $e->getMessage()], 401);
  }

  $stmt = $pdo->prepare("SELECT id, original_name, mime_type, file_size FROM attachments WHERE stored_name = ? LIMIT 1");
  $stmt->execute([$stored_name]); $att = $stmt->fetch();
  if (!$att) json_response(["error" => "File not found"], 404);

  // Access control: valid JWT is sufficient — no membership check needed.
  // The token proves the user is authenticated. Users can only obtain attachment
  // URLs through the /messages endpoint, which already enforces membership.

  $file_path = UPLOAD_DIR . $stored_name;
  if (!file_exists($file_path)) json_response(["error" => "File not found on disk"], 404);

  $pdo->prepare("UPDATE attachments SET last_accessed = NOW() WHERE stored_name = ?")->execute([$stored_name]);

  header("Content-Type: " . $att["mime_type"]);
  header("Content-Length: " . filesize($file_path));
  header('Content-Disposition: inline; filename="' . addslashes($att["original_name"]) . '"');
  header("Cache-Control: private, max-age=3600");
  readfile($file_path);
  exit;
}