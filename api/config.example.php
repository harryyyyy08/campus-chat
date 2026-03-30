<?php

/**
 * Configuration Example File
 * 
 * Purpose: Template para sa configuration setup
 * Type: PHP Configuration Template
 * 
 * Instructions:
 * 1. Copy this file: cp config.example.php config.php
 * 2. Update ang values based sa iyong local/production environment
 * 3. NEVER commit ang config.php sa git (protected sa .gitignore)
 * 
 * Security Notes:
 * - JWT secret dapat unique at random sa bawat environment
 * - Database password dapat malakas at secure
 * - WebSocket URL dapat match sa actual server IP/domain
 */

return [
  'db' => [
    'dsn' => 'mysql:host=localhost;dbname=campus_chat;charset=utf8mb4', // Preferred DSN format
    'host' => 'localhost',           // Database server address
    'name' => 'campus_chat',          // Database name
    'user' => 'root',                 // Database user
    'pass' => '',                     // Database password (CHANGE THIS!)
  ],
  'jwt' => [
    'secret'      => 'CHANGE_ME_use_a_long_random_string_here_at_least_32_chars',  // Token signing key
    'issuer'      => 'campus-chat',                                                 // JWT issuer identifier
    'ttl_seconds' => 60 * 60 * 24 * 7,                                    // Token expiry: 1 week
  ],
  'ws' => [
    'url' => 'http://YOUR_SERVER_IP:3001',  // WebSocket server URL (update to actual IP)
  ],
  'cleanup_secret' => 'your_cleanup_secret_here', // Must match ws-node/.env CLEANUP_SECRET
];
