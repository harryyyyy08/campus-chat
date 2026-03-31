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

function altcha_settings(): array
{
  global $cfg;

  $altcha = is_array($cfg["altcha"] ?? null) ? $cfg["altcha"] : [];
  $hmacKey = trim((string)($altcha["hmac_key"] ?? ""));
  if ($hmacKey === "") {
    $hmacKey = (string)($cfg["jwt"]["secret"] ?? "");
  }

  $maxNumber = (int)($altcha["max_number"] ?? 120000);
  if ($maxNumber < 1000) $maxNumber = 1000;
  if ($maxNumber > 1000000) $maxNumber = 1000000;

  $ttlSeconds = (int)($altcha["ttl_seconds"] ?? 180);
  if ($ttlSeconds < 30) $ttlSeconds = 30;
  if ($ttlSeconds > 3600) $ttlSeconds = 3600;

  $algorithm = strtoupper(trim((string)($altcha["algorithm"] ?? "SHA-256")));
  if (!in_array($algorithm, ["SHA-1", "SHA-256", "SHA-512"], true)) {
    $algorithm = "SHA-256";
  }

  return [
    "enabled" => ($altcha["enabled"] ?? true) !== false,
    "algorithm" => $algorithm,
    "hmac_key" => $hmacKey,
    "max_number" => $maxNumber,
    "ttl_seconds" => $ttlSeconds,
  ];
}

function altcha_php_hash_algo(string $algorithm): ?string
{
  $normalized = strtoupper(trim($algorithm));
  if ($normalized === "SHA-1") return "sha1";
  if ($normalized === "SHA-256") return "sha256";
  if ($normalized === "SHA-512") return "sha512";
  return null;
}

function altcha_base64_decode(string $value)
{
  $normalized = strtr(trim($value), '-_', '+/');
  $pad = strlen($normalized) % 4;
  if ($pad > 0) {
    $normalized .= str_repeat('=', 4 - $pad);
  }
  return base64_decode($normalized, true);
}

function altcha_random_hex(int $bytes = 12): string
{
  try {
    return bin2hex(random_bytes($bytes));
  } catch (Throwable $e) {
    $legacy = openssl_random_pseudo_bytes($bytes);
    if ($legacy === false) return bin2hex((string)mt_rand());
    return bin2hex($legacy);
  }
}

function altcha_generate_code(int $length = 4): string
{
  $alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  $maxIndex = strlen($alphabet) - 1;
  $code = "";

  for ($i = 0; $i < $length; $i++) {
    $code .= $alphabet[random_int(0, $maxIndex)];
  }

  return $code;
}

function altcha_code_signature(string $hmacKey, string $code, string $scope, string $expires): string
{
  $normalizedCode = strtoupper(trim($code));
  $normalizedScope = strtolower(trim($scope));
  $material = $normalizedCode . "|" . $normalizedScope . "|" . $expires;
  return hash_hmac("sha256", $material, $hmacKey);
}

function altcha_code_image_data_uri(string $code): string
{
  $safeCode = htmlspecialchars($code, ENT_QUOTES | ENT_SUBSTITUTE, "UTF-8");
  $noiseLines = "";
  $verticalNoiseLines = "";

  for ($i = 0; $i < 5; $i++) {
    $y1 = random_int(6, 44);
    $y2 = max(2, min(48, $y1 + random_int(-8, 8)));
    $strokeWidth = random_int(2, 3);
    $noiseLines .= '<line x1="0" y1="' . $y1 . '" x2="220" y2="' . $y2 . '" stroke="#0f172a" stroke-opacity="0.35" stroke-width="' . $strokeWidth . '" />';
  }

  for ($i = 0; $i < 10; $i++) {
    $x = random_int(8, 212);
    $strokeWidth = random_int(2, 3);
    $verticalNoiseLines .= '<line x1="' . $x . '" y1="0" x2="' . $x . '" y2="50" stroke="#0f172a" stroke-opacity="0.35" stroke-width="' . $strokeWidth . '" />';
  }

  $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="50" viewBox="0 0 220 50">'
    . '<rect width="220" height="50" fill="#f8fafc" />'
    . '<text x="110" y="33" font-family="monospace" font-size="28" font-weight="700" text-anchor="middle" fill="#0f172a" letter-spacing="6">'
    . $safeCode
    . '</text>'
    . $noiseLines
    . $verticalNoiseLines
    . '</svg>';

  return "data:image/svg+xml;base64," . base64_encode($svg);
}

