// views/messages.js

let chatSocket = null
let chatFormBound = false
let userListRefreshInterval = null
let messageHandler = null // Для хранения ссылки на обработчик
let unreadDividerTimeout = null
const UNREAD_DIVIDER_HIDE_DELAY = 3000
let chatState = {
  users: [],
  activeUserId: null,
  messages: [],
  offset: 0,
  hasMore: false,
  loading: false,
  onlineUserIds: [],
  unreadCounts: {}, // userId -> count непрочитанных сообщений
  lastReadMessageId: loadLastReadIds(), // userId -> ID последнего прочитанного сообщения
}

function getCurrentUserId() {
  const { user } = window.state || {}
  if (!user) return null
  return Number(user.id)
}

// Загружаем сохраненные ID прочитанных сообщений из localStorage
function loadLastReadIds() {
  try {
    const saved = localStorage.getItem('lastReadMessageIds')
    return saved ? JSON.parse(saved) : {}
  } catch (e) {
    return {}
  }
}

// Сохраняем ID прочитанных сообщений в localStorage
function saveLastReadIds() {
  try {
    localStorage.setItem('lastReadMessageIds', JSON.stringify(chatState.lastReadMessageId))
  } catch (e) {
    console.error('Failed to save lastReadMessageIds:', e)
  }
}

function renderMessagesPage() {
  const app = document.getElementById("app")
  if (!app) return

  app.innerHTML = `
    <div class="page messages-page">
      <aside class="chat-sidebar">
        <div class="chat-sidebar-header">
          <h3>Chats</h3>
          <span id="chat-sidebar-count"></span>
        </div>
        <div id="chat-user-list" class="chat-user-list">Downloading...</div>
      </aside>
      <section class="chat-content">
        <div class="chat-header">
          <div>
            <h2 id="chat-title">Choose a user</h2>
            <p id="chat-status" class="chat-status"></p>
          </div>
        </div>
        <div id="chat-messages-wrapper" class="chat-messages-wrapper">
          <div id="chat-loading-indicator" class="chat-loading-indicator" style="display: none;">
            <span>Loading earlier messages...</span>
          </div>
          <div id="chat-messages" class="chat-messages"></div>
        </div>
        <form id="chat-form" class="chat-form">
          <input id="chat-input" type="text" placeholder="Enter a message..." disabled />
          <button id="chat-send" type="submit" class="btn btn-primary" disabled>Send</button>
        </form>
      </section>
    </div>
  `

  setTimeout(() => {
    initChat()
  }, 0)
}

function initChat() {
  connectChatSocket()
  loadChatUsers()
  if (!chatFormBound) {
    bindChatForm()
    bindChatScroll()
    chatFormBound = true
  }
  
  // Периодически обновляем список пользователей (каждые 30 секунд)
  if (!userListRefreshInterval) {
    userListRefreshInterval = setInterval(() => {
      loadChatUsers()
    }, 30000)
  }
}

function connectChatSocket() {
  // Используем глобальный WebSocket вместо создания нового
  if (window.websocket) {
    chatSocket = window.websocket.getSocket()
    
    // Создаем обработчик для сообщений чата
    messageHandler = (payload) => {
      handleSocketMessage(payload)
    }
    
    // Регистрируем обработчик в глобальном WebSocket
    window.websocket.addHandler(messageHandler)
    
    console.log("Используем глобальный WebSocket для чата")
  } else {
    console.warn("Глобальный WebSocket не инициализирован")
  }
}

function handleSocketMessage(payload) {
  if (!payload || !payload.type) return
  
  console.log("WebSocket message received:", payload)

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
  console.log("Applying presence, online users:", onlineUsers)
  chatState.onlineUserIds = onlineUsers.map(u => Number(u.user_id))
  const onlineSet = new Set(chatState.onlineUserIds)
  chatState.users = chatState.users.map(user => ({
    ...user,
    status: onlineSet.has(user.id) ? "online" : "offline",
  }))
  console.log("Updated users with presence:", chatState.users)
  renderUserList()
}

async function loadChatUsers() {
  try {
    console.log("Loading chat users from API...")
    const users = await api.getChatUsers()
    const newUsers = Array.isArray(users) ? users : []
    console.log("Received users from API:", newUsers)
    
    chatState.users = newUsers
    
    // Пересчитываем количество непрочитанных для каждого пользователя
    await updateUnreadCounts()
    
    // Всегда применяем актуальный список онлайн пользователей из WebSocket
    if (chatState.onlineUserIds.length > 0) {
      console.log("Applying presence from onlineUserIds:", chatState.onlineUserIds)
      applyPresence(chatState.onlineUserIds.map(id => ({ user_id: id })))
    } else {
      console.log("No onlineUserIds yet, rendering with API statuses")
      renderUserList()
    }
  } catch (err) {
    console.error("Error loading chat users:", err)
    const list = document.getElementById("chat-user-list")
    if (list) list.innerHTML = "<p class='error'>Не удалось загрузить пользователей</p>"
  }
}

