// ===============================
// Global SPA State
// ===============================

window.state = {
  user: null,      // { id, username } | null
  ui: {
    viewHtml: ""   // текущий HTML view
  },
  currentPost: null,
  comments: []
}

// ===============================
// setState — единая точка обновления состояния
// ===============================

window.setState = function (partial) {
  window.state = {
    ...window.state,
    ...partial,
    ui: {
      ...window.state.ui,
      ...partial.ui
    }
  }

  // всегда обновляем header (зависит от state.user)
  if (typeof window.renderHeader === "function") {
    renderHeader()
  }

  // обновляем основной view
  if (window.state.ui?.viewHtml !== undefined) {
    const app = document.getElementById("app")
    if (app) {
      app.innerHTML = window.state.ui.viewHtml
    }
  }
}