function altcha_extract_params_from_salt(string $salt): array
{
  $qPos = strpos($salt, '?');
  if ($qPos === false) return [];

  $query = substr($salt, $qPos + 1);
  if ($query === false || $query === '') return [];

  $params = [];
  parse_str($query, $params);
  return is_array($params) ? $params : [];
}

function altcha_create_challenge(array $settings, array $params = []): array
{
  $algorithm = $settings["algorithm"];
  $phpAlgo = altcha_php_hash_algo($algorithm);
  if ($phpAlgo === null) {
    $algorithm = "SHA-256";
    $phpAlgo = "sha256";
  }

  $salt = altcha_random_hex(12);
  $query = [];
  foreach ($params as $k => $v) {
    if ($v === null || $v === "") continue;
    $query[] = rawurlencode((string)$k) . "=" . rawurlencode((string)$v);
  }

  $ttl = (int)($settings["ttl_seconds"] ?? 180);
  $hasExpiresParam = array_key_exists("expires", $params) || array_key_exists("expire", $params);
  if ($ttl > 0 && !$hasExpiresParam) {
    $query[] = "expires=" . (string)(time() + $ttl);
  }

  if (!empty($query)) {
    $salt .= "?" . implode("&", $query);
  }
  if (substr($salt, -1) !== "&") {
    $salt .= "&";
  }

  $number = random_int(0, (int)$settings["max_number"]);
  $challenge = hash($phpAlgo, $salt . $number);
  $signature = hash_hmac($phpAlgo, $challenge, (string)$settings["hmac_key"]);

  return [
    "algorithm" => $algorithm,
    "challenge" => $challenge,
    "maxnumber" => (int)$settings["max_number"],
    "salt" => $salt,
    "signature" => $signature,
  ];
}

function altcha_decode_payload(string $payload): ?array
{
  $decoded = altcha_base64_decode($payload);
  if ($decoded === false || $decoded === null) return null;
  $data = json_decode($decoded, true);
  if (!is_array($data)) return null;
  return $data;
}

function altcha_verify_payload(string $payload, string $hmacKey, array $allowedScopes = []): bool
{
  $data = altcha_decode_payload($payload);
  if (!$data) return false;

  $algorithm = strtoupper(trim((string)($data["algorithm"] ?? "")));
  $phpAlgo = altcha_php_hash_algo($algorithm);
  if ($phpAlgo === null) return false;

  $challenge = (string)($data["challenge"] ?? "");
  $salt = (string)($data["salt"] ?? "");
  $signature = (string)($data["signature"] ?? "");
  if ($challenge === "" || $salt === "" || $signature === "") return false;
  if (!array_key_exists("number", $data) || !is_numeric($data["number"])) return false;

  $params = altcha_extract_params_from_salt($salt);
  $expires = $params["expires"] ?? ($params["expire"] ?? null);
  if ($expires !== null) {
    $expTs = (int)$expires;
    if ($expTs <= 0 || $expTs < time()) return false;
  }

  if (!empty($allowedScopes)) {
    $scope = strtolower(trim((string)($params["scope"] ?? "")));
    if ($scope === "") return false;
    $normalizedAllowed = array_map(static function ($item) {
      return strtolower(trim((string)$item));
    }, $allowedScopes);
    if (!in_array($scope, $normalizedAllowed, true)) return false;
  }

  $number = (int)$data["number"];
  $expectedChallenge = hash($phpAlgo, $salt . $number);
  if (!hash_equals($expectedChallenge, $challenge)) return false;

  $expectedSignature = hash_hmac($phpAlgo, $challenge, $hmacKey);
  return hash_equals($expectedSignature, $signature);
}

function require_altcha(array $input, array $allowedScopes): void
{
  $settings = altcha_settings();
  if (!$settings["enabled"]) return;

  $payload = trim((string)($input["altcha"] ?? ""));
  if ($payload === "") {
    json_response(["error" => "Security verification is required"], 400);
  }
  if ($settings["hmac_key"] === "") {
    json_response(["error" => "Security verification unavailable"], 503);
  }

  if (!altcha_verify_payload($payload, (string)$settings["hmac_key"], $allowedScopes)) {
    json_response(["error" => "Security verification failed. Please try again."], 400);
  }
}

