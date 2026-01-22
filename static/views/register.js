window.renderRegister = function () {
  setState({
    ui: {
      viewHtml: `
        <div class="form-container">
          <h1>Register</h1>

          <form id="registerForm">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="email" name="email" required />
              <p class="error form-error" data-error-for="email"></p>
            </div>

            <div class="form-group">
              <label>Username</label>
              <input type="text" id="username" name="username" required />
              <p class="error form-error" data-error-for="username"></p>
            </div>

            <div class="form-group">
              <label>Password</label>
              <input type="password" id="password" name="password" required />
              <p class="error form-error" data-error-for="password"></p>
            </div>

            <div class="form-group">
              <label>Age</label>
              <input type="number" id="age" name="age" required min="13" max="120" />
              <p class="error form-error" data-error-for="age"></p>
            </div>

            <div class="form-group">
              <label>Gender</label>
              <select id="gender" required>
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
              <p class="error form-error" data-error-for="gender"></p>
            </div>

            <div class="form-group">
              <label>First name</label>
              <input type="text" id="first_name" required />
              <p class="error form-error" data-error-for="first_name"></p>
            </div>

            <div class="form-group">
              <label>Last name</label>
              <input type="text" id="last_name" required />
              <p class="error form-error" data-error-for="last_name"></p>
            </div>

            <p class="error form-error form-error-global" data-error-for="form"></p>

            <button type="submit" class="btn btn-primary button-full-width">
              Register
            </button>
          </form>

          <p class="auth-link">
            Already have an account?
            <a href="/login" data-link><b><span style="color: blue;">Login</span></b></a>
          </p>
        </div>
      `
    }
  })

  // Инициализируем валидацию для новой формы
  if (window.initFormValidation) {
    window.initFormValidation();
  }

  document
    .getElementById("registerForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault()
      clearRegisterErrors()

      const formData = {
        email: document.getElementById("email").value.trim(),
        username: document.getElementById("username").value.trim(),
        password: document.getElementById("password").value,
        age: Number(document.getElementById("age").value),
        gender: document.getElementById("gender").value,
        first_name: document.getElementById("first_name").value.trim(),
        last_name: document.getElementById("last_name").value.trim(),
      }

      console.log("Отправляем данные регистрации:", formData)

      try {
        await api.register(formData)

        router.navigate("/login")
      } catch (err) {
        console.error("Registration failed", err)
        // Используем специальный контекст 'register' для детальной обработки ошибок
        window.handleApiError(err, 'register')
      }
    })
}

function clearRegisterErrors() {
  document.querySelectorAll(".form-error").forEach(errorEl => {
    errorEl.textContent = ""
    errorEl.style.display = "none"
  })
}

function showRegisterError(rawMessage, fallbackMessage) {
  let target = "form"

  if (rawMessage === "email exists") target = "email"
  if (rawMessage === "username exists") target = "username"
  if (rawMessage === "invalid data") target = "form"

  const errorEl = document.querySelector(`[data-error-for="${target}"]`)
  if (!errorEl) return

  errorEl.textContent = fallbackMessage
  errorEl.style.display = "block"
}
