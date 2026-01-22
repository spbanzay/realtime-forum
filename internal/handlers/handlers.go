package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"real-time-forum/internal/database"
	"real-time-forum/internal/middleware"
	"real-time-forum/internal/models"
	"real-time-forum/internal/repos"
	"real-time-forum/internal/utils"

	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	db    *sql.DB
	hub   *Hub
	repos *repos.Repos
}

func NewHandler(db *sql.DB) *Handler {
	adapter := repos.NewSQLiteAdapter(db)
	r := &repos.Repos{Users: adapter, Messages: adapter, Presence: adapter}
	h := &Handler{db: db, hub: NewHub(), repos: r}
	// start hub run loop for safe broadcasting
	go h.hub.Run()
	return h
}

// ServeWS proxies WebSocket requests to the hub
func (h *Handler) ServeWS(w http.ResponseWriter, r *http.Request) {
	h.hub.ServeWS(w, r, h.db)
}

// UsersHandler handles GET /api/users for chat roster
func (h *Handler) UsersHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userID, err := middleware.GetUserIDFromContextOrSession(r, h.db)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	users, err := database.ListChatUsers(h.db, userID)
	if err != nil {
		http.Error(w, "failed to load users", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// MessagesHandler handles GET /api/messages?user_id=ID&offset=0&limit=10
func (h *Handler) MessagesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// authenticate (prefer userID from context when available)
	userID, err := middleware.GetUserIDFromContextOrSession(r, h.db)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()
	other := q.Get("user_id")
	if other == "" {
		http.Error(w, "missing user_id", http.StatusBadRequest)
		return
	}

	otherID, err := strconv.Atoi(other)
	if err != nil {
		http.Error(w, "invalid user_id", http.StatusBadRequest)
		return
	}

	offsetStr := q.Get("offset")
	if offsetStr == "" {
		offsetStr = "0"
	}
	offset, _ := strconv.Atoi(offsetStr)

	// limit fixed to 10 per requirements
	limit := 10

	// authorization check: ensure both users exist
	if _, err := database.GetUserByID(h.db, otherID); err != nil {
		http.Error(w, "user not found", http.StatusNotFound)
		return
	}

	msgs, err := database.GetMessagesBetween(h.db, userID, otherID, offset, limit)
	if err != nil {
		http.Error(w, "failed to load messages", http.StatusInternalServerError)
		return
	}

	total, err := database.CountMessagesBetween(h.db, userID, otherID)
	if err != nil {
		http.Error(w, "failed to load messages", http.StatusInternalServerError)
		return
	}

	hasMore := (offset + limit) < total

	// build response according to contract
	type RespMsg struct {
		ID        int    `json:"id"`
		From      int    `json:"from"`
		To        int    `json:"to"`
		Content   string `json:"content"`
		CreatedAt string `json:"created_at"`
	}

	var out []RespMsg
	for _, m := range msgs {
		targetID := otherID
		if m.UserID != userID {
			targetID = userID
		}
		out = append(out, RespMsg{
			ID:        m.ID,
			From:      m.UserID,
			To:        targetID,
			Content:   m.Content,
			CreatedAt: m.CreatedAt.Format(time.RFC3339),
		})
	}

	resp := map[string]interface{}{"messages": out, "has_more": hasMore}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

//
// ===================== AUTH =====================
//

// POST /api/register
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Email     string `json:"email"`
		Username  string `json:"username"`
		Password  string `json:"password"`
		Age       int    `json:"age"`
		Gender    string `json:"gender"`
		FirstName string `json:"first_name"`
		LastName  string `json:"last_name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	if !utils.IsValidEmail(req.Email) ||
		!utils.IsValidUsername(req.Username) ||
		req.Age < 16 ||
		strings.TrimSpace(req.Gender) == "" ||
		strings.TrimSpace(req.FirstName) == "" ||
		strings.TrimSpace(req.LastName) == "" {
		http.Error(w, "invalid data", http.StatusBadRequest)
		return
	}

	if ok, _ := database.EmailExists(h.db, req.Email); ok {
		http.Error(w, "email exists", http.StatusConflict)
		return
	}
	if ok, _ := database.UsernameExists(h.db, req.Username); ok {
		http.Error(w, "username exists", http.StatusConflict)
		return
	}

	hash, _ := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)

	_, err := h.db.Exec(`
		INSERT INTO users (email, username, password_hash, age, gender, first_name, last_name)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		req.Email, req.Username, string(hash),
		req.Age, req.Gender, req.FirstName, req.LastName,
	)

	if err != nil {
		http.Error(w, "db error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusCreated)
}

// POST /api/login
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Identifier string `json:"identifier"`
		Password   string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	var user models.User
	err := h.db.QueryRow(`
		SELECT id, username, password_hash
		FROM users
		WHERE LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)`,
		req.Identifier, req.Identifier,
	).Scan(&user.ID, &user.Username, &user.PasswordHash)

	if err != nil ||
		bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)) != nil {
		http.Error(w, "invalid credentials", http.StatusUnauthorized)
		return
	}

	if err := middleware.CreateSession(w, h.db, user.ID); err != nil {
		http.Error(w, "session error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

// POST /api/logout
func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	middleware.LogoutUser(w, r, h.db)
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/me
func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	user, _ := database.GetUserByID(h.db, userID)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":       user.ID,
		"username": user.Username,
	})
}

