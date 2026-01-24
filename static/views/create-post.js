window.renderCreatePost = async function () {
  const app = document.getElementById("app")

  try {
    app.innerHTML = `
      <div class="page single-post">
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
                  name="title"
                  placeholder="Post title"
                  required
                />
              </div>

              <div class="form-group">
                <label for="content">Description</label>
                <textarea
                  id="content"
                  name="content"
                  placeholder="Post content"
                  required
                ></textarea>
              </div>

              <div class="categories">
                <h4>Categories</h4>
                <div id="categories" class="category-selection">Loading...</div>
              </div>

              <button type="submit" class="btn btn-primary">
                Publish
              </button>
            </form>
          </div>
        </section>
      </div>
    `

    // загружаем категории с обработкой ошибок
    try {
      const categories = await api.getCategories()
      const box = document.getElementById("categories")

      box.innerHTML = categories
        .map(
          c => `
        <label class="category-item">
          <input type="checkbox" name="categories" value="${c.id}">
          ${escapeHtml(c.name)}
        </label>
      `
        )
        .join("")
    } catch (err) {
      console.error("Error loading categories:", err)
      const box = document.getElementById("categories")
      if (err.status >= 500) {
        // Для критических ошибок используем navigation context
        window.handleApiError(err, 'navigation')
        return
      }
      // Для некритических ошибок показываем сообщение и позволяем создать пост без категорий
      box.innerHTML = "<p class='error'>Failed to load categories. You can create a post without categories.</p>"
      window.handleApiError(err, 'action')
    }

    // Инициализируем валидацию для новой формы
    if (window.initFormValidation) {
      window.initFormValidation();
    }

    bindCreatePostForm()
  } catch (err) {
    console.error("Critical error in renderCreatePost:", err)
    // Для критических ошибок страницы используем navigation context
    window.handleApiError(err, 'navigation')
  }
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

    // if (!title || !content || categories.length === 0) {
    //   window.showWarning("Fill all fields and select categories")
    //   return
    // }

    try {
      await api.createPost({ title, content, categories })
      window.showSuccess("Post created successfully!")
      router.navigate("/") // 👈 после создания возвращаемся к постам
    } catch (err) {
      console.error("Error creating post:", err)
      // Для 500 ошибок используем navigation context, для остальных - action
      if (err.status >= 500) {
        window.handleApiError(err, 'navigation')
      } else {
        window.handleApiError(err, 'action')
      }
    }
  })
}
