// views/posts.js

async function renderPostsPage({ title, filter }) {
  const app = document.getElementById("app")
  const { user } = window.state || {}
  let realtimeRefreshTimer = null
  let selectedCategories = []

  if (window.websocket) {
    window.websocket.init()
  }

  try {
    app.innerHTML = `
      <div class="page posts-page">
        <aside class="sidebar">
          <h3>Categories</h3>
          <div id="categories">Loading...</div>
        </aside>

        <section class="content posts-content">
          <h1>${escapeHtml(title)}</h1>
          <div id="posts">Loading...</div>
        </section>
      </div>
    `

    // ================= CATEGORIES =================

    const categoriesEl = document.getElementById("categories")

    try {
      const categories = await api.getCategories()

      categoriesEl.innerHTML = categories
        .map(
          c => `
        <label class="category-item">
          <input type="checkbox" value="${c.id}">
          ${escapeHtml(c.name)}
        </label>
      `
        )
        .join("")

      categoriesEl.querySelectorAll("input").forEach(cb => {
        cb.addEventListener("change", () => {
          selectedCategories = Array.from(
            categoriesEl.querySelectorAll("input:checked")
          ).map(i => Number(i.value))

          loadPosts()
        })
      })
    } catch (err) {
      console.error(err)
      // Для критических ошибок загрузки категорий используем navigation context
      if (err.status >= 500) {
        window.handleApiError(err, 'navigation')
        return
      }
      window.handleApiError(err, 'action')
      categoriesEl.innerHTML = "<p class='error'>Failed to load categories</p>"
    }

    // ================= POSTS =================

    async function loadPosts() {
      const list = document.getElementById("posts")
      if (!list) return

      // фиксируем якорь: первый видимый пост и его смещение от верха viewport
      const cards = Array.from(list.querySelectorAll(".post-card"))
      const anchorEl = cards.find(el => el.getBoundingClientRect().bottom > 0)
      const anchorId = anchorEl ? anchorEl.dataset.id : null
      const anchorTop = anchorEl ? anchorEl.getBoundingClientRect().top : null

      list.innerHTML = "Loading..."

      let posts
      try {
        posts = await api.getPosts(filter, selectedCategories)
      } catch (err) {
        console.error(err)
        // Для критических ошибок загрузки постов используем navigation context
        if (err.status >= 500) {
          window.handleApiError(err, 'navigation')
          return
        }
        window.handleApiError(err, 'action')
        list.innerHTML = "<p class='error'>Failed to load posts</p>"
        return
      }

      if (!Array.isArray(posts) || posts.length === 0) {
        list.innerHTML = "<p class='no-posts'>No posts</p>"
        return
      }

      list.innerHTML = posts.map(post => renderPostCard(post, user)).join("")

      // восстанавливаем позицию прокрутки относительно якоря
      if (anchorId && anchorTop !== null) {
        const newAnchor = document.querySelector(`.post-card[data-id="${anchorId}"]`)
        if (newAnchor) {
          const newTop = newAnchor.getBoundingClientRect().top
          const delta = newTop - anchorTop
          if (Math.abs(delta) > 1) {
            window.scrollBy({ top: delta })
          }
        }
      }

      bindPostEvents(user)
    }

    // локальное обновление карточек без полной перерисовки
    const updateCardMetrics = (postId, likes, dislikes, commentCount) => {
      const card = document.querySelector(`.post-card[data-id="${postId}"]`)
      if (!card) return false
      const likeBtn = card.querySelector(".like-btn")
      const dislikeBtn = card.querySelector(".dislike-btn")
      const likeSpan = likeBtn || card.querySelector("span:nth-child(1)")
      const dislikeSpan = dislikeBtn || card.querySelector("span:nth-child(2)")
      if (likeBtn && typeof likes === "number") likeBtn.textContent = `👍 ${likes}`
      if (dislikeBtn && typeof dislikes === "number") dislikeBtn.textContent = `👎 ${dislikes}`
      if (!likeBtn && likeSpan && typeof likes === "number") likeSpan.textContent = `👍 ${likes}`
      if (!dislikeBtn && dislikeSpan && typeof dislikes === "number") dislikeSpan.textContent = `👎 ${dislikes}`
      const commentsEl = card.querySelector(".post-footer span:last-child")
      if (commentsEl && typeof commentCount === "number") commentsEl.textContent = `💬 ${commentCount}`
      return true
    }

    const insertNewPostCard = post => {
      const list = document.getElementById("posts")
      if (!list || !post) return
      const cardHTML = renderPostCard(post, user)
      const wrapper = document.createElement("div")
      wrapper.innerHTML = cardHTML
      const card = wrapper.firstElementChild
      if (!card) return
      const prevScroll = window.scrollY
      list.prepend(card)
      bindPostEvents(user)
      // компенсируем сдвиг если пользователь не у самого верха
      if (window.scrollY !== 0) {
        const h = card.getBoundingClientRect().height
        window.scrollTo({ top: prevScroll + h })
      }
    }

    if (window.websocket) {
      if (window.postsRealtimeHandler) {
        window.websocket.removeHandler(window.postsRealtimeHandler)
      }

      window.postsRealtimeHandler = payload => {
        if (!payload || !payload.type) return
        const relevant = ["post_created", "post_reaction", "comment_created"].includes(payload.type)
        if (!relevant) return
        const list = document.getElementById("posts")
        if (!list) return

        if (payload.type === "post_reaction") {
          updateCardMetrics(payload.post_id, payload.likes, payload.dislikes)
          return
        }

        if (payload.type === "comment_created") {
          updateCardMetrics(payload.post_id, undefined, undefined, payload.comment_count)
          return
        }

        if (payload.type === "post_created") {
          const post = payload.post
          // для фильтров кроме all/без категорий — оставляем прежнее поведение через reload
          const isDefaultFeed = filter === "all" && selectedCategories.length === 0
          if (isDefaultFeed && post) {
            insertNewPostCard(post)
            return
          }
        }

        if (realtimeRefreshTimer) return
        realtimeRefreshTimer = setTimeout(() => {
          realtimeRefreshTimer = null
          loadPosts()
        }, 150)
      }
      window.websocket.addHandler(window.postsRealtimeHandler)
    }

    loadPosts()
  } catch (err) {
    console.error("Critical error in renderPostsPage:", err)
    // Для критических ошибок при загрузке страницы используем navigation context
    window.handleApiError(err, 'navigation')
  }
}

