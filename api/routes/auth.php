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
  $ip = $_SERVER["REMOTE_ADDR"] ?? "unknown";
  $in = json_input();
  $username = trim((string)($in["username"] ?? ""));
  $password = (string)($in["password"] ?? "");
  if ($username === "" || $password === "") json_response(["error" => "username and password required"], 400);

  // Rate limiting: max 10 attempts per username+IP per 15 minutes
  $rl_key  = strtolower($username) . "|" . $ip;
  $rl_file = sys_get_temp_dir() . "/cc_rl_login_" . md5($rl_key) . ".json";
  $now      = time();
  $window   = 15 * 60; // 15 minutes
  $max_attempts = 10;

  $rl_raw = file_exists($rl_file) ? json_decode((string)file_get_contents($rl_file), true) : null;
  $rl = is_array($rl_raw) ? $rl_raw : ["count" => 0, "since" => $now];
  $rl["count"] = (int)($rl["count"] ?? 0);
  $rl["since"] = (int)($rl["since"] ?? $now);
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now]; // reset window
  if ($rl["count"] >= $max_attempts) {
    $retry_after = $window - ($now - $rl["since"]);
    json_response(["error" => "Too many login attempts. Try again in " . ceil($retry_after / 60) . " minute(s)."], 429);
  }

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT u.id, u.username, u.full_name, u.password_hash, u.status, u.role, u.force_password_change, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department WHERE u.username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();
  if (!$user || !password_verify($password, $user["password_hash"])) {
    $rl["count"]++;
    file_put_contents($rl_file, json_encode($rl), LOCK_EX);
    json_response(["error" => "Invalid credentials"], 401);
  }
  if ($user["status"] === "pending")  json_response(["error" => "Your account is pending admin approval"], 403);
  if ($user["status"] === "disabled") json_response(["error" => "Your account has been disabled"], 403);

  // Reset rate limit counter on successful login
  @unlink($rl_file);

  // Record login metadata, but stay compatible with older schemas.
  // Some deployments do not yet have last_ip / last_seen_at columns.
  try {
    db()->prepare("UPDATE users SET last_ip = ?, last_seen_at = NOW() WHERE id = ?")
      ->execute([$ip, (int)$user["id"]]);
  } catch (Throwable $e) {
    try {
      db()->prepare("UPDATE users SET last_seen_at = NOW() WHERE id = ?")
        ->execute([(int)$user["id"]]);
    } catch (Throwable $_) {
      // Ignore metadata write errors so successful login is not blocked.
    }
  }

  // Check if user has security questions set
  $sqStmt = $pdo->prepare("SELECT 1 FROM user_security_questions WHERE user_id = ? LIMIT 1");
  $sqStmt->execute([(int)$user["id"]]);
  $hasSQ = (bool)$sqStmt->fetchColumn();

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
    "force_security_setup" => !$hasSQ,
    "user" => [
      "id"        => (int)$user["id"],
      "username"  => $user["username"],
      "full_name" => $user["full_name"],
      "role"      => $user["role"],
      "department" => $user["department"]
    ],
    "ws_url" => $cfg["ws"]["url"]
  ]);
}

