package repos

import (
	"real-time-forum/internal/models"
)

// UserRepo defines methods to access users
type UserRepo interface {
	GetByID(id int) (*models.User, error)
	GetByUsername(username string) (*models.User, error)
}

// MessageRepo defines methods to access messages
type MessageRepo interface {
	Insert(from int, to int, content string) (int64, string, error)
	GetBetween(a int, b int, offset int, limit int) ([]models.Comment, error)
	CountBetween(a int, b int) (int, error)
}

// PresenceService provides presence-related operations
type PresenceService interface {
	SetOnline(userID int, nickname string) error
	SetOffline(userID int) error
	ListOnline() ([]map[string]interface{}, error)
}

// Repos groups repository interfaces for convenience
type Repos struct {
	Users    UserRepo
	Messages MessageRepo
	Presence PresenceService
}
