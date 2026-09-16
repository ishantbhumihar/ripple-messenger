// Requests Page Logic
async function loadRequests() {
  const container = $("#request-list");
  if (!container) return;

  try {
    const data = await api("/api/requests");
    const requests = data.requests || [];

    const incoming = requests.filter((r) => r.direction === "received" && r.status === "pending");
    const past = requests.filter((r) => !(r.direction === "received" && r.status === "pending"));

    const badge = $("#request-count");
    if (badge) {
      badge.hidden = incoming.length === 0;
      badge.textContent = incoming.length;
    }

    const card = (request) => `<article class="request-card">
      <span class="avatar">${initials(request.person.name)}</span>
      <div class="user-copy">
        <b>${escapeHtml(request.person.name)}</b>
        <small>@${escapeHtml(request.person.username)} · ${
          request.direction === "received"
            ? "wants to start a private chat"
            : request.status === "accepted"
            ? "You are connected"
            : request.status === "declined"
            ? "Request declined"
            : "Request pending"
        }</small>
      </div>
      ${
        request.direction === "received" && request.status === "pending"
          ? `<div class="actions">
              <button class="accept" data-respond="${request.id}" data-action="accepted">Accept</button>
              <button class="decline" data-respond="${request.id}" data-action="declined">Decline</button>
            </div>`
          : `<span class="status">${request.status}</span>`
      }
    </article>`;

    container.innerHTML = incoming.length
      ? incoming.map(card).join("") + (past.length ? `<p class="eyebrow" style="margin-top:24px">HISTORY</p>${past.map(card).join("")}` : "")
      : past.length
      ? `<p class="eyebrow">HISTORY</p>${past.map(card).join("")}`
      : '<div class="empty">No incoming requests right now. <a href="/discover" style="color:var(--purple);font-weight:600">Find people</a> to connect with.</div>';

    document.querySelectorAll("[data-respond]").forEach((button) => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const result = await api(`/api/requests/${button.dataset.respond}/respond`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: button.dataset.action })
          });

          if (result.conversationId) {
            toast("Request accepted! Opening chat...");
            setTimeout(() => {
              window.location.href = `/?chat=${result.conversationId}`;
            }, 600);
          } else {
            toast("Request declined.");
            loadRequests();
          }
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
  const user = await initSidebar("requests");
  if (!user) return;
  await loadRequests();
});
