package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"real-time-forum/internal/models"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

// InitDB initializes the SQLite database connection
func InitDB() (*sql.DB, error) {
	// Create data directory if it doesn't exist
	dataDir := "data"
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %v", err)
	}

	// Open database connection
	dbPath := filepath.Join(dataDir, "forum.db")
	// Enable foreign key constraints via connection string
	db, err := sql.Open("sqlite3", dbPath+"?_foreign_keys=on")
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %v", err)
	}

	log.Printf("Using database file: %s", dbPath)

	// Test connection
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to connect to database: %v", err)
	}

	// Enable foreign key constraints for this connection
	if _, err := db.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %v", err)
	}

	return db, nil
}

// RunMigrations executes all database migrations
func RunMigrations(db *sql.DB) error {
	migrations := []string{
		createUsersTable,
		createCategoriesTable,
		createPostsTable,
		createCommentsTable,
		createPostCategoriesTable,
		createPostLikesTable,
		createCommentLikesTable,
		createSessionsTable,
		createMessagesTable,
		createPresenceTable,
		insertDefaultCategories,
		createCaseInsensitiveIndexes,
	}

	for _, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration failed: %v", err)
		}
	}

	return nil
}

const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    age INTEGER,               -- НОВОЕ
    gender TEXT,               -- НОВОЕ
    first_name TEXT,           -- НОВОЕ
    last_name TEXT,            -- НОВОЕ
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

const createCategoriesTable = `
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`

const createPostsTable = `
CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const createCommentsTable = `
CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const createPostCategoriesTable = `
CREATE TABLE IF NOT EXISTS post_categories (
    post_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (post_id, category_id),
    FOREIGN KEY (post_id) REFERENCES posts (id),
    FOREIGN KEY (category_id) REFERENCES categories (id)
);
`

const createPostLikesTable = `
CREATE TABLE IF NOT EXISTS post_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_like BOOLEAN NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(post_id, user_id),
    FOREIGN KEY (post_id) REFERENCES posts (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const createCommentLikesTable = `
