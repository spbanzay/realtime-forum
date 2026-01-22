const routes = [
  { path: "/", view: "redirectToPosts" },
  { path: "/posts", view: "renderHome" },
  { path: "/create-post", view: "renderCreatePost" }, 
  { path: "/my-posts", view: "renderMyPosts" },
  { path: "/liked-posts", view: "renderLikedPosts" },
  { path: "/messages", view: "renderMessages" },
  { path: "/messages/:id", view: "renderMessages" },

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
  currentPath: null,
  
  navigate(to) {
    history.pushState({}, "", to);
    this.resolve();
  },

  resolve() {
    const path = location.pathname;
    const { user } = window.state || {};

    const publicRoutes = ["/", "/login", "/register"]
    const isPublicRoute = publicRoutes.some(route => matchRoute(route, path) !== null)

    if (!user && !isPublicRoute) {
      this.navigate("/login");
      return;
    }

    if (this.currentPath === "/messages" && path !== "/messages") {
      if (window.cleanupMessages && typeof window.cleanupMessages === "function") {
        window.cleanupMessages();
      }
    }
    
    this.currentPath = path;

    // Ищем подходящий маршрут
    for (const r of routes) {
      const params = matchRoute(r.path, path);
      if (params) {
        const view = window[r.view];
        if (typeof view === "function") {
          view(params);
        } else {
          console.error(`View ${r.view} not found`);
          // Можно вызвать 500 ошибку, так как это ошибка конфигурации сервера/кода
          window.renderError(500, "View component is missing");
        }
        return;
      }
    }

    // --- ПРИМЕНЕНИЕ ЛОГИКИ ОШИБКИ ---
    // Если цикл прошел и ни один маршрут не совпал (routeFound === false)
    if (typeof window.renderError === "function") {
      window.renderError(404);
    } else {
      document.getElementById("app").innerHTML = "<h2>404 - Page Not Found</h2>";
    }
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
