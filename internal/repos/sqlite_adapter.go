package repos

import (
	"database/sql"
	"fmt"
	"real-time-forum/internal/database"
	"real-time-forum/internal/models"
)

type SQLiteAdapter struct {
	DB *sql.DB
}

func NewSQLiteAdapter(db *sql.DB) *SQLiteAdapter {
	return &SQLiteAdapter{DB: db}
}

// UserRepo
func (s *SQLiteAdapter) GetByID(id int) (*models.User, error) {
	return database.GetUserByID(s.DB, id)
}

func (s *SQLiteAdapter) GetByUsername(username string) (*models.User, error) {
	return database.GetUserByUsername(s.DB, username)
}

// MessageRepo
func (s *SQLiteAdapter) Insert(from int, to int, content string) (int64, string, error) {
	return database.InsertMessage(s.DB, from, to, content)
}

func (s *SQLiteAdapter) GetBetween(a int, b int, offset int, limit int) ([]models.Comment, error) {
	return database.GetMessagesBetween(s.DB, a, b, offset, limit)
}

func (s *SQLiteAdapter) CountBetween(a int, b int) (int, error) {
	return database.CountMessagesBetween(s.DB, a, b)
}

// PresenceService
func (s *SQLiteAdapter) SetOnline(userID int, nickname string) error {
	_, err := s.DB.Exec("INSERT OR REPLACE INTO presence (user_id, status, nickname, updated_at) VALUES (?, 'online', ?, datetime('now'))", userID, nickname)
	return err
}

func (s *SQLiteAdapter) SetOffline(userID int) error {
	_, err := s.DB.Exec("UPDATE presence SET status='offline', updated_at = datetime('now') WHERE user_id = ?", userID)
	return err
}

func (s *SQLiteAdapter) ListOnline() ([]map[string]interface{}, error) {
	rows, err := s.DB.Query("SELECT user_id, nickname FROM presence WHERE status = 'online'")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]interface{}
	for rows.Next() {
		var id int
		var nick sql.NullString
		if err := rows.Scan(&id, &nick); err != nil {
			return nil, err
		}
		item := map[string]interface{}{"user_id": fmt.Sprintf("%d", id)}
		if nick.Valid {
			item["nickname"] = nick.String
		}
		out = append(out, item)
	}
	return out, nil
}