// ================= POST CARD =================

function renderPostCard(post, user) {
  return `
    <article class="post-card" data-id="${post.id}">
      <h3>${escapeHtml(post.title)}</h3>

      <div class="post-info">
        👤 ${escapeHtml(post.username)}
        <span>🕒 ${new Date(post.created_at).toLocaleString()}</span>
      </div>

      <p>${escapeHtml(post.content)}</p>

      <div class="post-tags">
        ${(post.categories || [])
          .map(c => `<span class="tag">${escapeHtml(c)}</span>`)
          .join("")}
      </div>

      <div class="post-footer">
        ${
          user
            ? `
              <button class="like-btn">👍 ${post.likes}</button>
              <button class="dislike-btn">👎 ${post.dislikes}</button>
            `
            : `
              <span>👍 ${post.likes}</span>
              <span>👎 ${post.dislikes}</span>
            `
        }
        <span>💬 ${post.comment_count}</span>
      </div>
    </article>
  `
}

// ================= EVENTS =================

function bindPostEvents(user) {
  document.querySelectorAll(".post-card").forEach(card => {
    const postId = Number(card.dataset.id)

    // переход по карточке
    card.addEventListener("click", (e) => {
      // Не переходим в пост, если нажали на кнопку лайка
      if (e.target.closest('button')) return;
      router.navigate(`/post/${postId}`)
    })

    if (!user) return

    const likeBtn = card.querySelector(".like-btn")
    const dislikeBtn = card.querySelector(".dislike-btn")

    // Вспомогательная функция для обновления цифр в конкретной карточке
    const updateCardUI = async () => {
        try {
            // Получаем только этот пост с сервера (если API позволяет)
            const updatedPost = await api.getPost(postId)
            if (likeBtn) likeBtn.textContent = `👍 ${updatedPost.likes}`
            if (dislikeBtn) dislikeBtn.textContent = `👎 ${updatedPost.dislikes}`
        } catch (err) {
            // Если точечно не вышло, обновляем список (но это вызовет прыжок)
            // loadPosts() 
        }
    }

    if (likeBtn) {
      likeBtn.addEventListener("click", async e => {
        e.stopPropagation()
        try {
          await api.likePost(postId)
          await updateCardUI() // Обновляем только цифры в этой карточке
        } catch (err) {
          window.handleApiError(err, 'action')
        }
      })
    }

    if (dislikeBtn) {
      dislikeBtn.addEventListener("click", async e => {
        e.stopPropagation()
        try {
          await api.dislikePost(postId)
          await updateCardUI() // Обновляем только цифры в этой карточке
        } catch (err) {
          window.handleApiError(err, 'action')
        }
      })
    }
  })
}

// ================= VIEWS =================

window.renderHome = () =>
  renderPostsPage({ title: "Welcome to Go Forum", filter: "all" })

window.renderMyPosts = () =>
  renderPostsPage({ title: "My Posts", filter: "mine" })

window.renderLikedPosts = () =>
  renderPostsPage({ title: "Liked Posts", filter: "liked" })
