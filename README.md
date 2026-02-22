# 💬 CampusChat

> Real-time intranet messaging system for campus networks — no internet required.

![PHP](https://img.shields.io/badge/PHP-8%2B-777BB4?style=flat-square&logo=php&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=flat-square&logo=node.js&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.x-010101?style=flat-square&logo=socket.io&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?style=flat-square&logo=mysql&logoColor=white)
![License](https://img.shields.io/badge/License-Private-red?style=flat-square)

CampusChat is a WhatsApp/Messenger-style messaging platform that runs entirely on a **local campus network**. Built for faculty, staff, and students — no cloud, no third-party services, all data stays on campus.

---

## ✨ Features

- 💬 **Real-time messaging** — direct and group conversations via WebSocket
- ✅ **Read receipts** — Sent / Delivered / Seen status
- 🔔 **Unread counters** — per conversation badge
- ⌨️ **Typing indicators** — live "is typing…" display
- 🟢 **Online presence** — see who's online in real time
- 📎 **File & image attachments** — images inline, documents as download cards
- 🔍 **Image lightbox** — click to expand images
- 🖱️ **Drag & drop** — drag files directly into the chat
- 👥 **Group chat** — create groups, add/remove members, admin roles
- 📋 **Self-registration** — users register and wait for admin approval
- 🔐 **Role-based access** — Student, Faculty, Admin, Super Admin
- 🛡️ **Admin panel** — approve accounts, manage roles, monitor storage
- 👑 **Super Admin** — chat monitoring, message flagging, storage cleanup

---

## 🛠️ Tech Stack

| Layer            | Technology          |
| ---------------- | ------------------- |
| Backend API      | PHP 8+              |
| Database         | MySQL 8             |
| WebSocket Server | Node.js + Socket.IO |
| Web Server       | Apache (XAMPP)      |
| Frontend         | Vanilla JS + CSS    |
| Authentication   | JWT (HS256)         |

---

## 📁 Project Structure

```
campus-chat/
├── api/
│   ├── index.php          ← All API endpoints
│   ├── db.php             ← Database connection
│   ├── helpers.php        ← Utility functions
│   ├── jwt.php            ← JWT sign & verify
│   ├── auth.php           ← Auth middleware
│   └── config.example.php ← Config template
├── uploads/               ← Stored attachment files
└── ws-node/
    ├── server.js          ← Socket.IO server
    ├── package.json
    └── public/
        ├── index.html     ← Chat interface
        ├── register.html  ← Registration page
        ├── admin.html     ← Admin panel
        ├── app.js
        ├── chat.css
        └── admin.css
```

---

## ⚙️ Installation

### Requirements

- XAMPP (Apache + MySQL + PHP 8+)
- Node.js v18+
- All devices on the same local network

### Steps

**1. Clone the repository**

```bash
git clone https://github.com/harryyyyy08/campus-chat.git
cd campus-chat
```

**2. Place in XAMPP htdocs**

```
C:\xampp\htdocs\campus-chat\
```

**3. Create the database**

Open phpMyAdmin → create a database named `campus_chat` → run the migration files in order:

```
migration_read_receipts.sql
migration_group_chat.sql
migration_user_roles.sql
migration_attachments.sql
migration_super_admin.sql
migration_chat_monitoring.sql
```

**4. Configure the API**

```bash
cp api/config.example.php api/config.php
```

Edit `api/config.php` with your database credentials and a secure JWT secret.

**5. Create the uploads folder**

```bash
mkdir uploads
```

Make sure Apache/PHP has write permission to this folder.

**6. Install Node.js dependencies**

```bash
cd ws-node
npm install
```

**7. Start the WebSocket server**

```bash
node server.js
```

**8. Set your Super Admin account**

In phpMyAdmin, run:

```sql
UPDATE users SET role = 'super_admin' WHERE username = 'your_username';
```

**9. Access the app**

Open in any browser on the campus network:

```
http://<server-ip>:3001
```

---

## 👤 User Roles

| Role            | Capabilities                                                       |
| --------------- | ------------------------------------------------------------------ |
| **Student**     | Chat, send files, create groups                                    |
| **Faculty**     | Same as Student                                                    |
| **Admin**       | + Approve/disable accounts, view user list                         |
| **Super Admin** | + Change roles, storage management, chat monitoring, flag messages |

New accounts require **admin approval** before they can log in.

---

## 🔌 API Overview

Base URL: `http://<server>/campus-chat/api/index.php`

All protected routes require: `Authorization: Bearer <token>`

| Method | Endpoint                 | Description                       |
| ------ | ------------------------ | --------------------------------- |
| POST   | `/login`                 | Login → returns JWT               |
| POST   | `/register`              | Self-register (public)            |
| GET    | `/conversations`         | List user's conversations         |
| POST   | `/conversations/direct`  | Start direct chat                 |
| POST   | `/conversations/group`   | Create group chat                 |
| GET    | `/messages`              | Get messages                      |
| POST   | `/messages`              | Send message                      |
| POST   | `/upload`                | Upload file attachment            |
| GET    | `/admin/users`           | List all users (admin+)           |
| POST   | `/admin/users/approve`   | Approve account (admin+)          |
| GET    | `/admin/conversations`   | Monitor all chats (super admin)   |
| GET    | `/admin/messages/search` | Search all messages (super admin) |

---

## 📱 Roadmap

- [x] Web chat interface
- [x] Direct & group messaging
- [x] File & image attachments
- [x] Admin panel with user management
- [x] Super Admin — chat monitoring & storage management
- [ ] Android native client
- [ ] Message editing & deletion
- [ ] Push notifications
- [ ] Message search for regular users

---

## 📄 License

This project is private and intended for internal campus use only.  
Unauthorized distribution or use outside the campus network is not permitted.

---

<p align="center">Built with ❤️ for campus communication</p>
