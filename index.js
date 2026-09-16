// Messages & Chat Page Logic
const state = {
  user: null,
  conversations: [],
  activeConversation: null,
  messageTimer: null,
  call: { timer: null, cursor: 0, callId: null, mode: null, peer: null, stream: null, pendingCandidates: [], incoming: false }
};

function callElements() {
  return {
    panel: $("#call-panel"), stage: document.querySelector(".call-stage"), avatar: $("#call-avatar"),
    remote: $("#remote-video"), local: $("#local-video"), status: $("#call-status"), detail: $("#call-detail"),
    answer: $("#answer-call"), decline: $("#decline-call"), mute: $("#mute-call"), camera: $("#camera-call"), end: $("#end-call")
  };
}

function setCallPanel({ status, detail, incoming = false, connected = false } = {}) {
  const elements = callElements();
  if (!elements.panel) return;
  elements.panel.hidden = false;
  elements.status.textContent = status || "Calling…";
  elements.detail.textContent = detail || "Connecting your private call";
  elements.avatar.textContent = initials($("#chat-name")?.textContent || "");
  elements.stage.classList.toggle("connected", connected);
  elements.answer.hidden = !incoming;
  elements.decline.hidden = !incoming;
  elements.mute.hidden = incoming;
  elements.camera.hidden = incoming || state.call.mode !== "video";
  elements.end.hidden = incoming;
}

function hideCallPanel() {
  const elements = callElements();
  if (!elements.panel) return;
  elements.panel.hidden = true;
  elements.stage.classList.remove("connected");
  elements.remote.srcObject = null;
  elements.local.srcObject = null;
}

function stopLocalMedia() {
  if (state.call.stream) state.call.stream.getTracks().forEach((track) => track.stop());
  state.call.stream = null;
}

function clearCurrentCall() {
  if (state.call.peer) {
    state.call.peer.onicecandidate = null;
    state.call.peer.ontrack = null;
    state.call.peer.close();
  }
  stopLocalMedia();
  state.call.callId = null;
  state.call.mode = null;
  state.call.peer = null;
  state.call.pendingCandidates = [];
  state.call.offer = null;
  state.call.incoming = false;
  const controls = callElements();
  if (controls.mute) controls.mute.textContent = "Mute";
  if (controls.camera) controls.camera.textContent = "Camera";
  hideCallPanel();
}

