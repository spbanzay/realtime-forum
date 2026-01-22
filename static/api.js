const jsonHeaders = {
  "Content-Type": "application/json",
}

function handleJSON(res) {
  if (!res.ok) {
    return res.text().then(text => {
      const error = new Error(text || res.statusText)
      error.status = res.status
      throw error
    })
  }
  return res.json()
}

// Глобальная функция для обработки API ошибок
window.handleApiError = function(error, context = 'action') {
  const status = error.status || 500
  const message = error.message || 'Unknown error'
  
  console.error(`API Error (${status}):`, message)
  
  // Для навигационных ошибок (загрузка страниц) показываем полноценную страницу ошибки
  if (context === 'navigation' || context === 'page') {
    if (status === 400) {
      window.renderError(400, message || 'Invalid request parameters')
      return
    }
    if (status === 404) {
      window.renderError(404, message)
      return
    }
    if (status >= 500) {
      window.renderError(500, 'Server error occurred while loading the page')
      return
    }
    // Fallback для других навигационных ошибок
    window.renderError(status, message || 'An error occurred while loading the page')
    return
  }
  
  // Для действий в интерфейсе (отправка сообщений, лайки и т.д.) показываем Toast
  if (status === 400) {
    if (context === 'register') {
      if (message.includes('invalid data')) {
        window.showError('Invalid registration data. Please check that all fields contain only English letters, numbers, and allowed punctuation marks.')
      } else {
        window.showError(message || 'Invalid request. Please check your input.')
      }
    } else {
      window.showError(message || 'Invalid request. Please check your input.')
    }
  } else if (status === 401) {
    // Специальная обработка для ошибок логина
    if (context === 'login') {
      if (message.includes('user not found') || message.includes('invalid credentials') || message.includes('login failed')) {
        window.showError('Invalid email/username or password. Please check your credentials and try again.')
      } else {
        window.showError('Authentication failed. Please check your credentials.')
      }
    } else {
      window.showError('You need to login to perform this action')
      // Можно добавить перенаправление на логин
    }
  } else if (status === 403) {
    window.showError('You don\'t have permission to perform this action')
  } else if (status === 404) {
    window.showError('The requested resource was not found')
  } else if (status === 409) {
    // Обработка конфликтов (например, email exists, username exists)
    if (context === 'register') {
      if (message.includes('email exists')) {
        window.showError('This email is already registered. Please use a different email or try logging in.')
      } else if (message.includes('username exists')) {
        window.showError('This username is already taken. Please choose a different username.')
      } else {
        window.showError(message || 'This data already exists. Please use different values.')
      }
    } else {
      // Для других контекстов
      if (message.includes('email exists')) {
        window.showError('This email is already registered. Please use a different email or try logging in.')
      } else if (message.includes('username exists')) {
        window.showError('This username is already taken. Please choose a different username.')
      } else {
        window.showError(message || 'This data already exists. Please use different values.')
      }
    }
  } else if (status >= 500) {
    window.showError('Server error occurred. Please try again later.')
  } else {
    window.showError(message || 'An error occurred')
  }
}

window.api = {
  // ================= AUTH =================

  async me() {
    const res = await fetch("/api/me", {
      credentials: "include",
    })
    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(errorText || "unauthorized")
      error.status = res.status
      throw error
    }
    return res.json()
  },

  async login(identifier, password) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    })
    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(errorText || "login failed")
      error.status = res.status
      throw error
    }
  },

  async register(data) {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const errorText = await res.text()
      const error = new Error(errorText || "registration failed")
      error.status = res.status
      throw error
    }
  },

  async logout() {
    await fetch("/api/logout", {
      method: "POST",
      credentials: "include",
    })
  },

  // ================= POSTS =================

  async getPosts(filter = "all", categories = []) {
    let url = "/api/posts"
    const params = []

    if (filter === "mine") params.push("mine=1")
    if (filter === "liked") params.push("liked=1")
    if (categories.length) {
      params.push(`categories=${categories.join(",")}`)
    }

    if (params.length) {
      url += "?" + params.join("&")
    }

    const res = await fetch(url, { credentials: "include" })
    return handleJSON(res)
  },

  // GET /api/posts?id=ID
  async getPost(id) {
    const res = await fetch(`/api/posts/${id}`, {
      credentials: "include",
    })
    return handleJSON(res)
  },

  // POST /api/posts/create
  async createPost({ title, content, categories }) {
    const res = await fetch("/api/posts/create", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ title, content, categories }),
    })

    return handleJSON(res)
  },

  // ================= COMMENTS =================

  // GET /api/comments?post_id=ID
  async getComments(postId) {
    const res = await fetch(`/api/comments?post_id=${postId}`, {
      credentials: "include",
    })

    const data = await handleJSON(res)

    // ✅ ВСЕГДА массив
    return Array.isArray(data) ? data : []
  },

  // POST /api/comments
  async createComment(postId, content) {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({
        post_id: postId,
        content,
      }),
    })

    if (!res.ok) {
      throw new Error("failed to create comment")
    }
  },

  // ================= REACTIONS =================

  async likePost(postId) {
    const res = await fetch("/api/posts/like", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ post_id: postId }),
    })
    return handleJSON(res)
  },

  async dislikePost(postId) {
    const res = await fetch("/api/posts/dislike", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ post_id: postId }),
    })
    return handleJSON(res)
  },

  async likeComment(commentId) {
    const res = await fetch("/api/comments/like", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ comment_id: commentId }),
    })
    return handleJSON(res)
  },

  async dislikeComment(commentId) {
    const res = await fetch("/api/comments/dislike", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ comment_id: commentId }),
    })
    return handleJSON(res)
  },

  // ================= CATEGORIES =================

  async getCategories() {
    const res = await fetch("/api/categories")
    return handleJSON(res)
  },

  // ================= CHAT =================

  async getChatUsers() {
    const res = await fetch("/api/users", { credentials: "include" })
    return handleJSON(res)
  },

  async getMessages(userId, offset = 0) {
    const params = new URLSearchParams({
      user_id: String(userId),
      offset: String(offset),
    })
    const res = await fetch(`/api/messages?${params.toString()}`, {
      credentials: "include",
    })
    return handleJSON(res)
  },
}
