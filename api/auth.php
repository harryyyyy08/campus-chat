<?php
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