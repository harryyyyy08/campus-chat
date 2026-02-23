<?php
/**
 * Main API Router & Entry Point
 * 
 * Purpose: Central routing gateway for all API endpoints
 * Type: PHP API Router/Request Handler
 * 
 * Endpoints Handled:
 * - POST /login - User authentication
 * - POST /register - User registration
 * - POST /conversations/direct - Create direct messages
 * - POST /conversations/group - Create group chats
 * - GET /conversations - List user's conversations
 * - POST /messages - Send messages
 * - GET /messages - Retrieve message history
 * - POST /upload - Upload file attachments
 * - GET /uploads/{filename} - Download/view files
 * - GET /admin/users - List all users (admin only)
 * - POST /admin/users/approve - Approve pending users (admin only)
 * - POST /admin/users/disable - Disable user accounts (admin only)
 * 
 * Features:
 * - CORS headers for cross-origin requests
 * - Route parsing from URL path
 * - File upload handling with size/type validation
 * - Centralized error responses in JSON format
 * 
 * Flow: Request → Route matching → Controller logic → JSON response
 */

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/helpers.php";
require_once __DIR__ . "/jwt.php";
require_once __DIR__ . "/auth.php";

header("Access-Control-Allow-Origin: http://localhost:3001");
header("Access-Control-Allow-Credentials: true");
header("Access-Control-Allow-Headers: Content-Type, Authorization");
header("Access-Control-Allow-Methods: GET, POST, PATCH, DELETE, OPTIONS");

if ($_SERVER["REQUEST_METHOD"] === "OPTIONS") { http_response_code(204); exit; }

$cfg    = require __DIR__ . "/config.php";
$method = $_SERVER["REQUEST_METHOD"];
$path   = parse_url($_SERVER["REQUEST_URI"], PHP_URL_PATH);
$path   = preg_replace('#^/campus-chat/api#', '', $path);
$path   = preg_replace('#^/index\.php#',      '', $path);
if ($path === '') $path = '/';

define('UPLOAD_DIR',       __DIR__ . '/../uploads/');
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

function is_admin(string $role): bool {
  return in_array($role, ['admin', 'super_admin']);
}
function is_super_admin(string $role): bool {
  return $role === 'super_admin';
}

// ── Routes ────────────────────────────────────────────────────────
require_once __DIR__ . "/routes/auth.php";
require_once __DIR__ . "/routes/conversations.php";
require_once __DIR__ . "/routes/messages.php";
require_once __DIR__ . "/routes/uploads.php";
require_once __DIR__ . "/routes/admin.php";

// ── 404 Fallback ──────────────────────────────────────────────────
json_response(["error" => "Not found", "path" => $path], 404);