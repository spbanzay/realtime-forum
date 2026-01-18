package models

import "time"

// User represents a forum user
type User struct {
	ID           int       `json:"id"`
	Email        string    `json:"email"`
	Username     string    `json:"username"`
	Age          int       `json:"age"`        // НОВОЕ
	Gender       string    `json:"gender"`     // НОВОЕ
	FirstName    string    `json:"first_name"` // НОВОЕ
	LastName     string    `json:"last_name"`  // НОВОЕ
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
}

// Post represents a forum post
type Post struct {
	ID           int       `json:"id"`
	UserID       int       `json:"user_id"`
	Username     string    `json:"username"`
	Title        string    `json:"title"`
	Content      string    `json:"content"`
	Categories   []string  `json:"categories"`
	Likes        int       `json:"likes"`
	Dislikes     int       `json:"dislikes"`
	CommentCount int       `json:"comment_count"`
	CreatedAt    time.Time `json:"created_at"`
}

// Comment represents a comment on a post
type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"post_id"`
	UserID    int       `json:"user_id"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	Likes     int       `json:"likes"`
	Dislikes  int       `json:"dislikes"`
	CreatedAt time.Time `json:"created_at"`
}

// Category represents a post category
type Category struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
}

// Session represents a user session
type Session struct {
	ID        string    `json:"id"`
	UserID    int       `json:"user_id"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// ChatUser represents a user in the chat roster
type ChatUser struct {
	ID            int    `json:"id"`
	Username      string `json:"username"`
	Status        string `json:"status"`
	LastMessageAt string `json:"last_message_at,omitempty"`
}

// LikeDislike represents a like or dislike action
type LikeDislike struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	TargetID  int       `json:"target_id"` // Post ID or Comment ID
	IsLike    bool      `json:"is_like"`   // true for like, false for dislike
	CreatedAt time.Time `json:"created_at"`
}
