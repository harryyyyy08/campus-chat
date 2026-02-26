// ── Storage (super_admin only) ────────────────────────
      async function loadStorage() {
        document.getElementById("staleTableBody").innerHTML =
          `<tr><td colspan="7" class="table-empty">Loading…</td></tr>`;
        try {
          const res = await fetch(`${API_BASE}/admin/storage`, {
            headers: { Authorization: "Bearer " + adminToken },
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }

          document.getElementById("statTotalFiles").textContent =
            data.total_files.toLocaleString();
          document.getElementById("statDbSize").textContent = fmtBytes(
            data.total_bytes,
          );
          document.getElementById("statDiskUsed").textContent = fmtBytes(
            data.disk_bytes,
          );
          document.getElementById("statStaleCount").textContent =
            data.stale_count.toLocaleString();
          document.getElementById("statStaleSize").textContent = fmtBytes(
            data.stale_bytes,
          );

          staleFiles = data.stale_files || [];
          selectedStale.clear();
          renderStaleTable();
          document.getElementById("deleteAllBtn").disabled =
            staleFiles.length === 0;
        } catch (err) {
          showToast("Connection error.");
          console.error(err);
        }
      }

      function renderStaleTable() {
        const tbody = document.getElementById("staleTableBody");
        if (!staleFiles.length) {
          tbody.innerHTML = `<tr><td colspan="7" class="table-empty">🎉 No stale files found!</td></tr>`;
          updateSelectionBar();
          return;
        }
        tbody.innerHTML = staleFiles
          .map(
            (f) => `
          <tr data-fid="${f.id}">
            <td><input type="checkbox" class="stale-cb" value="${f.id}" ${selectedStale.has(f.id) ? "checked" : ""} onchange="toggleStaleSelect(${f.id},this.checked)" /></td>
            <td><span class="mono" title="${escapeHtml(f.original_name)}">${escapeHtml(truncate(f.original_name, 36))}</span></td>
            <td><span class="mono">${escapeHtml(f.mime_type.split("/")[1] || f.mime_type)}</span></td>
            <td><span class="mono">${fmtBytes(f.file_size)}</span></td>
            <td>${escapeHtml(f.uploader_name || f.uploader_username)}</td>
            <td><span class="mono">${formatDate(f.last_accessed)}</span></td>
            <td><button class="action-btn reject" onclick="cleanupOne(${f.id})">Delete</button></td>
          </tr>`,
          )
          .join("");
        updateSelectionBar();
      }

      function toggleStaleSelect(id, checked) {
        if (checked) selectedStale.add(id);
        else selectedStale.delete(id);
        updateSelectionBar();
      }
      function toggleSelectAll(cb) {
        document.querySelectorAll(".stale-cb").forEach((el) => {
          el.checked = cb.checked;
          const id = parseInt(el.value);
          if (cb.checked) selectedStale.add(id);
          else selectedStale.delete(id);
        });
        updateSelectionBar();
      }
      function updateSelectionBar() {
        document.getElementById("selectionCount").textContent =
          selectedStale.size +
          " file" +
          (selectedStale.size !== 1 ? "s" : "") +
          " selected";
        document
          .getElementById("selectionBar")
          .classList.toggle("hidden", selectedStale.size === 0);
      }

      async function cleanupAll() {
        if (!staleFiles.length) {
          showToast("No stale files to delete.");
          return;
        }
        if (
          !confirm(
            `Delete all ${staleFiles.length} stale file(s)? This cannot be undone.`,
          )
        )
          return;
        await runCleanup([]);
      }
      async function cleanupSelected() {
        if (!selectedStale.size) return;
        if (!confirm(`Delete ${selectedStale.size} selected file(s)?`)) return;
        await runCleanup(Array.from(selectedStale));
      }
      async function cleanupOne(id) {
        if (!confirm("Delete this file? Cannot be undone.")) return;
        await runCleanup([id]);
      }

      async function runCleanup(ids) {
        try {
          const res = await fetch(`${API_BASE}/admin/cleanup`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + adminToken,
            },
            body: JSON.stringify({ ids }),
          });
          const data = await res.json();
          if (!res.ok) {
            showToast(data.error || "Failed.");
            return;
          }
          showToast(
            `Deleted ${data.deleted} file(s), freed ${fmtBytes(data.freed_bytes)}.`,
          );
          await loadStorage();
        } catch {
          showToast("Connection error.");
        }
      }

      // ── Helpers ───────────────────────────────────────────
      function initials(name) {
        if (!name) return "?";
        const p = name.trim().split(" ");
        return p.length >= 2
          ? (p[0][0] + p[p.length - 1][0]).toUpperCase()
          : name.slice(0, 2).toUpperCase();
      }
      function escapeHtml(str) {
        return String(str)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      }
      function formatDate(dt) {
        if (!dt) return "—";
        return new Date(dt.replace(" ", "T")).toLocaleDateString([], {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
      }
      function fmtBytes(bytes) {
        if (!bytes) return "0 B";
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + " MB";
        return (bytes / 1073741824).toFixed(2) + " GB";
      }
      function truncate(str, n) {
        return str.length > n ? str.slice(0, n) + "…" : str;
      }