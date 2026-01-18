// views/messages.js

const chatUI = {
  listId: "chat-widget-user-list",
  countId: "chat-widget-count",
  titleId: "chat-widget-title",
  statusId: "chat-widget-status",
  messagesId: "chat-widget-messages",
  formId: "chat-widget-form",
  inputId: "chat-widget-input",
  sendId: "chat-widget-send",
  panelId: "chat-widget-panel",
  buttonId: "chat-widget-button",
  badgeId: "chat-widget-badge",
}

let chatSocket = null
let chatState = {
  users: [],
  activeUserId: null,
  messages: [],
  offset: 0,
  hasMore: false,
  loading: false,
  onlineUserIds: [],
  unreadByUser: {},
  isWidgetOpen: false,
  widgetInitialized: false,
}

function renderMessagesPage() {
  const app = document.getElementById("app")
  if (!app) return

  app.innerHTML = `
    <div class="chat-page-placeholder">
      <h2>Чат открыт в виджете</h2>
      <p>Нажмите кнопку в правом нижнем углу, чтобы открыть переписку.</p>
    </div>
  `

  ensureChatWidget()
  openChatWidget()
}

function ui(id) {
  return document.getElementById(chatUI[id])
}

function ensureChatWidget() {
  const { user } = window.state || {}
  if (!user) {
    teardownChatWidget()
    return
  }

  if (chatState.widgetInitialized) {
    return
  }

  const button = document.createElement("button")
  button.id = chatUI.buttonId
  button.className = "chat-widget-button"
  button.innerHTML = `
    💬
    <span id="${chatUI.badgeId}" class="chat-widget-badge" hidden>0</span>
  `

  const panel = document.createElement("div")
  panel.id = chatUI.panelId
  panel.className = "chat-widget-panel"
  panel.innerHTML = `
    <div class="chat-widget-header">
      <div>
        <h3>Сообщения</h3>
        <span id="${chatUI.countId}" class="chat-widget-count"></span>
      </div>
      <button class="chat-widget-close" type="button">×</button>
    </div>
    <div class="chat-widget-body">
      <aside class="chat-widget-sidebar">
        <div id="${chatUI.listId}" class="chat-user-list">Загрузка...</div>
      </aside>
      <section class="chat-widget-chat">
        <div class="chat-header">
          <div>
            <h2 id="${chatUI.titleId}">Выберите пользователя</h2>
            <p id="${chatUI.statusId}" class="chat-status"></p>
          </div>
        </div>
        <div id="${chatUI.messagesId}" class="chat-messages"></div>
        <form id="${chatUI.formId}" class="chat-form">
          <input id="${chatUI.inputId}" type="text" placeholder="Введите сообщение..." disabled />
          <button id="${chatUI.sendId}" type="submit" class="btn btn-primary" disabled>Отправить</button>
        </form>
      </section>
    </div>
  `

  document.body.appendChild(button)
  document.body.appendChild(panel)

  button.addEventListener("click", () => {
    if (chatState.isWidgetOpen) {
      closeChatWidget()
    } else {
      openChatWidget()
    }
  })

  panel.querySelector(".chat-widget-close").addEventListener("click", () => {
    closeChatWidget()
  })

  chatState.widgetInitialized = true

  initChat()
  renderUserList()
}

function teardownChatWidget() {
  const button = ui("buttonId")
  const panel = ui("panelId")
  if (button) button.remove()
  if (panel) panel.remove()

  if (chatSocket) {
    chatSocket.close()
    chatSocket = null
  }

  chatState = {
    users: [],
    activeUserId: null,
    messages: [],
    offset: 0,
    hasMore: false,
    loading: false,
    onlineUserIds: [],
    unreadByUser: {},
    isWidgetOpen: false,
    widgetInitialized: false,
  }
}

function openChatWidget() {
  const panel = ui("panelId")
  if (!panel) return
  panel.classList.add("open")
  chatState.isWidgetOpen = true
  updateUnreadBadge()

  if (chatState.activeUserId) {
    clearUnread(chatState.activeUserId)
  }
}

function closeChatWidget() {
  const panel = ui("panelId")
  if (!panel) return
  panel.classList.remove("open")
  chatState.isWidgetOpen = false
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
    const list = ui("listId")
    if (list) list.innerHTML = "<p class='error'>Не удалось загрузить пользователей</p>"
  }
}

function renderUserList() {
  const list = ui("listId")
  const count = ui("countId")
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
      const unread = chatState.unreadByUser[user.id] || 0
      return `
        <button class="chat-user ${active}" data-user-id="${user.id}">
          <span class="chat-user-name">${escapeHtml(user.username)}</span>
          <span class="chat-user-meta">
            <span class="status-dot ${statusClass}"></span>
            <span>${user.status === "online" ? "В сети" : "Не в сети"}</span>
          </span>
          <span class="chat-user-last">${lastMessage}</span>
          ${unread ? `<span class="chat-user-unread">${unread}</span>` : ""}
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
  const title = ui("titleId")
  const status = ui("statusId")
  if (title) title.textContent = user ? user.username : "Диалог"
  if (status) status.textContent = user && user.status === "online" ? "В сети" : "Не в сети"

  enableChatInput(true)
  clearUnread(userId)
  await loadMessages({ reset: true })
  renderUserList()
}

function enableChatInput(enabled) {
  const input = ui("inputId")
  const send = ui("sendId")
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
  const container = ui("messagesId")
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
  const form = ui("formId")
  const input = ui("inputId")
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
  const container = ui("messagesId")
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

  if (chatState.activeUserId === otherUserId && chatState.isWidgetOpen) {
    const shouldScroll = shouldAutoScroll()
    chatState.messages = [...chatState.messages, message]
    renderMessages({ preserveScroll: !shouldScroll })
    if (shouldScroll) {
      const container = ui("messagesId")
      if (container) {
        container.scrollTop = container.scrollHeight
      }
    }
  } else if (message.from !== user.id) {
    incrementUnread(otherUserId)
  }

  renderUserList()
}

function updateUserStatus(userId, status) {
  const user = chatState.users.find(u => u.id === Number(userId))
  if (user) {
    user.status = status
    renderUserList()
    if (chatState.activeUserId === user.id) {
      const statusEl = ui("statusId")
      if (statusEl) {
        statusEl.textContent = status === "online" ? "В сети" : "Не в сети"
      }
    }
  }
}

function incrementUnread(userId) {
  if (!userId) return
  chatState.unreadByUser[userId] = (chatState.unreadByUser[userId] || 0) + 1
  updateUnreadBadge()
}

function clearUnread(userId) {
  if (!userId) return
  delete chatState.unreadByUser[userId]
  updateUnreadBadge()
}

function updateUnreadBadge() {
  const badge = ui("badgeId")
  if (!badge) return

  const total = Object.values(chatState.unreadByUser).reduce((sum, count) => sum + count, 0)
  if (total > 0 && !chatState.isWidgetOpen) {
    badge.hidden = false
    badge.textContent = String(total)
  } else {
    badge.hidden = true
    badge.textContent = ""
  }
}

function shouldAutoScroll() {
  const container = ui("messagesId")
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
window.initChatWidget = ensureChatWidget
window.teardownChatWidget = teardownChatWidget