// ── GET /altcha/challenge ───────────────────────────────────────
if ($method === "GET" && $path === "/altcha/challenge") {
  $settings = altcha_settings();
  if (!$settings["enabled"]) {
    json_response(["error" => "Not found"], 404);
  }

  $scope = strtolower(trim((string)($_GET["scope"] ?? "auth")));
  $scope = preg_replace('/[^a-z0-9_-]/', '', $scope);
  if ($scope === "") $scope = "auth";

  $expires = (string)(time() + (int)$settings["ttl_seconds"]);
  $code = altcha_generate_code(4);
  $codeSig = altcha_code_signature((string)$settings["hmac_key"], $code, $scope, $expires);

  $challenge = altcha_create_challenge($settings, [
    "scope" => $scope,
    "expires" => $expires,
    "code_sig" => $codeSig,
    "code_len" => "4",
  ]);
  $challenge["codeChallenge"] = [
    "image" => altcha_code_image_data_uri($code),
    "length" => 4,
  ];

  header("Cache-Control: no-store, no-cache, must-revalidate, max-age=0");
  json_response($challenge);
}

// ── POST /altcha/verify-code ───────────────────────────────────
if ($method === "POST" && $path === "/altcha/verify-code") {
  $settings = altcha_settings();
  if (!$settings["enabled"]) {
    json_response(["verified" => false, "reason" => "Security verification is disabled."]);
  }

  $in = json_input();
  $payload = trim((string)($in["payload"] ?? ""));
  $code = strtoupper(trim((string)($in["code"] ?? "")));

  if ($payload === "" || $code === "") {
    json_response(["verified" => false, "reason" => "Code is required."]);
  }

  if (!preg_match('/^[A-Z0-9]{4}$/', $code)) {
    json_response(["verified" => false, "reason" => "Invalid code format."]);
  }

  $isPayloadValid = altcha_verify_payload(
    $payload,
    (string)$settings["hmac_key"],
    ["login", "admin-login", "register", "forgot-password"]
  );
  if (!$isPayloadValid) {
    json_response(["verified" => false, "reason" => "Challenge invalid or expired."]);
  }

  $decoded = altcha_decode_payload($payload);
  if (!$decoded) {
    json_response(["verified" => false, "reason" => "Invalid payload."]);
  }

  $salt = (string)($decoded["salt"] ?? "");
  $params = altcha_extract_params_from_salt($salt);
  $scope = strtolower(trim((string)($params["scope"] ?? "")));
  $expires = (string)($params["expires"] ?? ($params["expire"] ?? ""));
  $expectedSig = (string)($params["code_sig"] ?? "");
  if ($scope === "" || $expires === "" || $expectedSig === "") {
    json_response(["verified" => false, "reason" => "Code challenge missing."]);
  }

  $actualSig = altcha_code_signature((string)$settings["hmac_key"], $code, $scope, $expires);
  if (!hash_equals($expectedSig, $actualSig)) {
    json_response(["verified" => false, "reason" => "Incorrect verification code."]);
  }

  json_response([
    "verified" => true,
    "payload" => $payload,
  ]);
}

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
  require_altcha($in, ["login", "admin-login"]);

  $pdo  = db();
  $stmt = $pdo->prepare("SELECT u.id, u.username, u.full_name, u.password_hash, u.status, u.role, u.force_password_change, d.name AS department FROM users u LEFT JOIN departments d ON d.id = u.department WHERE u.username = ?");
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
  require_altcha($in, ["register"]);
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

// ── POST /forgot-password ─────────────────────────────────────────
if ($method === "POST" && $path === "/forgot-password") {
  $in       = json_input();
  require_altcha($in, ["forgot-password"]);
  $username = strtolower(trim((string)($in["username"] ?? "")));
  if ($username === "") json_response(["error" => "Username is required"], 400);

  // Rate limit: max 3 requests per username per hour (prevents spam)
  $rl_file = sys_get_temp_dir() . "/cc_fpr_" . md5($username) . ".json";
  $now     = time();
  $window  = 60 * 60; // 1 hour
  $rl = file_exists($rl_file) ? json_decode(file_get_contents($rl_file), true) : ["count" => 0, "since" => $now];
  if (($now - $rl["since"]) > $window) $rl = ["count" => 0, "since" => $now];
  if ($rl["count"] >= 3) {
    json_response(["error" => "Too many requests. Please try again after 1 hour."], 429);
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