// ── GET /me ──────────────────────────────────────────────────────
if ($method === "GET" && $path === "/me") {
  $claims = require_auth();
  $pdo = db();
  $stmt = $pdo->prepare("SELECT u.id, u.username, u.full_name, u.role, u.created_at, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department WHERE u.id = ?");
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
  $current = trim((string)($in["current_password"] ?? ""));
  $new_pw  = (string)($in["new_password"] ?? "");
  $confirm = (string)($in["confirm_password"] ?? "");

  if ($new_pw === "" || $confirm === "") {
    json_response(["error" => "New password and confirmation are required"], 400);
  }
  if ($new_pw !== $confirm) {
    json_response(["error" => "New password and confirmation do not match"], 400);
  }
  if (strlen($new_pw) < 8) {
    json_response(["error" => "Password must be at least 8 characters"], 400);
  }

  $pdo = db();
  $uid = (int)$claims["sub"];
  $stmt = $pdo->prepare("SELECT password_hash, force_password_change FROM users WHERE id = ?");
  $stmt->execute([$uid]);
  $row = $stmt->fetch();
  if (!$row) json_response(["error" => "User not found"], 404);

  $requiresForcedChange = (bool)$row["force_password_change"];

  // Standard settings flow requires current password.
  // Forced-change flow (after temp password login) allows setting a new password without re-entering current.
  if ($current === "" && !$requiresForcedChange) {
    json_response(["error" => "Current password is required"], 400);
  }

  if ($current !== "" && !password_verify($current, $row["password_hash"])) {
    json_response(["error" => "Current password is incorrect"], 401);
  }

  if (password_verify($new_pw, $row["password_hash"])) {
    json_response(["error" => "New password must be different from your current password"], 400);
  }

  $hash = password_hash($new_pw, PASSWORD_DEFAULT);
  $pdo->prepare("UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?")
    ->execute([$hash, $uid]);
  json_response(["ok" => true, "message" => "Password updated successfully."]);
}

// ── GET /users/search ────────────────────────────────────────────
if ($method === "GET" && $path === "/users/search") {
  $claims = require_auth();
  $user_id = (int)$claims["sub"];
  $q = trim($_GET["q"] ?? "");
  if (strlen($q) < 1) json_response(["users" => []]);
  $pdo = db();
  $like = "%" . $q . "%";
  $stmt = $pdo->prepare("SELECT id, username, full_name FROM users WHERE id <> ? AND status = 'active' AND (username LIKE ? OR full_name LIKE ?) ORDER BY full_name, username LIMIT 20");
  $stmt->execute([$user_id, $like, $like]);
  $users = $stmt->fetchAll();
  foreach ($users as &$u) $u["id"] = (int)$u["id"];
  json_response(["users" => $users]);
}

// ── POST /register ───────────────────────────────────────────────
if ($method === "POST" && $path === "/register") {
  $pdo = db();
  $in = json_input();
  $full_name  = trim((string)($in["full_name"]  ?? ""));
  $username   = strtolower(trim((string)($in["username"] ?? "")));
  $password   = (string)($in["password"]   ?? "");
  $role       = (string)($in["role"]       ?? "student");
  $department_id = (int)($in["department_id"] ?? 0);
  $department_name = trim((string)($in["department"] ?? ""));

  if ($full_name === "")  json_response(["error" => "Full name is required"], 400);
  if ($username === "")   json_response(["error" => "Username is required"], 400);
  if (!preg_match('/^[a-z0-9_]+$/', $username)) json_response(["error" => "Username: lowercase letters, numbers, underscores only"], 400);
  if (strlen($username) < 3) json_response(["error" => "Username must be at least 3 characters"], 400);
  if (strlen($password) < 8) json_response(["error" => "Password must be at least 8 characters"], 400);
  if (!in_array($role, ["student", "faculty"])) $role = "student";
  if ($department_id <= 0 && $department_name === "") json_response(["error" => "Department is required"], 400);

  $stmt = $pdo->prepare("SELECT 1 FROM users WHERE username = ?");
  $stmt->execute([$username]);
  if ($stmt->fetchColumn()) json_response(["error" => "Username is already taken"], 409);

  if ($department_id <= 0 && $department_name !== "") {
    $stmt = $pdo->prepare("SELECT id FROM departments WHERE name = ? LIMIT 1");
    $stmt->execute([$department_name]);
    $department_id = (int)($stmt->fetchColumn() ?: 0);
  }

  if ($department_id > 0) {
    $stmt = $pdo->prepare("SELECT 1 FROM departments WHERE id = ?");
    $stmt->execute([$department_id]);
    if (!$stmt->fetchColumn()) json_response(["error" => "Invalid department"], 400);
  }

  $hash = password_hash($password, PASSWORD_DEFAULT);
  $pdo->prepare("INSERT INTO users (username, full_name, password_hash, status, role, department) VALUES (?, ?, ?, 'pending', ?, ?)")
    ->execute([$username, $full_name, $hash, $role, $department_id > 0 ? $department_id : null]);
  json_response(["registered" => true, "message" => "Registration submitted. Please wait for admin approval."], 201);
}

