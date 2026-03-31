// ── Geomap module ─────────────────────────────────────────────────────
// Requires: adminToken, API_BASE (from admin-auth.js), showToast (admin-users.js)

let leafletLoaded  = false;
let geomapMap      = null;   // Leaflet map instance
let zoneCircles    = [];     // Leaflet Circle layers
let userMarkers    = [];     // Leaflet Marker layers
let allGeomapData  = null;   // { zones, users }

// ── Lazy-load Leaflet from local vendor folder ────────────────────────
function ensureLeaflet(cb) {
  if (leafletLoaded) { cb(); return; }

  const link = document.createElement("link");
  link.rel  = "stylesheet";
  link.href = "vendor/leaflet/leaflet.min.css";
  document.head.appendChild(link);

  const script    = document.createElement("script");
  script.src      = "vendor/leaflet/leaflet.min.js";
  script.onload   = () => { leafletLoaded = true; cb(); };
  script.onerror  = () => showToast("Failed to load Leaflet. Check vendor/leaflet/.");
  document.head.appendChild(script);
}

// ── Fetch geomap data from the API ────────────────────────────────────
async function loadGeomap() {
  const dept = document.getElementById("geomapDeptFilter")?.value || "";
  let url = `${API_BASE}/admin/geomap`;
  if (dept) url += `?department_id=${encodeURIComponent(dept)}`;

  try {
    const res  = await fetch(url, { headers: { Authorization: "Bearer " + adminToken } });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed to load geomap."); return; }

    allGeomapData = data;
    populateGeomapDeptFilter(data.users);
    ensureLeaflet(() => renderGeomap());
  } catch {
    showToast("Connection error loading geomap.");
  }
}

