// views/posts.js

async function renderPostsPage({ title, filter }) {
  const app = document.getElementById("app")

  app.innerHTML = `
    <div class="page">
      <aside class="sidebar">
        <h3>Categories</h3>
        <div id="categories">Loading...</div>
      </aside>

      <section class="content">
        <h1>${escapeHtml(title)}</h1>
        <div id="posts">Loading...</div>
      </section>
    </div>
  `

  // ================= CATEGORIES =================

  let selectedCategories = []
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
    categoriesEl.innerHTML = "<p class='error'>Failed to load categories</p>"
  }

  // ================= POSTS =================

  async function loadPosts() {
    const list = document.getElementById("posts")
    if (!list) return

    list.innerHTML = "Loading..."

    let posts
    try {
      posts = await api.getPosts(filter, selectedCategories)
    } catch (err) {
      console.error(err)
      list.innerHTML = "<p class='error'>Failed to load posts</p>"
      return
    }

    if (!Array.isArray(posts) || posts.length === 0) {
      list.innerHTML = "<p class='no-posts'>No posts</p>"
      return
    }

    list.innerHTML = posts.map(renderPostCard).join("")
    bindPostEvents()
  }

  loadPosts()
}

// ================= POST CARD =================

function renderPostCard(post) {
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
        <button class="like-btn">👍 ${post.likes}</button>
        <button class="dislike-btn">👎 ${post.dislikes}</button>
        <span>💬 ${post.comment_count}</span>
      </div>
    </article>
  `
}

// ================= EVENTS =================

function bindPostEvents() {
  document.querySelectorAll(".post-card").forEach(card => {
    const postId = Number(card.dataset.id)

    // переход по карточке
    card.addEventListener("click", () => {
      router.navigate(`/post/${postId}`)
    })

    const likeBtn = card.querySelector(".like-btn")
    const dislikeBtn = card.querySelector(".dislike-btn")

    likeBtn.addEventListener("click", async e => {
      e.stopPropagation()
      await api.likePost(postId)
      router.resolve()
    })

    dislikeBtn.addEventListener("click", async e => {
      e.stopPropagation()
      await api.dislikePost(postId)
      router.resolve()
    })
  })
}

// ================= VIEWS =================

window.renderHome = () =>
  renderPostsPage({ title: "Welcome to Go Forum", filter: "all" })

window.renderMyPosts = () =>
  renderPostsPage({ title: "My Posts", filter: "mine" })

window.renderLikedPosts = () =>
  renderPostsPage({ title: "Liked Posts", filter: "liked" })
