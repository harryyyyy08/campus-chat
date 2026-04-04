<?php
/**
 * Authentication Routes Module
 * 
 * Purpose: Handles user login and registration workflows
 * Type: PHP Route Handler
 * 
 * Routes:
 * - POST /login - Authenticate user with username/password, returns JWT token
 * - POST /register - Self-registration for new users (pending admin approval)
 * - POST /change-password - Update password (Bearer JWT; hashes with password_hash)
 * 
 * Behaviors:
 * - Login: Validates credentials, checks account status, generates JWT
 * - Register: Creates new user account with 'pending' status, sends to admin queue
 * - Both: Returns user data and token (login only) in JSON
 * 
 * Dependencies: db.php, jwt.php, helpers.php
 * Usage: Included by api/index.php to handle /login and /register endpoints
 */

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
  // ✅ BAGO — may role na
  $token = jwt_sign([
      "iss"      => $cfg["jwt"]["issuer"],
      "sub"      => (int)$user["id"],
      "username" => $user["username"],
      "role"     => $user["role"],        // ← IDAGDAG ITO
      "iat"      => $now,
      "exp"      => $now + $cfg["jwt"]["ttl_seconds"]
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
  $stmt = $pdo->prepare("SELECT id, username, full_name, role, created_at FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $me = $stmt->fetch();
  if (!$me) json_response(["error" => "User not found"], 404);
  $me["id"] = (int)$me["id"];
  json_response(["user" => $me]);
}

// ── POST /change-password ────────────────────────────────────────
if ($method === "POST" && $path === "/change-password") {
  $claims = require_auth();
  $in = json_input();
  $current = (string)($in["current_password"] ?? "");
  $new_pw  = (string)($in["new_password"] ?? "");
  $confirm = (string)($in["confirm_password"] ?? "");

  if ($current === "" || $new_pw === "" || $confirm === "") {
    json_response(["error" => "All fields are required"], 400);
  }
  if ($new_pw !== $confirm) {
    json_response(["error" => "New password and confirmation do not match"], 400);
  }
  if (strlen($new_pw) < 8) {
    json_response(["error" => "Password must be at least 8 characters"], 400);
  }
  if ($new_pw === $current) {
    json_response(["error" => "New password must be different from your current password"], 400);
  }

  $pdo = db();
  $uid = (int)$claims["sub"];
  $stmt = $pdo->prepare("SELECT password_hash FROM users WHERE id = ?");
  $stmt->execute([$uid]);
  $row = $stmt->fetch();
  if (!$row) json_response(["error" => "User not found"], 404);
  if (!password_verify($current, $row["password_hash"])) {
    json_response(["error" => "Current password is incorrect"], 401);
  }

  $hash = password_hash($new_pw, PASSWORD_DEFAULT);
  $pdo->prepare("UPDATE users SET password_hash = ? WHERE id = ?")->execute([$hash, $uid]);
  json_response(["ok" => true, "message" => "Password updated successfully."]);
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
  if (!in_array($role, ["student","faculty"])) $role = "student";

  $stmt = $pdo->prepare("SELECT 1 FROM users WHERE username = ?");
  $stmt->execute([$username]);
  if ($stmt->fetchColumn()) json_response(["error" => "Username is already taken"], 409);

  $hash = password_hash($password, PASSWORD_DEFAULT);
  $pdo->prepare("INSERT INTO users (username, full_name, password_hash, status, role, department) VALUES (?, ?, ?, 'pending', ?, ?)")
      ->execute([$username, $full_name, $hash, $role, $department ?: null]);
  json_response(["registered" => true, "message" => "Registration submitted. Please wait for admin approval."], 201);
}