// ── Populate department filter from user list ─────────────────────────
function populateGeomapDeptFilter(users) {
  const sel = document.getElementById("geomapDeptFilter");
  if (!sel) return;
  const current = sel.value;
  const depts   = [...new Map(
    users.filter(u => u.department).map(u => [u.department, u.department])
  ).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  sel.innerHTML = '<option value="">All Departments</option>';
  depts.forEach(([name]) => {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (name === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ── Main render ───────────────────────────────────────────────────────
function renderGeomap() {
  if (!allGeomapData) return;
  const { zones, users } = allGeomapData;
  const filter  = document.getElementById("geomapFilter")?.value || "all";
  const now     = Date.now();
  const ACTIVE  = 15 * 60 * 1000; // 15 minutes

  const visible = filter === "online"
    ? users.filter(u => {
        if (!u.last_seen_at) return false;
        return (now - new Date(u.last_seen_at.replace(" ", "T") + "Z").getTime()) < ACTIVE;
      })
    : users;

  initOrResetMap(zones);
  drawZoneCircles(zones);
  drawUserMarkers(visible, zones);
  renderGeomapList(visible, zones);
}

// ── Init or reset Leaflet map ─────────────────────────────────────────
function initOrResetMap(zones) {
  // Clear old layers first
  zoneCircles.forEach(c => c.remove());
  userMarkers.forEach(m => m.remove());
  zoneCircles = [];
  userMarkers = [];

  if (!geomapMap) {
    geomapMap = L.map("geomapMap");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors",
      maxZoom: 19,
    }).addTo(geomapMap);
  }

  geomapMap.invalidateSize();

  if (zones.length === 0) return;
  const lats = zones.map(z => z.lat);
  const lngs = zones.map(z => z.lng);
  geomapMap.fitBounds([
    [Math.min(...lats) - 0.002, Math.min(...lngs) - 0.002],
    [Math.max(...lats) + 0.002, Math.max(...lngs) + 0.002],
  ]);
}

// ── Draw zone circles ─────────────────────────────────────────────────
function drawZoneCircles(zones) {
  zones.forEach(z => {
    const circle = L.circle([z.lat, z.lng], {
      radius:      z.radius_m,
      color:       z.color,
      fillColor:   z.color,
      fillOpacity: 0.15,
      weight:      2,
    })
    .bindPopup(
      `<strong>${esc(z.name)}</strong><br>` +
      `${esc(z.building)}<br>` +
      `<code style="font-size:11px">${esc(z.cidr)}</code>` +
      (z.description ? `<br><span style="font-size:11px;color:#999">${esc(z.description)}</span>` : "") +
      `<br><br><a href="#" onclick="openZoneModal(geomapZoneById(${z.id}));return false"` +
      ` style="font-size:12px">Edit zone</a>`
    )
    .addTo(geomapMap);
    zoneCircles.push(circle);
  });
}

function geomapZoneById(id) {
  return (allGeomapData?.zones || []).find(z => z.id === id) || null;
}

// ── Draw user count markers per zone ──────────────────────────────────
function drawUserMarkers(users, zones) {
  const byZone = {};
  users.forEach(u => {
    if (u.zone_id) (byZone[u.zone_id] = byZone[u.zone_id] || []).push(u);
  });

  zones.forEach(z => {
    const zUsers = byZone[z.id] || [];
    if (!zUsers.length) return;

    const icon = L.divIcon({
      className: "",
      html: `<div class="geomap-marker-bubble" style="background:${z.color}">${zUsers.length}</div>`,
      iconSize:   [30, 30],
      iconAnchor: [15, 15],
    });

    const popupHtml = zUsers.map(u =>
      `<div class="geomap-popup-user">` +
        `<strong>${esc(u.full_name)}</strong>` +
        `<span class="geomap-popup-username"> @${esc(u.username)}</span>` +
        `<div class="geomap-popup-meta">${esc(u.department || u.role)}</div>` +
      `</div>`
    ).join(`<hr class="geomap-popup-hr">`);

    const marker = L.marker([z.lat, z.lng], { icon })
      .bindPopup(
        `<div style="min-width:180px;max-height:300px;overflow-y:auto">` +
        `<strong>${esc(z.name)}</strong><hr class="geomap-popup-hr">${popupHtml}</div>`
      )
      .addTo(geomapMap);
    userMarkers.push(marker);
  });
}

// ── Right-panel user list ─────────────────────────────────────────────
function renderGeomapList(users, zones) {
  const el = document.getElementById("geomapListInner");
  if (!el) return;

  if (!users.length) {
    el.innerHTML = `<div class="table-empty" style="padding:32px 0">No users found.</div>`;
    return;
  }

  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]));

  el.innerHTML = users.map(u => {
    const initials = (u.full_name || u.username).charAt(0).toUpperCase();
    const zone     = u.zone_id ? zoneMap[u.zone_id] : null;
    const color    = zone ? zone.color : "var(--accent)";
    const timeAgo  = u.last_seen_at ? fmtRelTime(u.last_seen_at) : "—";

    return `<div class="geomap-user-row" onclick="geomapFocusZone(${u.zone_id || "null"})">
      <div class="geomap-user-avatar" style="background:${color}20;color:${color}">${initials}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(u.full_name)}</div>
        <div style="font-size:11px;color:var(--text-muted)">@${esc(u.username)}</div>
        ${zone
          ? `<span class="geomap-zone-badge" style="border-color:${color}40;color:${color};background:${color}15">${esc(zone.name)}</span>`
          : `<span class="geomap-unresolved">Unknown location</span>`
        }
      </div>
      <div style="font-size:11px;color:var(--text-muted);flex-shrink:0;text-align:right">${timeAgo}</div>
    </div>`;
  }).join("");
}

function geomapFocusZone(zoneId) {
  if (!zoneId || !geomapMap || !allGeomapData) return;
  const zone = (allGeomapData.zones || []).find(z => z.id === zoneId);
  if (zone) geomapMap.setView([zone.lat, zone.lng], 17);
}

