// views/post.js

window.renderPost = async function ({ id }) {
  id = Number(id)
  const app = document.getElementById("app")

  if (!id) {
    app.innerHTML = "<p>Invalid post</p>"
    return
  }

  app.innerHTML = "<p>Loading post...</p>"

  try {
    const post = await api.getPost(id)
    const comments = await api.getComments(id)

    app.innerHTML = `
      <div class="page single-post">
        <section class="content">

          <!-- POST -->
          <article class="post-card post-detail">
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
              <button id="postLikeBtn" class="btn btn-secondary">👍 ${post.likes}</button>
              <button id="postDislikeBtn" class="btn btn-secondary">👎 ${post.dislikes}</button>
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
                : comments.map(renderComment).join("")
            }
          </section>

          <!-- ADD COMMENT -->
          <section class="add-comment">
            <h4>Add a comment</h4>

            <form id="commentForm">
              <textarea
                id="commentInput"
                placeholder="Share your thoughts..."
                required
              ></textarea>
              <button type="submit" class="btn btn-primary">Post comment</button>
            </form>
          </section>

        </section>
      </div>
    `

    // ✅ единая функция перерендеринга этого же поста
    const rerender = () => window.renderPost({ id })

    // биндинги
    bindPostLikes(post.id, rerender)
    bindCommentLikes(rerender)
    bindCommentForm(post.id, rerender)

  } catch (err) {
    console.error(err)
    app.innerHTML = "<p class='error'>Failed to load post</p>"
  }
}

// ================= COMMENTS =================

function renderComment(comment) {
  return `
    <div class="comment" data-id="${comment.id}">
      <div class="comment-header">
        <strong>${escapeHtml(comment.username)}</strong>
        <span>${new Date(comment.created_at).toLocaleString()}</span>
      </div>

      <p>${escapeHtml(comment.content)}</p>

      <div class="comment-footer">
        <button class="comment-like btn btn-secondary">👍 ${comment.likes || 0}</button>
        <button class="comment-dislike btn btn-secondary">👎 ${comment.dislikes || 0}</button>
      </div>
    </div>
  `
}

// ================= POST LIKES =================

function bindPostLikes(postId, rerender) {
  const likeBtn = document.getElementById("postLikeBtn")
  const dislikeBtn = document.getElementById("postDislikeBtn")

  if (!likeBtn || !dislikeBtn) return

  likeBtn.addEventListener("click", async () => {
    try {
      await api.likePost(postId)
      rerender()
    } catch (e) {
      alert("Failed to like post")
    }
  })

  dislikeBtn.addEventListener("click", async () => {
    try {
      await api.dislikePost(postId)
      rerender()
    } catch (e) {
      alert("Failed to dislike post")
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

    if (likeBtn) {
      likeBtn.addEventListener("click", async () => {
        try {
          await api.likeComment(commentId)
          rerender()
        } catch (e) {
          alert("Failed to like comment")
        }
      })
    }

    if (dislikeBtn) {
      dislikeBtn.addEventListener("click", async () => {
        try {
          await api.dislikeComment(commentId)
          rerender()
        } catch (e) {
          alert("Failed to dislike comment")
        }
      })
    }
  })
}

// ================= COMMENT FORM =================

function bindCommentForm(postId, rerender) {
  const form = document.getElementById("commentForm")
  const input = document.getElementById("commentInput")
  const errorEl = document.querySelector('[data-error-for="comment"]')

  if (!form || !input) return

  form.addEventListener("submit", async e => {
    e.preventDefault()

    const content = input.value.trim()
    if (!content) return

    try {
      await api.createComment(postId, content)
      rerender()
    } catch (err) {
      if (errorEl) {
        errorEl.textContent = "Failed to add comment"
        errorEl.style.display = "block"
      }
    }
  })
}
