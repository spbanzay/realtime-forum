document.addEventListener("DOMContentLoaded", async () => {
  // Стартуем WebSocket сразу, чтобы гости тоже получали трансляции
  if (window.websocket) {
    window.websocket.init({ forceReconnect: true })
  }

  // SPA links
  document.body.addEventListener("click", e => {
    const link = e.target.closest("a[data-link]")
    if (!link) return

    e.preventDefault()
    router.navigate(link.getAttribute("href"))
  })

  try {
    const me = await api.me()
    setState({ user: me })
    
    // Инициализируем глобальный WebSocket с текущей сессией
    if (window.websocket) {
      window.websocket.init({ forceReconnect: true })
    }

    if (window.ensureChatMessageHandler) {
      window.ensureChatMessageHandler()
    }
  } catch {
    setState({ user: null })

    // Гостевое соединение для публичных событий в реальном времени
    if (window.websocket) {
      window.websocket.init({ forceReconnect: true })
    }
  }

  router.resolve()

  if (window.state?.user && typeof window.initChatWidget === "function") {
    window.initChatWidget()
  }
})
