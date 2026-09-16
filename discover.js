// Discover Page Logic
let searchTimer = null;
let requests = [];

async function refreshRequests() {
  const data = await api("/api/requests");
  requests = data.requests || [];
  const incoming = requests.filter((r) => r.direction === "received" && r.status === "pending").length;
  const badge = $("#request-count");
  if (badge) {
    badge.hidden = incoming === 0;
    badge.textContent = incoming;
  }
}

async function loadUsers() {
  const searchInput = $("#user-search");
  const query = searchInput ? searchInput.value.trim() : "";
  const listContainer = $("#user-list");
  if (!listContainer) return;

  try {
    const [userData] = await Promise.all([
      api(`/api/users?q=${encodeURIComponent(query)}`),
      refreshRequests()
    ]);

    listContainer.innerHTML = userData.users.length
      ? userData.users.map((person) => {
          const request = requests.find((item) => item.person && item.person.id === person.id);
          let action = `<button class="outline" data-request-person="${person.id}">Send request</button>`;
          if (request?.status === "accepted") {
            action = '<a href="/?chat=' + (request.conversationId || "") + '" class="status" style="color:var(--purple);font-weight:600;text-decoration:none">Connected · Chat</a>';
          } else if (request?.status === "pending") {
            action = `<span class="status">${request.direction === "sent" ? "Request pending" : "Request received"}</span>`;
          } else if (request?.status === "declined") {
            action = '<span class="status">Request declined</span>';
          }
          return `<article class="user-card">
            <span class="avatar">${initials(person.name)}</span>
            <div class="user-copy">
              <b>${escapeHtml(person.name)}</b>
              <small>@${escapeHtml(person.username)} · ${escapeHtml(person.bio || "No bio yet")}</small>
            </div>
            ${action}
          </article>`;
        }).join("")
      : '<div class="empty">No people found. New accounts will show up here.</div>';

    document.querySelectorAll("[data-request-person]").forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          await api("/api/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: button.dataset.requestPerson })
          });
          toast("Request sent. They must accept before you can chat.");
          loadUsers();
        } catch (error) {
          button.disabled = false;
          toast(error.message, true);
        }
      };
    });
  } catch (error) {
    toast(error.message, true);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const user = await initSidebar("discover");
  if (!user) return;

  await loadUsers();

  const searchInput = $("#user-search");
  if (searchInput) {
    searchInput.oninput = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(loadUsers, 200);
    };
  }
});