// Обновляем счетчики непрочитанных сообщений для всех пользователей
async function updateUnreadCounts() {
  const currentUserId = getCurrentUserId()
  if (currentUserId === null) return
  
  for (const chatUser of chatState.users) {
    const chatUserId = Number(chatUser.id)
    const lastReadId = Number(chatState.lastReadMessageId[chatUserId] || 0)
    
    // Загружаем последние 50 сообщений для подсчета непрочитанных
    try {
      const response = await api.getMessages(chatUserId, 0)
      const messages = Array.isArray(response.messages) ? response.messages : []
      
      // Считаем непрочитанные сообщения от собеседника
      const unreadCount = messages.filter(msg => 
        Number(msg.from) === chatUserId && msg.id > lastReadId
      ).length
      
      chatState.unreadCounts[chatUserId] = unreadCount
      console.log(`User ${chatUser.username}: ${unreadCount} unread messages (lastReadId: ${lastReadId})`)
    } catch (err) {
      console.error(`Failed to load messages for user ${chatUserId}:`, err)
    }
  }
  
  updatePageTitle()
}

function renderUserList() {
  const list = document.getElementById("chat-user-list")
  const count = document.getElementById("chat-sidebar-count")
  if (!list) return

  sortChatUsers()

  if (!chatState.users.length) {
    list.innerHTML = "<p class='empty'>No users</p>"
    return
  }

  list.innerHTML = chatState.users
    .map(user => {
      const active = user.id === chatState.activeUserId ? "active" : ""
      const statusClass = user.status === "online" ? "online" : "offline"
      const lastMessage = user.last_message_at
        ? new Date(user.last_message_at).toLocaleString()
        : "No messages"
      const unreadCount = chatState.unreadCounts[user.id] || 0
      const unreadBadge = unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ""
      
      return `
        <button class="chat-user ${active}" data-user-id="${user.id}">
          <span class="chat-user-name">${escapeHtml(user.username)}${unreadBadge}</span>
          <span class="chat-user-meta">
            <span class="status-dot ${statusClass}"></span>
            <span>${user.status === "online" ? "Online" : "Offline"}</span>
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

  // НЕ сбрасываем счетчик автоматически - это произойдет при прокрутке вниз
  // chatState.unreadCounts[userId] = 0
  // updatePageTitle()

  const user = chatState.users.find(u => u.id === userId)
  const title = document.getElementById("chat-title")
  const status = document.getElementById("chat-status")
  if (title) title.textContent = user ? user.username : "Диалог"
  if (status) status.textContent = user && user.status === "online" ? "Online" : "Offline"

  // Разрешаем ввод только если пользователь онлайн
  const isOnline = user && user.status === "online"
  enableChatInput(isOnline)
  
  await loadMessages({ reset: true })
  renderUserList()
}

function enableChatInput(enabled) {
  const input = document.getElementById("chat-input")
  const send = document.getElementById("chat-send")
  if (input) {
    input.disabled = !enabled
  }
  if (send) {
    send.disabled = !enabled
  }
}

async function loadMessages({ reset = false } = {}) {
  if (!chatState.activeUserId || chatState.loading) return
  chatState.loading = true

  // Показываем индикатор загрузки только при подгрузке старых сообщений
  const loadingIndicator = document.getElementById("chat-loading-indicator")
  if (!reset && loadingIndicator) {
    loadingIndicator.style.display = "block"
  }

  try {
    const response = await api.getMessages(chatState.activeUserId, chatState.offset)
    const messages = Array.isArray(response.messages) ? response.messages : []
    chatState.hasMore = Boolean(response.has_more)

    // Сервер возвращает сообщения в порядке DESC (новые → старые)
    // Нам нужен порядок ASC (старые → новые) для отображения
    const reversedMessages = [...messages].reverse()

    if (reset) {
      // При первой загрузке показываем последние 10 сообщений
      chatState.messages = reversedMessages
      chatState.offset = messages.length
    } else {
      // При подгрузке добавляем старые сообщения в начало
      chatState.messages = [...reversedMessages, ...chatState.messages]
      chatState.offset += messages.length
    }

    renderMessagesList({ preserveScroll: !reset })
  } catch (err) {
    console.error(err)
  } finally {
    chatState.loading = false
    // Скрываем индикатор загрузки
    if (loadingIndicator) {
      loadingIndicator.style.display = "none"
    }
  }
}

function renderMessagesList({ preserveScroll = false } = {}) {
  const container = document.getElementById("chat-messages")
  const wrapper = document.getElementById("chat-messages-wrapper")
  if (!container || !wrapper) return

  const prevHeight = wrapper.scrollHeight
  const prevTop = wrapper.scrollTop

  // Сортируем сообщения по ID или времени создания для правильного порядка
  const sortedMessages = [...chatState.messages].sort((a, b) => {
    // Сначала пытаемся сравнить по времени
    const timeA = new Date(a.created_at).getTime()
    const timeB = new Date(b.created_at).getTime()
    if (timeA !== timeB) {
      return timeA - timeB
    }
    // Если время одинаковое, сравниваем по ID
    return (a.id || 0) - (b.id || 0)
  })

  // Определяем ID последнего прочитанного сообщения
  const lastReadId = Number(chatState.lastReadMessageId[chatState.activeUserId] || 0)
  let unreadCount = 0
  let unreadStartIndex = -1

  console.log("Rendering messages. lastReadId:", lastReadId, "total messages:", sortedMessages.length)

  // Подсчитываем непрочитанные сообщения (от других пользователей)
  const currentUserId = getCurrentUserId()
  sortedMessages.forEach((msg, index) => {
    if (currentUserId !== null && Number(msg.from) !== currentUserId && msg.id > lastReadId) {
      if (unreadStartIndex === -1) {
        unreadStartIndex = index
      }
      unreadCount++
      console.log(`Unread message #${index}: id=${msg.id}, from=${msg.from}`)
    }
  })

  // Рендерим сообщения с разделителем непрочитанных
  const messagesHTML = sortedMessages.map((message, index) => {
    let html = ''
    
    // Добавляем разделитель перед первым непрочитанным сообщением
    if (index === unreadStartIndex && unreadCount > 0) {
      html += `
        <div class="unread-divider">
          <span>${unreadCount} непрочитанн${unreadCount === 1 ? 'ое' : unreadCount < 5 ? 'ых' : 'ых'} сообщени${unreadCount === 1 ? 'е' : 'й'}</span>
        </div>
      `
    }
    
    html += renderMessage(message)
    return html
  }).join("")

  container.innerHTML = messagesHTML

  if (preserveScroll) {
    // При подгрузке старых сообщений сохраняем позицию скролла
    const newHeight = wrapper.scrollHeight
    wrapper.scrollTop = newHeight - prevHeight + prevTop
  } else {
    // При первой загрузке или новом сообщении скроллим вниз
    wrapper.scrollTop = wrapper.scrollHeight
    // Отмечаем все сообщения как прочитанные
    markMessagesAsRead()
  }
}

