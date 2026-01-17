window.renderRegister = function () {
  setState({
    ui: {
      viewHtml: `
        <div class="form-container">
          <h1>Register</h1>

          <form id="registerForm">
            <div class="form-group">
              <label>Email</label>
              <input type="email" id="email" required />
              <p class="error form-error" data-error-for="email"></p>
            </div>

            <div class="form-group">
              <label>Username</label>
              <input type="text" id="username" required />
              <p class="error form-error" data-error-for="username"></p>
            </div>

            <div class="form-group">
              <label>Password</label>
              <input type="password" id="password" required />
              <p class="error form-error" data-error-for="password"></p>
            </div>

            <div class="form-group">
              <label>Age</label>
              <input type="number" id="age" required min="16" />
              <p class="error form-error" data-error-for="age"></p>
            </div>

            <div class="form-group">
              <label>Gender</label>
              <select id="gender">
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
              <input type="text" id="first_name" />
              <p class="error form-error" data-error-for="first_name"></p>
            </div>

            <div class="form-group">
              <label>Last name</label>
              <input type="text" id="last_name" />
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

  document
    .getElementById("registerForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault()
      clearRegisterErrors()

      try {
        await api.register({
          email: document.getElementById("email").value.trim(),
          username: document.getElementById("username").value.trim(),
          password: document.getElementById("password").value,
          age: Number(document.getElementById("age").value),
          gender: document.getElementById("gender").value,
          first_name: document.getElementById("first_name").value.trim(),
          last_name: document.getElementById("last_name").value.trim(),
        })

        router.navigate("/login")
      } catch (err) {
        console.error("Registration failed", err)
        const message =
          err?.message === "email exists"
            ? "Email already registered"
            : err?.message === "username exists"
              ? "Username already taken"
              : err?.message === "invalid data"
                ? "Check email, username (3-20 chars), and age (16+)"
                : "Registration failed"
        showRegisterError(err?.message, message)
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
