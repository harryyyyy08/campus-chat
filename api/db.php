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

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;

  $cfg = require __DIR__ . "/config.php";
  $pdo = new PDO($cfg["db"]["dsn"], $cfg["db"]["user"], $cfg["db"]["pass"], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
  return $pdo;
}