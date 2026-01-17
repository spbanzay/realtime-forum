window.renderCreatePost = async function () {
  const app = document.getElementById("app")

  app.innerHTML = `
    <div class="page create-post">
      <section class="content">
        <div class="form-container form-container-wide">
          <h1>Create post</h1>
          <p class="form-helper">Share an update with the community.</p>

          <form id="createPostForm" class="post-form">
            <div class="form-group">
              <label for="title">Title</label>
              <input
                type="text"
                id="title"
                placeholder="Post title"
                required
              />
            </div>

            <div class="form-group">
              <label for="content">Description</label>
              <textarea
                id="content"
                placeholder="Post content"
                required
              ></textarea>
            </div>

            <div class="categories">
              <h4>Categories</h4>
              <div id="categories">Loading...</div>
            </div>

            <button type="submit" class="btn btn-primary">
              Publish
            </button>
          </form>
        </div>
      </section>
    </div>
  `

  // загружаем категории
  const categories = await api.getCategories()
  const box = document.getElementById("categories")

  box.innerHTML = categories
    .map(
      c => `
      <label class="category-item">
        <input type="checkbox" value="${c.id}">
        ${escapeHtml(c.name)}
      </label>
    `
    )
    .join("")

  bindCreatePostForm()
}

function bindCreatePostForm() {
  const form = document.getElementById("createPostForm")

  form.addEventListener("submit", async e => {
    e.preventDefault()

    const title = document.getElementById("title").value.trim()
    const content = document.getElementById("content").value.trim()

    const categories = Array.from(
      document.querySelectorAll("#categories input:checked")
    ).map(cb => cb.value)

    if (!title || !content || categories.length === 0) {
      alert("Fill all fields and select categories")
      return
    }

    try {
      await api.createPost({ title, content, categories })
      router.navigate("/") // 👈 после создания возвращаемся к постам
    } catch (err) {
      alert(err.message || "Failed to create post")
    }
  })
}
