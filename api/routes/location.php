<?php
/**
 * Location / Geomapping Routes
 *
 * Endpoints:
 *   POST /internal/update-ip          — Called by Node WS server (localhost only)
 *   GET  /admin/location-zones        — List all zones        (super_admin)
 *   POST /admin/location-zones        — Create zone           (super_admin)
 *   PUT  /admin/location-zones/{id}   — Update zone           (super_admin)
 *   DELETE /admin/location-zones/{id} — Delete zone           (super_admin)
 *   GET  /admin/geomap                — Map data: zones+users (super_admin)
 */

// ── POST /internal/update-ip ─────────────────────────────────────────
// Called by the Node.js WebSocket server on every client connect.
// Only accepted from localhost (127.0.0.1 / ::1).
if ($method === "POST" && $path === "/internal/update-ip") {
  $caller = $_SERVER["REMOTE_ADDR"] ?? "";
  if (!in_array($caller, ["127.0.0.1", "::1"], true)) {
    json_response(["error" => "Forbidden"], 403);
  }
  $claims = require_auth();
  $uid    = (int)$claims["sub"];
  // Trust X-Real-IP only when the caller is localhost (forwarded by Node)
  $ip = $_SERVER["HTTP_X_REAL_IP"] ?? $_SERVER["REMOTE_ADDR"] ?? "unknown";
  db()->prepare("UPDATE users SET last_ip = ?, last_seen_at = NOW() WHERE id = ?")
      ->execute([$ip, $uid]);
  json_response(["ok" => true]);
}

// ── Helper: assert super_admin ────────────────────────────────────────
function assert_super_admin(): array {
  $claims = require_auth();
  $pdo    = db();
  $stmt   = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $role = $stmt->fetchColumn();
  if (!is_super_admin($role)) {
    json_response(["error" => "Super admin access required"], 403);
  }
  return $claims;
}

// ── Helper: validate CIDR string ──────────────────────────────────────
function valid_cidr(string $cidr): bool {
  return (bool)preg_match('/^\d{1,3}(\.\d{1,3}){3}\/([0-9]|[12]\d|3[012])$/', $cidr);
}

// ── Helper: cast zone row types ───────────────────────────────────────
function cast_zone(array $z): array {
  $z["id"]       = (int)$z["id"];
  $z["lat"]      = (float)$z["lat"];
  $z["lng"]      = (float)$z["lng"];
  $z["radius_m"] = (int)$z["radius_m"];
  return $z;
}

// ── GET /admin/location-zones ─────────────────────────────────────────
if ($method === "GET" && $path === "/admin/location-zones") {
  assert_super_admin();
  $rows = db()->query("SELECT * FROM location_zones ORDER BY name ASC")->fetchAll();
  json_response(["zones" => array_map("cast_zone", $rows)]);
}

