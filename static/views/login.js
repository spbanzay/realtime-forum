window.renderLogin = function () {
  try {
    setState({
      ui: {
        viewHtml: `
          <div class="form-container">
            <h1>Login</h1>

            <form id="loginForm">
              <div class="form-group">
                <label>Email or username</label>
                <input id="identifier" name="identifier" required />
              </div>

              <div class="form-group">
                <label>Password</label>
                <input type="password" id="password" name="password" required />
              </div>

              <button type="submit" class="btn btn-primary button-full-width">
                Login
              </button>
            </form>
          </div>
        `
      }
    })

    // Инициализируем валидацию для новой формы
    if (window.initFormValidation) {
      window.initFormValidation();
    }

    document
      .getElementById("loginForm")
      .addEventListener("submit", async (e) => {
        e.preventDefault()

        const identifier = document.getElementById("identifier").value.trim()
        const password = document.getElementById("password").value

        try {
          await api.login(identifier, password)

          const user = await api.me()
          setState({ user })

          // Инициализируем глобальный WebSocket после входа
          if (window.websocket) {
            console.log("Initializing WebSocket after login...")
            window.websocket.init({ forceReconnect: true })
            if (window.ensureChatMessageHandler) {
              window.ensureChatMessageHandler()
            }
          } else {
            console.warn("WebSocket module not loaded!")
          }

          router.navigate("/")
        } catch (err) {
          console.error("Login failed", err)
          // Используем специальный контекст 'login' для детальной обработки ошибок
          window.handleApiError(err, 'login')
        }
      })
  } catch (err) {
    console.error("Critical error in renderLogin:", err)
    // Для критических ошибок страницы используем navigation context
    window.handleApiError(err, 'navigation')
  }
}
