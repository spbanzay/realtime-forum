// views/messages.js

let chatSocket = null
let chatFormBound = false
let messageHandler = null

let chatState = {
  users: [],
  activeUserId: null,
  messages: [],
  offset: 0,
  hasMore: true,
  loading: false,

  onlineUserIds: [],
  unreadCounts: {},
  lastReadMessageId: loadLastReadIds(),
  seenMessageIds: new Set(),
}

/* ===================== HELPERS ===================== */

function getCurrentUserId() {
  return window.state?.user ? Number(window.state.user.id) : null
}

function loadLastReadIds() {
  try {
    return JSON.parse(localStorage.getItem("lastReadMessageIds")) || {}
  } catch {
    return {}
  }
}

function saveLastReadIds() {
  localStorage.setItem(
    "lastReadMessageIds",
    JSON.stringify(chatState.lastReadMessageId)
  )
}

function shouldLoadMore(wrapper) {
  return wrapper.scrollTop < 200 && chatState.hasMore && !chatState.loading
}


/* ===================== INIT ===================== */

function renderMessagesPage(params) {
  const app = document.getElementById("app")
  if (!app) return

  const targetUserId = params?.id ? Number(params.id) : null

  app.innerHTML = `
    <div class="page messages-page">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-header">
          <h3>Chats</h3>
        </div>
        <div id="chat-user-list" class="chat-user-list">Loading…</div>
      </aside>

      <section class="chat-content">
        <div id="chat-messages-wrapper" class="chat-messages-wrapper">
          <div id="chat-loading-indicator" class="chat-loading-indicator" style="display:none">
            No messages
          </div>
          <div id="chat-messages" class="chat-messages">
            ${!targetUserId ? '<div class="chat-placeholder">Select a chat</div>' : ''}
          </div>
        </div>

        <form id="chat-form" class="chat-form">
          <input id="chat-input" placeholder="Enter a message…" disabled />
          <button id="chat-send" type="submit" class="btn btn-primary" disabled>
            Send
          </button>
        </form>
      </section>
    </div>
  `

  initChat(targetUserId)
}

async function initChat(targetUserId) {
  connectChatSocket()
  await loadChatUsers()

  if (!chatFormBound) {
    bindChatForm()
    bindChatScroll()
    chatFormBound = true
  }

  if (targetUserId) {
    selectChatUser(targetUserId)
  }
}

/* ===================== WEBSOCKET ===================== */

function ensureChatMessageHandler() {
  if (!window.websocket) return

  window.websocket.init()

  if (!messageHandler) {
    messageHandler = payload => handleSocketMessage(payload)
    window.websocket.addHandler(messageHandler)
  }

  chatSocket = window.websocket.getSocket()
}

function connectChatSocket() {
  ensureChatMessageHandler()
}

function handleSocketMessage(payload) {
  if (!payload?.type) return

  if (payload.type === "init") {
    applyPresence(payload.online_users || [])
  }

  if (payload.type === "presence") {
    updateUserStatus(payload.user_id, payload.status)
  }

  if (payload.type === "message") {
    handleIncomingMessage(payload)
  }
}

function applyPresence(onlineUsers) {
  chatState.onlineUserIds = onlineUsers.map(u => Number(u.user_id))

  chatState.users = chatState.users.map(u => ({
    ...u,
    status: chatState.onlineUserIds.includes(u.id)
      ? "online"
      : "offline",
  }))

  renderUserList()

  if (chatState.activeUserId) {
    enableChatInput(isUserOnline(chatState.activeUserId))
  }
}

/* ===================== USERS ===================== */

async function loadChatUsers() {
  const users = await api.getChatUsers()
  chatState.users = Array.isArray(users) ? users : []
  renderUserList()
}

function renderUserList() {
  const list = document.getElementById("chat-user-list")
  if (!list) return

  sortChatUsers()

  list.innerHTML = chatState.users.map(user => {
    const unread = chatState.unreadCounts[user.id] || 0
    const badge = unread
      ? `<span class="unread-badge">${unread}</span>`
      : ""

    const date = user.last_message_at
      ? new Date(user.last_message_at).toLocaleString()
      : ""

    return `
      <button class="chat-user ${user.id === chatState.activeUserId ? "active" : ""}"
              data-id="${user.id}">
        <div class="chat-user-main">
          <span class="chat-user-name">${escapeHtml(user.username)}${badge}</span>
        </div>
        <div class="chat-user-meta">
          <span class="status-dot ${user.status}"></span>
          <span class="chat-user-last">${date}</span>
        </div>
      </button>
    `
  }).join("")

  list.querySelectorAll(".chat-user").forEach(btn => {
    btn.onclick = () => selectChatUser(Number(btn.dataset.id))
  })
}

function sortChatUsers() {
  chatState.users.sort((a, b) => {
    if (a.last_message_at && b.last_message_at) {
      return new Date(b.last_message_at) - new Date(a.last_message_at)
    }
    if (a.last_message_at) return -1
    if (b.last_message_at) return 1
    return a.username.localeCompare(b.username)
  })
}

function updateUserStatus(userId, status) {
  const id = Number(userId)
  const user = chatState.users.find(u => u.id === id)
  if (!user) return

  user.status = status

  if (chatState.activeUserId === id) {
    enableChatInput(status === "online")
  }

  renderUserList()
}

/* ===================== MESSAGES ===================== */

async function selectChatUser(userId) {
  if (chatState.activeUserId === userId) return

  chatState.activeUserId = userId
  chatState.messages = []
  chatState.offset = 0
  chatState.hasMore = true
  chatState.loading = false

  document.getElementById("chat-messages").innerHTML = ""

  enableChatInput(isUserOnline(userId))
  renderUserList()

  await loadMessages({ reset: true })
  markMessagesAsRead()
}

