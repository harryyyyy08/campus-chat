<?php
/**
 * Helper Functions Module
 * 
 * Purpose: Utility functions for common API operations
 * Type: PHP Utility/Helper Module
 * 
 * Exports:
 * - json_input() - Parses incoming JSON request body
 * - json_response() - Sends JSON response with HTTP status code
 * - bearer_token() - Extracts JWT token from Authorization header
 * 
 * Usage: Called throughout API routes to standardize request/response handling
 */

function json_input(): array {
  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function json_response($data, int $status = 200): void {
  http_response_code($status);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode($data);
  exit;
}

function bearer_token(): ?string {
  $hdr = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/Bearer\s+(.*)$/i', $hdr, $m)) return trim($m[1]);
  return null;
}