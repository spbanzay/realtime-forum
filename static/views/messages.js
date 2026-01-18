// views/messages.js

let chatSocket = null
let chatState = {
  users: [],
  activeUserId: null,
  messages: [],
  offset: 0,
  hasMore: false,
  loading: false,
  onlineUserIds: [],
}

function renderMessagesPage() {
  const app = document.getElementById("app")
  if (!app) return

  app.innerHTML = `
    <div class="page messages-page">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-header">
          <h3>Сообщения</h3>
          <span id="chat-sidebar-count"></span>
        </div>
        <div id="chat-user-list" class="chat-user-list">Загрузка...</div>
      </aside>
      <section class="chat-content">
        <div class="chat-header">
          <div>
            <h2 id="chat-title">Выберите пользователя</h2>
            <p id="chat-status" class="chat-status"></p>
          </div>
        </div>
        <div id="chat-messages" class="chat-messages"></div>
        <form id="chat-form" class="chat-form">
          <input id="chat-input" type="text" placeholder="Введите сообщение..." disabled />
          <button id="chat-send" type="submit" class="btn btn-primary" disabled>Отправить</button>
        </form>
      </section>
    </div>
  `

  initChat()
}

function initChat() {
  connectChatSocket()
  loadChatUsers()
  bindChatForm()
  bindChatScroll()
}