// ── POST /admin/location-zones ────────────────────────────────────────
if ($method === "POST" && $path === "/admin/location-zones") {
  assert_super_admin();
  $in = json_input();

  $name        = trim($in["name"]        ?? "");
  $building    = trim($in["building"]    ?? "");
  $cidr        = trim($in["cidr"]        ?? "");
  $lat         = isset($in["lat"])        ? (float)$in["lat"]        : null;
  $lng         = isset($in["lng"])        ? (float)$in["lng"]        : null;
  $radius_m    = isset($in["radius_m"])   ? max(10, (int)$in["radius_m"]) : 80;
  $color       = trim($in["color"]       ?? "#8B5CF6");
  $description = trim($in["description"] ?? "") ?: null;

  if (!$name || !$building)           json_response(["error" => "name and building are required"], 400);
  if (!valid_cidr($cidr))             json_response(["error" => "Invalid CIDR format (e.g. 10.0.1.0/24)"], 400);
  if ($lat === null || $lng === null) json_response(["error" => "lat and lng are required"], 400);

  $pdo = db();
  try {
    $stmt = $pdo->prepare(
      "INSERT INTO location_zones (name, building, cidr, lat, lng, radius_m, color, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    $stmt->execute([$name, $building, $cidr, $lat, $lng, $radius_m, $color, $description]);
    $id = (int)$pdo->lastInsertId();
    $zone = cast_zone($pdo->query("SELECT * FROM location_zones WHERE id = $id")->fetch());
    json_response(["zone" => $zone], 201);
  } catch (PDOException $e) {
    if ($e->getCode() === "23000") {
      json_response(["error" => "A zone with that CIDR already exists"], 409);
    }
    throw $e;
  }
}

// ── PUT /admin/location-zones/{id} ────────────────────────────────────
if ($method === "PUT" && preg_match('#^/admin/location-zones/(\d+)$#', $path, $m)) {
  assert_super_admin();
  $id  = (int)$m[1];
  $in  = json_input();
  $pdo = db();

  $existing = $pdo->prepare("SELECT * FROM location_zones WHERE id = ?");
  $existing->execute([$id]);
  $zone = $existing->fetch();
  if (!$zone) json_response(["error" => "Zone not found"], 404);

  $name        = trim($in["name"]        ?? $zone["name"]);
  $building    = trim($in["building"]    ?? $zone["building"]);
  $cidr        = trim($in["cidr"]        ?? $zone["cidr"]);
  $lat         = isset($in["lat"])        ? (float)$in["lat"]            : (float)$zone["lat"];
  $lng         = isset($in["lng"])        ? (float)$in["lng"]            : (float)$zone["lng"];
  $radius_m    = isset($in["radius_m"])   ? max(10, (int)$in["radius_m"]) : (int)$zone["radius_m"];
  $color       = trim($in["color"]       ?? $zone["color"]);
  $description = array_key_exists("description", $in)
                   ? (trim($in["description"]) ?: null)
                   : $zone["description"];

  if (!$name || !$building) json_response(["error" => "name and building are required"], 400);
  if (!valid_cidr($cidr))   json_response(["error" => "Invalid CIDR format"], 400);

  try {
    $pdo->prepare(
      "UPDATE location_zones
       SET name=?, building=?, cidr=?, lat=?, lng=?, radius_m=?, color=?, description=?
       WHERE id=?"
    )->execute([$name, $building, $cidr, $lat, $lng, $radius_m, $color, $description, $id]);
    $updated = cast_zone($pdo->query("SELECT * FROM location_zones WHERE id = $id")->fetch());
    json_response(["zone" => $updated]);
  } catch (PDOException $e) {
    if ($e->getCode() === "23000") {
      json_response(["error" => "A zone with that CIDR already exists"], 409);
    }
    throw $e;
  }
}

// ── DELETE /admin/location-zones/{id} ────────────────────────────────
if ($method === "DELETE" && preg_match('#^/admin/location-zones/(\d+)$#', $path, $m)) {
  assert_super_admin();
  $id  = (int)$m[1];
  $pdo = db();
  $stmt = $pdo->prepare("DELETE FROM location_zones WHERE id = ?");
  $stmt->execute([$id]);
  if ($stmt->rowCount() === 0) json_response(["error" => "Zone not found"], 404);
  json_response(["ok" => true]);
}

// ── GET /admin/geomap ─────────────────────────────────────────────────
if ($method === "GET" && $path === "/admin/geomap") {
  assert_super_admin();
  $pdo = db();

  // Load all zones
  $zones = array_map("cast_zone",
    $pdo->query("SELECT * FROM location_zones ORDER BY name ASC")->fetchAll()
  );

  // Build user query — optional department filter
  $dept_id = (int)($_GET["department_id"] ?? 0);
  $sql = "SELECT u.id, u.username, u.full_name, u.role, u.last_ip, u.last_seen_at,
                 d.name AS department
          FROM users u
          LEFT JOIN departments d ON d.id = u.department
          WHERE u.status = 'active' AND u.last_ip IS NOT NULL";
  $params = [];
  if ($dept_id > 0) {
    $sql .= " AND u.department = ?";
    $params[] = $dept_id;
  }
  $sql .= " ORDER BY u.last_seen_at DESC";

  $stmt = $pdo->prepare($sql);
  $stmt->execute($params);
  $users = $stmt->fetchAll();

  // Resolve each user's IP against zones (PHP-side CIDR matching)
  $resolved = [];
  foreach ($users as $u) {
    $matched_zone = null;
    foreach ($zones as $z) {
      if (ip_in_cidr($u["last_ip"], $z["cidr"])) {
        $matched_zone = $z;
        break;
      }
    }
    $resolved[] = [
      "id"           => (int)$u["id"],
      "username"     => $u["username"],
      "full_name"    => $u["full_name"],
      "role"         => $u["role"],
      "department"   => $u["department"],
      "last_ip"      => $u["last_ip"],
      "last_seen_at" => $u["last_seen_at"],
      "zone_id"      => $matched_zone ? $matched_zone["id"]       : null,
      "zone_name"    => $matched_zone ? $matched_zone["name"]     : null,
      "building"     => $matched_zone ? $matched_zone["building"] : null,
    ];
  }

  json_response(["zones" => $zones, "users" => $resolved]);
}