// ── Zone CRUD modal ───────────────────────────────────────────────────
function openZoneModal(zone) {
  const isEdit = !!zone;
  const title  = isEdit ? "Edit Zone" : "Add Zone";

  const modal = document.createElement("div");
  modal.id    = "zoneModal";
  modal.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:9999;" +
    "display:flex;align-items:center;justify-content:center;padding:16px";

  modal.innerHTML = `
    <div style="background:var(--bg-elevated);border-radius:12px;padding:24px;width:100%;max-width:460px;
                border:1px solid var(--border-strong);box-shadow:0 20px 60px rgba(0,0,0,0.5)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="margin:0;font-size:16px">${title}</h3>
        <button onclick="closeZoneModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:20px;line-height:1">×</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label class="form-label">Zone Name *</label>
          <input id="zm_name" class="form-input" value="${esc(zone?.name || '')}" placeholder="e.g. Main Building AP1"></div>
        <div><label class="form-label">Building *</label>
          <input id="zm_building" class="form-input" value="${esc(zone?.building || '')}" placeholder="e.g. Main Building"></div>
        <div><label class="form-label">IP Range (CIDR) *</label>
          <input id="zm_cidr" class="form-input" value="${esc(zone?.cidr || '')}" placeholder="e.g. 10.0.1.0/24"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="form-label">Latitude *</label>
            <input id="zm_lat" class="form-input" type="number" step="any" value="${zone?.lat ?? ''}" placeholder="e.g. 10.3157"></div>
          <div><label class="form-label">Longitude *</label>
            <input id="zm_lng" class="form-input" type="number" step="any" value="${zone?.lng ?? ''}" placeholder="e.g. 123.8854"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div><label class="form-label">Radius (metres)</label>
            <input id="zm_radius" class="form-input" type="number" min="10" value="${zone?.radius_m ?? 80}"></div>
          <div><label class="form-label">Color</label>
            <input id="zm_color" type="color" value="${zone?.color ?? '#8B5CF6'}"
              style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border-strong);background:var(--bg-base);cursor:pointer;padding:2px 4px"></div>
        </div>
        <div><label class="form-label">Description</label>
          <textarea id="zm_desc" class="form-input" rows="2" style="resize:vertical"
            placeholder="Optional notes">${esc(zone?.description || '')}</textarea></div>
      </div>

      <div id="zm_error" style="color:var(--error,#f44);font-size:13px;margin-top:8px;display:none"></div>

      <div style="display:flex;gap:8px;margin-top:20px;${isEdit ? 'justify-content:space-between' : 'justify-content:flex-end'}">
        ${isEdit ? `<button onclick="deleteZone(${zone.id})" class="btn-modal-danger"
          style="padding:9px 16px;font-size:13px">Delete</button>` : ""}
        <div style="display:flex;gap:8px">
          <button onclick="closeZoneModal()" class="btn-modal-secondary"
            style="padding:9px 16px;font-size:13px">Cancel</button>
          <button onclick="saveZone(${isEdit ? zone.id : 'null'})" class="btn-modal-primary"
            style="padding:9px 18px;font-size:13px">${isEdit ? "Save Changes" : "Create Zone"}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) closeZoneModal(); });
}

function closeZoneModal() {
  document.getElementById("zoneModal")?.remove();
}

async function saveZone(id) {
  const name     = document.getElementById("zm_name").value.trim();
  const building = document.getElementById("zm_building").value.trim();
  const cidr     = document.getElementById("zm_cidr").value.trim();
  const lat      = parseFloat(document.getElementById("zm_lat").value);
  const lng      = parseFloat(document.getElementById("zm_lng").value);
  const radius_m = parseInt(document.getElementById("zm_radius").value, 10) || 80;
  const color    = document.getElementById("zm_color").value.trim();
  const description = document.getElementById("zm_desc").value.trim() || null;

  const errEl = document.getElementById("zm_error");
  const cidrRx = /^\d{1,3}(\.\d{1,3}){3}\/([0-9]|[12]\d|3[012])$/;

  if (!name || !building)        { errEl.textContent = "Name and building are required."; errEl.style.display = ""; return; }
  if (!cidrRx.test(cidr))        { errEl.textContent = "Invalid CIDR (e.g. 10.0.1.0/24)."; errEl.style.display = ""; return; }
  if (isNaN(lat) || isNaN(lng))  { errEl.textContent = "Latitude and longitude are required."; errEl.style.display = ""; return; }
  errEl.style.display = "none";

  const isEdit  = id !== null;
  const url     = isEdit ? `${API_BASE}/admin/location-zones/${id}` : `${API_BASE}/admin/location-zones`;
  const method  = isEdit ? "PUT" : "POST";

  try {
    const res  = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + adminToken },
      body: JSON.stringify({ name, building, cidr, lat, lng, radius_m, color, description }),
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.error || "Failed to save."; errEl.style.display = ""; return; }
    closeZoneModal();
    showToast(isEdit ? "Zone updated." : "Zone created.");
    loadGeomap();
  } catch {
    errEl.textContent = "Connection error."; errEl.style.display = "";
  }
}

async function deleteZone(id) {
  if (!confirm("Delete this zone? This cannot be undone.")) return;
  closeZoneModal();
  try {
    const res  = await fetch(`${API_BASE}/admin/location-zones/${id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer " + adminToken },
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || "Failed to delete zone."); return; }
    showToast("Zone deleted.");
    loadGeomap();
  } catch {
    showToast("Connection error.");
  }
}

// ── Utilities ─────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtRelTime(dtStr) {
  const ms  = Date.now() - new Date(dtStr.replace(" ", "T") + "Z").getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60)        return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60)        return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr < 24)         return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
