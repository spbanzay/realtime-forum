package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"real-time-forum/internal/database"
	"real-time-forum/internal/handlers"
	"real-time-forum/internal/middleware"
)

func main() {
	db, err := database.InitDB()
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	if err := database.RunMigrations(db); err != nil {
		log.Fatal(err)
	}

	handler := handlers.NewHandler(db)
	mux := http.NewServeMux()

	// ================= STATIC FILES =================
	mux.Handle(
		"/static/",
		http.StripPrefix(
			"/static/",
			http.FileServer(http.Dir("./static")),
		),
	)

	// WebSocket endpoint for real-time private messages
	mux.HandleFunc("/ws", handler.ServeWS)

	// API endpoint for loading private messages
	mux.HandleFunc("/api/messages", middleware.RequireAuth(handler.MessagesHandler, db))
	// API endpoint for chat roster
	mux.HandleFunc("/api/users", middleware.RequireAuth(handler.UsersHandler, db))

	// ================= API =================

	// --- Auth ---
	mux.HandleFunc("/api/register", handler.Register)
	mux.HandleFunc("/api/login", handler.Login)
	mux.HandleFunc("/api/logout", handler.Logout)
	mux.HandleFunc("/api/me", handler.Me)

	// --- Posts ---
	mux.HandleFunc("/api/posts", handler.GetPosts)
	mux.HandleFunc("/api/posts/", handler.GetPost)
	mux.HandleFunc("/api/posts/create", handler.CreatePost)

	// --- Comments (GET + POST) ---
	mux.HandleFunc("/api/comments", handler.Comments)

	// --- Reactions ---
	mux.HandleFunc("/api/posts/like", handler.LikePost)
	mux.HandleFunc("/api/posts/dislike", handler.DislikePost)
	mux.HandleFunc("/api/comments/like", handler.LikeComment)
	mux.HandleFunc("/api/comments/dislike", handler.DislikeComment)

	// --- Categories ---
	mux.HandleFunc("/api/categories", handler.GetCategories)

	// Change password endpoint
	mux.HandleFunc("/change-password", middleware.RequireAuth(handler.ChangePasswordHandler, db))

	// ================= SPA ENTRY =================
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// пропускаем API и static
		if strings.HasPrefix(r.URL.Path, "/api/") ||
			strings.HasPrefix(r.URL.Path, "/static/") {
			http.NotFound(w, r)
			return
		}

		http.ServeFile(w, r, "./static/index.html")
	})

	// ================= SERVER =================
	server := &http.Server{
		Addr:    ":8080",
		Handler: mux,
	}

	go func() {
		log.Println("Server running at http://localhost:8080")
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	// ================= SHUTDOWN =================
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	server.Shutdown(ctx)
	log.Println("Server stopped")
}
