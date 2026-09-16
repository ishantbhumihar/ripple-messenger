// Messages & Chat Page Logic
const state = {
  user: null,
  conversations: [],
  activeConversation: null,
  messageTimer: null
};

function messageMarkup(message) {
  const media = message.mediaUrl
    ? message.mediaType === "image"
      ? `<img class="chat-image" src="${message.mediaUrl}" alt="Shared image">`
      : message.mediaType === "video"
      ? `<video class="chat-video" controls preload="metadata" src="${message.mediaUrl}"></video>`
      : `<audio class="chat-audio" controls src="${message.mediaUrl}"></audio>`
    : "";
  return `<article class="message ${message.mine ? "mine" : ""}">
    <div class="bubble">
      ${message.text ? `<p>${escapeHtml(message.text).replace(/\n/g, "<br>")}</p>` : ""}${media}
    </div>
    <time>${time(message.createdAt)}</time>
  </article>`;
}

async function loadConversations() {
  try {
    const { conversations } = await api("/api/conversations");
    state.conversations = conversations;
    const container = $("#conversation-list");
    if (!container) return;
    container.innerHTML = conversations.length
      ? conversations.map((chat) => {
          const preview = chat.latest
            ? (chat.latest.text || (chat.latest.mediaType === "image" ? "📷 Photo" : chat.latest.mediaType === "video" ? "🎬 Video" : "🎵 Audio"))
            : "Start your private conversation";
          return `<button class="conversation-card" data-chat="${chat.id}">
            <span class="avatar">${initials(chat.person.name)}</span>
            <span class="user-copy">
              <b>${escapeHtml(chat.person.name)}</b>
              <small>@${escapeHtml(chat.person.username)} · ${escapeHtml(preview)}</small>
            </span>
            <span class="chevron">›</span>
          </button>`;
        }).join("")
      : '<div class="empty">No conversations yet. <a href="/discover" style="color:var(--purple);font-weight:600">Find someone</a> to start chatting!</div>';

    document.querySelectorAll("[data-chat]").forEach((button) => {
      button.onclick = () => {
        openChat(button.dataset.chat);
        history.pushState({ chat: button.dataset.chat }, "", `/?chat=${button.dataset.chat}`);
      };
    });
  } catch (error) {
    toast(error.message, true);
  }
}

let pollErrorCount = 0;
async function loadChatMessages(scroll = false) {
  if (!state.activeConversation || document.hidden) return;
  try {
    const data = await api(`/api/conversations/${state.activeConversation}/messages`);
    pollErrorCount = 0;
    const chat = data.conversation;
    $("#chat-avatar").textContent = initials(chat.person.name);
    $("#chat-name").textContent = chat.person.name;
    $("#chat-handle").textContent = `@${chat.person.username}`;
    $("#chat-messages").innerHTML = data.messages.length
      ? data.messages.map(messageMarkup).join("")
      : '<div class="empty-chat">You are connected. Say hello 👋</div>';
    if (scroll) {
      $("#chat-messages").scrollTop = $("#chat-messages").scrollHeight;
    }
  } catch (error) {
    pollErrorCount++;
    // If conversation not found, return to chats list
    if (error.message.includes("not found") || error.message.includes("404")) {
      toast("Conversation not found.", true);
      showChatsList();
    } else if (pollErrorCount >= 4) {
      toast("Trouble reaching server. Retrying...", true);
    }
  }
}

async function openChat(conversationId) {
  state.activeConversation = conversationId;
  pollErrorCount = 0;
  $("#screen-chats").hidden = true;
  $("#screen-chat").hidden = false;
  await loadChatMessages(true);
  clearInterval(state.messageTimer);
  state.messageTimer = setInterval(() => loadChatMessages(false), 3000);
}

function showChatsList() {
  state.activeConversation = null;
  pollErrorCount = 0;
  clearInterval(state.messageTimer);
  $("#screen-chat").hidden = true;
  $("#screen-chats").hidden = false;
  loadConversations();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.activeConversation) {
    loadChatMessages(false);
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  state.user = await initSidebar("chats");
  if (!state.user) return;

  const urlParams = new URLSearchParams(window.location.search);
  const initialChatId = urlParams.get("chat");

  await loadConversations();

  if (initialChatId) {
    openChat(initialChatId);
  }

  window.addEventListener("popstate", (e) => {
    const params = new URLSearchParams(window.location.search);
    const chatId = params.get("chat");
    if (chatId) {
      openChat(chatId);
    } else {
      showChatsList();
    }
  });

  $("#back-to-chats").onclick = () => {
    showChatsList();
    history.pushState({}, "", "/");
  };

  const emojiToggle = $("#emoji-toggle");
  const emojiMenu = $("#emoji-menu");
  if (emojiToggle && emojiMenu) {
    emojiToggle.onclick = () => { emojiMenu.hidden = !emojiMenu.hidden; };
    emojiMenu.querySelectorAll("button").forEach((btn) => {
      btn.onclick = () => {
        $("#message-text").value += btn.textContent;
        $("#message-text").focus();
        emojiMenu.hidden = true;
      };
    });
  }

  const mediaInput = $("#media-input");
  if (mediaInput) {
    mediaInput.onchange = () => {
      const file = mediaInput.files[0];
      $("#file-name").textContent = file ? file.name : "";
    };
  }

  const messageForm = $("#message-form");
  if (messageForm) {
    messageForm.onsubmit = async (event) => {
      event.preventDefault();
      const text = $("#message-text").value.trim();
      const file = $("#media-input").files[0];
      if (!text && !file) return;
      if (file && (!/^(image|video|audio)\//.test(file.type) || file.size > 25 * 1024 * 1024)) {
        return toast("Only image, video, or audio files up to 25 MB are allowed.", true);
      }

      const form = new FormData();
      form.append("text", text);
      if (file) form.append("media", file);

      $("#send").disabled = true;
      try {
        await api(`/api/conversations/${state.activeConversation}/messages`, {
          method: "POST",
          body: form
        });
        $("#message-text").value = "";
        $("#media-input").value = "";
        $("#file-name").textContent = "";
        await loadChatMessages(true);
      } catch (error) {
        toast(error.message, true);
      } finally {
        $("#send").disabled = false;
      }
    };
  }
});
