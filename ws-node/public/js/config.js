/**
 * CampusChat Main Application Logic
 * 
 * Purpose: Frontend controller handling UI state, API communication, and WebSocket events
 * Type: JavaScript Frontend Application (Single Page App)
 * 
 * Core Modules:
 * - THEME: Light/dark mode toggle with localStorage persistence
 * - AUTH: Login, registration, session management, JWT token handling
 * - CHAT: Message sending/receiving, conversation switching
 * - UI: Real-time UI updates (messages, typing indicators, online status)
 * - ATTACHMENTS: File upload, image preview, drag-and-drop handling
 * - SEARCH: Conversation search and user lookup
 * - ADMIN: Admin panel access and moderation features
 * 
 * Key Features:
 * - Direct and group messaging
 * - Read receipts (Sent → Delivered → Seen)
 * - Unread message counter per conversation
 * - Live typing indicators
 * - Online presence tracking
 * - File and image attachments with preview
 * - Image lightbox for expanded viewing
 * - Drag & drop file upload
 * - Conversation history pagination
 * - User search and mention support
 * - Role-based UI (Student/Faculty/Admin/Super Admin)
 * 
 * API Integration: Communicates with api/index.php backend
 * WebSocket: Connected to ws://localhost:3001 for real-time events
 * Storage: Uses localStorage for session persistence and preferences
 * 
 * Dependencies: Socket.IO client library (/socket.io/socket.io.js)
 * Stylesheets: chat.css, admin.css
 */

/* ════════════════════════════════════════════════════════════════════════════════════
   CampusChat — app.js
   Features: direct/group chat, read receipts,
             unread counter, typing, online strip,
             file & image attachments
   ════════════════════════════════════════════════════════════════════════════════════ */

// Dynamically use the server's IP/hostname — works for both localhost and LAN access
const _serverHost = window.location.hostname;
const API_BASE = `http://${_serverHost}/campus-chat/api/index.php`;
const WS_BASE = `http://${_serverHost}:3001`;