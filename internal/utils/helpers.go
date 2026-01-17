package utils

import (
	"database/sql"
	"html/template"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// TemplateFuncs returns a map of custom template functions
func TemplateFuncs() template.FuncMap {
	return template.FuncMap{
		"formatTime": formatTime,
		"truncate":   truncate,
		"initials":   initials,
		"add":        add,
		"sub":        sub,
		"contains":   contains,
	}
}

// IsForeignKeyConstraintError checks if an error is a FOREIGN KEY constraint error
func IsForeignKeyConstraintError(err error) bool {
	if err == nil {
		return false
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "foreign key constraint failed") ||
		strings.Contains(errStr, "constraint failed")
}

// formatTime formats time in a readable format
func formatTime(t time.Time) string {
	return t.Format("2006-01-02 15:04")
}

// truncate truncates a string to the specified length
func truncate(s string, length int) string {
	if len(s) <= length {
		return s
	}
	return s[:length] + "..."
}

// initials returns the initials of a string
func initials(s string) string {
	if len(s) == 0 {
		return "?"
	}
	if len(s) <= 2 {
		return s
	}
	return s[:2]
}

// add adds two numbers
func add(a, b int) int {
	return a + b
}

// sub subtracts two numbers
func sub(a, b int) int {
	return a - b
}

// contains checks if a slice contains a specific element
func contains(slice []int, item int) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// ValidatePostData validates post data for validity
func ValidatePostData(title, content string) (bool, string) {
	// Trim spaces at the beginning and end
	title = strings.TrimSpace(title)
	content = strings.TrimSpace(content)

	// Check for empty strings
	if title == "" {
		return false, "Title cannot be empty"
	}

	if content == "" {
		return false, "Content cannot be empty"
	}

	// Check minimum title length
	if utf8.RuneCountInString(title) < 3 {
		return false, "Title must contain at least 3 characters"
	}
	// Check maximum title length
	if utf8.RuneCountInString(title) > 120 {
		return false, "Title cannot exceed 120 characters"
	}

	// Check minimum content length
	if utf8.RuneCountInString(content) < 10 {
		return false, "Content must contain at least 10 characters"
	}

	// Check maximum content length
	if utf8.RuneCountInString(content) > 5000 {
		return false, "Content cannot exceed 5000 characters"
	}

	return true, ""
}

// ValidateCompletePostData validates all post data including categories
func ValidateCompletePostData(title, content string, categories []string) (bool, string) {
	// First validate title and content
	if valid, err := ValidatePostData(title, content); !valid {
		return false, err
	}

	// Validate categories
	if len(categories) == 0 {
		return false, "Please select at least one category for your post"
	}

	// Check maximum number of categories (optional limit)
	if len(categories) > 5 {
		return false, "Cannot select more than 5 categories"
	}

	// Validate each category ID
	for _, cat := range categories {
		if strings.TrimSpace(cat) == "" {
			return false, "Invalid category selected"
		}
		// Additional validation: ensure it's a valid number
		if !isValidCategoryID(cat) {
			return false, "Invalid category ID format"
		}
	}

	return true, ""
}

// isValidCategoryID checks if category ID is a valid positive integer
func isValidCategoryID(categoryID string) bool {
	if categoryID == "" {
		return false
	}

	// Check if it contains only digits
	for _, char := range categoryID {
		if char < '0' || char > '9' {
			return false
		}
	}

	// Check it's not just "0" or starting with 0 (like "01", "02")
	if categoryID == "0" || (len(categoryID) > 1 && categoryID[0] == '0') {
		return false
	}

	return true
}

// ValidateCommentData validates comment data for validity
func ValidateCommentData(content string) (bool, string) {
	content = strings.TrimSpace(content)

	if content == "" {
		return false, "Comment content cannot be empty"
	}

	runeCount := utf8.RuneCountInString(content)
	if runeCount < 1 { // Изменили условие на 1 символ
		return false, "Comment content must contain at least 1 character"
	}

	if runeCount > 1000 {
		return false, "Comment content cannot exceed 1000 characters"
	}

	return true, ""
}

// IsValidURL checks if a string is a valid URL
func IsValidURL(str string) bool {
	if str == "" {
		return true // Empty string is considered valid (optional field)
	}

	// Simple URL validation - check for http/https prefix
	return strings.HasPrefix(str, "http://") || strings.HasPrefix(str, "https://")
}

// IsValidImageURL checks if a URL points to an image file
func IsValidImageURL(str string) bool {
	if str == "" {
		return true // Empty string is considered valid (optional field)
	}

	imageExtensions := []string{".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp", ".svg"}
	str = strings.ToLower(str)

	for _, ext := range imageExtensions {
		if strings.HasSuffix(str, ext) {
			return true
		}
	}

	return false
}

func IsValidEmail(email string) bool {
	re := regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)
	return re.MatchString(email)
}