// ── Security Questions Definitions ────────────────────────────────
function get_security_questions(): array
{
  return [
    1 => [
      1 => "What is the name of your first pet?",
      2 => "What is your mother's maiden name?",
      3 => "What was the name of your first school?",
      4 => "What is your favorite food?",
      5 => "In what city were you born?",
    ],
    2 => [
      1 => "What is your nickname growing up?",
      2 => "What is your favorite subject in school?",
      3 => "What is the name of your childhood best friend?",
      4 => "What is your favorite color?",
      5 => "What is the name of the street you grew up on?",
    ],
    3 => [
      1 => "What is the name of your favorite teacher?",
      2 => "What was the make of your first phone?",
      3 => "What is the name of your favorite movie?",
      4 => "What is your favorite hobby?",
      5 => "What is the middle name of your oldest sibling?",
    ],
  ];
}

// ── GET /security-questions/list ──────────────────────────────────
if ($method === "GET" && $path === "/security-questions/list") {
  json_response(["questions" => get_security_questions()]);
}

// ── POST /security-questions/setup ───────────────────────────────
if ($method === "POST" && $path === "/security-questions/setup") {
  $claims = require_auth();
  $in     = json_input();
  $uid    = (int)$claims["sub"];

  $q1_index  = (int)($in["q1_index"]  ?? 0);
  $q1_answer = strtolower(trim((string)($in["q1_answer"] ?? "")));
  $q2_index  = (int)($in["q2_index"]  ?? 0);
  $q2_answer = strtolower(trim((string)($in["q2_answer"] ?? "")));
  $q3_index  = (int)($in["q3_index"]  ?? 0);
  $q3_answer = strtolower(trim((string)($in["q3_answer"] ?? "")));

  $questions = get_security_questions();
  if (!isset($questions[1][$q1_index])) json_response(["error" => "Invalid question 1 selection"], 400);
  if (!isset($questions[2][$q2_index])) json_response(["error" => "Invalid question 2 selection"], 400);
  if (!isset($questions[3][$q3_index])) json_response(["error" => "Invalid question 3 selection"], 400);
  if (strlen($q1_answer) < 2) json_response(["error" => "Answer 1 must be at least 2 characters"], 400);
  if (strlen($q2_answer) < 2) json_response(["error" => "Answer 2 must be at least 2 characters"], 400);
  if (strlen($q3_answer) < 2) json_response(["error" => "Answer 3 must be at least 2 characters"], 400);

  $pdo = db();

  // Check if already set (no changes allowed)
  $stmt = $pdo->prepare("SELECT 1 FROM user_security_questions WHERE user_id = ? LIMIT 1");
  $stmt->execute([$uid]);
  if ($stmt->fetchColumn()) {
    json_response(["error" => "Security questions are already set"], 409);
  }

  $hash1 = password_hash($q1_answer, PASSWORD_DEFAULT);
  $hash2 = password_hash($q2_answer, PASSWORD_DEFAULT);
  $hash3 = password_hash($q3_answer, PASSWORD_DEFAULT);

  $pdo->prepare("INSERT INTO user_security_questions (user_id, q1_index, q1_answer_hash, q2_index, q2_answer_hash, q3_index, q3_answer_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
    ->execute([$uid, $q1_index, $hash1, $q2_index, $hash2, $q3_index, $hash3]);

  json_response(["ok" => true, "message" => "Security questions saved successfully."]);
}

// ── POST /forgot-password ─────────────────────────────────────────
if ($method === "POST" && $path === "/forgot-password") {
  $in       = json_input();
  $username = strtolower(trim((string)($in["username"] ?? "")));
  if ($username === "") json_response(["error" => "Username is required"], 400);

  // Rate limit: max 5 requests per username+IP per hour
  $ip = $_SERVER["REMOTE_ADDR"] ?? "unknown";
  $rl_key = $username . "|" . $ip;
  $rl_file = sys_get_temp_dir() . "/cc_fpr_" . md5($rl_key) . ".json";
  $now     = time();
  $window  = 60 * 60;
  $rl_raw = file_exists($rl_file) ? json_decode((string)file_get_contents($rl_file), true) : null;
  $rl = is_array($rl_raw) ? $rl_raw : ["count" => 0, "since" => $now];
  $rl["count"] = (int)($rl["count"] ?? 0);
  $rl["since"] = (int)($rl["since"] ?? $now);
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now];
  if ($rl["count"] >= 5) {
    json_response(["error" => "Too many requests. Please try again after 1 hour."], 429);
  }

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT id, status FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();

  $rl["count"]++;
  file_put_contents($rl_file, json_encode($rl), LOCK_EX);

  // Prevent username enumeration — same response shape regardless
  if (!$user || $user["status"] !== "active") {
    json_response(["method" => "admin", "message" => "If this account exists, a reset request has been submitted. Please contact your administrator."]);
  }

  // Check if user has security questions set
  $stmt = $pdo->prepare("SELECT 1 FROM user_security_questions WHERE user_id = ? LIMIT 1");
  $stmt->execute([(int)$user["id"]]);
  $hasSQ = (bool)$stmt->fetchColumn();

  if ($hasSQ) {
    // Self-service path: generate a redirect token
    $token = bin2hex(random_bytes(32));
    $expires = date("Y-m-d H:i:s", time() + 900); // 15 minutes

    // Clean up any existing pending self-service requests for this user
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE user_id = ? AND status = 'pending' AND reset_method = 'self_service'")
      ->execute([(int)$user["id"]]);

    $pdo->prepare("INSERT INTO password_reset_requests (user_id, status, reset_method, reset_token, token_expires_at) VALUES (?, 'pending', 'self_service', ?, ?)")
      ->execute([(int)$user["id"], $token, $expires]);

    json_response(["method" => "self_service", "token" => $token]);
  } else {
    // Admin path: create pending request for admin approval
    $stmt = $pdo->prepare("SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending' AND reset_method = 'admin'");
    $stmt->execute([(int)$user["id"]]);
    if (!$stmt->fetch()) {
      $pdo->prepare("INSERT INTO password_reset_requests (user_id, reset_method) VALUES (?, 'admin')")
        ->execute([(int)$user["id"]]);
    }
    json_response(["method" => "admin", "message" => "Request submitted. Please contact your administrator."]);
  }
}

