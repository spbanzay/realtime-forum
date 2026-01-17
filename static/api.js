const jsonHeaders = {
  "Content-Type": "application/json",
}

function handleJSON(res) {
  if (!res.ok) {
    return res.text().then(text => {
      throw new Error(text || res.statusText)
    })
  }
  return res.json()
}

window.api = {
  // ================= AUTH =================

  async me() {
    const res = await fetch("/api/me", {
      credentials: "include",
    })
    if (!res.ok) throw new Error("unauthorized")
    return res.json()
  },

  async login(identifier, password) {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: jsonHeaders,
      credentials: "include",
      body: JSON.stringify({ identifier, password }),
    })
    if (!res.ok) throw new Error("login failed")
  },

  async register(data) {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error("registration failed")
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
    const res = await fetch(`/api/posts?id=${id}`, {
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
}
