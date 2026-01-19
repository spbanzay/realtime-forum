// websocket.js - Глобальное управление WebSocket соединением

let globalSocket = null
let messageHandlers = []
let reconnectTimeout = null

// Инициализация WebSocket соединения
function initGlobalWebSocket() {
  if (globalSocket && (globalSocket.readyState === WebSocket.OPEN || globalSocket.readyState === WebSocket.CONNECTING)) {
    console.log("WebSocket уже подключен")
    return globalSocket
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws"
  globalSocket = new WebSocket(`${protocol}://${location.host}/ws`)

  globalSocket.addEventListener("open", () => {
    console.log("WebSocket подключен")
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
  })

  globalSocket.addEventListener("message", event => {
    // Проверяем, является ли это текстовым сообщением
    if (typeof event.data === 'string') {
      try {
        const payload = JSON.parse(event.data)
        
        // Вызываем все зарегистрированные обработчики
        messageHandlers.forEach(handler => {
          try {
            handler(payload)
          } catch (err) {
            console.error("Ошибка в обработчике сообщения:", err)
          }
        })
      } catch (err) {
        console.error("Ошибка парсинга WebSocket сообщения:", err)
      }
    }
    // Ping/Pong обрабатываются автоматически браузером
  })

  globalSocket.addEventListener("close", event => {
    console.log("WebSocket отключен, код:", event.code, "причина:", event.reason)
    globalSocket = null
    
    // Автоматическое переподключение если пользователь авторизован
    if (window.state?.user && !reconnectTimeout) {
      console.log("Переподключение через 2 секунды...")
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        console.log("Попытка переподключения...")
        initGlobalWebSocket()
      }, 2000)
    }
  })

  globalSocket.addEventListener("error", err => {
    console.error("WebSocket ошибка:", err)
  })

  return globalSocket
}

// Добавить обработчик сообщений
function addMessageHandler(handler) {
  if (typeof handler === "function" && !messageHandlers.includes(handler)) {
    messageHandlers.push(handler)
  }
}

// Удалить обработчик сообщений
function removeMessageHandler(handler) {
  messageHandlers = messageHandlers.filter(h => h !== handler)
}

// Закрыть WebSocket соединение
function closeGlobalWebSocket() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  
  messageHandlers = []
  
  if (globalSocket) {
    globalSocket.close()
    globalSocket = null
  }
}

// Получить текущее соединение
function getGlobalWebSocket() {
  return globalSocket
}

// Отправить сообщение через WebSocket
function sendWebSocketMessage(data) {
  if (globalSocket && globalSocket.readyState === WebSocket.OPEN) {
    globalSocket.send(JSON.stringify(data))
    return true
  }
  console.warn("WebSocket не подключен")
  return false
}

// Экспорт в глобальную область
window.websocket = {
  init: initGlobalWebSocket,
  close: closeGlobalWebSocket,
  addHandler: addMessageHandler,
  removeHandler: removeMessageHandler,
  getSocket: getGlobalWebSocket,
  send: sendWebSocketMessage
}
