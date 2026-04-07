-- Migration 004: Add conversation_hidden table
-- This table tracks which conversations a user has "deleted" (hidden)
-- Without it, GET /conversations fails because the query LEFT JOINs on it

CREATE TABLE IF NOT EXISTS `conversation_hidden` (
  `conversation_id` INT UNSIGNED NOT NULL,
  `user_id`         INT UNSIGNED NOT NULL,
  `hidden_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`conversation_id`, `user_id`),
  KEY `idx_ch_user` (`user_id`),
  CONSTRAINT `fk_ch_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `conversations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ch_user`         FOREIGN KEY (`user_id`)         REFERENCES `users` (`id`)          ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
