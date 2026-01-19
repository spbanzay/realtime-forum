document.addEventListener("DOMContentLoaded", async () => {
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
    
    // Инициализируем глобальный WebSocket при входе
    if (window.websocket) {
      window.websocket.init()
    }

    if (window.ensureChatMessageHandler) {
      window.ensureChatMessageHandler()
    }
  } catch {
    setState({ user: null })
  }

  router.resolve()

  if (window.state?.user && typeof window.initChatWidget === "function") {
    window.initChatWidget()
  }
})
