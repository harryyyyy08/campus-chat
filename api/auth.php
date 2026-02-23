<?php
/**
 * Authentication Middleware Module
 * 
 * Purpose: Provides middleware function to verify JWT tokens in incoming requests
 * Type: PHP Authentication/Authorization Module
 * 
 * Exports:
 * - require_auth() - Validates Bearer token and returns JWT claims
 * 
 * Behavior:
 * - Extracts JWT token from Authorization: Bearer header
 * - Verifies token signature using JWT secret from config
 * - Returns decoded claims (user_id, username, etc.) on success
 * - Returns 401 Unauthorized on token missing or invalid
 * 
 * Usage: Called at the start of protected API routes to ensure user is authenticated
 */

require_once __DIR__ . "/db.php";
require_once __DIR__ . "/jwt.php";
require_once __DIR__ . "/helpers.php";

function require_auth(): array {
  $cfg = require __DIR__ . "/config.php";
  $token = bearer_token();
  if (!$token) json_response(["error" => "Missing Authorization Bearer token"], 401);

  try {
    return jwt_verify($token, $cfg["jwt"]["secret"]);
  } catch (Exception $e) {
    json_response(["error" => "Unauthorized: " . $e->getMessage()], 401);
  }
}