async function loadMessages({ reset }) {
  if (!chatState.activeUserId || chatState.loading || !chatState.hasMore) return
  chatState.loading = true

  const wrapper = document.getElementById("chat-messages-wrapper")
  const indicator = document.getElementById("chat-loading-indicator")

  const prevHeight = wrapper.scrollHeight
  indicator.style.display = "block"

  const res = await api.getMessages(chatState.activeUserId, chatState.offset)
  const messages = res.messages.reverse()

  messages.forEach(m => chatState.seenMessageIds.add(m.id))

  chatState.messages = reset
    ? messages
    : [...messages, ...chatState.messages]

  chatState.offset += messages.length
  chatState.hasMore = res.has_more

  renderMessagesList({ reset })

  if (!reset) {
    wrapper.scrollTop = wrapper.scrollHeight - prevHeight
  } else {
    wrapper.scrollTop = wrapper.scrollHeight
  }

  indicator.style.display = "none"
  chatState.loading = false

  requestAnimationFrame(() => {
    if (shouldLoadMore(wrapper)) {
      loadMessages({ reset: false })
    }
  })
}

function renderMessagesList({ reset }) {
  const container = document.getElementById("chat-messages")
  if (!container) return

  const currentUserId = getCurrentUserId()
  const lastReadId = chatState.lastReadMessageId[chatState.activeUserId] || 0
  const unreadTotal = chatState.unreadCounts[chatState.activeUserId] || 0

  let dividerIndex = -1

  chatState.messages.forEach((m, i) => {
    if (
      dividerIndex === -1 &&
      Number(m.from) !== currentUserId &&
      m.id > lastReadId
    ) dividerIndex = i
  })

  container.innerHTML = chatState.messages.map((m, i) => `
    ${i === dividerIndex && unreadTotal > 0
      ? `<div class="unread-divider"><span>${unreadTotal} unread</span></div>`
      : ""}
    ${renderMessage(m)}
  `).join("")
}

function renderMessage(message) {
  const isOwn = Number(message.from) === getCurrentUserId()
  const author = isOwn
    ? "You"
    : chatState.users.find(u => u.id === message.from)?.username || "User"

  const date = message.created_at
    ? new Date(message.created_at).toLocaleString()
    : ""

  return `
    <div class="chat-message ${isOwn ? "own" : ""}">
      <div class="chat-message-meta">
        <span>${escapeHtml(author)}</span>
        <span>${date}</span>
      </div>
      <p>${escapeHtml(message.content)}</p>
    </div>
  `
}

/* ===================== UNREAD ===================== */

function handleIncomingMessage(message) {
  if (!message?.id || chatState.seenMessageIds.has(message.id)) return
  chatState.seenMessageIds.add(message.id)

  const currentUserId = getCurrentUserId()
  const otherId =
    Number(message.from) === currentUserId
      ? Number(message.to)
      : Number(message.from)

  const isActive = chatState.activeUserId === otherId
  const fromOther = Number(message.from) !== currentUserId

  const user = chatState.users.find(u => u.id === otherId)
  if (user) user.last_message_at = message.created_at

  if (fromOther && !isActive) {
    chatState.unreadCounts[otherId] =
      (chatState.unreadCounts[otherId] || 0) + 1
    updatePageTitle()
    renderUserList()
    return
  }

  if (isActive) {
    chatState.messages.push(message)
    renderMessagesList({ reset: false })
    scrollToBottom()
    markMessagesAsRead()
  }
}

function markMessagesAsRead() {
  const currentUserId = getCurrentUserId()
  const last = [...chatState.messages]
    .reverse()
    .find(m => Number(m.from) !== currentUserId)

  if (!last) return

  chatState.lastReadMessageId[chatState.activeUserId] = last.id
  saveLastReadIds()
  chatState.unreadCounts[chatState.activeUserId] = 0

  updatePageTitle()
  renderUserList()
}

/* ===================== UI ===================== */

function bindChatForm() {
  const form = document.getElementById("chat-form")
  const input = document.getElementById("chat-input")

  form.onsubmit = e => {
    e.preventDefault()
    if (!chatState.activeUserId || !input.value.trim()) return

    chatSocket.send(JSON.stringify({
      type: "message",
      to: chatState.activeUserId,
      content: input.value.trim()
    }))

    input.value = ""
  }
}

function bindChatScroll() {
  const wrapper = document.getElementById("chat-messages-wrapper")

  wrapper.addEventListener("scroll", throttle(async () => {
    if (!shouldLoadMore(wrapper)) return
    await loadMessages({ reset: false })
  }, 200))
}

function enableChatInput(enabled) {
  document.getElementById("chat-input").disabled = !enabled
  document.getElementById("chat-send").disabled = !enabled
}

function isUserOnline(id) {
  return chatState.onlineUserIds.includes(id)
}

function scrollToBottom() {
  const w = document.getElementById("chat-messages-wrapper")
  w.scrollTop = w.scrollHeight
}

function updatePageTitle() {
  const total = Object.values(chatState.unreadCounts)
    .reduce((a, b) => a + b, 0)

  document.title = total ? `(${total}) Messages` : "Messages"
  window.renderHeader?.()
}

/* ===================== UTILS ===================== */

function throttle(fn, delay) {
  let last = 0
  return (...args) => {
    const now = Date.now()
    if (now - last > delay) {
      last = now
      fn(...args)
    }
  }
}

/* ===================== EXPORT ===================== */

window.renderMessages = renderMessagesPage
window.ensureChatMessageHandler = ensureChatMessageHandler
window.getTotalUnreadMessages = () =>
  Object.values(chatState.unreadCounts).reduce((a, b) => a + b, 0)