func IsValidUsername(username string) bool {
	re := regexp.MustCompile(`^[\p{L}0-9 _-]{3,20}$`)
	return re.MatchString(username)
}

// FormatTimeAgo formats a time as "X ago" string
func FormatTimeAgo(t interface{}) string {
	var timeVal time.Time

	switch v := t.(type) {
	case time.Time:
		timeVal = v
	case *time.Time:
		if v != nil {
			timeVal = *v
		} else {
			return "unknown"
		}
	default:
		return "unknown"
	}

	return formatTime(timeVal)
}

func TogglePostReaction(
	db *sql.DB,
	userID int,
	postID int,
	isLike bool,
) (likes int, dislikes int, err error) {

	var current sql.NullBool

	err = db.QueryRow(`
		SELECT is_like FROM post_likes
		WHERE post_id = ? AND user_id = ?`,
		postID, userID,
	).Scan(&current)

	if err == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO post_likes (post_id, user_id, is_like)
			VALUES (?, ?, ?)`,
			postID, userID, isLike,
		)
	} else if err == nil {
		if current.Valid && current.Bool == isLike {
			_, err = db.Exec(`
				DELETE FROM post_likes
				WHERE post_id = ? AND user_id = ?`,
				postID, userID,
			)
		} else {
			_, err = db.Exec(`
				UPDATE post_likes
				SET is_like = ?
				WHERE post_id = ? AND user_id = ?`,
				isLike, postID, userID,
			)
		}
	}

	if err != nil {
		return
	}

	db.QueryRow(`
		SELECT
			COALESCE(SUM(CASE WHEN is_like = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_like = 0 THEN 1 ELSE 0 END), 0)
		FROM post_likes
		WHERE post_id = ?`,
		postID,
	).Scan(&likes, &dislikes)

	return
}

func ToggleCommentReaction(
	db *sql.DB,
	userID int,
	commentID int,
	isLike bool,
) (likes int, dislikes int, err error) {

	var current sql.NullBool

	err = db.QueryRow(`
		SELECT is_like FROM comment_likes
		WHERE comment_id = ? AND user_id = ?`,
		commentID, userID,
	).Scan(&current)

	if err == sql.ErrNoRows {
		_, err = db.Exec(`
			INSERT INTO comment_likes (comment_id, user_id, is_like)
			VALUES (?, ?, ?)`,
			commentID, userID, isLike,
		)
	} else if err == nil {
		if current.Valid && current.Bool == isLike {
			_, err = db.Exec(`
				DELETE FROM comment_likes
				WHERE comment_id = ? AND user_id = ?`,
				commentID, userID,
			)
		} else {
			_, err = db.Exec(`
				UPDATE comment_likes
				SET is_like = ?
				WHERE comment_id = ? AND user_id = ?`,
				isLike, commentID, userID,
			)
		}
	}

	if err != nil {
		return
	}

	db.QueryRow(`
		SELECT
			COALESCE(SUM(CASE WHEN is_like = 1 THEN 1 ELSE 0 END), 0),
			COALESCE(SUM(CASE WHEN is_like = 0 THEN 1 ELSE 0 END), 0)
		FROM comment_likes
		WHERE comment_id = ?`,
		commentID,
	).Scan(&likes, &dislikes)

	return
}
