<?php

/**
 * Department Routes Module
 * 
 * Purpose: CRUD endpoints for department management
 * Type: PHP Route Handler
 * 
 * Routes:
 * - GET /departments          - Public list of all departments (for register dropdown)
 * - GET /admin/departments    - Admin list with user counts
 * - POST /admin/departments   - Create a new department
 * - PUT /admin/departments/{id}    - Update department name
 * - DELETE /admin/departments/{id} - Delete department & clear users
 */

// ── GET /departments ── Public (for registration dropdown) ───────
if ($method === "GET" && $path === "/departments") {
  $pdo = db();
  $stmt = $pdo->prepare("SELECT id, name FROM departments ORDER BY name ASC");
  $stmt->execute();
  $depts = $stmt->fetchAll();
  foreach ($depts as &$d) $d["id"] = (int)$d["id"];
  json_response(["departments" => $depts]);
}

// ── GET /admin/departments ── with user counts ───────────────────
if ($method === "GET" && $path === "/admin/departments") {
  $claims = require_auth();
  $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);

  $stmt = $pdo->prepare("SELECT d.id, d.name, d.created_at, COUNT(u.id) AS user_count FROM departments d LEFT JOIN users u ON u.department = d.id GROUP BY d.id, d.name, d.created_at ORDER BY d.name ASC");
  $stmt->execute();
  $depts = $stmt->fetchAll();
  foreach ($depts as &$d) {
    $d["id"] = (int)$d["id"];
    $d["user_count"] = (int)$d["user_count"];
  }
  json_response(["departments" => $depts]);
}

// ── POST /admin/departments ── Create ────────────────────────────
if ($method === "POST" && $path === "/admin/departments") {
  $claims = require_auth();
  $pdo = db();
  $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);

  $name = trim((string)($in["name"] ?? ""));
  if ($name === "") json_response(["error" => "Department name is required"], 400);
  if (strlen($name) > 150) json_response(["error" => "Name too long (max 150 characters)"], 400);

  // Check duplicate
  $stmt = $pdo->prepare("SELECT 1 FROM departments WHERE name = ?");
  $stmt->execute([$name]);
  if ($stmt->fetchColumn()) json_response(["error" => "Department already exists"], 409);

  $pdo->prepare("INSERT INTO departments (name) VALUES (?)")->execute([$name]);
  $id = (int)$pdo->lastInsertId();
  json_response(["created" => true, "id" => $id, "name" => $name], 201);
}

// ── PUT /admin/departments/{id} ── Update ────────────────────────
if ($method === "PUT" && preg_match('#^/admin/departments/(\d+)$#', $path, $m)) {
  $dept_id = (int)$m[1];
  $claims = require_auth();
  $pdo = db();
  $in = json_input();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);

  $name = trim((string)($in["name"] ?? ""));
  if ($name === "") json_response(["error" => "Department name is required"], 400);
  if (strlen($name) > 150) json_response(["error" => "Name too long (max 150 characters)"], 400);

  // Get old name
  $stmt = $pdo->prepare("SELECT name FROM departments WHERE id = ?");
  $stmt->execute([$dept_id]);
  $old = $stmt->fetch();
  if (!$old) json_response(["error" => "Department not found"], 404);

  // Check duplicate
  $stmt = $pdo->prepare("SELECT 1 FROM departments WHERE name = ? AND id <> ?");
  $stmt->execute([$name, $dept_id]);
  if ($stmt->fetchColumn()) json_response(["error" => "A department with that name already exists"], 409);

  // Update department name
  $pdo->prepare("UPDATE departments SET name = ? WHERE id = ?")->execute([$name, $dept_id]);

  // Users reference department by ID, so only announcement targets need name update.
  $old_name = $old["name"];
  try {
    $has_announcements = $pdo->query("SHOW TABLES LIKE 'announcements'");
    if ($has_announcements && $has_announcements->fetchColumn()) {
      $has_department_col = $pdo->query("SHOW COLUMNS FROM announcements LIKE 'department'");
      if ($has_department_col && $has_department_col->fetchColumn()) {
        $pdo->prepare("UPDATE announcements SET department = ? WHERE department = ?")->execute([$name, $old_name]);
      }
    }
  } catch (Throwable $e) {
    error_log("Department rename: skipped announcements department sync - " . $e->getMessage());
  }

  json_response(["updated" => true, "id" => $dept_id, "name" => $name]);
}

// ── DELETE /admin/departments/{id} ── Delete ─────────────────────
if ($method === "DELETE" && preg_match('#^/admin/departments/(\d+)$#', $path, $m)) {
  $dept_id = (int)$m[1];
  $claims = require_auth();
  $pdo = db();
  $stmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
  $stmt->execute([(int)$claims["sub"]]);
  $my_role = $stmt->fetchColumn();
  if (!is_admin($my_role)) json_response(["error" => "Admin access required"], 403);

  // Get the name so we can clear users
  $stmt = $pdo->prepare("SELECT name FROM departments WHERE id = ?");
  $stmt->execute([$dept_id]);
  $dept = $stmt->fetch();
  if (!$dept) json_response(["error" => "Department not found"], 404);

  // Clear users' department FK before delete.
  $stmt = $pdo->prepare("UPDATE users SET department = NULL WHERE department = ?");
  $stmt->execute([$dept_id]);
  $cleared = $stmt->rowCount();

  // Delete the department
  $pdo->prepare("DELETE FROM departments WHERE id = ?")->execute([$dept_id]);

  json_response(["deleted" => true, "id" => $dept_id, "users_cleared" => $cleared]);
}
