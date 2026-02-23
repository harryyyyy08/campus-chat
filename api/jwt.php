<?php
/**
 * JWT (JSON Web Token) Authentication Module
 * 
 * Purpose: Implements JWT signing and verification for secure user authentication
 * Type: PHP Cryptography/Authentication Module
 * 
 * Exports:
 * - base64url_encode/decode() - URL-safe Base64 encoding for JWT segments
 * - jwt_sign() - Creates a signed JWT token with HS256 algorithm
 * - jwt_verify() - Verifies JWT signature and returns decoded payload
 * 
 * Algorithm: HMAC SHA-256 (HS256)
 * Usage: Used to create and validate authentication tokens for API requests
 * Token Format: header.payload.signature (3 Base64-URL encoded segments)
 */

function base64url_encode(string $data): string {
  return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}
function base64url_decode(string $data): string {
  $remainder = strlen($data) % 4;
  if ($remainder) $data .= str_repeat('=', 4 - $remainder);
  return base64_decode(strtr($data, '-_', '+/'));
}

function jwt_sign(array $payload, string $secret): string {
  $header = ["alg" => "HS256", "typ" => "JWT"];
  $segments = [
    base64url_encode(json_encode($header)),
    base64url_encode(json_encode($payload))
  ];
  $signing_input = implode('.', $segments);
  $sig = hash_hmac('sha256', $signing_input, $secret, true);
  $segments[] = base64url_encode($sig);
  return implode('.', $segments);
}

function jwt_verify(string $token, string $secret): array {
  $parts = explode('.', $token);
  if (count($parts) !== 3) throw new Exception("Invalid token format");
  [$h, $p, $s] = $parts;
  $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$h.$p", $secret, true)), '+/', '-_'), '=');
  if (!hash_equals($expected, $s)) throw new Exception("Invalid signature");
  $payload = json_decode(base64_decode(strtr($p, '-_', '+/')), true);
  if (!$payload) throw new Exception("Invalid payload");
  if (isset($payload['exp']) && $payload['exp'] < time()) throw new Exception("Token expired");
  return $payload;
}