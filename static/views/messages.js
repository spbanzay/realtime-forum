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

  const rawId = params?.id;
  let targetUserId = null;

  if (rawId !== undefined) {
    targetUserId = Number(rawId);
    
    // Если в URL буквы (NaN), выводим 400 ошибку
    if (isNaN(targetUserId)) {
      if (window.renderError) {
        window.renderError(400, "Invalid Chat ID. Please provide a numeric ID.");
      }
      return; // Прекращаем выполнение, не рендерим страницу чата
    }
  }

  chatFormBound = false

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
  connectChatSocket();
  await loadChatUsers(); // Сначала грузим юзеров и их статусы

  if (!chatFormBound) {
    bindChatForm();
    bindChatScroll();
    chatFormBound = true;
  }

  if (targetUserId) {
    const user = chatState.users.find(u => u.id === targetUserId);
    if (!user) {
      window.renderError(404, "User not found in your chat list");
      return;
    }
    await selectChatUser(targetUserId);
    
    // ПРОВЕРКА: Разблокируем, если целевой юзер онлайн
    enableChatInput(user.status === "online");
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

// function handleSocketMessage(payload) {
//   if (!payload?.type) return

//   if (payload.type === "init") {
//     applyPresence(payload.online_users || [])
//   }

//   if (payload.type === "presence") {
//     updateUserStatus(payload.user_id, payload.status)
//   }

//   if (payload.type === "message") {
//     handleIncomingMessage(payload)
//   }
// }

function handleSocketMessage(payload) {
  if (!payload?.type) return;

  if (payload.type === "init") {
    applyPresence(payload.online_users || []);
  }

  if (payload.type === "presence") {
    updateUserStatus(payload.user_id, payload.status);
  }

  // === ДОБАВЬТЕ ЭТОТ БЛОК ===
  if (payload.type === "user_created") {
    handleNewUser(payload);
  }
  // ==========================

  if (payload.type === "message") {
    handleIncomingMessage(payload);
  }
}

function handleNewUser(data) {
  const id = Number(data.user_id);
  
  // Проверяем, нет ли его уже в списке (чтобы не дублировать)
  const exists = chatState.users.some(u => u.id === id);
  if (exists) return;

  // Добавляем нового человечка в массив
  chatState.users.push({
    id: id,
    username: data.username,
    status: "online", // Раз он только что прислал user_created, он явно онлайн
    last_message_at: null
  });

  if (!chatState.onlineUserIds.includes(id)) {
    chatState.onlineUserIds.push(id)
  }

  // Перерисовываем список, чтобы он появился (с учетом сортировки по алфавиту)
  renderUserList();

  if (chatState.activeUserId === id) {
    enableChatInput(true)
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
    const isOnline = chatState.onlineUserIds.includes(chatState.activeUserId);
    enableChatInput(isOnline);
  }
}

/* ===================== USERS ===================== */

async function loadChatUsers() {
  const users = await api.getChatUsers()
  // Приводим ID к числам и сохраняем
  chatState.users = Array.isArray(users) ? users.map(u => ({
    ...u,
    id: Number(u.id),
    // Если id пользователя уже есть в списке онлайн, ставим online, иначе offline
    status: chatState.onlineUserIds.includes(Number(u.id)) ? "online" : "offline"
  })) : [];
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
          <span class="status-dot ${user.status}" data-user-id="${user.id}"></span>
          <span class="chat-user-last">${date}</span>
        </div>
      </button>
    `
  }).join("")

  list.querySelectorAll(".chat-user").forEach(btn => {
    btn.onclick = () => selectChatUser(Number(btn.dataset.id))
  })
}

// function sortChatUsers() {
//   chatState.users.sort((a, b) => {
//     if (a.last_message_at && b.last_message_at) {
//       return new Date(b.last_message_at) - new Date(a.last_message_at)
//     }
//     if (a.last_message_at) return -1
//     if (b.last_message_at) return 1
//     return a.username.localeCompare(b.username)
//   })
// }

function sortChatUsers() {
  chatState.users.sort((a, b) => {
    // 1. Сначала сравниваем по времени последнего сообщения
    const timeA = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const timeB = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;

    if (timeB !== timeA) {
      return timeB - timeA; // Новые сообщения выше
    }

    // 2. Если сообщений нет или время одинаковое — по алфавиту (A-Z)
    return a.username.localeCompare(b.username);
  });
}

function updateUserStatus(userId, status) {
  const id = Number(userId)
  const user = chatState.users.find(u => u.id === id)
  if (!user) return

  user.status = status

  if (status === "online") {
    if (!chatState.onlineUserIds.includes(id)) {
      chatState.onlineUserIds.push(id)
    }
  } else {
    chatState.onlineUserIds = chatState.onlineUserIds.filter(oid => oid !== id)
  }

  // 1. Мгновенное обновление точки в DOM (без ререндера всего списка)
  const dots = document.querySelectorAll(`.status-dot[data-user-id="${id}"]`);
  dots.forEach(dot => {
    dot.classList.remove('online', 'offline');
    dot.classList.add(status);
  });

  // 2. Управление инпутом, если это активный чат
  if (chatState.activeUserId === id) {
    enableChatInput(status === "online")
  }

  // 3. Полный ререндер нужен только если вы хотите, чтобы юзеры 
  // перемещались вверх/вниз при входе в сеть (из-за сортировки)
  // renderUserList() 
}

/* ===================== MESSAGES ===================== */

async function selectChatUser(userId) {
  if (chatState.activeUserId === userId) return

  const newUrl = `/messages/${userId}`;
  if (window.location.pathname !== newUrl) {
    window.history.pushState({ userId }, "", newUrl);
  }

  chatState.activeUserId = userId
  chatState.messages = []
  chatState.offset = 0
  chatState.hasMore = true
  chatState.loading = false

  const messagesContainer = document.getElementById("chat-messages");
  if (messagesContainer) messagesContainer.innerHTML = "";

  enableChatInput(isUserOnline(userId))
  renderUserList()

  await loadMessages({ reset: true })
  markMessagesAsRead()
}

// async function loadMessages({ reset }) {
//   if (!chatState.activeUserId || chatState.loading || !chatState.hasMore) return
//   chatState.loading = true

//   const wrapper = document.getElementById("chat-messages-wrapper")
//   const indicator = document.getElementById("chat-loading-indicator")

//   const prevHeight = wrapper.scrollHeight
//   indicator.style.display = "block"

//   const res = await api.getMessages(chatState.activeUserId, chatState.offset)
//   const messages = res.messages.reverse()

//   messages.forEach(m => chatState.seenMessageIds.add(m.id))

//   chatState.messages = reset
//     ? messages
//     : [...messages, ...chatState.messages]

//   chatState.offset += messages.length
//   chatState.hasMore = res.has_more

//   renderMessagesList({ reset })

//   if (!reset) {
//     wrapper.scrollTop = wrapper.scrollHeight - prevHeight
//   } else {
//     wrapper.scrollTop = wrapper.scrollHeight
//   }

//   indicator.style.display = "none"
//   chatState.loading = false

//   requestAnimationFrame(() => {
//     if (shouldLoadMore(wrapper)) {
//       loadMessages({ reset: false })
//     }
//   })
// }

async function loadMessages({ reset }) {
  // 1. Базовые проверки
  if (!chatState.activeUserId || chatState.loading || (!reset && !chatState.hasMore)) return
  
  chatState.loading = true

  const wrapper = document.getElementById("chat-messages-wrapper")
  const indicator = document.getElementById("chat-loading-indicator")
  const prevHeight = wrapper ? wrapper.scrollHeight : 0

  if (indicator) indicator.style.display = "block"

  try {
    // 2. Запрос к API (здесь может возникнуть ошибка 404, 500 и т.д.)
    const res = await api.getMessages(chatState.activeUserId, chatState.offset)
    
    // 3. Обработка успешного ответа
    const messages = res.messages.reverse()
    messages.forEach(m => chatState.seenMessageIds.add(m.id))

    chatState.messages = reset
      ? messages
      : [...messages, ...chatState.messages]

    chatState.offset += messages.length
    chatState.hasMore = res.has_more

    renderMessagesList({ reset })

    // 4. Управление скроллом
    if (wrapper) {
      if (!reset) {
        wrapper.scrollTop = wrapper.scrollHeight - prevHeight
      } else {
        wrapper.scrollTop = wrapper.scrollHeight
      }
    }

    // 5. Проверка на необходимость подгрузить еще (если экран большой)
    requestAnimationFrame(() => {
      if (wrapper && shouldLoadMore(wrapper)) {
        loadMessages({ reset: false })
      }
    })

  } catch (error) {
    // === ВОТ ЗДЕСЬ МАГИЯ ===
    console.error("Failed to load messages:", error)

    // Если ошибка серьезная (404, 500, 400), показываем страницу ошибки
    if (error.status === 404 || error.status === 500 || error.status === 400) {
      if (window.renderError) {
        window.renderError(error.status, error.message)
      }
      return // Прекращаем выполнение
    }
    
    // Для мелких ошибок (например, таймаут) можно просто вывести уведомление
  } finally {
    // В любом случае (успех или ошибка) выключаем лоадер
    chatState.loading = false
    if (indicator) indicator.style.display = "none"
  }
}

function renderMessagesList({ reset }) {
  const container = document.getElementById("chat-messages")
  if (!container) return

  const currentUserId = getCurrentUserId()
  const lastReadId = chatState.lastReadMessageId[chatState.activeUserId] || 0
  const unreadTotal = chatState.unreadCounts[chatState.activeUserId] || 0

  chatState.messages.sort((a, b) => {
    // Сортируем по ID (если они инкрементные) или по времени создания
    const timeA = new Date(a.created_at).getTime();
    const timeB = new Date(b.created_at).getTime();
    
    if (timeA !== timeB) return timeA - timeB;
    return a.id - b.id; // Если время совпало до миллисекунд, сравниваем ID
  });

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

  const onMessagesPage = window.location.pathname.startsWith("/messages")
  const currentUserId = getCurrentUserId()
  const otherId =
    Number(message.from) === currentUserId
      ? Number(message.to)
      : Number(message.from)

  const isActive = onMessagesPage && chatState.activeUserId === otherId
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

