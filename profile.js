// Profile Page Logic
document.addEventListener("DOMContentLoaded", async () => {
  const user = await initSidebar("profile");
  if (!user) return;

  const avatarEl = $("#profile-avatar");
  const nameInput = $("#profile-name");
  const usernameInput = $("#profile-username");
  const bioInput = $("#profile-bio");
  const profileNote = $("#profile-note");

  avatarEl.textContent = initials(user.name);
  nameInput.value = user.name || "";
  usernameInput.value = user.username || "";
  bioInput.value = user.bio || "";

  // Profile info submission
  $("#profile-form").onsubmit = async (event) => {
    event.preventDefault();
    profileNote.textContent = "";
    profileNote.classList.remove("success");

    try {
      const updated = await api("/api/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          username: usernameInput.value.trim(),
          bio: bioInput.value.trim()
        })
      });

      avatarEl.textContent = initials(updated.user.name);
      $("#my-avatar").textContent = initials(updated.user.name);
      $("#my-name").textContent = updated.user.name;
      $("#my-handle").textContent = `@${updated.user.username}`;

      profileNote.textContent = "Profile saved successfully.";
      profileNote.classList.add("success");
      toast("Profile updated!");
    } catch (error) {
      profileNote.textContent = error.message;
      profileNote.classList.remove("success");
    }
  };

  // Change password submission
  const passwordForm = $("#password-form");
  const passwordNote = $("#password-note");
  const currentPasswordInput = $("#current-password");
  const newPasswordInput = $("#new-password");
  const confirmPasswordInput = $("#confirm-new-password");
  const passwordSaveBtn = $("#password-save");

  passwordForm.onsubmit = async (event) => {
    event.preventDefault();
    passwordNote.textContent = "";
    passwordNote.classList.remove("success");

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (newPassword !== confirmPassword) {
      passwordNote.textContent = "New passwords do not match.";
      return;
    }

    if (newPassword.length < 8) {
      passwordNote.textContent = "New password must be at least 8 characters.";
      return;
    }

    passwordSaveBtn.disabled = true;

    try {
      const res = await api("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      passwordNote.textContent = res.message || "Password changed successfully.";
      passwordNote.classList.add("success");
      currentPasswordInput.value = "";
      newPasswordInput.value = "";
      confirmPasswordInput.value = "";
      toast("Password updated!");
    } catch (error) {
      passwordNote.textContent = error.message;
      passwordNote.classList.remove("success");
    } finally {
      passwordSaveBtn.disabled = false;
    }
  };
});
