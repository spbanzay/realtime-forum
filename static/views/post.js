// views/post.js

window.renderPost = async function ({ id }) {
  id = Number(id)
  const app = document.getElementById("app")
  const { user } = window.state || {}

  if (!id || isNaN(id)) {
    window.renderError(400, "Invalid post ID")
    return
  }

  app.innerHTML = "<p>Loading post...</p>"

  if (window.websocket) {
    // Подключаем WS даже для гостей, чтобы получать события в реальном времени
    window.websocket.init()
  }

  try {
    // Загружаем пост и комментарии по отдельности для лучшей обработки ошибок
    let post, comments;
    
    try {
      post = await api.getPost(id)
    } catch (err) {
      console.error("Error loading post:", err)
      throw err; // Перебрасываем ошибку выше
    }
    
    try {
      comments = await api.getComments(id)
    } catch (err) {
      console.error("Error loading comments:", err)
      // Комментарии не критичны, используем пустой массив
      comments = []
    }

    app.innerHTML = `
      <div class="page single-post">
        <section class="content">

          <!-- POST -->
          <article class="post-card post-detail" data-id="${post.id}">
            <div class="post-header">
              <h2>${escapeHtml(post.title)}</h2>
              <div class="post-info">
                <span class="meta-item">👤 ${escapeHtml(post.username)}</span>
                <span class="meta-item">🕒 ${new Date(post.created_at).toLocaleString()}</span>
              </div>
            </div>

            <p class="post-body">${escapeHtml(post.content)}</p>

            <div class="post-tags">
              ${(post.categories || [])
                .map(c => `<span class="tag">${escapeHtml(c)}</span>`)
                .join("")}
            </div>

            <div class="post-footer post-actions">
              ${
                user
                  ? `
                    <button id="postLikeBtn" class="btn btn-secondary">👍 <span class="post-like-count">${post.likes}</span></button>
                    <button id="postDislikeBtn" class="btn btn-secondary">👎 <span class="post-dislike-count">${post.dislikes}</span></button>
                  `
                  : `
                    <span class="post-like-readonly">👍 <span class="post-like-count">${post.likes}</span></span>
                    <span class="post-dislike-readonly">👎 <span class="post-dislike-count">${post.dislikes}</span></span>
                  `
              }
              <span class="comment-count">💬 ${comments.length}</span>
            </div>
          </article>

          <!-- COMMENTS -->
          <section class="comments">
            <div class="comments-header">
              <h3>Discussion</h3>
              <span>${comments.length} messages</span>
            </div>

            ${
              comments.length === 0
                ? `<p class="no-posts">No comments yet</p>`
                : comments.map(comment => renderComment(comment, user)).join("")
            }
          </section>

          ${
            user
              ? `
                <!-- ADD COMMENT -->
                <section class="add-comment">
                  <h4>Add a comment</h4>

                  <form id="commentForm">
                    <textarea
                      id="commentInput"
                      name="content"
                      placeholder="Share your thoughts..."
                      required
                    ></textarea>
                    <button type="submit" class="btn btn-primary">Post comment</button>
                  </form>
                </section>
              `
              : ""
          }

        </section>
      </div>
    `

    // Инициализируем валидацию для новых форм
    if (window.initFormValidation) {
      window.initFormValidation();
    }

    if (user) {
      const rerender = () => window.renderPost({ id })
      bindPostLikes(post.id, rerender)
      bindCommentLikes(rerender)
      bindCommentForm(post.id, rerender)
    }

    // Подписываемся на обновления в реальном времени для этого поста
    attachPostRealtimeUpdates(post.id, user)

  } catch (err) {
    console.error(err)
    // Для загрузки поста используем navigation context
    window.handleApiError(err, 'navigation')
  }
}

// ================= COMMENTS =================

