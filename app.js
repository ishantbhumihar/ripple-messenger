const $ = (selector) => document.querySelector(selector);
const state = { user: null, requests: [], conversations: [], activeConversation: null, messageTimer: null };

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}
function initials(name = "") { return (name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2) || "?").toUpperCase(); }
function escapeHtml(value = "") { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#039;", "\"": "&quot;" }[character])); }
function toast(message, error = false) { const item = $("#toast"); item.textContent = message; item.style.background = error ? "#a7384c" : ""; item.hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => item.hidden = true, 3500); }
function time(value) { return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value)); }

function switchScreen(name) {
  document.querySelectorAll(".screen, .chat-screen").forEach((screen) => screen.hidden = true);
  $(`#screen-${name}`).hidden = false;
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.screen === name));
  if (name !== "chat") { state.activeConversation = null; clearInterval(state.messageTimer); }
  if (name === "chats") loadConversations();
  if (name === "discover") loadUsers();
  if (name === "requests") loadRequests();
  if (name === "profile") fillProfile();
}
function setUser(user) {
  state.user = user;
  $("#my-avatar").textContent = initials(user.name); $("#my-name").textContent = user.name; $("#my-handle").textContent = `@${user.username}`;
}
function renderRequestsBadge() {
  const incoming = state.requests.filter((request) => request.direction === "received" && request.status === "pending").length;
  $("#request-count").hidden = incoming === 0; $("#request-count").textContent = incoming;
}

async function refreshRequests() { const data = await api("/api/requests"); state.requests = data.requests; renderRequestsBadge(); return data.requests; }
async function loadConversations() {
  try {
    const { conversations } = await api("/api/conversations"); state.conversations = conversations;
    $("#conversation-list").innerHTML = conversations.length ? conversations.map((chat) => {
      const preview = chat.latest ? (chat.latest.text || (chat.latest.mediaType === "image" ? "📷 Photo" : chat.latest.mediaType === "video" ? "🎬 Video" : "🎵 Audio")) : "Start your private conversation";
      return `<button class="conversation-card" data-chat="${chat.id}"><span class="avatar">${initials(chat.person.name)}</span><span class="user-copy"><b>${escapeHtml(chat.person.name)}</b><small>@${escapeHtml(chat.person.username)} · ${escapeHtml(preview)}</small></span><span class="chevron">›</span></button>`;
    }).join("") : '<div class="empty">No conversations yet. Find a person and send a chat request.</div>';
    document.querySelectorAll("[data-chat]").forEach((button) => button.onclick = () => openChat(button.dataset.chat));
  } catch (error) { toast(error.message, true); }
}
async function loadUsers() {
  try {
    const query = $("#user-search").value.trim(); const [userData] = await Promise.all([api(`/api/users?q=${encodeURIComponent(query)}`), refreshRequests()]);
    $("#user-list").innerHTML = userData.users.length ? userData.users.map((person) => {
      const request = state.requests.find((item) => item.person.id === person.id);
      let action = `<button class="outline" data-request-person="${person.id}">Send request</button>`;
      if (request?.status === "accepted") action = '<span class="status">Already connected</span>';
      else if (request?.status === "pending") action = `<span class="status">${request.direction === "sent" ? "Request pending" : "Request received"}</span>`;
      else if (request?.status === "declined") action = '<span class="status">Request declined</span>';
      return `<article class="user-card"><span class="avatar">${initials(person.name)}</span><div class="user-copy"><b>${escapeHtml(person.name)}</b><small>@${escapeHtml(person.username)} · ${escapeHtml(person.bio || "No bio yet")}</small></div>${action}</article>`;
    }).join("") : '<div class="empty">No people found. New accounts will show up here.</div>';
    document.querySelectorAll("[data-request-person]").forEach((button) => button.onclick = async () => {
      button.disabled = true;
      try { await api("/api/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: button.dataset.requestPerson }) }); toast("Request sent. They must accept before you can chat."); loadUsers(); }
      catch (error) { button.disabled = false; toast(error.message, true); }
    });
  } catch (error) { toast(error.message, true); }
}
async function loadRequests() {
  try {
    await refreshRequests();
    const incoming = state.requests.filter((request) => request.direction === "received" && request.status === "pending");
    const past = state.requests.filter((request) => !(request.direction === "received" && request.status === "pending"));
    const card = (request) => `<article class="request-card"><span class="avatar">${initials(request.person.name)}</span><div class="user-copy"><b>${escapeHtml(request.person.name)}</b><small>@${escapeHtml(request.person.username)} · ${request.direction === "received" ? "wants to start a private chat" : request.status === "accepted" ? "You are connected" : request.status === "declined" ? "Request declined" : "Request pending"}</small></div>${request.direction === "received" && request.status === "pending" ? `<div class="actions"><button class="accept" data-respond="${request.id}" data-action="accepted">Accept</button><button class="decline" data-respond="${request.id}" data-action="declined">Decline</button></div>` : `<span class="status">${request.status}</span>`}</article>`;
    $("#request-list").innerHTML = incoming.length ? incoming.map(card).join("") + (past.length ? `<p class="eyebrow">HISTORY</p>${past.map(card).join("")}` : "") : past.length ? `<p class="eyebrow">HISTORY</p>${past.map(card).join("")}` : '<div class="empty">No incoming requests right now.</div>';
    document.querySelectorAll("[data-respond]").forEach((button) => button.onclick = async () => {
      button.disabled = true;
      try { const result = await api(`/api/requests/${button.dataset.respond}/respond`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: button.dataset.action }) }); if (result.conversationId) { toast("Request accepted. Your private chat is ready."); await refreshRequests(); await loadConversations(); openChat(result.conversationId); } else { toast("Request declined."); loadRequests(); } }
      catch (error) { button.disabled = false; toast(error.message, true); }
    });
  } catch (error) { toast(error.message, true); }
}
function fillProfile() { $("#profile-avatar").textContent = initials(state.user.name); $("#profile-name").value = state.user.name; $("#profile-username").value = state.user.username; $("#profile-bio").value = state.user.bio || ""; }

