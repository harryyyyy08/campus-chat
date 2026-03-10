# 💬 CampusChat

> A **real-time, offline-ready messaging platform** designed for campus networks. Built with modern web technologies — designed to run entirely on local infrastructure without internet dependency.

[![PHP](https://img.shields.io/badge/PHP-8%2B-777BB4?style=flat-square&logo=php)](https://php.net)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js)](https://nodejs.org)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io)](https://socket.io)
[![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql)](https://mysql.com)
[![License](https://img.shields.io/badge/License-Private-red?style=flat-square)

---

## 🎯 Overview

CampusChat is a **WhatsApp/Messenger-style messaging platform** optimized for educational institutions. It enables real-time communication between students, faculty, and staff entirely on a **self-hosted campus network** — no cloud services, no data leaving your institution.

**Perfect for:**

- Universities and colleges
- Large office campuses
- Hospital networks
- Enterprise intranets

---

## ✨ Core Features

### Messaging

- 💬 **Real-time messaging** — Direct and group conversations via WebSocket
- ✅ **Read receipts** — Sent / Delivered / Seen status tracking
- 🔔 **Unread counters** — Badge notifications per conversation
- ⌨️ **Typing indicators** — Live "is typing…" visual feedback
- 🟢 **Online presence** — Real-time user availability display

### Media & Files

- 📎 **File attachments** — Images display inline, documents as cards
- 🖼️ **Image lightbox** — Click-to-expand photo viewer
- 🖱️ **Drag & drop** — Direct file upload from desktop
- 📱 **Mobile-optimized** — Responsive design for all devices

### Groups & Organization

- 👥 **Group chats** — Create groups, add/remove members dynamically
- 👤 **Direct messaging** — One-to-one private conversations
- 🏷️ **Admin roles** — Group admins can manage membership

### Security & Administration

- 🔐 **Role-based access control** (RBAC) — Student, Faculty, Admin, Super Admin
- 📋 **Self-registration workflow** — Users register, admins approve
- 🛡️ **Admin panel** — Account approval, role management, storage monitoring
- 👑 **Super Admin features** — Chat monitoring, message flagging, enforcement
- 🔒 **JWT authentication** — Secure token-based authentication

---

## 🛠️ Tech Stack

| Component       | Technology          | Purpose                   |
| --------------- | ------------------- | ------------------------- |
| **Frontend**    | Vanilla JS + CSS    | Modern, responsive web UI |
| **Backend API** | PHP 8+              | RESTful API endpoints     |
| **WebSocket**   | Node.js + Socket.IO | Real-time events          |
| **Database**    | MySQL 8             | Data persistence          |
| **Server**      | Apache (XAMPP)      | HTTP server               |
| **Auth**        | JWT (HS256)         | Stateless authentication  |

---

## 📁 Project Structure

campus-chat/
├── README.md # This file
├── api/ # PHP Backend API
│ ├── index.php # Main router
│ ├── auth.php # Authentication logic
│ ├── db.php # Database singleton
│ ├── config.php # Generated config (DO NOT COMMIT)
│ ├── config.example.php # Config template
│ ├── helpers.php # Utility functions
│ ├── jwt.php # JWT handling
│ └── routes/
│ ├── auth.php # Login/register endpoints
│ ├── conversations.php # Chat creation/listing
│ ├── messages.php # Message operations
│ ├── admin.php # Admin-only endpoints
│ └── uploads.php # File upload handling
├── ws-node/ # WebSocket Server
│ ├── server.js # Socket.IO server
│ ├── client_test.js # Test client script
│ ├── package.json # Node dependencies
│ └── public/
│ ├── index.html # Web UI
│ ├── admin.html # Admin panel
│ ├── register.html # Registration form
│ ├── manifest.json # PWA manifest
│ ├── service-worker.js# Service worker (offline support)
│ ├── css/ # Stylesheets
│ └── js/ # Frontend logic
└── uploads/ # User-uploaded files

---

## 🚀 Installation & Setup

### Prerequisites

- **XAMPP** (Apache, PHP 8+, MySQL 8)
  - [Download XAMPP](https://www.apachefriends.org/download.html)
- **Node.js 18+**
  - [Download Node.js](https://nodejs.org)

### Step 1: Clone or Extract Project

````bash
# If using git
git clone <your-repo-url> campus-chat
cd campus-chat

# Or extract zip in htdocs
cd /xampp/htdocs/campus-chat

Step 2: Configure the Database
1. Start XAMPP services (Apache + MySQL)
2. Open phpMyAdmin
3. Create a new database:
CREATE DATABASE campus_chat CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
4. Run the database schema (instructions below)

Step 3: Configure PHP API
cd api/

# Copy config template
cp config.example.php config.php

# Edit config.php with your values
# - Database credentials
# - JWT secret (use a strong random string)
# - WebSocket URL (http://localhost:3001)

Example config.php:
<?php
return [
  'db' => [
    'host' => 'localhost',
    'name' => 'campus_chat',
    'user' => 'root',
    'pass' => 'your_db_password',
  ],
  'jwt' => [
    'secret' => 'use_a_very_long_random_string_at_least_32_characters_long',
    'issuer' => 'campus-chat',
    'ttl_seconds' => 60 * 60 * 24 * 7,  // 1 week
  ],
  'ws' => [
    'url' => 'http://localhost:3001',
  ],
];

Step 4: Set Up WebSocket Server
cd ws-node/

# Install dependencies
npm install

# Update JWT_SECRET in server.js to match config.php
# Update PHP_API_BASE to your server URL if needed

Step 5: Run the Application
Terminal 1 — Start XAMPP
# Windows: Start XAMPP Control Panel
# Or command line:
cd C:\xampp
apache_start.bat
mysql_start.bat

Terminal 2 — Start WebSocket Server
cd /path/to/ws-node
node server.js
# Listens on http://localhost:3001

Terminal 3 — Access the Web UI

*Open browser: http://localhost/campus-chat
*Or: http://localhost:3001 (via Node.js static server)

🔌 API Reference
Authentication Endpoints
POST /api/index.php → register
Register a new user account
{
  "username": "john_doe",
  "password": "securepass123",
  "email": "john@campus.edu",
  "display_name": "John Doe"
}

Response: {"user_id": 1, "message": "Registration pending admin approval"}

POST /api/index.php → login
Authenticate and receive JWT token
{
  "username": "john_doe",
  "password": "securepass123"
}

Response: { "token": "eyJhbGc...", "user_id": 1, "role": "student" }

Conversation Endpoints
GET /api/index.php/conversations
List user's conversations (auth required)

Response: [{ "conversations": [{ "conversation_id": 1, "type": "direct", "participants": [...] }] }](http://vscodecontentref/10)

POST /api/index.php/conversations/direct
Create a direct message conversation
{
  "participant_id": 2
}

POST /api/index.php/conversations/group
Create a group conversation
{
  "name": "Computer Science Club",
  "participant_ids": [2, 3, 4]
}
Message Endpoints
POST /api/index.php/messages
Send a message
{
  "conversation_id": 1,
  "content": "Hello everyone!",
  "attachment_id": null
}

GET /api/index.php/messages?conversation_id=1
Retrieve message history

PATCH /api/index.php/messages/{message_id}
Mark message as read/update status

File Upload
POST /api/index.php/upload
Upload a file (multipart/form-data)
conversation_id: 1
file: <binary file data>

Response: { "attachment_id": 5, "url": "/uploads/abc123.jpg", "type": "image" }

Admin Endpoints
GET /api/index.php/admin/users
List all users (admin only)

POST /api/index.php/admin/users/approve
Approve pending user registrations
{
  "user_id": 5
}

#### `POST /api/index.php/admin/users/disable`
Disable a user account
```json
{
  "user_id": 5
}
````

---

## 🔌 WebSocket Events

### Client → Server

| Event               | Payload                           | Description                       |
| ------------------- | --------------------------------- | --------------------------------- |
| `who_is_online`     | -                                 | Request list of online users      |
| `join_conversation` | `{ conversation_id }`             | Subscribe to conversation updates |
| `typing`            | `{ conversation_id, is_typing }`  | Broadcast typing status           |
| `send_message`      | `{ conversation_id, body }`       | Send message via WebSocket        |
| `edit_message`      | `{ message_id, body }`            | Edit a message                    |
| `react_message`     | `{ message_id, emoji }`           | Add emoji reaction                |
| `delete_message`    | `{ message_id }`                  | Delete message for everyone       |
| `hide_message`      | `{ message_id }`                  | Delete message for me only        |
| `mark_seen`         | `{ conversation_id }`             | Mark all messages as seen         |
| `group_created`     | `{ conversation_id, member_ids }` | Notify group created              |
| `member_added`      | `{ conversation_id, user_id }`    | Add member to group               |
| `member_removed`    | `{ conversation_id, user_id }`    | Remove member from group          |

### Server → Client

| Event                | Payload                                   | Description                  |
| -------------------- | ----------------------------------------- | ---------------------------- |
| `online_list`        | `[user_id, ...]`                          | Current online users         |
| `presence`           | `{ user_id, online }`                     | User joined/left             |
| `new_message`        | `{ message_id, content, ... }`            | New message received         |
| `message_edited`     | `{ message_id, body, is_edited }`         | Message was edited           |
| `message_reacted`    | `{ message_id, reactions, ... }`          | Emoji reactions added        |
| `message_deleted`    | `{ message_id }`                          | Message deleted for everyone |
| `message_hidden`     | `{ message_id }`                          | Message deleted for me       |
| `typing`             | `{ conversation_id, user_id, is_typing }` | Someone is typing            |
| `message_status`     | `{ message_id, status }`                  | Status: sent/delivered/seen  |
| `added_to_group`     | `{ conversation_id }`                     | User added to group          |
| `removed_from_group` | `{ conversation_id }`                     | User removed from group      |
| `group_updated`      | `{ conversation_id }`                     | Group details changed        |

---

## 🔒 Security Considerations

1. **JWT Secret** — Use a strong, random string (min 32 chars)
2. **Database Passwords** — Never use default credentials
3. **CORS Configuration** — Currently allows local network IPs
4. **File Uploads** — Validate file types and sizes
5. **Environment Variables** — Store sensitive config in `.env` (not in version control)
6. **.gitignore** — Ensure `config.php` is never committed

---

## 🐛 Troubleshooting

### WebSocket Connection Fails

- Ensure Node.js server is running on port 3001
- Check CORS headers match frontend URL
- Verify JWT_SECRET in server.js matches config.php

### Database Connection Error

- Verify MySQL is running
- Check credentials in config.php
- Ensure database `campus_chat` exists

### File Upload Issues

- Check `uploads/` folder has write permissions
- Verify file size limits in nginx/Apache config
- Check PHP `upload_max_filesize` setting

### No Messages Appear

- Check WebSocket connection: Open browser console
- Verify API cookies are being sent (Authorization header)
- Check server logs for JWT validation errors

---

## 📝 Environment Variables

Create a `.env` file (optional, for XAMPP compatibility):

```
DB_HOST=localhost
DB_NAME=campus_chat
DB_USER=root
DB_PASS=

JWT_SECRET=your_very_long_random_secret_string
JWT_TTL=604800

WS_PORT=3001
WS_URL=http://localhost:3001
```

---

## 🛠️ Development

### Running Tests

```bash
cd ws-node
node client_test.js
```

### Database Schema

Initialize database:

```sql
-- Users table structure example
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student', 'faculty', 'admin', 'super_admin') DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Conversations, Messages, etc. — see db migration files
```

---

## 📄 License

This project is **PRIVATE**. All rights reserved.

---

## 👥 Contributing

For modifications and bug fixes:

1. Create a feature branch
2. Make changes
3. Test thoroughly
4. Submit for review

---

## 📞 Support

For issues or questions:

- Check troubleshooting section above
- Review API documentation
- Check browser console for client-side errors
- Check server logs for backend errors

---

**Made with ❤️ for campus communities**