async function postCallSignal(type, payload = {}, callId = state.call.callId) {
  if (!state.activeConversation || !callId) return;
  await api(`/api/conversations/${state.activeConversation}/call-events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, callId, payload })
  });
}

function makeCallId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function createPeerConnection() {
  const peer = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:global.stun.twilio.com:3478" }
    ]
  });
  peer.onicecandidate = ({ candidate }) => {
    if (candidate) postCallSignal("candidate", { candidate: candidate.toJSON() }).catch(() => {});
  };
  peer.ontrack = ({ streams }) => {
    const elements = callElements();
    elements.remote.srcObject = streams[0];
    setCallPanel({ status: "Connected", detail: "Your private call is live", connected: true });
  };
  peer.onconnectionstatechange = () => {
    if (["failed", "closed"].includes(peer.connectionState) && state.call.peer === peer) {
      clearCurrentCall();
      toast("Call ended.");
    }
  };
  return peer;
}

async function requestMedia(mode) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calling is not supported in this browser. Use a secure HTTPS connection.");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
  state.call.stream = stream;
  const elements = callElements();
  elements.local.srcObject = stream;
  elements.local.hidden = mode !== "video";
  return stream;
}

async function flushCallCandidates() {
  if (!state.call.peer?.remoteDescription) return;
  const candidates = state.call.pendingCandidates.splice(0);
  for (const candidate of candidates) await state.call.peer.addIceCandidate(candidate);
}

async function startCall(mode) {
  if (state.call.callId) return toast("Finish the current call first.", true);
  state.call.callId = makeCallId();
  state.call.mode = mode;
  state.call.incoming = false;
  setCallPanel({ status: `${mode === "video" ? "Video" : "Voice"} calling…`, detail: "Waiting for them to answer" });
  try {
    const stream = await requestMedia(mode);
    const peer = createPeerConnection();
    state.call.peer = peer;
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await postCallSignal("offer", { mode, description: peer.localDescription });
  } catch (error) {
    clearCurrentCall();
    toast(error.message || "We could not start the call.", true);
  }
}

async function answerCall() {
  const { peer, offer, mode } = state.call;
  if (!peer || !offer) return;
  try {
    const stream = await requestMedia(mode);
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
    await peer.setRemoteDescription(offer);
    await flushCallCandidates();
    const answer = await peer.createAnswer();
    await peer.setLocalDescription(answer);
    await postCallSignal("answer", { description: peer.localDescription });
    state.call.incoming = false;
    setCallPanel({ status: "Connecting…", detail: "Joining your private call" });
  } catch (error) {
    await postCallSignal("decline").catch(() => {});
    clearCurrentCall();
    toast(error.message || "We could not access your microphone or camera.", true);
  }
}

async function finishCall(type = "end", message = "Call ended.") {
  await postCallSignal(type).catch(() => {});
  clearCurrentCall();
  if (message) toast(message);
}

async function handleCallEvent(event) {
  if (event.type === "offer") {
    if (state.call.callId && state.call.callId !== event.callId) {
      return postCallSignal("decline", {}, event.callId).catch(() => {});
    }
    state.call.callId = event.callId;
    state.call.mode = event.payload.mode === "video" ? "video" : "audio";
    state.call.incoming = true;
    state.call.offer = event.payload.description;
    state.call.pendingCandidates = [];
    state.call.peer = createPeerConnection();
    setCallPanel({ status: `Incoming ${state.call.mode === "video" ? "video" : "voice"} call`, detail: "Answer to connect" , incoming: true });
    return;
  }
  if (event.callId !== state.call.callId) return;
  if (event.type === "answer" && state.call.peer) {
    await state.call.peer.setRemoteDescription(event.payload.description);
    await flushCallCandidates();
    setCallPanel({ status: "Connecting…", detail: "Securing your private call" });
  } else if (event.type === "candidate") {
    const candidate = new RTCIceCandidate(event.payload.candidate);
    if (state.call.peer?.remoteDescription) await state.call.peer.addIceCandidate(candidate);
    else state.call.pendingCandidates.push(candidate);
  } else if (event.type === "decline") {
    clearCurrentCall();
    toast("Call declined.");
  } else if (event.type === "end") {
    clearCurrentCall();
    toast("Call ended.");
  }
}

async function syncCallEvents() {
  if (!state.activeConversation || document.hidden) return;
  try {
    const data = await api(`/api/conversations/${state.activeConversation}/call-events?after=${state.call.cursor}`);
    state.call.cursor = data.cursor || state.call.cursor;
    for (const event of data.events || []) await handleCallEvent(event);
  } catch {
    // Message polling already surfaces persistent connection errors.
  }
}

function startCallPolling() {
  clearInterval(state.call.timer);
  state.call.cursor = 0;
  state.call.timer = setInterval(syncCallEvents, 1500);
  syncCallEvents();
}

function stopCallPolling() {
  clearInterval(state.call.timer);
  state.call.timer = null;
}

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
  const conversationChanged = state.activeConversation !== conversationId;
  if (conversationChanged && state.activeConversation && state.call.callId) await finishCall("end", "Call ended because you opened another chat.");
  if (conversationChanged) stopCallPolling();
  state.activeConversation = conversationId;
  pollErrorCount = 0;
  $("#screen-chats").hidden = true;
  $("#screen-chat").hidden = false;
  await loadChatMessages(true);
  clearInterval(state.messageTimer);
  state.messageTimer = setInterval(() => loadChatMessages(false), 3000);
  if (conversationChanged || !state.call.timer) startCallPolling();
}

function showChatsList() {
  if (state.call.callId) finishCall("end", null);
  state.activeConversation = null;
  pollErrorCount = 0;
  clearInterval(state.messageTimer);
  stopCallPolling();
  $("#screen-chat").hidden = true;
  $("#screen-chats").hidden = false;
  loadConversations();
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.activeConversation) {
    loadChatMessages(false);
    syncCallEvents();
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

  document.querySelectorAll("[data-call-type]").forEach((button) => {
    button.onclick = () => startCall(button.dataset.callType);
  });
  $("#answer-call").onclick = answerCall;
  $("#decline-call").onclick = () => finishCall("decline", "Call declined.");
  $("#end-call").onclick = () => finishCall();
  $("#mute-call").onclick = () => {
    const track = state.call.stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    $("#mute-call").textContent = track.enabled ? "Mute" : "Unmute";
  };
  $("#camera-call").onclick = () => {
    const track = state.call.stream?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    $("#camera-call").textContent = track.enabled ? "Camera" : "Camera off";
  };
  window.addEventListener("pagehide", () => { if (state.call.callId) postCallSignal("end").catch(() => {}); });

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