CREATE TABLE IF NOT EXISTS comment_likes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    comment_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    is_like BOOLEAN NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES comments (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const createSessionsTable = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const createMessagesTable = `
CREATE TABLE IF NOT EXISTS messages (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	from_user INTEGER NOT NULL,
	to_user INTEGER NOT NULL,
	content TEXT NOT NULL,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (from_user) REFERENCES users (id),
	FOREIGN KEY (to_user) REFERENCES users (id)
);
`

const createPresenceTable = `
CREATE TABLE IF NOT EXISTS presence (
	user_id INTEGER PRIMARY KEY,
	status TEXT NOT NULL,
	nickname TEXT,
	updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users (id)
);
`

const insertDefaultCategories = `
INSERT OR IGNORE INTO categories (name, description) VALUES
    ('Job Search', 'Discussions about searching for jobs and career advice'),
    ('Job Offers', 'Posts with job offers and recruitment'),
    ('Company Reviews', 'Reviews and feedback about companies'),
    ('Job Search Tips', 'Tips and advice for job seekers'),
    ('Hiring Tips', 'Advice for employers on hiring and recruitment'),
    ('Internships', 'Internship opportunities and experiences');
`

const createCaseInsensitiveIndexes = `
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (LOWER(username));
`

// Database functions for user profile management

// GetUserByUsername retrieves a user by username
func GetUserByUsername(db *sql.DB, username string) (*models.User, error) {
	query := "SELECT id, email, username, password_hash, age, gender, first_name, last_name, created_at FROM users WHERE LOWER(username) = LOWER(?)"
	row := db.QueryRow(query, username)

	var user models.User
	err := row.Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.PasswordHash,
		&user.Age,       // НОВОЕ
		&user.Gender,    // НОВОЕ
		&user.FirstName, // НОВОЕ
		&user.LastName,  // НОВОЕ
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(db *sql.DB, userID int) (*models.User, error) {
	query := "SELECT id, email, username, password_hash, age, gender, first_name, last_name, created_at FROM users WHERE id = ?"
	row := db.QueryRow(query, userID)

	var user models.User
	err := row.Scan(
		&user.ID,
		&user.Email,
		&user.Username,
		&user.PasswordHash,
		&user.Age,       // НОВОЕ
		&user.Gender,    // НОВОЕ
		&user.FirstName, // НОВОЕ
		&user.LastName,  // НОВОЕ
		&user.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	return &user, nil
}

// UpdateUserPassword updates the password hash for a user
func UpdateUserPassword(db *sql.DB, userID int, hashedPassword string) error {
	_, err := db.Exec("UPDATE users SET password_hash = ? WHERE id = ?", hashedPassword, userID)
	return err
}

// DeleteSessionsByUserID deletes all sessions for a given user and returns number of rows removed
func DeleteSessionsByUserID(db *sql.DB, userID int) (int64, error) {
	res, err := db.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	if err != nil {
		return 0, err
	}
	rows, _ := res.RowsAffected()
	return rows, nil
}

// GetPostsByUserID retrieves all posts by a user
func GetPostsByUserID(db *sql.DB, userID int) ([]models.Post, error) {
	query := `
		SELECT p.id, p.user_id, p.title, p.content, p.created_at, u.username
		FROM posts p
		JOIN users u ON p.user_id = u.id
		WHERE p.user_id = ?
		ORDER BY p.created_at DESC
	`

	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}

	posts, err := ScanPosts(rows)
	if err != nil {
		return nil, err
	}

	for i := range posts {
		p := &posts[i]
		// Load categories for this post
		categories, err := GetCategoriesForPost(db, p.ID)
		if err != nil {
			log.Printf("Failed to get categories for post %d: %v", p.ID, err)
		} else {
			p.Categories = categories
		}

		// Load likes and dislikes count
		likeCount, dislikeCount, err := GetPostLikesDislikesCount(db, p.ID)
		if err != nil {
			log.Printf("Failed to get likes/dislikes for post %d: %v", p.ID, err)
		} else {
			p.Likes = likeCount
			p.Dislikes = dislikeCount
		}

		// Load comment count
		commentCount, err := GetCommentCount(db, p.ID)
		if err != nil {
			log.Printf("Failed to get comment count for post %d: %v", p.ID, err)
		} else {
			p.CommentCount = commentCount
		}
	}

	return posts, nil
}

// GetCommentsByUserID retrieves all comments by a user
func GetCommentsByUserID(db *sql.DB, userID int) ([]models.Comment, error) {
	query := `
		SELECT c.id, c.post_id, c.user_id, c.content, c.created_at, u.username
		FROM comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.user_id = ?
		ORDER BY c.created_at DESC
	`

	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}

	comments, err := ScanComments(rows)
	if err != nil {
		return nil, err
	}

	return comments, nil
}

// internal/database/comments.go
// func GetCommentsByPostID(db *sql.DB, postID int) ([]models.Comment, error) {
// 	query := `
// 		SELECT c.id, c.post_id, c.user_id, u.username, c.content, c.created_at
// 		FROM comments c
// 		JOIN users u ON c.user_id = u.id
// 		WHERE c.post_id = ?
// 		ORDER BY c.created_at ASC
// 	`

// 	rows, err := db.Query(query, postID)
// 	if err != nil {
// 		return nil, err
// 	}
// 	defer rows.Close()

// 	var comments []models.Comment
// 	for rows.Next() {
// 		var c models.Comment
// 		if err := rows.Scan(
// 			&c.ID,
// 			&c.PostID,
// 			&c.UserID,
// 			&c.Username,
// 			&c.Content,
// 			&c.CreatedAt,
// 		); err != nil {
// 			return nil, err
// 		}
// 		comments = append(comments, c)
// 	}

// 	return comments, nil
// }

func GetCommentsByPostID(db *sql.DB, postID int) ([]models.Comment, error) {
	query := `
		SELECT c.id, c.post_id, c.user_id, u.username, c.content, c.created_at
		FROM comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.post_id = ?
		ORDER BY c.created_at ASC
	`

	rows, err := db.Query(query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(
			&c.ID,
			&c.PostID,
			&c.UserID,
			&c.Username,
			&c.Content,
			&c.CreatedAt,
		); err != nil {
			return nil, err
		}

		// ✅ догружаем лайки
		db.QueryRow(`
			SELECT
				SUM(CASE WHEN is_like = 1 THEN 1 ELSE 0 END),
				SUM(CASE WHEN is_like = 0 THEN 1 ELSE 0 END)
			FROM comment_likes
			WHERE comment_id = ?
		`, c.ID).Scan(&c.Likes, &c.Dislikes)

		comments = append(comments, c)
	}

	return comments, nil
}

// GetCommentByID returns a single comment with aggregated reaction counters.
func GetCommentByID(db *sql.DB, commentID int) (*models.Comment, error) {
	var c models.Comment
	err := db.QueryRow(`
		SELECT c.id, c.post_id, c.user_id, u.username, c.content, c.created_at
		FROM comments c
		JOIN users u ON c.user_id = u.id
		WHERE c.id = ?
	`, commentID).Scan(&c.ID, &c.PostID, &c.UserID, &c.Username, &c.Content, &c.CreatedAt)
	if err != nil {
		return nil, err
	}

	db.QueryRow(`
		SELECT
			COALESCE(SUM(CASE WHEN is_like = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_like = 0 THEN 1 ELSE 0 END), 0)
		FROM comment_likes
		WHERE comment_id = ?
	`, commentID).Scan(&c.Likes, &c.Dislikes)

	return &c, nil
}

// GetUserPostCount gets the total number of posts by a user
func GetUserPostCount(db *sql.DB, userID int) (int, error) {
	var count int
	query := "SELECT COUNT(*) FROM posts WHERE user_id = ?"
	err := db.QueryRow(query, userID).Scan(&count)
	return count, err
}

// GetUserCommentCount gets the total number of comments by a user
func GetUserCommentCount(db *sql.DB, userID int) (int, error) {
	var count int
	query := "SELECT COUNT(*) FROM comments WHERE user_id = ?"
	err := db.QueryRow(query, userID).Scan(&count)
	return count, err
}

// GetUserLikeCount gets the total number of likes given by a user
func GetUserLikeCount(db *sql.DB, userID int) (int, error) {
	var count int
	query := `
		SELECT COUNT(*) FROM (
			SELECT 1 FROM post_likes WHERE user_id = ? AND is_like = 1
			UNION ALL
			SELECT 1 FROM comment_likes WHERE user_id = ? AND is_like = 1
		)
	`
	err := db.QueryRow(query, userID, userID).Scan(&count)
	return count, err
}

// GetUserDislikeCount gets the total number of dislikes given by a user
func GetUserDislikeCount(db *sql.DB, userID int) (int, error) {
	var count int
	query := `
		SELECT COUNT(*) FROM (
			SELECT 1 FROM post_likes WHERE user_id = ? AND is_like = 0
			UNION ALL
			SELECT 1 FROM comment_likes WHERE user_id = ? AND is_like = 0
		)
	`
	err := db.QueryRow(query, userID, userID).Scan(&count)
	return count, err
}

// CreatePost creates a new post in the database
func CreatePost(db *sql.DB, userID int, title, content string) (int, error) {
	log.Printf("=== DATABASE CREATE POST DEBUG ===")
	log.Printf("UserID: %d, Title: '%s', Content length: %d", userID, title, len(content))

	query := `INSERT INTO posts (user_id, title, content, created_at) VALUES (?, ?, ?, datetime('now'))`
	log.Printf("SQL Query: %s", query)

	result, err := db.Exec(query, userID, title, content)
	if err != nil {
		log.Printf("Database insert error: %v", err)
		return 0, err
	}

	postID, err := result.LastInsertId()
	if err != nil {
		log.Printf("Failed to get last insert ID: %v", err)
		return 0, err
	}

	log.Printf("Successfully created post with ID: %d", int(postID))
	return int(postID), nil
}

// GetPostByID retrieves a post by its ID
// func GetPostByID(db *sql.DB, postID int) (*models.Post, error) {
// 	query := `
// 		SELECT p.id, p.user_id, u.username, p.title, p.content, p.created_at
// 		FROM posts p
// 		JOIN users u ON p.user_id = u.id
// 		WHERE p.id = ?
// 	`

// 	var post models.Post
// 	err := db.QueryRow(query, postID).Scan(&post.ID, &post.UserID, &post.Username, &post.Title, &post.Content, &post.CreatedAt)
// 	if err != nil {
// 		return nil, err
// 	}

// 	return &post, nil
// }

func GetPostByID(db *sql.DB, postID int) (*models.Post, error) {
	query := `
		SELECT p.id, p.user_id, u.username, p.title, p.content, p.created_at
		FROM posts p
		JOIN users u ON p.user_id = u.id
		WHERE p.id = ?
	`

	var post models.Post
	err := db.QueryRow(query, postID).Scan(
		&post.ID,
		&post.UserID,
		&post.Username,
		&post.Title,
		&post.Content,
		&post.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	// ✅ ДОГРУЖАЕМ ВСЁ ОСТАЛЬНОЕ
	post.Categories, _ = GetCategoriesForPost(db, post.ID)
	post.Likes, post.Dislikes, _ = GetPostLikesDislikesCount(db, post.ID)
	post.CommentCount, _ = GetCommentCount(db, post.ID)

	return &post, nil
}

func GetLikedPosts(db *sql.DB, userID int) ([]models.Post, error) {
	rows, err := db.Query(`
        SELECT p.id, p.title, p.content, p.user_id, u.username, p.created_at
        FROM posts p
        JOIN users u ON p.user_id = u.id
        JOIN post_likes l ON p.id = l.post_id
        WHERE l.user_id = ? AND l.is_like = 1
        ORDER BY p.created_at DESC
    `, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Content, &post.UserID, &post.Username, &post.CreatedAt); err != nil {
			return nil, err
		}

		// Load categories for this post
		categories, err := GetCategoriesForPost(db, post.ID)
		if err != nil {
			log.Printf("Failed to get categories for post %d: %v", post.ID, err)
		} else {
			post.Categories = categories
		}

		// Load likes and dislikes count
		likeCount, dislikeCount, err := GetPostLikesDislikesCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get likes/dislikes for post %d: %v", post.ID, err)
		} else {
			post.Likes = likeCount
			post.Dislikes = dislikeCount
		}

		// Load comment count
		commentCount, err := GetCommentCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get comment count for post %d: %v", post.ID, err)
		} else {
			post.CommentCount = commentCount
		}

		posts = append(posts, post)
	}

	return posts, nil
}

