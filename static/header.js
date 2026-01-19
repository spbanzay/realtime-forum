window.renderHeader = function () {
  const header = document.getElementById("header")
  if (!header) return

  const { user } = window.state || {}
  
  // Получаем общее количество непрочитанных сообщений
  const totalUnread = window.getTotalUnreadMessages ? window.getTotalUnreadMessages() : 0
  const currentPath = window.location.pathname
  const showBadge = totalUnread > 0 && currentPath !== '/messages'
  const badgeClass = showBadge ? "nav-badge" : "nav-badge is-hidden"
  const badgeText = showBadge ? totalUnread : "0"

  header.innerHTML = `
    <header class="header">
      <div class="header-inner">
        <a href="/" data-link class="logo">Forum</a>

        <button class="burger-menu" id="burgerBtn" aria-label="Menu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <nav class="nav-container" id="navContainer">
          ${user ? `
            <div class="nav-links">
              <a href="/messages" data-link class="nav-link">
                Chats
                <span class="${badgeClass}">${badgeText}</span>
              </a>
              <a href="/liked-posts" data-link class="nav-link">Favorites</a>
              <a href="/my-posts" data-link class="nav-link">My Posts</a>
              <a href="/create-post" data-link class="nav-link nav-link-highlight">+ Create Post</a>
            </div>
            <div class="nav-actions">
              <div class="user-info">
                <span class="username">👤 ${escapeHtml(user.username)}</span>
                <span id="ws-status" class="ws-status" title="WebSocket status">🔴</span>
                <button id="logoutBtn" class="btn btn-primary btn-sm">Logout</button>
              </div>
            </div>
          ` : `
            <div class="auth-links">
              <a href="/login" data-link class="btn btn-secondary btn-sm">Login</a>
              <a href="/register" data-link class="btn btn-primary btn-sm">Register</a>
            </div>
          `}
        </nav>
      </div>
    </header>
  `

  // Логика открытия/закрытия бургера
  const burgerBtn = document.getElementById("burgerBtn")
  const navContainer = document.getElementById("navContainer")
  
  if (burgerBtn && navContainer) {
    burgerBtn.addEventListener("click", () => {
      navContainer.classList.toggle("active")
      burgerBtn.classList.toggle("open")
    })

    // Закрываем меню при клике на любую ссылку
    const navLinks = navContainer.querySelectorAll("a, button")
    navLinks.forEach(link => {
      link.addEventListener("click", () => {
        navContainer.classList.remove("active")
        burgerBtn.classList.remove("open")
      })
    })

    // Закрываем меню при клике вне его
    document.addEventListener("click", (e) => {
      if (!navContainer.contains(e.target) && !burgerBtn.contains(e.target)) {
        navContainer.classList.remove("active")
        burgerBtn.classList.remove("open")
      }
    })
  }

  // Логика Logout
  const logoutBtn = document.getElementById("logoutBtn")
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      // Закрываем локальные чаты если открыты
      if (window.cleanupMessages && typeof window.cleanupMessages === "function") {
        window.cleanupMessages()
      }
      
      // Закрываем глобальный WebSocket
      if (window.websocket) {
        window.websocket.close()
      }
      
      await api.logout()
      setState({ user: null })
      router.navigate("/login")
    })
  }
}
