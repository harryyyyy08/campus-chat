-- =====================================================
-- Migration: Merge schema from campus_chat.sql into
-- the older campus_chat (1).sql schema
-- Run this ONCE on the old database to bring it up to date.
-- Safe to re-run (idempotent).
-- =====================================================

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================
-- 1. CREATE NEW TABLES
-- =====================================================

CREATE TABLE IF NOT EXISTS `departments` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` varchar(150) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dept_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO `departments` (`id`, `name`, `created_at`) VALUES
(1, 'Business',              '2026-03-20 07:00:00'),
(2, 'Computer Science',      '2026-03-20 07:00:00'),
(3, 'Engineering',           '2026-03-20 07:00:00'),
(4, 'Humanities',            '2026-03-20 07:00:00'),
(5, 'Information Technology','2026-03-20 07:00:00'),
(6, 'Mathematics',           '2026-03-20 07:00:00'),
(7, 'Registrar',             '2026-03-20 07:00:00');

CREATE TABLE IF NOT EXISTS `conversation_hidden` (
  `conversation_id` int(10) UNSIGNED NOT NULL,
  `user_id` int(10) UNSIGNED NOT NULL,
  `hidden_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`conversation_id`,`user_id`),
  KEY `idx_ch_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_requests` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `status` enum('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  `reset_method` enum('admin','self_service') NOT NULL DEFAULT 'admin',
  `reset_token` varchar(64) DEFAULT NULL,
  `token_expires_at` datetime DEFAULT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `temp_plain` varchar(32) DEFAULT NULL,
  `requested_at` datetime NOT NULL DEFAULT current_timestamp(),
  `resolved_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_prr_user_status` (`user_id`,`status`),
  KEY `idx_prr_status_requested` (`status`,`requested_at`),
  KEY `idx_prr_token` (`reset_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_security_questions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `q1_index` tinyint(3) UNSIGNED NOT NULL,
  `q1_answer_hash` varchar(255) NOT NULL,
  `q2_index` tinyint(3) UNSIGNED NOT NULL,
  `q2_answer_hash` varchar(255) NOT NULL,
  `q3_index` tinyint(3) UNSIGNED NOT NULL,
  `q3_answer_hash` varchar(255) NOT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `updated_at` datetime DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- =====================================================
-- 2. ALTER EXISTING TABLES (column changes only)
-- =====================================================

-- 2a. announcements
ALTER TABLE `announcements`
  MODIFY `priority` enum('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  MODIFY `department` varchar(120) DEFAULT NULL,
  MODIFY `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  MODIFY `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  MODIFY `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp();

ALTER TABLE `announcements`
  ADD KEY IF NOT EXISTS `idx_ann_created` (`created_at`),
  ADD KEY IF NOT EXISTS `fk_ann_approver` (`approved_by`);

-- 2b. announcement_reads — remove id, composite PK
ALTER TABLE `announcement_reads`
  DROP PRIMARY KEY,
  DROP KEY IF EXISTS `unique_read`,
  DROP COLUMN IF EXISTS `id`,
  MODIFY `read_at` datetime NOT NULL DEFAULT current_timestamp(),
  ADD PRIMARY KEY (`announcement_id`,`user_id`),
  ADD KEY IF NOT EXISTS `idx_ar_user` (`user_id`);

-- 2c. attachments
ALTER TABLE `attachments`
  MODIFY `mime_type` varchar(150) NOT NULL,
  MODIFY `file_size` bigint(20) UNSIGNED NOT NULL,
  MODIFY `last_accessed` datetime DEFAULT NULL;

-- 2d. conversations
ALTER TABLE `conversations`
  MODIFY `name` varchar(150) DEFAULT NULL,
  MODIFY `is_request` tinyint(1) NOT NULL DEFAULT 0;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversations' AND COLUMN_NAME = 'updated_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `conversations` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() AFTER `created_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2e. conversation_members — add joined_at
SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'conversation_members' AND COLUMN_NAME = 'joined_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `conversation_members` ADD COLUMN `joined_at` timestamp NOT NULL DEFAULT current_timestamp()', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2f. conversation_read_status
ALTER TABLE `conversation_read_status`
  MODIFY `last_read_at` datetime DEFAULT NULL;

ALTER TABLE `conversation_read_status`
  ADD KEY IF NOT EXISTS `idx_crs_user` (`user_id`),
  ADD KEY IF NOT EXISTS `idx_crs_last_read_msg` (`last_read_msg_id`);

-- 2g. messages
ALTER TABLE `messages`
  MODIFY `body` text DEFAULT NULL,
  MODIFY `created_at` datetime NOT NULL DEFAULT current_timestamp();

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'messages' AND COLUMN_NAME = 'updated_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `messages` ADD COLUMN `updated_at` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2h. message_attachments — composite PK
ALTER TABLE `message_attachments`
  DROP PRIMARY KEY,
  DROP COLUMN IF EXISTS `id`,
  MODIFY `sort_order` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  ADD PRIMARY KEY (`message_id`,`attachment_id`);

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_attachments' AND COLUMN_NAME = 'created_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `message_attachments` ADD COLUMN `created_at` timestamp NOT NULL DEFAULT current_timestamp()', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2i. message_hidden — composite PK, rename created_at -> hidden_at
ALTER TABLE `message_hidden`
  DROP PRIMARY KEY,
  DROP KEY IF EXISTS `unique_hidden`,
  DROP COLUMN IF EXISTS `id`;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_hidden' AND COLUMN_NAME = 'created_at');
SET @sql = IF(@col_exists > 0, 'ALTER TABLE `message_hidden` CHANGE `created_at` `hidden_at` datetime NOT NULL DEFAULT current_timestamp()', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

ALTER TABLE `message_hidden`
  ADD PRIMARY KEY (`message_id`,`user_id`),
  ADD KEY IF NOT EXISTS `idx_message_hidden_user` (`user_id`);

-- 2j. message_reactions — widen types
ALTER TABLE `message_reactions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  MODIFY `message_id` bigint(20) UNSIGNED NOT NULL,
  MODIFY `emoji` varchar(32) NOT NULL,
  MODIFY `created_at` datetime NOT NULL DEFAULT current_timestamp();

-- 2k. users — widen fields, add columns
ALTER TABLE `users`
  MODIFY `username` varchar(100) NOT NULL,
  MODIFY `full_name` varchar(150) NOT NULL;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'contact_number');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `users` ADD COLUMN `contact_number` varchar(255) DEFAULT NULL AFTER `full_name`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'updated_at');
SET @sql = IF(@col_exists = 0, 'ALTER TABLE `users` ADD COLUMN `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =====================================================
-- 3. DROP REMOVED TABLE
-- =====================================================
DROP TABLE IF EXISTS `user_message_visibility`;

SET FOREIGN_KEY_CHECKS = 1;