// GetPostsByUserIDAndCategories retrieves posts by user ID filtered by categories
func GetPostsByUserIDAndCategories(db *sql.DB, userID int, categoryIDs []int) ([]models.Post, error) {
	if len(categoryIDs) == 0 {
		return GetPostsByUserID(db, userID)
	}

	// Create placeholders for the IN clause
	placeholders := strings.Repeat("?,", len(categoryIDs)-1) + "?"

	query := fmt.Sprintf(`
		SELECT DISTINCT p.id, p.user_id, p.title, p.content, p.created_at, u.username
		FROM posts p
		JOIN users u ON p.user_id = u.id
		JOIN post_categories pc ON p.id = pc.post_id
		WHERE p.user_id = ? AND pc.category_id IN (%s)
		ORDER BY p.created_at DESC
	`, placeholders)

	// Prepare arguments: userID first, then category IDs
	args := make([]interface{}, 1+len(categoryIDs))
	args[0] = userID
	for i, catID := range categoryIDs {
		args[i+1] = catID
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.Username)
		if err != nil {
			return nil, err
		}

		// Load categories for this post
		categories, err := GetCategoriesForPost(db, post.ID)
		if err != nil {
			log.Printf("Failed to get categories for post %d: %v", post.ID, err)
		} else {
			post.Categories = categories
		}

		// Load likes and dislikes count
		likeCount, dislikeCount, err := GetPostLikesDislikesCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get likes/dislikes for post %d: %v", post.ID, err)
		} else {
			post.Likes = likeCount
			post.Dislikes = dislikeCount
		}

		// Load comment count
		commentCount, err := GetCommentCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get comment count for post %d: %v", post.ID, err)
		} else {
			post.CommentCount = commentCount
		}

		posts = append(posts, post)
	}

	return posts, nil
}

