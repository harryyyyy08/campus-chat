<?php
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