// Forgot / Reset Password page logic
document.addEventListener("DOMContentLoaded", () => {
  const form = $("#reset-form");
  const submitBtn = $("#reset-submit");
  const note = $("#reset-note");

  form.onsubmit = async (event) => {
    event.preventDefault();
    const email = $("#email").value.trim();
    const username = $("#username").value.trim();
    const newPassword = $("#new-password").value;
    const confirmPassword = $("#confirm-password").value;

    note.textContent = "";
    note.classList.remove("success");

    if (newPassword !== confirmPassword) {
      note.textContent = "New passwords do not match.";
      return;
    }

    if (newPassword.length < 8) {
      note.textContent = "Password must be at least 8 characters.";
      return;
    }

    submitBtn.disabled = true;

    try {
      const data = await api("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, newPassword })
      });

      note.textContent = data.message || "Password successfully reset! Redirecting to login...";
      note.classList.add("success");

      setTimeout(() => {
        window.location.href = "/login?reset=success";
      }, 1500);
    } catch (error) {
      note.textContent = error.message;
      submitBtn.disabled = false;
    }
  };
});