// GetLikedPostsByCategories retrieves liked posts filtered by categories
func GetLikedPostsByCategories(db *sql.DB, userID int, categoryIDs []int) ([]models.Post, error) {
	if len(categoryIDs) == 0 {
		return GetLikedPosts(db, userID)
	}

	// Create placeholders for the IN clause
	placeholders := strings.Repeat("?,", len(categoryIDs)-1) + "?"

	query := fmt.Sprintf(`
		SELECT DISTINCT p.id, p.title, p.content, p.user_id, u.username, p.created_at
		FROM posts p
		JOIN users u ON p.user_id = u.id
		JOIN post_likes l ON p.id = l.post_id
		JOIN post_categories pc ON p.id = pc.post_id
		WHERE l.user_id = ? AND l.is_like = 1 AND pc.category_id IN (%s)
		ORDER BY p.created_at DESC
	`, placeholders)

	// Prepare arguments: userID first, then category IDs
	args := make([]interface{}, 1+len(categoryIDs))
	args[0] = userID
	for i, catID := range categoryIDs {
		args[i+1] = catID
	}

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(&post.ID, &post.Title, &post.Content, &post.UserID, &post.Username, &post.CreatedAt); err != nil {
			return nil, err
		}

		// Load categories for this post
		categories, err := GetCategoriesForPost(db, post.ID)
		if err != nil {
			log.Printf("Failed to get categories for post %d: %v", post.ID, err)
		} else {
			post.Categories = categories
		}

		// Load likes and dislikes count
		likeCount, dislikeCount, err := GetPostLikesDislikesCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get likes/dislikes for post %d: %v", post.ID, err)
		} else {
			post.Likes = likeCount
			post.Dislikes = dislikeCount
		}

		// Load comment count
		commentCount, err := GetCommentCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get comment count for post %d: %v", post.ID, err)
		} else {
			post.CommentCount = commentCount
		}

		posts = append(posts, post)
	}

	return posts, nil
}

