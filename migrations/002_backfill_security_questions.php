<?php
/**
 * Backfill script: Add random security questions for all active users.
 * Answer for all: "test" (bcrypt hashed)
 * Run once: c:\xampp\php\php.exe migrations/002_backfill_security_questions.php
 */

require_once __DIR__ . '/../api/db.php';

$pdo = db();
$answerHash = password_hash('test', PASSWORD_DEFAULT);

// Get all active users who don't have security questions yet
$users = $pdo->query("
  SELECT u.id, u.username 
  FROM users u 
  LEFT JOIN user_security_questions sq ON sq.user_id = u.id 
  WHERE u.status = 'active' AND sq.id IS NULL
")->fetchAll();

if (empty($users)) {
    echo "All users already have security questions set.\n";
    exit;
}

$inserted = 0;
foreach ($users as $user) {
    $uid = (int)$user['id'];
    $q1 = rand(1, 5);
    $q2 = rand(1, 5);
    $q3 = rand(1, 5);

    $pdo->prepare("INSERT INTO user_security_questions (user_id, q1_index, q1_answer_hash, q2_index, q2_answer_hash, q3_index, q3_answer_hash) VALUES (?, ?, ?, ?, ?, ?, ?)")
        ->execute([$uid, $q1, $answerHash, $q2, $answerHash, $q3, $answerHash]);

    $inserted++;
    echo "  [+] @{$user['username']} (id=$uid) → Q1:#$q1, Q2:#$q2, Q3:#$q3\n";
}

echo "\nDone! Inserted $inserted row(s). All answers: \"test\"\n";
