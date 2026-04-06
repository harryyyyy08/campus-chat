/**
 * Settings modal — change password (JWT-protected API).
 */

const SETTINGS_MIN_PASSWORD_LEN = 8;

function openSettingsModal() {
  resetSettingsForm();
  showSettingsMenuView();
  refreshSettingsThemeControl();
  openModal("settingsModal");
  setTimeout(
    () => document.querySelector("#settingsMenuView .settings-item")?.focus(),
    100,
  );
}

function openSettingsChangePasswordView() {
  const menuView = document.getElementById("settingsMenuView");
  const passwordView = document.getElementById("settingsPasswordView");
  if (menuView) menuView.classList.add("hidden");
  if (passwordView) passwordView.classList.remove("hidden");
  setTimeout(() => document.getElementById("settingsCurrentPw")?.focus(), 100);
}

function openSettingsSecurityQuestions() {
  window.location.href = "setup-security.html";
}

function showSettingsMenuView() {
  const menuView = document.getElementById("settingsMenuView");
  const passwordView = document.getElementById("settingsPasswordView");
  if (menuView) menuView.classList.remove("hidden");
  if (passwordView) passwordView.classList.add("hidden");
  setSettingsFeedback("", "");
  refreshSettingsThemeControl();
}

function refreshSettingsThemeControl() {
  const theme =
    document.documentElement.getAttribute("data-theme") ||
    localStorage.getItem("cc_theme") ||
    "light";
  const icon = document.getElementById("settingsThemePillIcon");
  const text = document.getElementById("settingsThemePillText");
  if (!icon || !text) return;

  if (theme === "dark") {
    text.textContent = "Dark";
    icon.innerHTML =
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    icon.setAttribute("viewBox", "0 0 24 24");
  } else {
    text.textContent = "Light";
    icon.innerHTML =
      '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>';
    icon.setAttribute("viewBox", "0 0 24 24");
  }
}

function toggleThemeFromSettings() {
  toggleTheme();
  refreshSettingsThemeControl();
}

function resetSettingsForm() {
  const cur = document.getElementById("settingsCurrentPw");
  const nw = document.getElementById("settingsNewPw");
  const cf = document.getElementById("settingsConfirmPw");
  const fb = document.getElementById("settingsFormFeedback");
  if (cur) cur.value = "";
  if (nw) nw.value = "";
  if (cf) cf.value = "";
  if (fb) {
    fb.textContent = "";
    fb.className = "modal-feedback";
  }
}

function setSettingsFeedback(message, kind) {
  const fb = document.getElementById("settingsFormFeedback");
  if (!fb) return;
  fb.textContent = message;
  fb.className = "modal-feedback" + (kind ? " modal-feedback--" + kind : "");
}

async function submitChangePassword(ev) {
  if (ev) ev.preventDefault();

  const cur = document.getElementById("settingsCurrentPw")?.value ?? "";
  const nw = document.getElementById("settingsNewPw")?.value ?? "";
  const cf = document.getElementById("settingsConfirmPw")?.value ?? "";
  const btn = document.getElementById("settingsChangePwBtn");

  setSettingsFeedback("", "");

  if (!cur || !nw || !cf) {
    setSettingsFeedback("Please fill in all fields.", "error");
    return;
  }
  if (nw.length < SETTINGS_MIN_PASSWORD_LEN) {
    setSettingsFeedback(
      "New password must be at least " +
        SETTINGS_MIN_PASSWORD_LEN +
        " characters.",
      "error",
    );
    return;
  }
  if (nw !== cf) {
    setSettingsFeedback("New password and confirmation do not match.", "error");
    return;
  }
  if (nw === cur) {
    setSettingsFeedback(
      "New password must be different from your current password.",
      "error",
    );
    return;
  }

  if (!token) {
    setSettingsFeedback("You are not signed in.", "error");
    return;
  }

  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        current_password: cur,
        new_password: nw,
        confirm_password: cf,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (checkAuthError(res)) return;

    if (!res.ok) {
      setSettingsFeedback(data.error || "Could not update password.", "error");
      return;
    }

    setSettingsFeedback(
      data.message || "Password updated successfully.",
      "success",
    );
    document.getElementById("settingsCurrentPw").value = "";
    document.getElementById("settingsNewPw").value = "";
    document.getElementById("settingsConfirmPw").value = "";
  } catch (e) {
    console.error(e);
    setSettingsFeedback("Connection error. Please try again.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}
