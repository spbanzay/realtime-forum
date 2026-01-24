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
            </div>

            <div class="form-group">
              <label>Username</label>
              <input type="text" id="username" name="username" required minlength="3" maxlength="20" />
            </div>

            <div class="form-group">
              <label>Password</label>
              <input type="password" id="password" name="password" required minlength="8" />
            </div>

            <div class="form-group">
              <label>Age</label>
              <input type="number" id="age" name="age" required min="13" max="120" />
            </div>

            <div class="form-group">
              <label>Gender</label>
              <select id="gender" name="gender" required>
                <option value="">Select gender</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>

            <div class="form-group">
              <label>First name</label>
              <input type="text" id="first_name" name="first_name" required />
            </div>

            <div class="form-group">
              <label>Last name</label>
              <input type="text" id="last_name" name="last_name" required />
            </div>

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

  const form = document.getElementById("registerForm");

  form.addEventListener("submit", async (e) => {
    // ВАЖНО: Проверяем, прошла ли форма валидацию от FormValidator
    // Если валидатор нашел ошибки, он добавит класс 'error' на поля или мы можем проверить вручную
    
    // Даем валидатору выполнить проверку первым. 
    // Если в notifications.js handleSubmit делает preventDefault, 
    // мы должны убедиться, что не отправляем запрос.
    
    // Однако, так как handleSubmit в notifications.js вешается через addEventListener, 
    // они сработают одновременно. Чтобы синхронизировать их:
    
    const isValid = window.formValidator.validateField; // или просто дождаться логики
    
    // Простой способ: проверить, нет ли в форме элементов с классом error после срабатывания валидатора
    const hasErrors = form.querySelectorAll('.error').length > 0;
    if (hasErrors) {
        e.preventDefault();
        return;
    }

    e.preventDefault();

    const formData = {
      email: document.getElementById("email").value.trim(),
      username: document.getElementById("username").value.trim(),
      password: document.getElementById("password").value,
      age: Number(document.getElementById("age").value),
      gender: document.getElementById("gender").value,
      first_name: document.getElementById("first_name").value.trim(),
      last_name: document.getElementById("last_name").value.trim(),
    }

    try {
      await api.register(formData)
      window.showSuccess("Registration successful! Please login.");
      router.navigate("/login")
    } catch (err) {
      console.error("Registration failed", err)
      // Если API вернуло ошибку (например, email занят), показываем тост
      window.showError(err.message || "Registration failed. Please try again.");
    }
  })
}