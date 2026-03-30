<?php

/**
 * Database Connection Module
 * 
 * Purpose: Provides a single PDO database connection instance (singleton pattern)
 * Type: PHP Database Abstraction Layer
 * 
 * Exports:
 * - db() - Returns the singleton PDO connection to MySQL database
 * 
 * Features:
 * - Lazy initialization (connection created only when needed)
 * - Error mode set to EXCEPTION for proper error handling
 * - Default fetch mode set to ASSOCIATIVE array for easier data handling
 * 
 * Usage: Call db() function to get the database connection instance
 */

function db(): PDO
{
  static $pdo = null;
  if ($pdo) return $pdo;

  $cfg = require __DIR__ . "/config.php";
  $db = $cfg["db"] ?? [];

  // Backward compatibility for host/name style configs.
  $dsn = $db["dsn"] ?? "";
  if ($dsn === "") {
    $host = $db["host"] ?? "localhost";
    $name = $db["name"] ?? "";
    $charset = $db["charset"] ?? "utf8mb4";
    if ($name === "") {
      throw new RuntimeException("Database config missing db.dsn or db.name");
    }
    $dsn = "mysql:host={$host};dbname={$name};charset={$charset}";
  }

  $pdo = new PDO($dsn, $db["user"] ?? "", $db["pass"] ?? "", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}
