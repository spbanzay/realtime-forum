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

// message types for websocket contract
type WSMessage map[string]interface{}

// Client represents a websocket connection
type Client struct {
	userID int
	conn   *websocket.Conn
	send   chan WSMessage
}

// Hub maintains active clients and broadcasts
type Hub struct {
	mu      sync.RWMutex
	clients map[int]*Client // map userID -> client
	// presence info cached in memory
	presence map[int]models.User
	// broadcast channel for safe message dispatch
	broadcast chan WSMessage
}

func NewHub() *Hub {
	return &Hub{
		clients:   make(map[int]*Client),
		presence:  make(map[int]models.User),
		broadcast: make(chan WSMessage, 64),
	}
}

func (h *Hub) AddClient(c *Client, nickname string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[c.userID] = c
	// update presence
	h.presence[c.userID] = models.User{ID: c.userID, Username: nickname}
}

func (h *Hub) RemoveClient(userID int) {
	h.mu.Lock()
	defer h.mu.Unlock()
	delete(h.clients, userID)
	delete(h.presence, userID)
}

func (h *Hub) GetOnlineUsers() []map[string]interface{} {
	h.mu.RLock()
	defer h.mu.RUnlock()
	var list []map[string]interface{}
	for id, u := range h.presence {
		list = append(list, map[string]interface{}{"user_id": id, "nickname": u.Username})
	}
	return list
}

func (h *Hub) BroadcastPresence(userID int, nickname string, status string) {
	msg := WSMessage{"type": "presence", "user_id": userID, "status": status}
	if nickname != "" {
		msg["nickname"] = nickname
	}
	// send via broadcast channel to let Run() handle mutex and iteration
	select {
	case h.broadcast <- msg:
	default:
		// drop if broadcast channel is full to avoid blocking
	}
}

func (h *Hub) Broadcast(msg WSMessage) {
	select {
	case h.broadcast <- msg:
	default:
		// drop if broadcast channel is full to avoid blocking
	}
}

// Run listens on broadcast channel and dispatches messages to clients safely.
func (h *Hub) Run() {
	for msg := range h.broadcast {
		// Capture clients under read lock, then send without holding lock to avoid blocking other ops
		h.mu.RLock()
		clients := make([]*Client, 0, len(h.clients))
		for _, c := range h.clients {
			clients = append(clients, c)
		}
		h.mu.RUnlock()

		for _, c := range clients {
			select {
			case c.send <- msg:
			default:
				// drop if client's send buffer is full
			}
		}
	}
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Если вы запускаете всё на одном порту,
		// Gorilla часто позволяет подключиться без лишних проверок.
		// Но для надежности на локалхосте проще всего вернуть true.
		return true
	},
}

// ServeWS handles websocket connections
func (h *Hub) ServeWS(w http.ResponseWriter, r *http.Request, db *sql.DB) {
	// authenticate
	userID, err := middleware.GetUserIDFromSession(r, db)
	if err != nil {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	// fetch user nickname
	user, _ := database.GetUserByID(db, userID)
	nickname := ""
	if user != nil {
		nickname = user.Username
	}

	client := &Client{userID: userID, conn: conn, send: make(chan WSMessage, 16)}
	h.AddClient(client, nickname)

	log.Printf("WebSocket: user %s (ID:%d) connected", nickname, userID)

	// set presence online in DB presence table
	_, _ = db.Exec("INSERT OR REPLACE INTO presence (user_id, status, nickname, updated_at) VALUES (?, 'online', ?, datetime('now'))", userID, nickname)
	// send INIT
	initMsg := WSMessage{"type": "init", "user_id": userID, "online_users": h.GetOnlineUsers()}
	client.conn.WriteJSON(initMsg)
	// broadcast presence online
	h.BroadcastPresence(userID, nickname, "online")

	// start writer and reader
	go h.writerLoop(client)
	h.readerLoop(client, db)
}

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
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
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
		// on disconnect
		h.RemoveClient(c.userID)
		db.Exec("UPDATE presence SET status='offline', updated_at = datetime('now') WHERE user_id = ?", c.userID)
		h.BroadcastPresence(c.userID, "", "offline")
		log.Printf("WebSocket: user ID:%d disconnected", c.userID)
		c.conn.Close()
	}()

	// Set up ping/pong handlers
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

		// handle incoming messages
		if t, ok := msg["type"].(string); ok && t == "message" {
			// expect fields: to, content
			toID, ok := parseUserID(msg["to"])
			content, _ := msg["content"].(string)
			// basic validation
			if !ok || content == "" {
				c.send <- WSMessage{"type": "error", "message": "Invalid recipient or empty content"}
				continue
			}

			// check recipient exists
			if _, err := database.GetUserByID(db, toID); err != nil {
				c.send <- WSMessage{"type": "error", "message": "Recipient not found"}
				continue
			}

			// allow messaging only to online users
			h.mu.RLock()
			recipient, recipientOnline := h.clients[toID]
			h.mu.RUnlock()
			if !recipientOnline {
				c.send <- WSMessage{"type": "error", "message": "User offline"}
				continue
			}

			// store message
			mid, createdAt, err := database.InsertMessage(db, c.userID, toID, content)
			if err != nil {
				c.send <- WSMessage{"type": "error", "message": "Failed to save message"}
				continue
			}

			createdAtRFC3339 := time.Now().UTC().Format(time.RFC3339)
			if parsedTime, err := time.Parse("2006-01-02 15:04:05", createdAt); err == nil {
				createdAtRFC3339 = parsedTime.UTC().Format(time.RFC3339)
			}

			// prepare new message payload
			newMsg := WSMessage{
				"type":       "message",
				"id":         mid,
				"from":       c.userID,
				"to":         toID,
				"content":    content,
				"created_at": createdAtRFC3339,
			}

			// send to recipient if online
			if recipientOnline {
				recipient.send <- newMsg
			}

			// send to sender (confirmation)
			c.send <- newMsg
		} else {
			// unknown type
			c.send <- WSMessage{"type": "error", "message": "Unknown message type"}
		}
	}
}

func parseUserID(value interface{}) (int, bool) {
	switch v := value.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	case int64:
		return int(v), true
	case json.Number:
		id, err := v.Int64()
		if err != nil {
			return 0, false
		}
		return int(id), true
	case string:
		if v == "" {
			return 0, false
		}
		id, err := strconv.Atoi(v)
		if err != nil {
			return 0, false
		}
		return id, true
	default:
		return 0, false
	}
}