function messageMarkup(message) {
  const media = message.mediaUrl ? message.mediaType === "image" ? `<img class="chat-image" src="${message.mediaUrl}" alt="Shared image">` : message.mediaType === "video" ? `<video class="chat-video" controls preload="metadata" src="${message.mediaUrl}"></video>` : `<audio class="chat-audio" controls src="${message.mediaUrl}"></audio>` : "";
  return `<article class="message ${message.mine ? "mine" : ""}"><div class="bubble">${message.text ? `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>` : ""}${media}</div><time>${time(message.createdAt)}</time></article>`;
}
async function loadChatMessages(scroll = false) {
  if (!state.activeConversation) return;
  try {
    const data = await api(`/api/conversations/${state.activeConversation}/messages`); const chat = data.conversation;
    $("#chat-avatar").textContent = initials(chat.person.name); $("#chat-name").textContent = chat.person.name; $("#chat-handle").textContent = `@${chat.person.username}`;
    $("#chat-messages").innerHTML = data.messages.length ? data.messages.map(messageMarkup).join("") : '<div class="empty-chat">You are connected. Say hello 👋</div>';
    if (scroll) $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
  } catch (error) { toast(error.message, true); switchScreen("chats"); }
}
async function openChat(conversationId) { state.activeConversation = conversationId; switchScreen("chat"); await loadChatMessages(true); clearInterval(state.messageTimer); state.messageTimer = setInterval(() => loadChatMessages(false), 3000); }

async function initialize() {
  try {
    const { user } = await api("/api/me"); setUser(user); $("#auth-view").hidden = true; $("#messenger-view").hidden = false; await refreshRequests(); switchScreen("chats");
  } catch { $("#auth-view").hidden = false; $("#messenger-view").hidden = true; }
}

document.querySelectorAll("[data-mode]").forEach((tab) => tab.onclick = () => {
  const signup = tab.dataset.mode === "signup"; document.querySelectorAll("[data-mode]").forEach((item) => item.classList.toggle("active", item === tab)); document.querySelectorAll(".signup-only").forEach((item) => item.hidden = !signup); $("#auth-submit").textContent = signup ? "Create account" : "Log in"; $("#password").autocomplete = signup ? "new-password" : "current-password"; $("#auth-form").dataset.mode = signup ? "signup" : "login"; $("#auth-error").textContent = "";
});
$("#auth-form").onsubmit = async (event) => {
  event.preventDefault(); const signup = $("#auth-form").dataset.mode === "signup"; const button = $("#auth-submit"); button.disabled = true;
  try { const data = await api(`/api/auth/${signup ? "signup" : "login"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: $("#email").value, password: $("#password").value, name: $("#name").value, username: $("#username").value }) }); setUser(data.user); $("#auth-view").hidden = true; $("#messenger-view").hidden = false; await refreshRequests(); switchScreen("chats"); }
  catch (error) { $("#auth-error").textContent = error.message; } finally { button.disabled = false; }
};
document.querySelectorAll("[data-screen]").forEach((button) => button.onclick = () => switchScreen(button.dataset.screen)); document.querySelectorAll("[data-go]").forEach((button) => button.onclick = () => switchScreen(button.dataset.go));
$("#user-search").oninput = () => { clearTimeout(loadUsers.timer); loadUsers.timer = setTimeout(loadUsers, 180); };
$("#profile-form").onsubmit = async (event) => { event.preventDefault(); try { const { user } = await api("/api/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: $("#profile-name").value, username: $("#profile-username").value, bio: $("#profile-bio").value }) }); setUser(user); $("#profile-avatar").textContent = initials(user.name); $("#profile-note").textContent = "Profile saved."; $("#profile-note").style.color = "#3b8b6c"; } catch (error) { $("#profile-note").textContent = error.message; } };
$("#logout").onclick = async () => { await api("/api/auth/logout", { method: "POST" }); clearInterval(state.messageTimer); state.user = null; $("#messenger-view").hidden = true; $("#auth-view").hidden = false; };
$("#back-to-chats").onclick = () => switchScreen("chats"); $("#emoji-toggle").onclick = () => $("#emoji-menu").hidden = !$("#emoji-menu").hidden; document.querySelectorAll("#emoji-menu button").forEach((button) => button.onclick = () => { $("#message-text").value += button.textContent; $("#message-text").focus(); $("#emoji-menu").hidden = true; });
$("#media-input").onchange = () => { const file = $("#media-input").files[0]; $("#file-name").textContent = file ? file.name : ""; };
$("#message-form").onsubmit = async (event) => { event.preventDefault(); const text = $("#message-text").value.trim(); const file = $("#media-input").files[0]; if (!text && !file) return; if (file && (!/^(image|video|audio)\//.test(file.type) || file.size > 25 * 1024 * 1024)) return toast("Only image, video, or audio files up to 25 MB are allowed.", true); const form = new FormData(); form.append("text", text); if (file) form.append("media", file); $("#send").disabled = true; try { await api(`/api/conversations/${state.activeConversation}/messages`, { method: "POST", body: form }); $("#message-text").value = ""; $("#media-input").value = ""; $("#file-name").textContent = ""; await loadChatMessages(true); } catch (error) { toast(error.message, true); } finally { $("#send").disabled = false; } };
initialize();