function renderComment(comment, user) {
  return `
    <div class="comment" data-id="${comment.id}">
      <div class="comment-header">
        <strong>${escapeHtml(comment.username)}</strong>
        <span>${new Date(comment.created_at).toLocaleString()}</span>
      </div>

      <p>${escapeHtml(comment.content)}</p>

      <div class="comment-footer">
        ${
          user
            ? `
              <button class="comment-like btn btn-secondary">👍 <span class="comment-like-count">${comment.likes || 0}</span></button>
              <button class="comment-dislike btn btn-secondary">👎 <span class="comment-dislike-count">${comment.dislikes || 0}</span></button>
            `
            : `
              <span class="comment-like-readonly">👍 <span class="comment-like-count">${comment.likes || 0}</span></span>
              <span class="comment-dislike-readonly">👎 <span class="comment-dislike-count">${comment.dislikes || 0}</span></span>
            `
        }
      </div>
    </div>
  `
}

// ================= POST LIKES =================

function bindPostLikes(postId, rerender) {
  const likeBtn = document.getElementById("postLikeBtn")
  const dislikeBtn = document.getElementById("postDislikeBtn")

  if (!likeBtn || !dislikeBtn) return

// Общая функция для обновления цифр
  const refreshMetrics = async () => {
    try {
      const updatedPost = await api.getPost(postId);
      updatePostReactionCounters(updatedPost.likes, updatedPost.dislikes)
    } catch (e) {
      console.error("Failed to refresh metrics", e);
    }
  };

  likeBtn.addEventListener("click", async () => {
    try {
      const res = await api.likePost(postId)
      updatePostReactionCounters(res.likes, res.dislikes)
    } catch (e) {
      window.handleApiError(e, 'action')
    }
  })

  dislikeBtn.addEventListener("click", async () => {
    try {
      const res = await api.dislikePost(postId)
      updatePostReactionCounters(res.likes, res.dislikes)
    } catch (e) {
      window.handleApiError(e, 'action')
    }
  })
}

// ================= COMMENT LIKES =================

function bindCommentLikes(rerender) {
  document.querySelectorAll(".comment").forEach(el => {
    const commentId = Number(el.dataset.id)
    if (!commentId) return

    const likeBtn = el.querySelector(".comment-like")
    const dislikeBtn = el.querySelector(".comment-dislike")

    if (!likeBtn || !dislikeBtn) return;

    const setCounts = (likes, dislikes) => {
      const likeCount = likeBtn.querySelector(".comment-like-count")
      const dislikeCount = dislikeBtn.querySelector(".comment-dislike-count")
      if (likeCount) likeCount.textContent = likes || 0
      if (dislikeCount) dislikeCount.textContent = dislikes || 0
    }

// Обработка ЛАЙКА
    likeBtn.onclick = async (e) => {
      e.preventDefault();
        try {
        // Получаем свежие цифры прямо из ответа бэкенда!
        const data = await api.likeComment(commentId); 
        setCounts(data.likes, data.dislikes)
      } catch (err) {
          window.handleApiError(err, 'action')
        }
      };
// Обработка ДИСКЛАЙКА

      dislikeBtn.onclick = async (e) => {
        e.preventDefault();
        try {
        const data = await api.dislikeComment(commentId);
        setCounts(data.likes, data.dislikes)
      } catch (err) {
          window.handleApiError(err, 'action')
        }
      };
  });
}

// ================= COMMENT FORM =================

function bindCommentForm(postId, rerender) {
  const form = document.getElementById("commentForm")
  const input = document.getElementById("commentInput")

  if (!form || !input) return

  form.addEventListener("submit", async e => {
    e.preventDefault()

    const content = input.value.trim()
    if (!content) {
      window.showWarning("Comment cannot be empty")
      return
    }
    if (window.formValidator && !window.formValidator.validateField({ target: input })) {
      window.showError("Please fix the errors below before submitting.")
      return
    }

    try {
      await api.createComment(postId, content)
      input.value = ""
      // обновляем счётчик локально, рендер оставляем — новый комментарий придет по WS
      const current = document.querySelector(".comment-count")
      const header = document.querySelector(".comments .comments-header span")
      const toNumber = el => {
        if (!el) return null
        const n = parseInt(el.textContent.replace(/\D+/g, ""), 10)
        return Number.isFinite(n) ? n : null
      }
      // const nextCount = (toNumber(current) || 0) + 1
      // updateCommentCountDisplay(nextCount)
    } catch (err) {
      window.handleApiError(err, 'action')
    }
  })
}

