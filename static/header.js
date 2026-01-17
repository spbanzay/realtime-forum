window.renderHeader = function () {
  const header = document.getElementById("header")
  if (!header) return

  const { user } = window.state || {}

  header.innerHTML = `
    <header class="header">
      <div class="header-inner">

        <a href="/" data-link class="logo">Forum</a>

        ${
          user
            ? `
              <nav class="nav">
                <a href="/create-post" data-link>Создать пост</a>
                <a href="/my-posts" data-link>Мои посты</a>
                <a href="/liked-posts" data-link>Понравившиеся</a>
              </nav>

              <div class="user-actions">
                <span class="username">
                  👤 ${escapeHtml(user.username)}
                </span>
                <button id="logoutBtn" class="btn btn-secondary">
                  Logout
                </button>
              </div>
            `
            : `
              <nav class="nav">
                <a href="/login" data-link class="btn btn-secondary">
                  Login
                </a>
                <a href="/register" data-link class="btn btn-primary">
                  Register
                </a>
              </nav>
            `
        }

      </div>
    </header>
  `

  const logoutBtn = document.getElementById("logoutBtn")
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await api.logout()
      setState({ user: null })
      router.navigate("/login")
    })
  }
}