func GetAllPosts(db *sql.DB) ([]models.Post, error) {
	query := `
		SELECT p.id, p.user_id, p.title, p.content, p.created_at, u.username
		FROM posts p
		JOIN users u ON p.user_id = u.id
		ORDER BY p.created_at DESC
	`

	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.Username)
		if err != nil {
			return nil, err
		}

		// Load categories for this post
		categories, err := GetCategoriesForPost(db, post.ID)
		if err != nil {
			log.Printf("Failed to get categories for post %d: %v", post.ID, err)
		} else {
			post.Categories = categories
		}

		// Load likes and dislikes count
		likeCount, dislikeCount, err := GetPostLikesDislikesCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get likes/dislikes for post %d: %v", post.ID, err)
		} else {
			post.Likes = likeCount
			post.Dislikes = dislikeCount
		}

		// Load comment count
		commentCount, err := GetCommentCount(db, post.ID)
		if err != nil {
			log.Printf("Failed to get comment count for post %d: %v", post.ID, err)
		} else {
			post.CommentCount = commentCount
		}

		posts = append(posts, post)
	}

	return posts, nil
}

// GetPostsByCategory возвращает посты, связанные с категорией через post_categories
func GetPostsByCategory(db *sql.DB, categoryID int) ([]models.Post, error) {
	query := `
		SELECT p.id, p.user_id, p.title, p.content, p.created_at, u.username
		FROM posts p
		JOIN users u ON p.user_id = u.id
		JOIN post_categories pc ON p.id = pc.post_id
		WHERE pc.category_id = ?
		ORDER BY p.created_at DESC
	`

	rows, err := db.Query(query, categoryID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.Username); err != nil {
			return nil, err
		}

		// Load categories for this post
		post.Categories, _ = GetPostCategories(db, post.ID)

		// Load likes and dislikes count
		post.Likes, post.Dislikes, _ = GetPostLikesCount(db, post.ID)

		posts = append(posts, post)
	}

	return posts, nil
}

// GetPostsByCategories возвращает посты, связанные с любой из указанных категорий
func GetPostsByCategories(db *sql.DB, categoryIDs []int) ([]models.Post, error) {
	if len(categoryIDs) == 0 {
		return []models.Post{}, nil
	}

	// Build IN clause for multiple category IDs
	placeholders := make([]string, len(categoryIDs))
	args := make([]interface{}, len(categoryIDs))
	for i, id := range categoryIDs {
		placeholders[i] = "?"
		args[i] = id
	}

	query := fmt.Sprintf(`
		SELECT DISTINCT p.id, p.user_id, p.title, p.content, p.created_at, u.username
		FROM posts p
		JOIN users u ON p.user_id = u.id
		JOIN post_categories pc ON p.id = pc.post_id
		WHERE pc.category_id IN (%s)
		ORDER BY p.created_at DESC
	`, strings.Join(placeholders, ","))

	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var posts []models.Post
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.Username); err != nil {
			return nil, err
		}

		// Load categories for this post
		post.Categories, _ = GetPostCategories(db, post.ID)

		// Load likes and dislikes count
		post.Likes, post.Dislikes, _ = GetPostLikesCount(db, post.ID)

		posts = append(posts, post)
	}

	return posts, nil
}