// ================= REALTIME UPDATES =================

function updatePostReactionCounters(likes, dislikes) {
  const likeCount = document.querySelector(".post-like-count")
  const dislikeCount = document.querySelector(".post-dislike-count")
  if (likeCount && typeof likes === "number") likeCount.textContent = likes
  if (dislikeCount && typeof dislikes === "number") dislikeCount.textContent = dislikes
}

function updateCommentCountDisplay(count) {
  const commentsTotal = typeof count === "number" ? count : null
  const commentCountEl = document.querySelector(".comment-count")
  if (commentCountEl && commentsTotal !== null) commentCountEl.textContent = `💬 ${commentsTotal}`

  const commentsHeaderCounter = document.querySelector(".comments .comments-header span")
  if (commentsHeaderCounter && commentsTotal !== null) commentsHeaderCounter.textContent = `${commentsTotal} messages`
}

function appendOrUpdateComment(comment, user) {
  if (!comment) return

  const commentsSection = document.querySelector(".comments")
  if (!commentsSection) return

  const existing = commentsSection.querySelector(`.comment[data-id="${comment.id}"]`)
  if (existing) {
    const likeCount = existing.querySelector(".comment-like-count")
    const dislikeCount = existing.querySelector(".comment-dislike-count")
    if (likeCount && typeof comment.likes === "number") likeCount.textContent = comment.likes
    if (dislikeCount && typeof comment.dislikes === "number") dislikeCount.textContent = comment.dislikes
    return
  }

  const placeholder = commentsSection.querySelector(".no-posts")
  if (placeholder) placeholder.remove()

  const wrapper = document.createElement("div")
  wrapper.innerHTML = renderComment(comment, user)
  const newEl = wrapper.firstElementChild
  if (newEl) {
    commentsSection.appendChild(newEl)
    if (user) {
      // Подключаем обработчики лайков для новых комментариев
      bindCommentLikes(() => {})
    }
  }
}

function attachPostRealtimeUpdates(postId, user) {
  if (!window.websocket) return

  if (window.postDetailRealtimeHandler) {
    window.websocket.removeHandler(window.postDetailRealtimeHandler)
  }

  window.postDetailRealtimeHandler = payload => {
    if (!payload || !payload.type) return

    if (payload.type === "post_reaction" && Number(payload.post_id) === Number(postId)) {
      updatePostReactionCounters(payload.likes, payload.dislikes)
      return
    }

    if (payload.type === "comment_created" && Number(payload.post_id) === Number(postId)) {
      if (typeof payload.comment_count === "number") {
        updateCommentCountDisplay(payload.comment_count)
      }
      appendOrUpdateComment(payload.comment, user)
      return
    }

    if (payload.type === "comment_reaction") {
      const comment = payload.comment || null
      const targetPostID = Number(payload.post_id || (comment && comment.post_id))
      const commentID = Number(payload.comment_id || (comment && comment.id))
      if (targetPostID !== Number(postId) || !commentID) return
      appendOrUpdateComment(comment, user)

      const commentEl = document.querySelector(`.comment[data-id="${commentID}"]`)
      if (commentEl) {
        const likeCount = commentEl.querySelector(".comment-like-count")
        const dislikeCount = commentEl.querySelector(".comment-dislike-count")
        if (likeCount && typeof payload.likes === "number") likeCount.textContent = payload.likes
        if (dislikeCount && typeof payload.dislikes === "number") dislikeCount.textContent = payload.dislikes
      }
    }
  }

  window.websocket.addHandler(window.postDetailRealtimeHandler)
}
