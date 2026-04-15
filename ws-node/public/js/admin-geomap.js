// ── Geomap module ─────────────────────────────────────────────────────
// Requires: adminToken, API_BASE (from admin-auth.js), showToast (admin-users.js)

let leafletLoaded    = false;
let geomapMap        = null;   // Leaflet map instance
let zoneCircles      = [];     // Leaflet Circle layers
let userMarkers      = [];     // Leaflet Marker layers
let userMarkerMap    = {};     // { [userId]: L.Marker } for sidebar click-to-focus
let allGeomapData    = null;   // { zones, users }
let pickModeActive   = false;  // true while map-click picker is active
let pickModeMarker   = null;   // temporary L.Marker shown after picking
let pickModeSavedData = null;  // form values saved before picker opens

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
  userMarkerMap = {};

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
      `<span style="font-size:12px;color:var(--text-secondary,#888)">${esc(z.building)}</span><br>` +
      `<code>${esc(z.cidr)}</code>` +
      (z.description ? `<br><span style="font-size:11px;color:var(--text-secondary,#888)">${esc(z.description)}</span>` : "") +
      `<br><br><a href="#" onclick="openZoneModal(geomapZoneById(${z.id}));return false"` +
      ` style="font-size:12px;color:var(--accent,#8B5CF6)">Edit zone</a>`
    )
    .addTo(geomapMap);
    zoneCircles.push(circle);
  });
}

function geomapZoneById(id) {
  return (allGeomapData?.zones || []).find(z => z.id === id) || null;
}

