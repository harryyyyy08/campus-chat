<?php
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'campus_chat',
    'user' => 'root',
    'pass' => '',
  ],
  'jwt' => [
    'secret'      => 'CHANGE_ME_use_a_long_random_string_here',
    'issuer'      => 'campus-chat',
    'ttl_seconds' => 86400,
  ],
  'ws' => [
    'url' => 'http://YOUR_SERVER_IP:3001',
  ],
];