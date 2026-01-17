const routes = [
  { path: "/", view: "redirectToPosts" },
  { path: "/posts", view: "renderHome" },
  { path: "/create-post", view: "renderCreatePost" }, 
  { path: "/my-posts", view: "renderMyPosts" },
  { path: "/liked-posts", view: "renderLikedPosts" },

  { path: "/login", view: "renderLogin" },
  { path: "/register", view: "renderRegister" },
  { path: "/post/:id", view: "renderPost" },
]

function matchRoute(route, path) {
  const r = route.split("/").filter(Boolean)
  const p = path.split("/").filter(Boolean)

  if (r.length !== p.length) return null

  const params = {}
  for (let i = 0; i < r.length; i++) {
    if (r[i].startsWith(":")) {
      params[r[i].slice(1)] = p[i]
    } else if (r[i] !== p[i]) {
      return null
    }
  }
  return params
}

window.router = {
  navigate(to) {
    history.pushState({}, "", to)
    this.resolve()
  },

  resolve() {
    const path = location.pathname
    const { user } = window.state || {}

    const publicRoutes = ["/", "/posts", "/post/:id", "/login", "/register"]
    const isPublicRoute = publicRoutes.some(route => matchRoute(route, path) !== null)

    if (!user && !isPublicRoute) {
      this.navigate("/login")
      return
    }

    for (const r of routes) {
      const params = matchRoute(r.path, path)
      if (params) {
        const view = window[r.view]
        if (typeof view === "function") {
          view(params)
        } else {
          console.error(`View ${r.view} not found`)
        }
        return
      }
    }

    document.getElementById("app").innerHTML = "<h2>404</h2>"
  }
}

window.addEventListener("popstate", () => {
  router.resolve()
})

window.redirectToPosts = function () {
  router.navigate("/posts")
}

// document.addEventListener("click", e => {
//   const link = e.target.closest("a[data-link]")
//   if (!link) return

//   e.preventDefault()
//   router.navigate(link.getAttribute("href"))
// })
