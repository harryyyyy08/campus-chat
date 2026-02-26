// ════════════════════════════════════════════
      // THEME
      // ════════════════════════════════════════════
      function applyTheme(theme) {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("cc_theme", theme);
        const icon = document.getElementById("adminThemeIcon");
        if (!icon) return;
        if (theme === "light") {
          icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
        } else {
          icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
        }
      }
      function toggleTheme() {
        const current =
          document.documentElement.getAttribute("data-theme") || "dark";
        applyTheme(current === "dark" ? "light" : "dark");
      }
      // Load saved theme on startup — shared with chat.css via localStorage key
      (function () {
        applyTheme(localStorage.getItem("cc_theme") || "dark");
      })();

      const API_BASE = `http://${window.location.hostname}/campus-chat/api/index.php`;
      let adminToken = null;
      let myRole = null; // 'admin' or 'super_admin'
      let currentTab = "pending";
      let allUsers = [];
      let staleFiles = [];
      let selectedStale = new Set();

      // ── Shared post-login UI setup ─────────────────────────
      async function initAdminApp(user) {
        document.getElementById("adminLoadingScreen").style.display = "none";
        document.getElementById("adminLogin").classList.add("hidden");
        document.getElementById("adminApp").classList.remove("hidden");
        document.getElementById("adminMyName").textContent =
          user.full_name || user.username;

        const badge = document.getElementById("adminRoleBadge");
        if (myRole === "super_admin") {
          badge.textContent = "Super Admin";
          badge.className = "admin-role-badge super";
          document.getElementById("adminRoleIcon").textContent = "👑";
          document.getElementById("storageTabBtn").classList.remove("hidden");
          document.getElementById("chatsTabBtn").classList.remove("hidden");
          document.getElementById("flaggedTabBtn").classList.remove("hidden");
        } else {
          badge.textContent = "Admin";
          badge.className = "admin-role-badge";
        }

        await loadUsers();
      }

      // ── Session restore on page load ───────────────────────
      (async function restoreAdminSession() {
        const savedToken = localStorage.getItem("cc_admin_token");
        const savedUserStr = localStorage.getItem("cc_admin_user");

        if (!savedToken || !savedUserStr) {
          // No saved session — show login
          document.getElementById("adminLoadingScreen").style.display = "none";
          document.getElementById("adminLogin").classList.remove("hidden");
          return;
        }

        let savedUser;
        try {
          savedUser = JSON.parse(savedUserStr);
        } catch {
          localStorage.removeItem("cc_admin_token");
          localStorage.removeItem("cc_admin_user");
          document.getElementById("adminLoadingScreen").style.display = "none";
          document.getElementById("adminLogin").classList.remove("hidden");
          return;
        }

        const role = savedUser.role;
        if (role !== "admin" && role !== "super_admin") {
          localStorage.removeItem("cc_admin_token");
          localStorage.removeItem("cc_admin_user");
          document.getElementById("adminLoadingScreen").style.display = "none";
          document.getElementById("adminLogin").classList.remove("hidden");
          return;
        }

        // Restore session immediately from localStorage — no network call needed
        // If token is truly expired, the first API call (loadUsers) will fail with 401
        adminToken = savedToken;
        myRole = role;

        document.getElementById("adminLoadingScreen").style.display = "none";
        await initAdminApp(savedUser);
      })();