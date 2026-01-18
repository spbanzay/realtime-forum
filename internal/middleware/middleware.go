package middleware

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"
)

type contextKey string

const UserIDKey contextKey = "userID"

// GetUserIDFromSession gets user ID from session cookie
func GetUserIDFromSession(r *http.Request, db *sql.DB) (int, error) {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		log.Printf("DEBUG: No session cookie found: %v", err)
		return 0, fmt.Errorf("no session")
	}

	log.Printf("DEBUG: Checking session with ID: %s", cookie.Value)

	// Берём unix timestamp из expires_at - это надёжнее для сравнения
	query := "SELECT user_id, strftime('%s', expires_at) FROM sessions WHERE id = ?"
	var userID int
	var expiresUnix sql.NullString
	err = db.QueryRow(query, cookie.Value).Scan(&userID, &expiresUnix)
	if err != nil {
		log.Printf("DEBUG: Session not found or error: %v", err)
		return 0, fmt.Errorf("invalid session")
	}

	log.Printf("DEBUG: Session found for user %d, expires: %s", userID, expiresUnix.String)

	if !expiresUnix.Valid || expiresUnix.String == "" {
		// некорректный expires_at — удалим сессию на всякий случай
		db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
		return 0, fmt.Errorf("invalid session")
	}

	// парсим unix seconds
	expSec, parseErr := strconv.ParseInt(expiresUnix.String, 10, 64)
	if parseErr != nil {
		// на случай непредвиденного формата — удаляем
		db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
		return 0, fmt.Errorf("invalid session")
	}

	if time.Now().Unix() > expSec {
		// сессия просрочена
		db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
		return 0, fmt.Errorf("session expired")
	}

	return userID, nil
}

// GetUserIDFromContextOrSession tries to get userID from request context first (set by RequireAuth).
// If not present, falls back to GetUserIDFromSession (which checks session cookie and DB).
func GetUserIDFromContextOrSession(r *http.Request, db *sql.DB) (int, error) {
	if v := r.Context().Value(UserIDKey); v != nil {
		if id, ok := v.(int); ok && id != 0 {
			return id, nil
		}
	}
	return GetUserIDFromSession(r, db)
}

// IsUserLoggedIn checks if user is logged in
func IsUserLoggedIn(r *http.Request, db *sql.DB) bool {
	_, err := GetUserIDFromSession(r, db)
	return err == nil
}

// RequireAuth is middleware that requires authentication
func RequireAuth(next http.HandlerFunc, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, err := GetUserIDFromSession(r, db)
		if err != nil {
			http.Redirect(w, r, "/login", http.StatusSeeOther)
			return
		}

		// кладём userID в контекст
		ctx := context.WithValue(r.Context(), UserIDKey, userID)

		// передаём дальше с новым контекстом
		next.ServeHTTP(w, r.WithContext(ctx))
	}
}

// CreateSession создаёт новую сессию и удаляет все старые сессии этого пользователя
func CreateSession(w http.ResponseWriter, db *sql.DB, userID int) error {
	log.Printf("DEBUG: CreateSession started for user %d", userID)
	// Стартуем транзакцию для атомарности операций
	tx, err := db.Begin()
	if err != nil {
		log.Printf("ERROR: Failed to start transaction for user %d: %v", userID, err)
		return fmt.Errorf("failed to start transaction: %v", err)
	}
	defer tx.Rollback() // безопасный откат если что-то пойдет не так

	// Удаляем ВСЕ существующие сессии этого пользователя
	log.Printf("DEBUG: Deleting all old sessions for user %d", userID)
	result, err := tx.Exec("DELETE FROM sessions WHERE user_id = ?", userID)
	if err != nil {
		log.Printf("ERROR: Failed to delete old sessions for user %d: %v", userID, err)
		return fmt.Errorf("failed to delete old sessions: %v", err)
	}

	if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("DEBUG: Deleted %d old sessions for user %d", rows, userID)
	} else {
		log.Printf("DEBUG: No old sessions found for user %d", userID)
	}

	// генерируем случайный ID для новой сессии
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		log.Printf("ERROR: Failed to generate session ID for user %d: %v", userID, err)
		return fmt.Errorf("failed to generate session ID: %v", err)
	}
	sessionID := hex.EncodeToString(b)
	log.Printf("DEBUG: Generated session ID for user %d: %s", userID, sessionID)

	// срок действия 1 день
	expiresAt := time.Now().Add(24 * time.Hour)

	// вставляем новую сессию
	log.Printf("DEBUG: Inserting new session for user %d", userID)
	_, err = tx.Exec(
		"INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, datetime(?), datetime('now'))",
		sessionID, userID, expiresAt.Format("2006-01-02 15:04:05"),
	)
	if err != nil {
		log.Printf("ERROR: Failed to insert session for user %d: %v", userID, err)
		return fmt.Errorf("failed to create session: %v", err)
	}

	// Коммитим транзакцию
	if err := tx.Commit(); err != nil {
		log.Printf("ERROR: Failed to commit transaction for user %d: %v", userID, err)
		return fmt.Errorf("failed to commit transaction: %v", err)
	}

	// устанавливаем cookie
	cookie := &http.Cookie{
		Name:     "session_id",
		Value:    sessionID,
		Expires:  expiresAt,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		// cookie.Secure = true // включи на HTTPS
	}
	http.SetCookie(w, cookie)
	log.Printf("DEBUG: Cookie set for user %d, session expires at: %v", userID, expiresAt)

	log.Printf("DEBUG: CreateSession completed successfully for user %d", userID)
	return nil
}

// CleanupExpiredSessions удаляет все просроченные сессии
func CleanupExpiredSessions(db *sql.DB) error {
	result, err := db.Exec("DELETE FROM sessions WHERE datetime(expires_at) <= datetime('now')")
	if err != nil {
		return err
	}

	if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("Cleaned up %d expired sessions", rows)
	}
	return nil
}

// LogoutUser удаляет текущую сессию пользователя
func LogoutUser(w http.ResponseWriter, r *http.Request, db *sql.DB) error {
	cookie, err := r.Cookie("session_id")
	if err != nil {
		// Если куки нет, считаем, что пользователь уже вышел
		log.Println("Logout attempted, but no session cookie found.")
		return fmt.Errorf("no session cookie")
	}

	// Удаляем сессию из базы данных
	result, err := db.Exec("DELETE FROM sessions WHERE id = ?", cookie.Value)
	if err != nil {
		log.Printf("ERROR: Failed to delete session from DB: %v", err)
		// Продолжаем удалять куки, даже если БД дала сбой, чтобы очистить браузер
	} else if rows, _ := result.RowsAffected(); rows > 0 {
		log.Printf("User logged out, session deleted from DB")
	}

	// Удаляем cookie (MaxAge: -1 или Expires: time.Unix(0, 0) для немедленного удаления)
	http.SetCookie(w, &http.Cookie{
		Name:     "session_id",
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1, // <--- ДОБАВЛЕНО для немедленного удаления
		HttpOnly: true,
	})

	return nil
}