function connectChatSocket() {
  if (chatSocket && (chatSocket.readyState === WebSocket.OPEN || chatSocket.readyState === WebSocket.CONNECTING)) {
    return
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws"
  chatSocket = new WebSocket(`${protocol}://${location.host}/ws`)

  chatSocket.addEventListener("message", event => {
    const payload = JSON.parse(event.data)
    handleSocketMessage(payload)
  })
}

function handleSocketMessage(payload) {
  if (!payload || !payload.type) return

  switch (payload.type) {
    case "init":
      applyPresence(payload.online_users || [])
      break
    case "presence":
      updateUserStatus(payload.user_id, payload.status)
      break
    case "message":
      handleIncomingMessage(payload)
      break
    case "error":
      console.error(payload.message || "WebSocket error")
      break
    default:
      break
  }
}

function applyPresence(onlineUsers) {
  if (!Array.isArray(onlineUsers)) return
  chatState.onlineUserIds = onlineUsers.map(u => Number(u.user_id))
  const onlineSet = new Set(chatState.onlineUserIds)
  chatState.users = chatState.users.map(user => ({
    ...user,
    status: onlineSet.has(user.id) ? "online" : "offline",
  }))
  renderUserList()
}

async function loadChatUsers() {
  try {
    const users = await api.getChatUsers()
    chatState.users = Array.isArray(users) ? users : []
    if (chatState.onlineUserIds.length) {
      applyPresence(chatState.onlineUserIds.map(id => ({ user_id: id })))
      return
    }
    renderUserList()
  } catch (err) {
    console.error(err)
    const list = document.getElementById("chat-user-list")
    if (list) list.innerHTML = "<p class='error'>Не удалось загрузить пользователей</p>"
  }
}

function renderUserList() {
  const list = document.getElementById("chat-user-list")
  const count = document.getElementById("chat-sidebar-count")
  if (!list) return

  sortChatUsers()

  if (!chatState.users.length) {
    list.innerHTML = "<p class='empty'>Нет пользователей</p>"
    return
  }

  list.innerHTML = chatState.users
    .map(user => {
      const active = user.id === chatState.activeUserId ? "active" : ""
      const statusClass = user.status === "online" ? "online" : "offline"
      const lastMessage = user.last_message_at
        ? new Date(user.last_message_at).toLocaleString()
        : "Нет сообщений"
      return `
        <button class="chat-user ${active}" data-user-id="${user.id}">
          <span class="chat-user-name">${escapeHtml(user.username)}</span>
          <span class="chat-user-meta">
            <span class="status-dot ${statusClass}"></span>
            <span>${user.status === "online" ? "В сети" : "Не в сети"}</span>
          </span>
          <span class="chat-user-last">${lastMessage}</span>
        </button>
      `
    })
    .join("")

  if (count) {
    count.textContent = `${chatState.users.length}`
  }

  list.querySelectorAll(".chat-user").forEach(button => {
    button.addEventListener("click", () => {
      const userId = Number(button.dataset.userId)
      selectChatUser(userId)
    })
  })
}

function sortChatUsers() {
  chatState.users.sort((a, b) => {
    const aHas = Boolean(a.last_message_at)
    const bHas = Boolean(b.last_message_at)
    if (aHas && bHas) {
      const diff = new Date(b.last_message_at) - new Date(a.last_message_at)
      if (diff !== 0) return diff
      return a.username.localeCompare(b.username)
    }
    if (aHas) return -1
    if (bHas) return 1
    return a.username.localeCompare(b.username)
  })
}

async function selectChatUser(userId) {
  chatState.activeUserId = userId
  chatState.messages = []
  chatState.offset = 0
  chatState.hasMore = false

  const user = chatState.users.find(u => u.id === userId)
  const title = document.getElementById("chat-title")
  const status = document.getElementById("chat-status")
  if (title) title.textContent = user ? user.username : "Диалог"
  if (status) status.textContent = user && user.status === "online" ? "В сети" : "Не в сети"

  enableChatInput(true)
  await loadMessages({ reset: true })
  renderUserList()
}

function enableChatInput(enabled) {
  const input = document.getElementById("chat-input")
  const send = document.getElementById("chat-send")
  if (input) input.disabled = !enabled
  if (send) send.disabled = !enabled
}

async function loadMessages({ reset = false } = {}) {
  if (!chatState.activeUserId || chatState.loading) return
  chatState.loading = true

  try {
    const response = await api.getMessages(chatState.activeUserId, chatState.offset)
    const messages = Array.isArray(response.messages) ? response.messages : []
    chatState.hasMore = Boolean(response.has_more)

    if (reset) {
      chatState.messages = messages
    } else {
      chatState.messages = [...messages, ...chatState.messages]
    }

    chatState.offset += messages.length
    renderMessages({ preserveScroll: !reset })
  } catch (err) {
    console.error(err)
  } finally {
    chatState.loading = false
  }
}

function renderMessages({ preserveScroll = false } = {}) {
  const container = document.getElementById("chat-messages")
  if (!container) return

  const prevHeight = container.scrollHeight
  const prevTop = container.scrollTop

  container.innerHTML = chatState.messages
    .map(message => renderMessage(message))
    .join("")

  if (preserveScroll) {
    const newHeight = container.scrollHeight
    container.scrollTop = newHeight - prevHeight + prevTop
  } else {
    container.scrollTop = container.scrollHeight
  }
}

function renderMessage(message) {
  const { user } = window.state || {}
  const isOwn = user && message.from === user.id
  const otherUser = chatState.users.find(u => u.id === message.from)
  const author = isOwn ? "Вы" : otherUser ? otherUser.username : "Пользователь"
  const timestamp = message.created_at
    ? new Date(message.created_at).toLocaleString()
    : ""

  return `
    <div class="chat-message ${isOwn ? "own" : ""}">
      <div class="chat-message-meta">
        <span>${escapeHtml(author)}</span>
        <span>${timestamp}</span>
      </div>
      <p>${escapeHtml(message.content)}</p>
    </div>
  `
}

function bindChatForm() {
  const form = document.getElementById("chat-form")
  const input = document.getElementById("chat-input")
  if (!form || !input) return

  form.addEventListener("submit", event => {
    event.preventDefault()
    if (!chatState.activeUserId || !chatSocket || chatSocket.readyState !== WebSocket.OPEN) return
    const content = input.value.trim()
    if (!content) return

    chatSocket.send(
      JSON.stringify({
        type: "message",
        to: chatState.activeUserId,
        content,
      })
    )

    input.value = ""
  })
}

function bindChatScroll() {
  const container = document.getElementById("chat-messages")
  if (!container) return

  const onScroll = throttle(() => {
    if (container.scrollTop <= 40 && chatState.hasMore && !chatState.loading) {
      loadMessages()
    }
  }, 500)

  container.addEventListener("scroll", onScroll)
}

function handleIncomingMessage(message) {
  if (!message) return

  const { user } = window.state || {}
  if (!user) return

  const otherUserId = message.from === user.id ? message.to : message.from
  const chatUser = chatState.users.find(u => u.id === otherUserId)
  if (chatUser) {
    chatUser.last_message_at = message.created_at
  }

  if (chatState.activeUserId === otherUserId) {
    const shouldScroll = shouldAutoScroll()
    chatState.messages = [...chatState.messages, message]
    renderMessages({ preserveScroll: !shouldScroll })
    if (shouldScroll) {
      const container = document.getElementById("chat-messages")
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }
  }

  renderUserList()
}

function updateUserStatus(userId, status) {
  const user = chatState.users.find(u => u.id === Number(userId))
  if (user) {
    user.status = status
    renderUserList()
    if (chatState.activeUserId === user.id) {
      const statusEl = document.getElementById("chat-status")
      if (statusEl) {
        statusEl.textContent = status === "online" ? "В сети" : "Не в сети"
      }
    }
  }
}

function shouldAutoScroll() {
  const container = document.getElementById("chat-messages")
  if (!container) return false
  const distance = container.scrollHeight - (container.scrollTop + container.clientHeight)
  return distance < 80
}

function throttle(fn, delay) {
  let lastCall = 0
  let timeoutId

  return (...args) => {
    const now = Date.now()
    const remaining = delay - (now - lastCall)

    if (remaining <= 0) {
      lastCall = now
      fn(...args)
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now()
        timeoutId = null
        fn(...args)
      }, remaining)
    }
  }
}

window.renderMessages = renderMessagesPage
