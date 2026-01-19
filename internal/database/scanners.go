package database

import (
	"database/sql"
	"log"
	"real-time-forum/internal/models"
)

// ScanPosts scans rows into []models.Post given a query rows that return
// columns: id, user_id, title, content, created_at, username (order used in current queries)
func ScanPosts(rows *sql.Rows) ([]models.Post, error) {
	defer rows.Close()
	var posts []models.Post
	for rows.Next() {
		var post models.Post
		if err := rows.Scan(&post.ID, &post.UserID, &post.Title, &post.Content, &post.CreatedAt, &post.Username); err != nil {
			return nil, err
		}
		posts = append(posts, post)
	}
	return posts, nil
}

// ScanComments scans rows into []models.Comment expecting columns: id, post_id, user_id, content, created_at, username
func ScanComments(rows *sql.Rows) ([]models.Comment, error) {
	defer rows.Close()
	var comments []models.Comment
	for rows.Next() {
		var c models.Comment
		if err := rows.Scan(&c.ID, &c.PostID, &c.UserID, &c.Content, &c.CreatedAt, &c.Username); err != nil {
			log.Printf("ScanComments error: %v", err)
			return nil, err
		}
		comments = append(comments, c)
	}
	return comments, nil
}
