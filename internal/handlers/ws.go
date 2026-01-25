package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"sync"
	"time"

	"real-time-forum/internal/database"
	"real-time-forum/internal/middleware"
	"real-time-forum/internal/models"

	"github.com/gorilla/websocket"
)

type WSMessage map[string]interface{}

type Client struct {
	userID int
	conn   *websocket.Conn
	send   chan WSMessage
}

type Hub struct {
	mu       sync.RWMutex
	clients  map[int]map[*Client]struct{} // userID -> connections
	presence map[int]models.User          // online users only

	broadcast  chan WSMessage // chat messages
	presenceCh chan WSMessage // presence events (no drop)

	nextGuestID int
	disconnect  chan int
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[int]map[*Client]struct{}),
		presence:    make(map[int]models.User),
		broadcast:   make(chan WSMessage, 64),
		presenceCh:  make(chan WSMessage, 64),
		nextGuestID: -1,
		disconnect:  make(chan int),
	}
}

/* ===================== CLIENT MGMT ===================== */

func (h *Hub) AddClient(c *Client, nickname string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, exists := h.clients[c.userID]
	if !exists {
		set = make(map[*Client]struct{})
		h.clients[c.userID] = set
	}

	set[c] = struct{}{}

	if c.userID > 0 && !exists {
		h.presence[c.userID] = models.User{
			ID:       c.userID,
			Username: nickname,
		}
		return true
	}
	return false
}

func (h *Hub) RemoveClient(c *Client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()

	set, ok := h.clients[c.userID]
	if !ok {
		return false
	}

	delete(set, c)
	if len(set) == 0 {
		delete(h.clients, c.userID)
		if c.userID > 0 {
			delete(h.presence, c.userID)
			return true
		}
	}
	return false
}

func (h *Hub) allocateGuestID() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	id := h.nextGuestID
	h.nextGuestID--
	return id
}

/* ===================== PRESENCE ===================== */

func (h *Hub) GetOnlineUsers() []map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var list []map[string]interface{}
	for id, u := range h.presence {
		list = append(list, map[string]interface{}{
			"user_id":  id,
			"nickname": u.Username,
		})
	}
	return list
}

func (h *Hub) IsUserOnline(userID int) bool {
	h.mu.RLock()
	defer h.mu.RUnlock()
	_, ok := h.presence[userID]
	return ok
}

// Broadcast sends a generic event to all connected clients (non-presence).
func (h *Hub) Broadcast(msg WSMessage) {
	select {
	case h.broadcast <- msg:
	default:
		// drop if buffer is full to avoid blocking
	}
}

func (h *Hub) BroadcastPresence(userID int, nickname string, status string) {
	msg := WSMessage{
		"type":    "presence",
		"user_id": userID,
		"status":  status,
	}
	if nickname != "" {
		msg["nickname"] = nickname
	}

	h.presenceCh <- msg // presence НЕ дропаем
}

/* ===================== HUB RUN ===================== */

func (h *Hub) Run() {
	for {
		select {
		case msg := <-h.broadcast:
			h.dispatch(msg)
		case msg := <-h.presenceCh:
			h.dispatch(msg)
		case userID := <-h.disconnect: // Слушаем сигналы на отключение
			h.forceDisconnect(userID)
		}
	}
}

func (h *Hub) forceDisconnect(userID int) {
	h.mu.Lock()
	defer h.mu.Unlock()

	// Находим все соединения (вкладки) конкретного пользователя
	if connections, exists := h.clients[userID]; exists {
		for client := range connections {
			// Закрытие соединения спровоцирует ошибку в readerLoop
			// и автоматически запустит ваш defer с логикой offline
			client.conn.Close()
		}
		log.Printf("Forced disconnect for user %d (all tabs closed)", userID)
	}
}

func (h *Hub) dispatch(msg WSMessage) {
	h.mu.RLock()
	clients := make([]*Client, 0)
	for _, set := range h.clients {
		for c := range set {
			clients = append(clients, c)
		}
	}
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.send <- msg:
		default:
			// не блокируемся
		}
	}
}

/* ===================== WS SETUP ===================== */

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	userID, err := middleware.GetUserIDFromSession(r, db)
	authenticated := err == nil

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("ws upgrade error:", err)
		return
	}

	nickname := ""
	if authenticated {
		if user, _ := database.GetUserByID(db, userID); user != nil {
			nickname = user.Username
		}
	} else {
		userID = h.allocateGuestID()
	}

	client := &Client{
		userID: userID,
		conn:   conn,
		send:   make(chan WSMessage, 16),
	}

	first := h.AddClient(client, nickname)

	log.Printf("WS connect user=%d", userID)

	if authenticated && first {
		db.Exec(
			"INSERT OR REPLACE INTO presence (user_id, status, nickname, updated_at) VALUES (?, 'online', ?, datetime('now'))",
			userID, nickname,
		)

		h.BroadcastPresence(userID, nickname, "online")

		h.Broadcast(WSMessage{
			"type":     "user_created",
			"user_id":  userID,
			"username": nickname,
		})
	}

	// INIT всегда с актуальным presence
	client.conn.WriteJSON(WSMessage{
		"type":         "init",
		"user_id":      userID,
		"online_users": h.GetOnlineUsers(),
	})

	if authenticated && first {
		h.BroadcastPresence(userID, nickname, "online")
	}

	go h.writerLoop(client)
	h.readerLoop(client, db)
}

/* ===================== LOOPS ===================== */

func (h *Hub) writerLoop(c *Client) {
	ticker := time.NewTicker(25 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			if !ok {
				return
			}
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteJSON(msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (h *Hub) readerLoop(c *Client, db *sql.DB) {
	defer func() {
		offline := h.RemoveClient(c)
		if c.userID > 0 && offline {
			db.Exec("UPDATE presence SET status='offline', updated_at=datetime('now') WHERE user_id=?", c.userID)
			h.BroadcastPresence(c.userID, "", "offline")
		}
		c.conn.Close()
	}()

	c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
		return nil
	})

	for {
		var msg WSMessage
		if err := c.conn.ReadJSON(&msg); err != nil {
			return
		}

		if c.userID <= 0 {
			select {
			case c.send <- WSMessage{"type": "error", "message": "Unauthorized"}:
			default:
			}
			continue
		}

		if msg["type"] == "message" {
			toID, ok := parseUserID(msg["to"])
			content, _ := msg["content"].(string)
			if !ok || content == "" {
				continue
			}

			if _, err := database.GetUserByID(db, toID); err != nil {
				continue
			}

			id, createdAt, err := database.InsertMessage(db, c.userID, toID, content)
			if err != nil {
				continue
			}

			payload := WSMessage{
				"type":       "message",
				"id":         id,
				"from":       c.userID,
				"to":         toID,
				"content":    content,
				"created_at": createdAt,
			}

			h.mu.RLock()
			for rc := range h.clients[toID] {
				select {
				case rc.send <- payload:
				default:
				}
			}
			h.mu.RUnlock()

			select {
			case c.send <- payload:
			default:
			}
		}
	}
}

/* ===================== UTILS ===================== */

func parseUserID(v interface{}) (int, bool) {
	switch x := v.(type) {
	case float64:
		return int(x), true
	case string:
		id, err := strconv.Atoi(x)
		return id, err == nil
	case json.Number:
		id, err := x.Int64()
		return int(id), err == nil
	default:
		return 0, false
	}
}
