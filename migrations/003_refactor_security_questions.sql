-- Migration 003: Refactor user_security_questions to single-row-per-user
-- Instead of 3 rows per user, store all 3 questions + answers in one row

DROP TABLE IF EXISTS user_security_questions;

CREATE TABLE user_security_questions (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id         INT UNSIGNED NOT NULL UNIQUE,
  q1_index        TINYINT UNSIGNED NOT NULL,
  q1_answer_hash  VARCHAR(255) NOT NULL,
  q2_index        TINYINT UNSIGNED NOT NULL,
  q2_answer_hash  VARCHAR(255) NOT NULL,
  q3_index        TINYINT UNSIGNED NOT NULL,
  q3_answer_hash  VARCHAR(255) NOT NULL,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