// ── Draw individual user pin markers ──────────────────────────────────
function drawUserMarkers(users, zones) {
  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]));

  // Group users by zone to calculate circular offsets
  const byZone = {};
  users.forEach(u => {
    if (u.zone_id) (byZone[u.zone_id] = byZone[u.zone_id] || []).push(u);
  });

  Object.entries(byZone).forEach(([zoneId, zUsers]) => {
    const zone = zoneMap[zoneId];
    if (!zone) return;

    const N = zUsers.length;
    // Spread pins in a ring at 35% of zone radius, capped at 25 m
    const offsetDist = N > 1 ? Math.min(zone.radius_m * 0.35, 25) : 0;
    const baseLat = parseFloat(zone.lat);
    const baseLng = parseFloat(zone.lng);

    zUsers.forEach((u, i) => {
      const angle = (2 * Math.PI * i) / N;
      const dLat  = offsetDist > 0 ? (offsetDist / 111320) * Math.cos(angle) : 0;
      const dLng  = offsetDist > 0
        ? (offsetDist / (111320 * Math.cos(baseLat * Math.PI / 180))) * Math.sin(angle)
        : 0;

      const pinLat = baseLat + dLat;
      const pinLng = baseLng + dLng;
      const initials = (u.full_name || u.username).charAt(0).toUpperCase();
      const color    = zone.color;
      const timeAgo  = u.last_seen_at ? fmtRelTime(u.last_seen_at) : "—";

      const icon = L.divIcon({
        className: "",
        html: `<div class="geomap-user-pin" style="background:${color};border-color:${color}">${initials}</div>`,
        iconSize:   [28, 28],
        iconAnchor: [14, 14],
      });

      const popup =
        `<div style="min-width:160px">` +
        `<strong style="color:var(--text-primary,#111)">${esc(u.full_name)}</strong>` +
        `<div class="geomap-popup-username" style="margin-bottom:4px">@${esc(u.username)}</div>` +
        `<div class="geomap-popup-meta">${esc(u.department || u.role)}</div>` +
        `<div class="geomap-popup-meta" style="margin-top:2px">` +
          `<span style="border-color:${color}40;color:${color};background:${color}15;display:inline-block;font-size:10px;border:1px solid;border-radius:4px;padding:1px 5px">${esc(zone.name)}</span>` +
        `</div>` +
        `<div class="geomap-popup-meta" style="margin-top:4px">Last seen: ${timeAgo}</div>` +
        `</div>`;

      const marker = L.marker([pinLat, pinLng], { icon })
        .bindPopup(popup)
        .addTo(geomapMap);

      userMarkers.push(marker);
      userMarkerMap[u.id] = marker;
    });
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

    return `<div class="geomap-user-row" onclick="geomapFocusUser(${u.id})">
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

function geomapFocusUser(userId) {
  const marker = userMarkerMap[userId];
  if (!marker || !geomapMap) return;
  geomapMap.setView(marker.getLatLng(), 18);
  marker.openPopup();
}

// ── Zone CRUD modal ───────────────────────────────────────────────────
function openZoneModal(zone) {
  const isEdit = !!zone;
  const title  = isEdit ? "Edit Zone" : "Add Zone";

  const modal = document.createElement("div");
  modal.id        = "zoneModal";
  modal.className = "zone-modal-overlay";

  modal.innerHTML = `
    <div class="zone-modal-card">
      <div class="zone-modal-header">
        <h3>${title}</h3>
        <button class="zone-modal-close" onclick="closeZoneModal()" title="Close">×</button>
      </div>

      <div class="zone-modal-body">
        <div class="zone-field">
          <label class="form-label">Zone Name *</label>
          <input id="zm_name" class="form-input" value="${esc(zone?.name || '')}" placeholder="e.g. Main Building AP1">
        </div>

        <div class="zone-field">
          <label class="form-label">Building *</label>
          <input id="zm_building" class="form-input" value="${esc(zone?.building || '')}" placeholder="e.g. Main Building">
        </div>

        <div class="zone-field">
          <label class="form-label">IP Range (CIDR) *</label>
          <input id="zm_cidr" class="form-input" value="${esc(zone?.cidr || '')}" placeholder="e.g. 192.168.1.0/24">
        </div>

        <div class="zone-field-row">
          <div class="zone-field">
            <label class="form-label">Latitude *</label>
            <input id="zm_lat" class="form-input" type="number" step="any" value="${zone?.lat ?? ''}" placeholder="e.g. 7.1985">
          </div>
          <div class="zone-field">
            <label class="form-label">Longitude *</label>
            <input id="zm_lng" class="form-input" type="number" step="any" value="${zone?.lng ?? ''}" placeholder="e.g. 125.630">
          </div>
        </div>

        <div class="zone-field">
          <button type="button" onclick="enterPickMode()" class="btn-pick-map">
            📍 Pick on Map
          </button>
        </div>

        <div class="zone-field-row">
          <div class="zone-field">
            <label class="form-label">Radius (metres)</label>
            <input id="zm_radius" class="form-input" type="number" min="10" value="${zone?.radius_m ?? 80}">
          </div>
          <div class="zone-field">
            <label class="form-label">Zone Color</label>
            <input id="zm_color" type="color" class="zone-color-input" value="${zone?.color ?? '#8B5CF6'}">
          </div>
        </div>

        <div class="zone-field">
          <label class="form-label">Description</label>
          <textarea id="zm_desc" class="form-input" rows="2" placeholder="Optional notes">${esc(zone?.description || '')}</textarea>
        </div>

        <input type="hidden" id="zm_zone_id" value="${zone?.id ?? ''}">
        <div id="zm_error" class="zone-modal-error"></div>
      </div>

      <div class="zone-modal-footer ${isEdit ? 'has-delete' : ''}">
        ${isEdit ? `<button onclick="deleteZone(${zone.id})" class="btn-modal-danger">Delete Zone</button>` : ""}
        <div style="display:flex;gap:8px">
          <button onclick="closeZoneModal()" class="btn-modal-cancel">Cancel</button>
          <button onclick="saveZone(${isEdit ? zone.id : 'null'})" class="btn-modal-primary">
            ${isEdit ? "Save Changes" : "Create Zone"}
          </button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.addEventListener("click", e => { if (e.target === modal) closeZoneModal(); });
}

function closeZoneModal() {
  // Clean up pick mode if it was left active when modal is force-closed
  if (pickModeActive) {
    geomapMap?.off("click", onPickModeClick);
    exitPickModeUI();
  }
  if (pickModeMarker) { pickModeMarker.remove(); pickModeMarker = null; }
  pickModeSavedData = null;
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

  const showErr = msg => { errEl.textContent = msg; errEl.style.display = "block"; };
  const hideErr = ()  => { errEl.style.display = "none"; };

  if (!name || !building)        { showErr("Name and building are required."); return; }
  if (!cidrRx.test(cidr))        { showErr("Invalid CIDR (e.g. 192.168.1.0/24)."); return; }
  if (isNaN(lat) || isNaN(lng))  { showErr("Latitude and longitude are required."); return; }
  hideErr();

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
    if (!res.ok) { showErr(data.error || "Failed to save."); return; }
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

// ── Map coordinate picker ─────────────────────────────────────────────
function enterPickMode() {
  // Save all current form values so we can restore them later
  pickModeSavedData = {
    zoneId:      document.getElementById("zm_zone_id")?.value || null,
    name:        document.getElementById("zm_name").value,
    building:    document.getElementById("zm_building").value,
    cidr:        document.getElementById("zm_cidr").value,
    lat:         document.getElementById("zm_lat").value,
    lng:         document.getElementById("zm_lng").value,
    radius_m:    document.getElementById("zm_radius").value,
    color:       document.getElementById("zm_color").value,
    description: document.getElementById("zm_desc").value,
  };

  // Hide modal temporarily (keep it in DOM so values aren't lost)
  const modal = document.getElementById("zoneModal");
  if (modal) modal.style.display = "none";

  // Show instruction banner inside the map container
  const banner = document.createElement("div");
  banner.id        = "pickModeBanner";
  banner.className = "pick-mode-banner";
  banner.innerHTML = `📍 Click anywhere on the map to place the zone center.
    <button type="button" onclick="cancelPickMode()" class="pick-mode-cancel">Cancel</button>`;
  document.getElementById("geomapMap").appendChild(banner);

  // Crosshair cursor on map
  document.getElementById("geomapMap").classList.add("pick-mode-cursor");

  // One-time click listener on Leaflet map
  pickModeActive = true;
  geomapMap.once("click", onPickModeClick);
}

function onPickModeClick(e) {
  if (!pickModeActive) return;
  const { lat, lng } = e.latlng;

  exitPickModeUI();

  // Drop a temporary marker so the user sees where they clicked
  if (pickModeMarker) { pickModeMarker.remove(); pickModeMarker = null; }
  pickModeMarker = L.marker([lat, lng]).addTo(geomapMap);

  // Rebuild the modal with saved values + new coords
  _reopenModalWithCoords(lat, lng);
}

function cancelPickMode() {
  geomapMap.off("click", onPickModeClick);
  exitPickModeUI();
  // Restore modal with the original coordinates
  const saved = pickModeSavedData;
  _reopenModalWithCoords(
    parseFloat(saved.lat) || null,
    parseFloat(saved.lng) || null,
    true  // restoring — don't overwrite with null coords
  );
}

function exitPickModeUI() {
  pickModeActive = false;
  document.getElementById("pickModeBanner")?.remove();
  document.getElementById("geomapMap").classList.remove("pick-mode-cursor");
}

function _reopenModalWithCoords(lat, lng, restoreOriginal = false) {
  const saved = pickModeSavedData;
  if (!saved) return;

  // Remove the hidden modal before opening a fresh one
  document.getElementById("zoneModal")?.remove();

  // Build a zone-like object from saved form state
  const zoneObj = saved.zoneId
    ? { ...geomapZoneById(Number(saved.zoneId)), ...saved, id: Number(saved.zoneId) }
    : { ...saved, id: null };

  // Apply the picked (or restored) coordinates
  if (lat !== null) zoneObj.lat = lat;
  if (lng !== null) zoneObj.lng = lng;

  openZoneModal(zoneObj);

  // Override the lat/lng inputs directly after the modal renders
  if (lat !== null) document.getElementById("zm_lat").value = restoreOriginal ? (saved.lat ?? "") : lat.toFixed(7);
  if (lng !== null) document.getElementById("zm_lng").value = restoreOriginal ? (saved.lng ?? "") : lng.toFixed(7);
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
