-- Migration: Security Questions for Forgot Password Self-Service
-- Date: 2026-04-06

-- 1. New table: user_security_questions
CREATE TABLE IF NOT EXISTS `user_security_questions` (
  `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` int(10) UNSIGNED NOT NULL,
  `question_set` tinyint(1) NOT NULL COMMENT '1 or 2',
  `question_index` tinyint(1) NOT NULL COMMENT '1-5 (which question they picked from the set)',
  `answer_hash` varchar(255) NOT NULL COMMENT 'bcrypt hash of lowercase answer',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_user_question_set` (`user_id`, `question_set`),
  CONSTRAINT `fk_usq_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Alter password_reset_requests: add self-service columns
ALTER TABLE `password_reset_requests`
  ADD COLUMN `reset_method` ENUM('admin','self_service') NOT NULL DEFAULT 'admin' AFTER `status`,
  ADD COLUMN `reset_token` varchar(64) DEFAULT NULL AFTER `reset_method`,
  ADD COLUMN `token_expires_at` datetime DEFAULT NULL AFTER `reset_token`,
  ADD COLUMN `attempts` tinyint(3) UNSIGNED NOT NULL DEFAULT 0 AFTER `token_expires_at`,
  ADD KEY `idx_prr_token` (`reset_token`);
