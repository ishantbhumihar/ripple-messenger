// Login and Signup page logic
document.addEventListener("DOMContentLoaded", () => {
  const form = $("#auth-form");
  const tabs = document.querySelectorAll("[data-mode]");
  const signupOnlyElements = document.querySelectorAll(".signup-only");
  const forgotContainer = $("#forgot-pw-container");
  const submitBtn = $("#auth-submit");
  const passwordInput = $("#password");
  const errorNote = $("#auth-error");

  // Check URL params for mode or message
  const params = new URLSearchParams(window.location.search);
  if (params.get("mode") === "signup") {
    setMode("signup");
  }
  if (params.get("reset") === "success") {
    errorNote.textContent = "Password reset successfully. Please log in with your new password.";
    errorNote.classList.add("success");
  }

  function setMode(mode) {
    const isSignup = mode === "signup";
    form.dataset.mode = mode;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    signupOnlyElements.forEach((el) => { el.hidden = !isSignup; });
    if (forgotContainer) forgotContainer.hidden = isSignup;
    submitBtn.textContent = isSignup ? "Create account" : "Log in";
    passwordInput.autocomplete = isSignup ? "new-password" : "current-password";
    errorNote.textContent = "";
    errorNote.classList.remove("success");
  }

  tabs.forEach((tab) => {
    tab.onclick = () => setMode(tab.dataset.mode);
  });

  form.onsubmit = async (event) => {
    event.preventDefault();
    const isSignup = form.dataset.mode === "signup";
    submitBtn.disabled = true;
    errorNote.textContent = "";
    errorNote.classList.remove("success");

    const payload = {
      email: $("#email").value.trim(),
      password: $("#password").value
    };

    if (isSignup) {
      payload.name = $("#name").value.trim();
      payload.username = $("#username").value.trim();
    }

    try {
      await api(`/api/auth/${isSignup ? "signup" : "login"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      // Redirect to home page
      window.location.href = "/";
    } catch (error) {
      errorNote.textContent = error.message;
    } finally {
      submitBtn.disabled = false;
    }
  };
});
