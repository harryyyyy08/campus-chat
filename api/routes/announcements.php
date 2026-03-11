<?php
// ════════════════════════════════════════════
// ANNOUNCEMENTS ROUTES
// ════════════════════════════════════════════

// ── GET /announcements — list visible announcements for current user ──
if ($method === "GET" && $path === "/announcements") {
  $claims  = require_auth(); $pdo = db();
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  // Get user's department
  $stmt = $pdo->prepare("SELECT department FROM users WHERE id = ?");
  $stmt->execute([$user_id]);
  $user = $stmt->fetch();
  $dept = $user["department"] ?? null;

  // Admins/super_admin see all (including pending)
  // Faculty/students see only approved announcements visible to them
  $is_admin = in_array($role, ["admin", "super_admin"]);

  if ($is_admin) {
    $stmt = $pdo->prepare("
      SELECT a.*, u.username AS author_name, u.role AS author_role,
             u.department AS author_dept,
             ab.username AS approver_name,
             (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS read_count
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      LEFT JOIN users ab ON ab.id = a.approved_by
      ORDER BY a.created_at DESC
      LIMIT 100
    ");
    $stmt->execute();
  } else {
    $stmt = $pdo->prepare("
      SELECT a.*, u.username AS author_name, u.role AS author_role,
             u.department AS author_dept,
             ab.username AS approver_name,
             (SELECT COUNT(*) FROM announcement_reads ar WHERE ar.announcement_id = a.id) AS read_count
      FROM announcements a
      JOIN users u ON u.id = a.author_id
      LEFT JOIN users ab ON ab.id = a.approved_by
      WHERE (
      -- Approved announcements visible to this user
      (a.status = 'approved' AND (
        a.target_type = 'all'
        OR (a.target_type = 'department' AND a.department = ?)
      ))
      OR
      -- Own pending/rejected announcements
      (a.author_id = ?)
    )
      ORDER BY a.created_at DESC
      LIMIT 100
    ");
    $stmt->execute([$dept, $user_id]);
  }

  $rows = $stmt->fetchAll();

  // Mark which ones current user has read
  $read_stmt = $pdo->prepare("SELECT announcement_id FROM announcement_reads WHERE user_id = ?");
  $read_stmt->execute([$user_id]);
  $read_ids = $read_stmt->fetchAll(PDO::FETCH_COLUMN);
  $read_set = array_flip($read_ids);

  $result = array_map(function($r) use ($read_set) {
    return [
      "id"           => (int)$r["id"],
      "author_id"    => (int)$r["author_id"],
      "author_name"  => $r["author_name"],
      "author_role"  => $r["author_role"],
      "author_dept"  => $r["author_dept"],
      "approver_name"=> $r["approver_name"],
      "title"        => $r["title"],
      "body"         => $r["body"],
      "priority"     => $r["priority"],
      "target_type"  => $r["target_type"],
      "department"   => $r["department"],
      "status"       => $r["status"],
      "read_count"   => (int)$r["read_count"],
      "is_read"      => isset($read_set[(int)$r["id"]]),
      "approved_by"  => $r["approved_by"] ? (int)$r["approved_by"] : null,
      "approved_at"  => $r["approved_at"],
      "created_at"   => $r["created_at"],
      "updated_at"   => $r["updated_at"],
    ];
  }, $rows);

  json_response(["announcements" => $result]);
}

// ── POST /announcements — create announcement ─────────────────────
if ($method === "POST" && $path === "/announcements") {
  $claims  = require_auth(); $pdo = db(); $in = json_input();
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  $title       = trim((string)($in["title"] ?? ""));
  $body        = trim((string)($in["body"] ?? ""));
  $priority    = in_array($in["priority"] ?? "", ["low","normal","high","urgent"]) ? $in["priority"] : "normal";
  $target_type = ($in["target_type"] ?? "all") === "department" ? "department" : "all";
  $department  = $target_type === "department" ? trim((string)($in["department"] ?? "")) : null;

  if ($title === "" || $body === "")
    json_response(["error" => "title and body required"], 400);
  if ($target_type === "department" && $department === "")
    json_response(["error" => "department required when target_type is department"], 400);

  // Faculty, admin, super_admin = auto-approved; student = pending
  $is_privileged = in_array($role, ["faculty", "admin", "super_admin"]);
  $status      = $is_privileged ? "approved" : "pending";
  $approved_by = $is_privileged ? $user_id : null;
  $approved_at = $is_privileged ? date("Y-m-d H:i:s") : null;

  $stmt = $pdo->prepare("
    INSERT INTO announcements (author_id, title, body, priority, target_type, department, status, approved_by, approved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ");
  $stmt->execute([$user_id, $title, $body, $priority, $target_type, $department, $status, $approved_by, $approved_at]);
  $ann_id = (int)$pdo->lastInsertId();

  $stmt = $pdo->prepare("
    SELECT a.*, u.username AS author_name, u.role AS author_role, u.department AS author_dept
    FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = ?
  ");
  $stmt->execute([$ann_id]);
  $ann = $stmt->fetch();

  json_response([
    "announcement" => [
      "id"          => (int)$ann["id"],
      "author_id"   => (int)$ann["author_id"],
      "author_name" => $ann["author_name"],
      "author_role" => $ann["author_role"],
      "author_dept" => $ann["author_dept"],
      "title"       => $ann["title"],
      "body"        => $ann["body"],
      "priority"    => $ann["priority"],
      "target_type" => $ann["target_type"],
      "department"  => $ann["department"],
      "status"      => $ann["status"],
      "approved_by" => $ann["approved_by"] ? (int)$ann["approved_by"] : null,
      "approved_at" => $ann["approved_at"],
      "created_at"  => $ann["created_at"],
      "is_read"     => false,
      "read_count"  => 0,
    ],
    "auto_approved" => $is_privileged,
  ], 201);
}

// ── PATCH /announcements/{id} — edit announcement ─────────────────
if ($method === "PATCH" && preg_match('#^/announcements/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db(); $in = json_input();
  $ann_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  $stmt = $pdo->prepare("SELECT * FROM announcements WHERE id = ?");
  $stmt->execute([$ann_id]); $ann = $stmt->fetch();
  if (!$ann) json_response(["error" => "Announcement not found"], 404);

  $is_admin = in_array($role, ["admin", "super_admin"]);
  if ((int)$ann["author_id"] !== $user_id && !$is_admin)
    json_response(["error" => "Cannot edit another user's announcement"], 403);

  $title       = isset($in["title"])       ? trim((string)$in["title"])       : $ann["title"];
  $body        = isset($in["body"])        ? trim((string)$in["body"])        : $ann["body"];
  $priority    = isset($in["priority"]) && in_array($in["priority"], ["low","normal","high","urgent"])
                 ? $in["priority"] : $ann["priority"];
  $target_type = isset($in["target_type"]) ? ($in["target_type"] === "department" ? "department" : "all") : $ann["target_type"];
  $department  = $target_type === "department"
                 ? (isset($in["department"]) ? trim((string)$in["department"]) : $ann["department"])
                 : null;

  if ($title === "" || $body === "")
    json_response(["error" => "title and body required"], 400);

  // If student edits, reset to pending
  $new_role = $claims["role"] ?? "student";
  $is_privileged = in_array($new_role, ["faculty", "admin", "super_admin"]);
  $new_status = $is_privileged ? "approved" : "pending";

  $pdo->prepare("
    UPDATE announcements SET title=?, body=?, priority=?, target_type=?, department=?, status=?, updated_at=NOW()
    WHERE id=?
  ")->execute([$title, $body, $priority, $target_type, $department, $new_status, $ann_id]);

  json_response(["ok" => true, "message" => "Announcement updated"]);
}

// ── DELETE /announcements/{id} ────────────────────────────────────
if ($method === "DELETE" && preg_match('#^/announcements/(\d+)$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $ann_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  $stmt = $pdo->prepare("SELECT author_id FROM announcements WHERE id = ?");
  $stmt->execute([$ann_id]); $ann = $stmt->fetch();
  if (!$ann) json_response(["error" => "Announcement not found"], 404);

  $is_admin = in_array($role, ["admin", "super_admin"]);
  if ((int)$ann["author_id"] !== $user_id && !$is_admin)
    json_response(["error" => "Cannot delete another user's announcement"], 403);

  $pdo->prepare("DELETE FROM announcement_reads WHERE announcement_id = ?")->execute([$ann_id]);
  $pdo->prepare("DELETE FROM announcements WHERE id = ?")->execute([$ann_id]);

  json_response(["ok" => true]);
}

// ── POST /announcements/{id}/approve ─────────────────────────────
if ($method === "POST" && preg_match('#^/announcements/(\d+)/approve$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $ann_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  if (!in_array($role, ["admin", "super_admin"]))
    json_response(["error" => "Admin only"], 403);

  $stmt = $pdo->prepare("SELECT * FROM announcements WHERE id = ?");
  $stmt->execute([$ann_id]); $ann = $stmt->fetch();
  if (!$ann) json_response(["error" => "Announcement not found"], 404);

  $pdo->prepare("
    UPDATE announcements SET status='approved', approved_by=?, approved_at=NOW() WHERE id=?
  ")->execute([$user_id, $ann_id]);

  // Fetch updated
  $stmt = $pdo->prepare("
    SELECT a.*, u.username AS author_name, u.role AS author_role, u.department AS author_dept
    FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.id = ?
  ");
  $stmt->execute([$ann_id]); $ann = $stmt->fetch();

  json_response([
    "ok" => true,
    "announcement" => [
      "id"          => (int)$ann["id"],
      "author_id"   => (int)$ann["author_id"],
      "author_name" => $ann["author_name"],
      "author_role" => $ann["author_role"],
      "author_dept" => $ann["author_dept"],
      "title"       => $ann["title"],
      "body"        => $ann["body"],
      "priority"    => $ann["priority"],
      "target_type" => $ann["target_type"],
      "department"  => $ann["department"],
      "status"      => $ann["status"],
      "approved_by" => (int)$ann["approved_by"],
      "approved_at" => $ann["approved_at"],
      "created_at"  => $ann["created_at"],
      "is_read"     => false,
      "read_count"  => 0,
    ],
  ]);
}

// ── POST /announcements/{id}/reject ──────────────────────────────
if ($method === "POST" && preg_match('#^/announcements/(\d+)/reject$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $ann_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];
  $role    = $claims["role"] ?? "student";

  if (!in_array($role, ["admin", "super_admin"]))
    json_response(["error" => "Admin only"], 403);

  $stmt = $pdo->prepare("SELECT id FROM announcements WHERE id = ?");
  $stmt->execute([$ann_id]); 
  if (!$stmt->fetch()) json_response(["error" => "Announcement not found"], 404);

  $pdo->prepare("UPDATE announcements SET status='rejected' WHERE id=?")->execute([$ann_id]);
  json_response(["ok" => true]);
}

// ── POST /announcements/{id}/read ────────────────────────────────
if ($method === "POST" && preg_match('#^/announcements/(\d+)/read$#', $path, $m)) {
  $claims  = require_auth(); $pdo = db();
  $ann_id  = (int)$m[1];
  $user_id = (int)$claims["sub"];

  $pdo->prepare("INSERT IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)")
      ->execute([$ann_id, $user_id]);

  json_response(["ok" => true]);
}