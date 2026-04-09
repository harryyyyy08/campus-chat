# 💬 CampusChat

> A **real-time messaging platform** designed for campus networks. Built on local infrastructure — no cloud, no data leaving your institution.

[![PHP](https://img.shields.io/badge/PHP-8%2B-777BB4?style=flat-square&logo=php)](https://php.net)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql)](https://mysql.com)
[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)]()

---

## Overview

CampusChat is a self-hosted, WhatsApp/Messenger-style messaging platform for educational institutions. Students, faculty, and staff communicate in real time — entirely within the campus network.

---

## Features

### Messaging
- Real-time direct and group conversations via WebSocket
- Read receipts — Sent / Delivered / Seen per message
- Unread counters and badge notifications per conversation
- Typing indicators — live "is typing…" display
- Online presence — real-time user availability
- Edit messages, delete for everyone, or hide for self only
- Emoji reactions on messages
- Message request system — new contacts require acceptance before messaging

### Media & Files
- Attach images (JPEG, PNG, GIF, WebP), videos (MP4, WebM), audio, and documents (PDF, Word, Excel, PowerPoint)
- Up to **5 attachments per message**, **100 MB max** per file
- Images display inline with a click-to-expand lightbox viewer
- Documents displayed as download cards
- Drag & drop file upload
- File deduplication via SHA-256 hashing

### Announcements
- Post announcements campus-wide or to a specific department
- Priority levels: Low, Normal, High, Urgent
- Faculty and Admin posts are auto-approved; Student posts require admin approval
- Admins can approve, reject, or edit any announcement
- Per-user read tracking and total read count statistics

### Groups & Conversations
- Create group chats with any set of members
- Add or remove members dynamically
- Group admin role — creator manages membership
- Archive (hide) conversations without deleting them
- Conversation read status tracked per user

### Admin Panel

| Tab | Access | Description |
|-----|--------|-------------|
| Pending Approvals | Admin+ | Approve or reject new user registrations, assign roles |
| Active / Disabled Users | Admin+ | View, search, disable user accounts |
| Password Resets | Admin+ | Approve/reject password reset requests, generate temp passwords |
| Announcements | Admin+ | Moderate student announcements (approve/reject/edit/delete) |
| Flagged Messages | Super Admin | Review and unflag reported messages |
| Chat Monitor | Super Admin | Browse all conversations, search messages across the system |
| Geomap | Super Admin | View user locations on a map based on network IP |
| Storage | Super Admin | Monitor disk usage, detect and clean up stale uploaded files |
| Departments | Admin+ | Create, rename, delete departments used in registration |

### Geomap (Super Admin)
- IP-based location tracking — records each user's IP on login
- Admin defines **zones** with CIDR notation (e.g., `192.168.1.0/24`), GPS coordinates, and radius
- Users are matched to zones by CIDR lookup on refresh
- Each user appears as an individual pin on the Leaflet map
- Filter by department or recently active (last 15 minutes)
- Click a pin or sidebar row to pan and focus the map

### Security
- JWT authentication (HS256, 7-day TTL)
- Role-based access control: `student`, `faculty`, `admin`, `super_admin`
- ALTCHA bot prevention on registration, login, and password reset
- bcrypt password hashing
- Rate limiting on password reset (max 3 requests/hour)
- File type validation (MIME type + extension)
- CORS restricted to local network IPs

---

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Vanilla JS + CSS | Responsive web UI |
| Backend API | PHP 8+ | RESTful endpoints |
| WebSocket | Node.js 18+ + Socket.IO 4.x | Real-time events |
| Database | MySQL 8 / MariaDB | Data persistence |
| HTTP Server | Apache (XAMPP) | Serves PHP API and static files |
| Auth | JWT (HS256) | Stateless authentication |
| Maps | Leaflet + OpenStreetMap | Geomap visualization |
| Bot Prevention | ALTCHA | Anti-bot on public forms |

---

## Project Structure

```
campus-chat/
├── README.md
├── campus_chat.sql           # Full database schema
├── api/                      # PHP Backend API
│   ├── index.php             # Main router
│   ├── config.php            # Local config (DO NOT COMMIT)
│   ├── config.example.php    # Config template
│   ├── db.php                # Database singleton (PDO)
│   ├── helpers.php           # Utility functions (CIDR matching, etc.)
│   ├── jwt.php               # JWT encode/decode
│   └── routes/
│       ├── auth.php          # Login, register, password management
│       ├── conversations.php # Direct/group conversation CRUD
│       ├── messages.php      # Send, edit, delete, react, flag messages
│       ├── uploads.php       # File upload handling
│       ├── announcements.php # Announcement CRUD + moderation
│       ├── departments.php   # Department management
│       ├── location.php      # Geomap zones + IP tracking
│       └── admin.php         # Admin user/reset/monitor/storage endpoints
├── ws-node/                  # WebSocket Server (Node.js)
│   ├── server.js             # Socket.IO server
│   ├── package.json
│   └── public/               # Static frontend files
│       ├── index.html        # Main chat UI
│       ├── admin.html        # Admin dashboard
│       ├── login.html
│       ├── register.html
│       ├── forgot-password.html
│       ├── change-password.html
│       ├── announcements.html
│       ├── css/
│       └── js/
└── uploads/                  # User-uploaded files (auto-created)
```

---

## Installation & Setup

### Prerequisites

- **XAMPP** (Apache + PHP 8+ + MySQL 8) — [Download](https://www.apachefriends.org/download.html)
- **Node.js 18+** — [Download](https://nodejs.org)

### Step 1: Database

1. Start XAMPP (Apache + MySQL)
2. Open **phpMyAdmin** → create database:

```sql
CREATE DATABASE campus_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

3. Import the schema:

```bash
mysql -u root -p campus_chat < campus_chat.sql
```

### Step 2: PHP API Config

```bash
cd api/
cp config.example.php config.php
```

Edit `config.php`:

```php
<?php
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'campus_chat',
    'user' => 'root',
    'pass' => '',
  ],
  'jwt' => [
    'secret' => 'use_a_long_random_string_at_least_32_characters',
    'issuer' => 'campus-chat',
    'ttl_seconds' => 604800, // 7 days
  ],
  'ws' => [
    'url' => 'http://localhost:3001',
  ],
];
```

### Step 3: WebSocket Server

```bash
cd ws-node/
npm install
```

Create `ws-node/.env`:

```
JWT_SECRET=use_a_long_random_string_at_least_32_characters
PHP_API_BASE=http://localhost/campus-chat/api
PORT=3001
```

> `JWT_SECRET` must match the value in `api/config.php`.

### Step 4: Run

**Terminal 1 — XAMPP** (Windows):
```
Start XAMPP Control Panel → Start Apache + MySQL
```

**Terminal 2 — WebSocket Server:**
```bash
cd ws-node/
node server.js
```

**Access:**
- Via Apache: `http://localhost/campus-chat` (or your server IP)
- Via Node.js: `http://localhost:3001`

For multi-device access on the same network, use the server's LAN IP (e.g., `http://192.168.1.10:3001`).

---

## WebSocket Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `who_is_online` | — | Request list of online users |
| `join_conversation` | `{ conversation_id }` | Subscribe to real-time updates |
| `typing` | `{ conversation_id, is_typing }` | Broadcast typing status |
| `send_message` | `{ conversation_id, body }` | Send a message |
| `edit_message` | `{ message_id, body }` | Edit a sent message |
| `delete_message` | `{ message_id }` | Delete for everyone |
| `hide_message` | `{ message_id }` | Delete for self only |
| `react_message` | `{ message_id, emoji }` | Add emoji reaction |
| `mark_seen` | `{ conversation_id }` | Mark all messages as seen |
| `member_added` | `{ conversation_id, user_id }` | Add member to group |
| `member_removed` | `{ conversation_id, user_id }` | Remove member from group |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `online_list` | `[user_id, ...]` | Current online users |
| `presence` | `{ user_id, online }` | User joined/left |
| `new_message` | `{ message_id, content, ... }` | New message received |
| `message_edited` | `{ message_id, body }` | Message was edited |
| `message_deleted` | `{ message_id }` | Message deleted for everyone |
| `message_hidden` | `{ message_id }` | Message hidden for self |
| `message_reacted` | `{ message_id, reactions }` | Reaction added |
| `typing` | `{ conversation_id, user_id, is_typing }` | Someone is typing |
| `message_status` | `{ message_id, status }` | sent / delivered / seen |
| `added_to_group` | `{ conversation_id }` | Added to a group |
| `removed_from_group` | `{ conversation_id }` | Removed from a group |

---

## Roles & Permissions

| Feature | Student | Faculty | Admin | Super Admin |
|---------|---------|---------|-------|-------------|
| Messaging | ✅ | ✅ | ✅ | ✅ |
| Post announcements | ✅ (pending approval) | ✅ (auto-approved) | ✅ | ✅ |
| Approve users / resets | ❌ | ❌ | ✅ | ✅ |
| Moderate announcements | ❌ | ❌ | ✅ | ✅ |
| Manage departments | ❌ | ❌ | ✅ | ✅ |
| Flag / unflag messages | ❌ | ❌ | ❌ | ✅ |
| Chat monitoring | ❌ | ❌ | ❌ | ✅ |
| Geomap | ❌ | ❌ | ❌ | ✅ |
| Storage management | ❌ | ❌ | ❌ | ✅ |

---

## Security Considerations

1. **JWT Secret** — Use a strong, random string (min 32 chars); must match between `config.php` and `.env`
2. **`config.php`** — Never commit this file; it is listed in `.gitignore`
3. **Database** — Change default MySQL root password in production
4. **CORS** — Currently restricted to `localhost` and local network IPs (`10.x`, `192.168.x`, `172.16.x`)
5. **File Uploads** — MIME type + extension validated; 100 MB limit enforced

---

## Troubleshooting

**WebSocket connection fails**
- Ensure `node server.js` is running on port 3001
- Verify `JWT_SECRET` in `.env` matches `config.php`
- Check browser console for CORS errors

**Database connection error**
- Verify MySQL is running in XAMPP
- Check credentials in `api/config.php`
- Ensure the `campus_chat` database exists and schema was imported

**File upload issues**
- Check that `uploads/` directory exists and is writable
- Adjust PHP `upload_max_filesize` and `post_max_size` in `php.ini`

**Users show "Unknown location" on Geomap**
- Users must access the app via the server's LAN IP (e.g., `192.168.1.10:3001`), not `localhost`
- A matching zone must be defined with the correct CIDR for that IP range

---

## License

This project is **PRIVATE**. All rights reserved.

---

**Made with ❤️ for campus communities**
