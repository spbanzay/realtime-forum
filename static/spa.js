document.addEventListener("DOMContentLoaded", async () => {
  if (window.websocket) {
    window.websocket.addHandler((payload) => {
      if (payload.type === "presence") {
        const { user_id, status } = payload;
        // Находим все индикаторы (точки) этого пользователя на странице
        // Важно, чтобы при рендере списка юзеров вы добавили им [data-user-id]
        const dots = document.querySelectorAll(`.status-dot[data-user-id="${user_id}"]`);
        dots.forEach(dot => {
          dot.classList.remove('online', 'offline');
          dot.classList.add(status);
        });
        console.log(`User ${user_id} is now ${status}`);
      }
    });
  }
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
