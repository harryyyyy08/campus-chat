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

function json_input(): array
{
  $raw = file_get_contents("php://input");
  $data = json_decode($raw, true);
  return is_array($data) ? $data : [];
}

function json_response($data, int $status = 200): void
{
  http_response_code($status);
  header("Content-Type: application/json; charset=utf-8");
  echo json_encode($data);
  exit;
}

function bearer_token(): ?string
{
  $hdr = $_SERVER["HTTP_AUTHORIZATION"] ?? "";
  if (preg_match('/Bearer\s+(.*)$/i', $hdr, $m))
    return trim($m[1]);
  return null;
}

/**
 * Returns true when $ip falls within the given $cidr range.
 * Supports both IPv4 and IPv6.
 */
function ip_in_cidr(string $ip, string $cidr): bool
{
  if (strpos($cidr, '/') === false)
    return $ip === $cidr;
  [$network, $bits] = explode('/', $cidr, 2);
  $bits = (int) $bits;
  $ipBin = inet_pton($ip);
  $netBin = inet_pton($network);
  if ($ipBin === false || $netBin === false)
    return false;
  if (strlen($ipBin) !== strlen($netBin))
    return false; // v4 vs v6 mismatch
  $fullBytes = (int) floor($bits / 8);
  $rem = $bits % 8;
  if ($fullBytes > 0 && substr($ipBin, 0, $fullBytes) !== substr($netBin, 0, $fullBytes)) {
    return false;
  }
  if ($rem > 0 && $fullBytes < strlen($ipBin)) {
    $mask = 0xFF & (0xFF << (8 - $rem));
    if ((ord($ipBin[$fullBytes]) & $mask) !== (ord($netBin[$fullBytes]) & $mask)) {
      return false;
    }
  }
  return true;
}