//
// ===================== POSTS =====================
//

// GET /api/posts
func (h *Handler) GetPosts(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	query := r.URL.Query()

	// filters
	mine := query.Get("mine") == "1"
	liked := query.Get("liked") == "1"

	var categoryIDs []int
	if raw := query.Get("categories"); raw != "" {
		for _, s := range strings.Split(raw, ",") {
			if id, err := strconv.Atoi(s); err == nil {
				categoryIDs = append(categoryIDs, id)
			}
		}
	}

	var (
		posts []models.Post
		err   error
	)

	switch {
	case mine && len(categoryIDs) > 0:
		posts, err = database.GetPostsByUserIDAndCategories(h.db, userID, categoryIDs)
	case mine:
		posts, err = database.GetPostsByUserID(h.db, userID)
	case liked && len(categoryIDs) > 0:
		posts, err = database.GetLikedPostsByCategories(h.db, userID, categoryIDs)
	case liked:
		posts, err = database.GetLikedPosts(h.db, userID)
	case len(categoryIDs) > 0:
		posts, err = database.GetPostsByCategories(h.db, categoryIDs)
	default:
		posts, err = database.GetAllPosts(h.db)
	}

	if err != nil {
		http.Error(w, "failed to load posts", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(posts)
}

// GET /api/posts/{id}
func (h *Handler) GetPost(w http.ResponseWriter, r *http.Request) {
	if _, err := middleware.GetUserIDFromSession(r, h.db); err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	id, err := strconv.Atoi(parts[3])
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	post, err := database.GetPostByID(h.db, id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(post)
}

// POST /api/posts/create
// POST /api/posts/create
func (h *Handler) CreatePost(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req struct {
		Title      string   `json:"title"`
		Content    string   `json:"content"`
		Categories []string `json:"categories"` // IDs категорий строками
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	if ok, msg := utils.ValidateCompletePostData(
		req.Title,
		req.Content,
		req.Categories,
	); !ok {
		http.Error(w, msg, http.StatusBadRequest)
		return
	}

	// 1️⃣ создаём пост
	postID, err := database.CreatePost(h.db, userID, req.Title, req.Content)
	if err != nil {
		http.Error(w, "failed to create post", http.StatusInternalServerError)
		return
	}

	// 2️⃣ сохраняем категории
	for _, catIDStr := range req.Categories {
		catID, err := strconv.Atoi(catIDStr)
		if err != nil {
			continue
		}

		if err := database.AddCategoryToPost(h.db, postID, catID); err != nil {
			http.Error(w, "failed to save categories", http.StatusInternalServerError)
			return
		}
	}

	if post, err := database.GetPostByID(h.db, postID); err == nil {
		h.hub.Broadcast(WSMessage{"type": "post_created", "post": post})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]int{"id": postID})
}

//
// ===================== COMMENTS =====================
//

// /api/comments  (GET, POST)
func (h *Handler) Comments(w http.ResponseWriter, r *http.Request) {
	switch r.Method {

	case http.MethodGet:
		postID, err := strconv.Atoi(r.URL.Query().Get("post_id"))
		if err != nil || postID == 0 {
			http.Error(w, "invalid post id", http.StatusBadRequest)
			return
		}

		comments, err := database.GetCommentsByPostID(h.db, postID)
		if err != nil {
			http.Error(w, "failed to load comments", http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(comments)

	case http.MethodPost:
		userID, err := middleware.GetUserIDFromSession(r, h.db)
		if err != nil {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		var req struct {
			PostID  int    `json:"post_id"`
			Content string `json:"content"`
		}
		json.NewDecoder(r.Body).Decode(&req)

		if ok, msg := utils.ValidateCommentData(req.Content); !ok {
			http.Error(w, msg, http.StatusBadRequest)
			return
		}

		res, err := h.db.Exec(`
			INSERT INTO comments (post_id, user_id, content, created_at)
			VALUES (?, ?, ?, datetime('now'))`,
			req.PostID, userID, req.Content,
		)

		if err != nil {
			http.Error(w, "failed to create comment", http.StatusInternalServerError)
			return
		}

		commentID, _ := res.LastInsertId()
		comment, _ := database.GetCommentByID(h.db, int(commentID))
		commentCount, _ := database.GetCommentCount(h.db, req.PostID)
		if comment != nil {
			h.hub.Broadcast(WSMessage{
				"type":          "comment_created",
				"post_id":       req.PostID,
				"comment_count": commentCount,
				"comment":       comment,
			})
		}

		w.WriteHeader(http.StatusCreated)

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

//
// ===================== REACTIONS =====================
//

// POST /api/posts/like
func (h *Handler) LikePost(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// ✅ LIKE = true
	likes, dislikes, err := utils.TogglePostReaction(h.db, userID, req.PostID, true)
	if err != nil {
		http.Error(w, "failed to like post", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"likes":    likes,
		"dislikes": dislikes,
	})

	// broadcast updated counters to everyone
	h.hub.Broadcast(WSMessage{
		"type":     "post_reaction",
		"post_id":  req.PostID,
		"likes":    likes,
		"dislikes": dislikes,
	})
}

// POST /api/posts/dislike
func (h *Handler) DislikePost(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// ✅ DISLIKE = false
	likes, dislikes, err := utils.TogglePostReaction(h.db, userID, req.PostID, false)
	if err != nil {
		http.Error(w, "failed to dislike post", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"likes":    likes,
		"dislikes": dislikes,
	})

	// broadcast updated counters to everyone
	h.hub.Broadcast(WSMessage{
		"type":     "post_reaction",
		"post_id":  req.PostID,
		"likes":    likes,
		"dislikes": dislikes,
	})
}

// POST /api/comments/like
func (h *Handler) LikeComment(w http.ResponseWriter, r *http.Request) {
	fmt.Println("LOG: LikeComment handler started")
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		fmt.Println("LOG: Auth error in LikeComment:", err)
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req struct {
		CommentID int `json:"comment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		fmt.Println("LOG: Decode error:", err) // И ЭТО
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	fmt.Printf("LOG: Calling ToggleCommentReaction for user %d, comment %d\n", userID, req.CommentID)

	// ✅ LIKE = true
	likes, dislikes, err := utils.ToggleCommentReaction(h.db, userID, req.CommentID, true)
	if err != nil {
		http.Error(w, "failed to like comment", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"likes":    likes,
		"dislikes": dislikes,
	})

	if comment, err := database.GetCommentByID(h.db, req.CommentID); err == nil && comment != nil {
		h.hub.Broadcast(WSMessage{
			"type":       "comment_reaction",
			"post_id":    comment.PostID,
			"comment_id": req.CommentID,
			"likes":      likes,
			"dislikes":   dislikes,
			"comment":    comment,
		})
	}
}

// POST /api/comments/dislike
func (h *Handler) DislikeComment(w http.ResponseWriter, r *http.Request) {
	userID, err := middleware.GetUserIDFromSession(r, h.db)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	var req struct {
		CommentID int `json:"comment_id"`
	}
	json.NewDecoder(r.Body).Decode(&req)

	// ✅ DISLIKE = false
	likes, dislikes, err := utils.ToggleCommentReaction(h.db, userID, req.CommentID, false)
	if err != nil {
		http.Error(w, "failed to dislike comment", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(map[string]int{
		"likes":    likes,
		"dislikes": dislikes,
	})

	if comment, err := database.GetCommentByID(h.db, req.CommentID); err == nil && comment != nil {
		h.hub.Broadcast(WSMessage{
			"type":       "comment_reaction",
			"post_id":    comment.PostID,
			"comment_id": req.CommentID,
			"likes":      likes,
			"dislikes":   dislikes,
			"comment":    comment,
		})
	}
}

//
// ===================== CATEGORIES =====================
//

// GET /api/categories
func (h *Handler) GetCategories(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	categories, err := database.GetAllCategories(h.db)
	if err != nil {
		http.Error(w, "failed to load categories", http.StatusInternalServerError)
		return
	}

	json.NewEncoder(w).Encode(categories)
}