// ── POST /forgot-password/questions ────────────────────────────────
if ($method === "POST" && $path === "/forgot-password/questions") {
  $in = json_input();
  $token = trim((string)($in["token"] ?? ""));
  if ($token === "") json_response(["error" => "Token is required"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT r.id, r.user_id, r.token_expires_at, r.attempts, u.full_name FROM password_reset_requests r JOIN users u ON u.id = r.user_id WHERE r.reset_token = ? AND r.status = 'pending' AND r.reset_method = 'self_service'");
  $stmt->execute([$token]);
  $req = $stmt->fetch();

  if (!$req) json_response(["error" => "Invalid or expired token"], 400);
  if (strtotime($req["token_expires_at"]) < time()) {
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
    json_response(["error" => "Token has expired. Please start over."], 400);
  }
  if ((int)$req["attempts"] >= 3) {
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
    json_response(["error" => "Too many failed attempts. Please contact your administrator."], 400);
  }

  // Get the user's chosen questions
  $questions = get_security_questions();
  $stmt = $pdo->prepare("SELECT q1_index, q2_index, q3_index FROM user_security_questions WHERE user_id = ? LIMIT 1");
  $stmt->execute([(int)$req["user_id"]]);
  $sq = $stmt->fetch();

  $result = [
    ["set" => 1, "question" => $questions[1][(int)$sq["q1_index"]] ?? "Unknown question"],
    ["set" => 2, "question" => $questions[2][(int)$sq["q2_index"]] ?? "Unknown question"],
    ["set" => 3, "question" => $questions[3][(int)$sq["q3_index"]] ?? "Unknown question"],
  ];

  // Show first name only for privacy
  $firstName = explode(" ", $req["full_name"])[0];

  json_response([
    "questions"      => $result,
    "display_name"   => $firstName,
    "attempts_left"  => 3 - (int)$req["attempts"],
  ]);
}

// ── POST /forgot-password/verify ──────────────────────────────────
if ($method === "POST" && $path === "/forgot-password/verify") {
  $in    = json_input();
  $token = trim((string)($in["token"]   ?? ""));
  $ans1  = strtolower(trim((string)($in["answer1"] ?? "")));
  $ans2  = strtolower(trim((string)($in["answer2"] ?? "")));
  $ans3  = strtolower(trim((string)($in["answer3"] ?? "")));

  if ($token === "") json_response(["error" => "Token is required"], 400);
  if ($ans1 === "" || $ans2 === "" || $ans3 === "") json_response(["error" => "All answers are required"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT r.id, r.user_id, r.token_expires_at, r.attempts FROM password_reset_requests r WHERE r.reset_token = ? AND r.status = 'pending' AND r.reset_method = 'self_service'");
  $stmt->execute([$token]);
  $req = $stmt->fetch();

  if (!$req) json_response(["error" => "Invalid or expired token"], 400);
  if (strtotime($req["token_expires_at"]) < time()) {
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
    json_response(["error" => "Token has expired. Please start over."], 400);
  }
  if ((int)$req["attempts"] >= 3) {
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
    json_response(["error" => "Too many failed attempts. Please contact your administrator."], 400);
  }

  // Get stored answer hashes
  $stmt = $pdo->prepare("SELECT q1_answer_hash, q2_answer_hash, q3_answer_hash FROM user_security_questions WHERE user_id = ? LIMIT 1");
  $stmt->execute([(int)$req["user_id"]]);
  $sq = $stmt->fetch();

  $correct = $sq
    && password_verify($ans1, $sq["q1_answer_hash"])
    && password_verify($ans2, $sq["q2_answer_hash"])
    && password_verify($ans3, $sq["q3_answer_hash"]);

  if (!$correct) {
    // Increment attempts
    $newAttempts = (int)$req["attempts"] + 1;
    $pdo->prepare("UPDATE password_reset_requests SET attempts = ? WHERE id = ?")->execute([$newAttempts, $req["id"]]);
    $left = 3 - $newAttempts;
    if ($left <= 0) {
      $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
      json_response(["error" => "Too many failed attempts. Please contact your administrator.", "attempts_left" => 0], 400);
    }
    json_response(["error" => "Incorrect answers. You have {$left} attempt(s) left.", "attempts_left" => $left], 400);
  }

  // Generate a one-time reset token
  $resetToken = bin2hex(random_bytes(32));
  $resetExpires = date("Y-m-d H:i:s", time() + 900); // 15 minutes

  $pdo->prepare("UPDATE password_reset_requests SET reset_token = ?, token_expires_at = ? WHERE id = ?")
    ->execute([$resetToken, $resetExpires, $req["id"]]);

  json_response(["verified" => true, "reset_token" => $resetToken]);
}

// ── POST /forgot-password/reset ───────────────────────────────────
if ($method === "POST" && $path === "/forgot-password/reset") {
  $in         = json_input();
  $resetToken = trim((string)($in["reset_token"]      ?? ""));
  $newPass    = (string)($in["new_password"]     ?? "");
  $confirm    = (string)($in["confirm_password"] ?? "");

  if ($resetToken === "") json_response(["error" => "Reset token is required"], 400);
  if (strlen($newPass) < 8) json_response(["error" => "Password must be at least 8 characters"], 400);
  if ($newPass !== $confirm) json_response(["error" => "Passwords do not match"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT r.id, r.user_id, r.token_expires_at FROM password_reset_requests r WHERE r.reset_token = ? AND r.status = 'pending' AND r.reset_method = 'self_service'");
  $stmt->execute([$resetToken]);
  $req = $stmt->fetch();

  if (!$req) json_response(["error" => "Invalid or expired token"], 400);
  if (strtotime($req["token_expires_at"]) < time()) {
    $pdo->prepare("UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW() WHERE id = ?")->execute([$req["id"]]);
    json_response(["error" => "Token has expired. Please start over."], 400);
  }

  $hash = password_hash($newPass, PASSWORD_DEFAULT);
  $pdo->prepare("UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?")
    ->execute([$hash, (int)$req["user_id"]]);
  $pdo->prepare("UPDATE password_reset_requests SET status = 'completed', resolved_at = NOW() WHERE id = ?")
    ->execute([$req["id"]]);

  json_response(["ok" => true, "message" => "Password has been reset successfully. You can now log in."]);
}

// ── POST /forgot-username ─────────────────────────────────────────
if ($method === "POST" && $path === "/forgot-username") {
  $in        = json_input();
  $full_name = trim((string)($in["full_name"] ?? ""));
  $dept_id   = (int)($in["department_id"] ?? 0);

  if ($full_name === "") json_response(["error" => "Full name is required"], 400);
  if ($dept_id <= 0)     json_response(["error" => "Department is required"], 400);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT username FROM users WHERE LOWER(full_name) = LOWER(?) AND department = ? AND status = 'active' LIMIT 1");
  $stmt->execute([$full_name, $dept_id]);
  $row = $stmt->fetch();

  if (!$row) {
    json_response(["found" => false, "message" => "No matching account found. Please contact your administrator."]);
  }

  json_response(["found" => true, "username" => $row["username"]]);
}

// ── POST /request-admin-reset ─────────────────────────────────────
// Used when a user forgot their security question answers and needs
// an admin to manually reset their password.
if ($method === "POST" && $path === "/request-admin-reset") {
  $in       = json_input();
  $username = strtolower(trim((string)($in["username"] ?? "")));
  if ($username === "") json_response(["error" => "Username is required"], 400);

  // Rate limit: max 5 requests per IP per hour
  $ip = $_SERVER["REMOTE_ADDR"] ?? "unknown";
  $rl_key  = "admin_reset|" . $ip;
  $rl_file = sys_get_temp_dir() . "/cc_arr_" . md5($rl_key) . ".json";
  $now     = time();
  $window  = 60 * 60;
  $rl_raw  = file_exists($rl_file) ? json_decode((string)file_get_contents($rl_file), true) : null;
  $rl = is_array($rl_raw) ? $rl_raw : ["count" => 0, "since" => $now];
  $rl["count"] = (int)($rl["count"] ?? 0);
  $rl["since"] = (int)($rl["since"] ?? $now);
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now];
  if ($rl["count"] >= 5) {
    json_response(["error" => "Too many requests. Please try again after 1 hour."], 429);
  }

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT id, status FROM users WHERE username = ?");
  $stmt->execute([$username]);
  $user = $stmt->fetch();

  $rl["count"]++;
  file_put_contents($rl_file, json_encode($rl), LOCK_EX);

  // Always return success to prevent username enumeration
  if (!$user || $user["status"] !== "active") {
    json_response(["submitted" => true, "message" => "If this account exists, a reset request has been submitted. Please contact your administrator."]);
  }

  // Check if there's already a pending admin reset request for this user
  $stmt = $pdo->prepare("SELECT id, requested_at FROM password_reset_requests WHERE user_id = ? AND status = 'pending' AND reset_method = 'admin'");
  $stmt->execute([(int)$user["id"]]);
  $existing = $stmt->fetch();
  if ($existing) {
    json_response([
      "submitted" => true,
      "already_pending" => true,
      "requested_at" => $existing["requested_at"],
      "message" => "You already have a pending reset request. Please contact your administrator in person to verify your identity."
    ]);
  }

  $pdo->prepare("INSERT INTO password_reset_requests (user_id, reset_method) VALUES (?, 'admin')")
    ->execute([(int)$user["id"]]);

  json_response(["submitted" => true, "message" => "Request submitted. Please contact your administrator to verify your identity."]);
}
