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
  // Rate limiting: max 10 attempts per IP per 15 minutes
  $ip       = $_SERVER["REMOTE_ADDR"] ?? "unknown";
  $rl_file  = sys_get_temp_dir() . "/cc_rl_" . md5($ip) . ".json";
  $now      = time();
  $window   = 15 * 60; // 15 minutes
  $max_attempts = 10;

  $rl = file_exists($rl_file) ? json_decode(file_get_contents($rl_file), true) : ["count" => 0, "since" => $now];
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now]; // reset window
  if ($rl["count"] >= $max_attempts) {
    $retry_after = $window - ($now - $rl["since"]);
    json_response(["error" => "Too many login attempts. Try again in " . ceil($retry_after / 60) . " minute(s)."], 429);
  }

  $in = json_input();
  $username = trim($in["username"] ?? "");
  $password = (string)($in["password"] ?? "");
  if ($username === "" || $password === "") json_response(["error" => "username and password required"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT id, username, full_name, password_hash, status, role, force_password_change FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();
  if (!$user || !password_verify($password, $user["password_hash"])) {
    $rl["count"]++;
    file_put_contents($rl_file, json_encode($rl));
    json_response(["error" => "Invalid credentials"], 401);
  }
  if ($user["status"] === "pending")  json_response(["error" => "Your account is pending admin approval"], 403);
  if ($user["status"] === "disabled") json_response(["error" => "Your account has been disabled"], 403);

  // Reset rate limit counter on successful login
  @unlink($rl_file);

  $now = time();
  $token = jwt_sign([
      "iss"      => $cfg["jwt"]["issuer"],
      "sub"      => (int)$user["id"],
      "username" => $user["username"],
      "role"     => $user["role"],
      "iat"      => $now,
      "exp"      => $now + $cfg["jwt"]["ttl_seconds"]
  ], $cfg["jwt"]["secret"]);

  json_response([
    "access_token"         => $token,
    "force_change"         => (bool)$user["force_password_change"],
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

// ── POST /forgot-password ─────────────────────────────────────────
if ($method === "POST" && $path === "/forgot-password") {
  $in       = json_input();
  $username = strtolower(trim((string)($in["username"] ?? "")));
  if ($username === "") json_response(["error" => "Username is required"], 400);

  // Rate limit: max 3 requests per username per hour (prevents spam)
  $rl_file = sys_get_temp_dir() . "/cc_fpr_" . md5($username) . ".json";
  $now     = time();
  $window  = 60 * 60; // 1 hour
  $rl = file_exists($rl_file) ? json_decode(file_get_contents($rl_file), true) : ["count" => 0, "since" => $now];
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now];
  if ($rl["count"] >= 3) {
    // Return generic message — don't reveal rate limit details
    json_response(["message" => "Request submitted. Please contact your administrator."]);
  }

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT id, status FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();

  // Always respond with the same message to prevent username enumeration
  if (!$user || $user["status"] !== "active") {
    json_response(["message" => "Request submitted. Please contact your administrator."]);
  }

  // Avoid duplicate pending requests
  $stmt = $pdo->prepare("SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'");
  $stmt->execute([(int)$user["id"]]);
  if (!$stmt->fetch()) {
    $pdo->prepare("INSERT INTO password_reset_requests (user_id) VALUES (?)")
        ->execute([(int)$user["id"]]);
  }

  $rl["count"]++;
  file_put_contents($rl_file, json_encode($rl));

  json_response(["message" => "Request submitted. Please contact your administrator."]);
}

// ── POST /change-password ─────────────────────────────────────────
if ($method === "POST" && $path === "/change-password") {
  $claims      = require_auth();
  $in          = json_input();
  $new_pass    = (string)($in["new_password"]     ?? "");
  $confirm     = (string)($in["confirm_password"] ?? "");

  if (strlen($new_pass) < 8) json_response(["error" => "Password must be at least 8 characters"], 400);
  if ($new_pass !== $confirm) json_response(["error" => "Passwords do not match"], 400);

  $pdo  = db();
  $hash = password_hash($new_pass, PASSWORD_DEFAULT);
  $pdo->prepare("UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?")
      ->execute([$hash, (int)$claims["sub"]]);

  json_response(["message" => "Password updated successfully."]);
}