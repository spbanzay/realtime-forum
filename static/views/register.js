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
            </div>

            <div class="form-group">
              <label>Username</label>
              <input type="text" id="username" required />
            </div>

            <div class="form-group">
              <label>Password</label>
              <input type="password" id="password" required />
            </div>

            <div class="form-group">
              <label>Age</label>
              <input type="number" id="age" required min="16" />
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
            </div>

            <div class="form-group">
              <label>First name</label>
              <input type="text" id="first_name" />
            </div>

            <div class="form-group">
              <label>Last name</label>
              <input type="text" id="last_name" />
            </div>

            <button type="submit" class="btn btn-primary button-full-width">
              Register
            </button>
          </form>

          <p class="auth-link">
            Already have an account?
            <a href="/login" data-link>Login</a>
          </p>
        </div>
      `
    }
  })

  document
    .getElementById("registerForm")
    .addEventListener("submit", async (e) => {
      e.preventDefault()

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
        setState({
          ui: {
            viewHtml: `<p class="error">${message}</p>`
          }
        })
      }
    })
}