func GetAllCategories(db *sql.DB) ([]models.Category, error) {
	rows, err := db.Query("SELECT id, name FROM categories ORDER BY id ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []models.Category
	for rows.Next() {
		var c models.Category
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		categories = append(categories, c)
	}

	return categories, nil
}

// Message-related functions

// InsertMessage inserts a new private message and returns the new message ID and created_at
func InsertMessage(db *sql.DB, fromUser int, toUser int, content string) (int64, string, error) {
	query := `INSERT INTO messages (from_user, to_user, content, created_at) VALUES (?, ?, ?, datetime('now'))`
	res, err := db.Exec(query, fromUser, toUser, content)
	if err != nil {
		return 0, "", err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return 0, "", err
	}

	var createdAt string
	err = db.QueryRow("SELECT created_at FROM messages WHERE id = ?", id).Scan(&createdAt)
	if err != nil {
		return id, "", err
	}
	return id, createdAt, nil
}

// GetMessagesBetween returns messages between two users ordered by created_at DESC with offset/limit
func GetMessagesBetween(db *sql.DB, userA int, userB int, offset int, limit int) ([]models.Comment, error) {
	// reuse Comment struct for lightweight message representation (id, user_id etc.)
	query := `
		SELECT id, from_user, to_user, content, created_at
		FROM messages
		WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)
		ORDER BY datetime(created_at) DESC
		LIMIT ? OFFSET ?
	`
	rows, err := db.Query(query, userA, userB, userB, userA, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []models.Comment
	for rows.Next() {
		var m models.Comment
		var fromUser int
		var toUser int
		if err := rows.Scan(&m.ID, &fromUser, &toUser, &m.Content, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.UserID = fromUser
		m.Username = "" // optional
		msgs = append(msgs, m)
	}
	return msgs, nil
}

// ListChatUsers returns users with presence and last message timestamps for chat roster.
func ListChatUsers(db *sql.DB, currentUserID int) ([]models.ChatUser, error) {
	query := `
		SELECT
			u.id,
			u.username,
			COALESCE(p.status, 'offline') AS status,
			MAX(datetime(m.created_at)) AS last_message_at
		FROM users u
		LEFT JOIN presence p ON p.user_id = u.id
		LEFT JOIN messages m ON ((m.from_user = u.id AND m.to_user = ?) OR (m.from_user = ? AND m.to_user = u.id))
		WHERE u.id != ?
		GROUP BY u.id
		ORDER BY
			CASE WHEN MAX(m.created_at) IS NULL THEN 1 ELSE 0 END,
			datetime(MAX(m.created_at)) DESC,
			u.username COLLATE NOCASE ASC
	`
	rows, err := db.Query(query, currentUserID, currentUserID, currentUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.ChatUser
	for rows.Next() {
		var user models.ChatUser
		var lastMessageAt sql.NullString
		if err := rows.Scan(&user.ID, &user.Username, &user.Status, &lastMessageAt); err != nil {
			return nil, err
		}
		if lastMessageAt.Valid {
			user.LastMessageAt = lastMessageAt.String
		}
		out = append(out, user)
	}
	return out, nil
}

// CountMessagesBetween returns total number of messages between two users
func CountMessagesBetween(db *sql.DB, userA int, userB int) (int, error) {
	query := `SELECT COUNT(*) FROM messages WHERE (from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?)`
	var count int
	err := db.QueryRow(query, userA, userB, userB, userA).Scan(&count)
	return count, err
}

// GetPostCategories returns category names for a specific post
func GetPostCategories(db *sql.DB, postID int) ([]string, error) {
	query := `
		SELECT c.name 
		FROM categories c
		JOIN post_categories pc ON c.id = pc.category_id
		WHERE pc.post_id = ?
	`

	rows, err := db.Query(query, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		categories = append(categories, name)
	}

	return categories, nil
}

// GetPostLikesCount returns the count of likes and dislikes for a post
func GetPostLikesCount(db *sql.DB, postID int) (int, int, error) {
	var likes, dislikes int

	// Count likes
	err := db.QueryRow("SELECT COUNT(*) FROM post_likes WHERE post_id = ? AND is_like = 1", postID).Scan(&likes)
	if err != nil {
		return 0, 0, err
	}

	// Count dislikes
	err = db.QueryRow("SELECT COUNT(*) FROM post_likes WHERE post_id = ? AND is_like = 0", postID).Scan(&dislikes)
	if err != nil {
		return 0, 0, err
	}

	return likes, dislikes, nil
}

// GetPostLikesDislikesCount is an alias for GetPostLikesCount for consistency
func GetPostLikesDislikesCount(db *sql.DB, postID int) (int, int, error) {
	return GetPostLikesCount(db, postID)
}

// GetCategoriesForPost returns the category names for a specific post
func GetCategoriesForPost(db *sql.DB, postID int) ([]string, error) {
	rows, err := db.Query(`
		SELECT c.name 
		FROM categories c 
		JOIN post_categories pc ON c.id = pc.category_id 
		WHERE pc.post_id = ?
	`, postID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var categories []string
	for rows.Next() {
		var categoryName string
		if err := rows.Scan(&categoryName); err != nil {
			return nil, err
		}
		categories = append(categories, categoryName)
	}

	return categories, nil
}

// GetCommentCount returns the number of comments for a specific post
func GetCommentCount(db *sql.DB, postID int) (int, error) {
	var count int
	err := db.QueryRow("SELECT COUNT(*) FROM comments WHERE post_id = ?", postID).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// GetUserSessions возвращает все активные сессии пользователя
func GetUserSessions(db *sql.DB, userID int) ([]struct {
	ID        string
	CreatedAt time.Time
	ExpiresAt time.Time
}, error) {
	query := "SELECT id, created_at, expires_at FROM sessions WHERE user_id = ? AND datetime(expires_at) > datetime('now') ORDER BY created_at DESC"

	rows, err := db.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []struct {
		ID        string
		CreatedAt time.Time
		ExpiresAt time.Time
	}

	for rows.Next() {
		var session struct {
			ID        string
			CreatedAt time.Time
			ExpiresAt time.Time
		}
		var createdAtStr, expiresAtStr string

		err := rows.Scan(&session.ID, &createdAtStr, &expiresAtStr)
		if err != nil {
			return nil, err
		}

		// Парсим даты
		session.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAtStr)
		session.ExpiresAt, _ = time.Parse("2006-01-02 15:04:05", expiresAtStr)

		sessions = append(sessions, session)
	}

	return sessions, nil
}

// TerminateUserSession завершает конкретную сессию пользователя
func TerminateUserSession(db *sql.DB, sessionID string, userID int) error {
	_, err := db.Exec("DELETE FROM sessions WHERE id = ? AND user_id = ?", sessionID, userID)
	return err
}

// TerminateAllOtherSessions завершает все сессии пользователя кроме текущей
func TerminateAllOtherSessions(db *sql.DB, currentSessionID string, userID int) error {
	_, err := db.Exec("DELETE FROM sessions WHERE user_id = ? AND id != ?", userID, currentSessionID)
	return err
}

func EmailExists(db *sql.DB, email string) (bool, error) {
	var count int
	err := db.QueryRow(
		"SELECT COUNT(*) FROM users WHERE LOWER(email) = LOWER(?)",
		email,
	).Scan(&count)
	return count > 0, err
}

func UsernameExists(db *sql.DB, username string) (bool, error) {
	var count int
	err := db.QueryRow(
		"SELECT COUNT(*) FROM users WHERE LOWER(username) = LOWER(?)",
		username,
	).Scan(&count)
	return count > 0, err
}

func AddCategoryToPost(db *sql.DB, postID, categoryID int) error {
	_, err := db.Exec(`
		INSERT OR IGNORE INTO post_categories (post_id, category_id)
		VALUES (?, ?)
	`, postID, categoryID)
	return err
}