function renderMessage(message) {
  const currentUserId = getCurrentUserId()
  const messageFrom = Number(message.from)
  const isOwn = currentUserId !== null && messageFrom === currentUserId
  const otherUser = chatState.users.find(u => u.id === messageFrom)
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
    
    // Используем глобальный WebSocket
    const ws = window.websocket ? window.websocket.getSocket() : null
    if (!chatState.activeUserId || !ws || ws.readyState !== WebSocket.OPEN) return
    
    // Проверяем, что пользователь онлайн
    const activeUser = chatState.users.find(u => u.id === chatState.activeUserId)
    if (!activeUser || activeUser.status !== "online") {
      alert("Вы можете отправлять сообщения только пользователям, которые онлайн")
      return
    }
    
    const content = input.value.trim()
    if (!content) return

    ws.send(
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
  const wrapper = document.getElementById("chat-messages-wrapper")
  if (!wrapper) return

  const onScroll = throttle(() => {
    // Проверяем скролл в wrapper (который содержит индикатор + сообщения)
    if (wrapper.scrollTop <= 40 && chatState.hasMore && !chatState.loading) {
      loadMessages()
    }
    
    // Если пользователь прокрутил вниз, отмечаем сообщения как прочитанные
    if (shouldAutoScroll()) {
      markMessagesAsRead()
      // Перерисовываем для скрытия разделителя непрочитанных
      const container = document.getElementById("chat-messages")
      if (container && chatState.messages.length > 0) {
        const currentUserId = getCurrentUserId()
        const lastReadId = Number(chatState.lastReadMessageId[chatState.activeUserId] || 0)
        
        // Проверяем, есть ли непрочитанные
        const hasUnread = chatState.messages.some(msg => 
          currentUserId !== null && Number(msg.from) !== currentUserId && msg.id > lastReadId
        )
        
        // Если были непрочитанные, но теперь нет - перерисовываем
        if (!hasUnread && container.querySelector('.unread-divider')) {
          renderMessagesList({ preserveScroll: true })
        }
      }
    }
  }, 500)

  wrapper.addEventListener("scroll", onScroll)
}

async function handleIncomingMessage(message) {
  if (!message) return

  const currentUserId = getCurrentUserId()
  if (currentUserId === null) return
  const messageFrom = Number(message.from)
  const otherUserId = messageFrom === currentUserId ? Number(message.to) : messageFrom
  let chatUser = chatState.users.find(u => u.id === otherUserId)
  
  // Если пользователь не найден в списке - загружаем список заново
  if (!chatUser) {
    await loadChatUsers()
    chatUser = chatState.users.find(u => u.id === otherUserId)
  }
  
  if (chatUser) {
    chatUser.last_message_at = message.created_at
  }

  // Если сообщение от другого пользователя и это не активный чат - увеличиваем счетчик
  if (messageFrom !== currentUserId && chatState.activeUserId !== otherUserId) {
    chatState.unreadCounts[otherUserId] = (chatState.unreadCounts[otherUserId] || 0) + 1
    
    // Показываем уведомление в заголовке страницы
    updatePageTitle()
  }

  if (chatState.activeUserId === otherUserId) {
    const shouldScroll = shouldAutoScroll()
    chatState.messages = [...chatState.messages, message]
    renderMessagesList({ preserveScroll: !shouldScroll })
    if (shouldScroll) {
      const wrapper = document.getElementById("chat-messages-wrapper")
      if (wrapper) {
        wrapper.scrollTop = wrapper.scrollHeight
      }
      // Отмечаем как прочитанное только если автоскролл сработал
      markMessagesAsRead()
    } else {
      // Если не скроллим - увеличиваем счетчик непрочитанных
      if (messageFrom !== currentUserId) {
        chatState.unreadCounts[otherUserId] = (chatState.unreadCounts[otherUserId] || 0) + 1
        updatePageTitle()
      }
    }
  }

  renderUserList()
}

function updatePageTitle() {
  const totalUnread = Object.values(chatState.unreadCounts).reduce((sum, count) => sum + count, 0)
  if (totalUnread > 0) {
    document.title = `(${totalUnread}) Сообщения - Forum`
  } else {
    document.title = "Сообщения - Forum"
  }
  
  // Обновляем бейдж в хедере
  if (window.renderHeader) {
    window.renderHeader()
  }
}

function markMessagesAsRead() {
  if (!chatState.activeUserId || chatState.messages.length === 0) return
  
  const currentUserId = getCurrentUserId()
  if (currentUserId === null) return
  
  // Находим последнее сообщение ОТ СОБЕСЕДНИКА (не от нас)
  for (let i = chatState.messages.length - 1; i >= 0; i--) {
    const msg = chatState.messages[i]
    if (Number(msg.from) !== currentUserId && msg.id) {
      console.log(`Marking messages as read up to ID: ${msg.id} for user ${chatState.activeUserId}`)
      chatState.lastReadMessageId[chatState.activeUserId] = msg.id
      saveLastReadIds() // Сохраняем в localStorage
      
      // Сбрасываем счетчик непрочитанных
      chatState.unreadCounts[chatState.activeUserId] = 0
      updatePageTitle()
      renderUserList() // Перерисовываем список пользователей
      scheduleUnreadDividerCleanup()
      return
    }
  }
  
  // Если все сообщения от нас, берем ID последнего сообщения
  const lastMessage = chatState.messages[chatState.messages.length - 1]
  if (lastMessage && lastMessage.id) {
    console.log(`All messages are from us, marking up to ID: ${lastMessage.id}`)
    chatState.lastReadMessageId[chatState.activeUserId] = lastMessage.id
    saveLastReadIds() // Сохраняем в localStorage
    
    // Сбрасываем счетчик непрочитанных
    chatState.unreadCounts[chatState.activeUserId] = 0
    updatePageTitle()
    renderUserList() // Перерисовываем список пользователей
    scheduleUnreadDividerCleanup()
  }

  unreadDividerTimeout = setTimeout(() => {
    const container = document.getElementById("chat-messages")
    if (!container) return

    const currentUserId = getCurrentUserId()
    const lastReadId = Number(chatState.lastReadMessageId[chatState.activeUserId] || 0)
    const hasUnread = chatState.messages.some(msg => 
      currentUserId !== null && Number(msg.from) !== currentUserId && msg.id > lastReadId
    )

    if (!hasUnread) {
      const divider = container.querySelector(".unread-divider")
      if (divider) {
        divider.remove()
      }
    }
  }, UNREAD_DIVIDER_HIDE_DELAY)
}

function scheduleUnreadDividerCleanup() {
  if (unreadDividerTimeout) {
    clearTimeout(unreadDividerTimeout)
  }

  unreadDividerTimeout = setTimeout(() => {
    const container = document.getElementById("chat-messages")
    if (!container) return

    const { user } = window.state || {}
    const lastReadId = chatState.lastReadMessageId[chatState.activeUserId] || 0
    const hasUnread = chatState.messages.some(msg => 
      user && msg.from !== user.id && msg.id > lastReadId
    )

    if (!hasUnread) {
      const divider = container.querySelector(".unread-divider")
      if (divider) {
        divider.remove()
      }
    }
  }, UNREAD_DIVIDER_HIDE_DELAY)
}

function scheduleUnreadDividerCleanup() {
  if (unreadDividerTimeout) {
    clearTimeout(unreadDividerTimeout)
  }

  unreadDividerTimeout = setTimeout(() => {
    const container = document.getElementById("chat-messages")
    if (!container) return

    const currentUserId = getCurrentUserId()
    const lastReadId = Number(chatState.lastReadMessageId[chatState.activeUserId] || 0)
    const hasUnread = chatState.messages.some(msg => 
      currentUserId !== null && Number(msg.from) !== currentUserId && msg.id > lastReadId
    )

    if (!hasUnread) {
      if (chatState.activeUserId) {
        chatState.unreadCounts[chatState.activeUserId] = 0
        updatePageTitle()
        renderUserList()
      }

      const divider = container.querySelector(".unread-divider")
      if (divider) {
        divider.remove()
      }
    }
  }, UNREAD_DIVIDER_HIDE_DELAY)
}

function updateUserStatus(userId, status) {
  console.log("updateUserStatus called:", userId, status)
  const numUserId = Number(userId)
  
  // Обновляем список онлайн пользователей
  if (status === "online") {
    if (!chatState.onlineUserIds.includes(numUserId)) {
      chatState.onlineUserIds.push(numUserId)
      console.log("Added to onlineUserIds:", numUserId)
    }
  } else {
    const index = chatState.onlineUserIds.indexOf(numUserId)
    if (index > -1) {
      chatState.onlineUserIds.splice(index, 1)
      console.log("Removed from onlineUserIds:", numUserId)
    }
  }
  
  let user = chatState.users.find(u => u.id === numUserId)
  
  // Если пользователь не найден и он стал онлайн - перезагружаем список
  if (!user && status === "online") {
    console.log("User not found, reloading user list")
    loadChatUsers()
    return
  }
  
  if (user) {
    console.log("Updating user status:", user.username, "->", status)
    user.status = status
    renderUserList()
    if (chatState.activeUserId === user.id) {
      const statusEl = document.getElementById("chat-status")
      if (statusEl) {
        statusEl.textContent = status === "online" ? "Online" : "Offline"
      }
      // Обновляем доступность поля ввода при изменении статуса
      enableChatInput(status === "online")
    }
  }
}

function shouldAutoScroll() {
  const wrapper = document.getElementById("chat-messages-wrapper")
  if (!wrapper) return false
  const distance = wrapper.scrollHeight - (wrapper.scrollTop + wrapper.clientHeight)
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

function cleanupChat() {
  console.log("Cleaning up chat resources")
  
  if (userListRefreshInterval) {
    clearInterval(userListRefreshInterval)
    userListRefreshInterval = null
  }

  if (unreadDividerTimeout) {
    clearTimeout(unreadDividerTimeout)
    unreadDividerTimeout = null
  }
  
  // Удаляем обработчик из глобального WebSocket (но не закрываем сам WebSocket)
  if (window.websocket && messageHandler) {
    window.websocket.removeHandler(messageHandler)
    messageHandler = null
  }
  
  chatSocket = null
  
  // Сбрасываем флаг привязки формы
  chatFormBound = false
  
  // НЕ сбрасываем счетчики - они нужны для отображения в header
  // chatState.unreadCounts = {}
  // updatePageTitle()
}

// Глобальная функция для получения общего количества непрочитанных
window.getTotalUnreadMessages = function() {
  if (!chatState || !chatState.unreadCounts) return 0
  return Object.values(chatState.unreadCounts).reduce((sum, count) => sum + count, 0)
}

window.renderMessages = renderMessagesPage
window.cleanupMessages = cleanupChat
