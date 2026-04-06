/**
 * Settings modal — change password (JWT-protected API).
 */

const SETTINGS_MIN_PASSWORD_LEN = 8;

function openSettingsModal() {
  resetSettingsForm();
  openModal("settingsModal");
  setTimeout(() => document.getElementById("settingsCurrentPw")?.focus(), 100);
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
      "New password must be at least " + SETTINGS_MIN_PASSWORD_LEN + " characters.",
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

    setSettingsFeedback(data.message || "Password updated successfully.", "success");
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
