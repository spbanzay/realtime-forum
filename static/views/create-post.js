window.renderCreatePost = async function () {
  const app = document.getElementById("app")

  app.innerHTML = `
    <div class="page">
      <section class="content narrow">
        <h1>Create post</h1>

        <form id="createPostForm" class="post-form">
          <input
            type="text"
            id="title"
            placeholder="Post title"
            required
          />

          <textarea
            id="content"
            placeholder="Post content"
            required
          ></textarea>

          <div class="categories">
            <h4>Categories</h4>
            <div id="categories">Loading...</div>
          </div>

          <button type="submit" class="btn btn-primary">
            Publish
          </button>
        </form>
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
