-- ============================================================
-- MERGE MIGRATION: New changes from a_campus-chat.sql
-- Date: Apr 16, 2026
-- Run this on your existing campus_chat database
-- ============================================================

-- --------------------------------------------------------
-- 1. NEW TABLE: location_zones
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `location_zones` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `building` varchar(120) NOT NULL,
  `cidr` varchar(50) NOT NULL COMMENT 'e.g. 10.0.1.0/24',
  `lat` decimal(10,7) NOT NULL,
  `lng` decimal(10,7) NOT NULL,
  `radius_m` smallint(5) UNSIGNED NOT NULL DEFAULT 80,
  `color` varchar(20) NOT NULL DEFAULT '#8B5CF6',
  `description` text DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cidr` (`cidr`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 2. NEW TABLE: user_message_visibility
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_message_visibility` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `visible_days` int(11) DEFAULT 3,
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user` (`user_id`),
  CONSTRAINT `fk_umv_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------
-- 3. ADD NEW COLUMNS to users table
-- --------------------------------------------------------
-- Add last_ip (stores the user's last known IP address)
ALTER TABLE `users`
  ADD COLUMN `last_ip` varchar(45) DEFAULT NULL AFTER `force_password_change`;

-- Add last_seen_at (tracks when the user was last active)
ALTER TABLE `users`
  ADD COLUMN `last_seen_at` datetime DEFAULT NULL AFTER `last_ip`;

-- ============================================================
-- DONE! Your database now has the teammate's new features
-- while keeping all your existing data and advanced columns.
-- ============================================================
