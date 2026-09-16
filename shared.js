// Shared utilities for Ripple multi-page application
const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
  try {
    const response = await fetch(url, { credentials: "same-origin", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Something went wrong.");
    return data;
  } catch (err) {
    if (err.name === "TypeError" && err.message.toLowerCase().includes("fetch")) {
      throw new Error("Unable to connect to the server. Please check your connection.");
    }
    throw err;
  }
}

function initials(name = "") {
  return (name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2) || "?").toUpperCase();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#039;",
    "\"": "&quot;"
  }[character]));
}

function toast(message, error = false) {
  let item = $("#toast");
  if (!item) {
    item = document.createElement("div");
    item.id = "toast";
    item.hidden = true;
    document.body.appendChild(item);
  }
  item.textContent = message;
  item.style.background = error ? "#a7384c" : "#182236";
  item.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { item.hidden = true; }, 3500);
}

function time(value) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

async function initSidebar(activeScreen = "") {
  try {
    const { user } = await api("/api/me");
    if (!user) {
      window.location.replace("/login");
      return null;
    }
    const myAvatar = $("#my-avatar");
    const myName = $("#my-name");
    const myHandle = $("#my-handle");
    if (myAvatar) myAvatar.textContent = initials(user.name);
    if (myName) myName.textContent = user.name;
    if (myHandle) myHandle.textContent = `@${user.username}`;

    // Highlight active link
    document.querySelectorAll(".nav-button").forEach((link) => {
      if (link.dataset.screen === activeScreen) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });

    // Update request count badge
    try {
      const data = await api("/api/requests");
      const incoming = (data.requests || []).filter((r) => r.direction === "received" && r.status === "pending").length;
      const badge = $("#request-count");
      if (badge) {
        badge.hidden = incoming === 0;
        badge.textContent = incoming;
      }
    } catch {
      // Ignore request badge error
    }

    // Setup logout handler
    const logoutBtn = $("#logout");
    if (logoutBtn) {
      logoutBtn.onclick = async () => {
        try {
          await api("/api/auth/logout", { method: "POST" });
        } catch {}
        window.location.href = "/login";
      };
    }

    return user;
  } catch {
    window.location.replace("/login");
    return null;
  }
}
