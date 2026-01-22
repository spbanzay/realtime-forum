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
	clients map[int]map[*Client]struct{} // map userID (auth or guest) -> set of clients
	// presence info cached in memory
	presence map[int]models.User
	// broadcast channel for safe message dispatch
	broadcast chan WSMessage
	// monotonically decreasing guest IDs (-1, -2, ...)
	nextGuestID int
}

func NewHub() *Hub {
	return &Hub{
		clients:     make(map[int]map[*Client]struct{}),
		presence:    make(map[int]models.User),
		broadcast:   make(chan WSMessage, 64),
		nextGuestID: -1,
	}
}

func (h *Hub) AddClient(c *Client, nickname string) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	_, exists := h.clients[c.userID]
	if !exists {
		h.clients[c.userID] = make(map[*Client]struct{})
	}
	h.clients[c.userID][c] = struct{}{}
	if c.userID > 0 {
		if !exists {
			// update presence only for authenticated users, once
			h.presence[c.userID] = models.User{ID: c.userID, Username: nickname}
			return true
		}
	}
	return false
}

func (h *Hub) RemoveClient(c *Client) bool {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients, ok := h.clients[c.userID]
	if !ok {
		return false
	}
	delete(clients, c)
	if len(clients) == 0 {
		delete(h.clients, c.userID)
		if c.userID > 0 {
			delete(h.presence, c.userID)
			return true
		}
	}
	return false
}

// allocateGuestID returns a unique negative ID for unauthenticated viewers.
func (h *Hub) allocateGuestID() int {
	h.mu.Lock()
	defer h.mu.Unlock()
	id := h.nextGuestID
	h.nextGuestID--
	return id
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
		for _, clientSet := range h.clients {
			for c := range clientSet {
				clients = append(clients, c)
			}
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
	// authenticate (guests are allowed for realtime updates)
	userID, err := middleware.GetUserIDFromSession(r, db)
	authenticated := err == nil

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("ws upgrade error: %v", err)
		return
	}

	// fetch user nickname when authenticated
	nickname := ""
	if authenticated {
		user, _ := database.GetUserByID(db, userID)
		if user != nil {
			nickname = user.Username
		}
	} else {
		// assign a unique negative ID for guest viewers
		userID = h.allocateGuestID()
	}

	client := &Client{userID: userID, conn: conn, send: make(chan WSMessage, 16)}
	isFirstConnection := h.AddClient(client, nickname)

	log.Printf("WebSocket: user %s (ID:%d) connected", nickname, userID)

	if authenticated && isFirstConnection {
		// set presence online in DB presence table
		_, _ = db.Exec("INSERT OR REPLACE INTO presence (user_id, status, nickname, updated_at) VALUES (?, 'online', ?, datetime('now'))", userID, nickname)
	}

	// send INIT (even to guests so the client knows socket is ready)
	initMsg := WSMessage{"type": "init", "user_id": userID, "online_users": h.GetOnlineUsers()}
	client.conn.WriteJSON(initMsg)
	// broadcast presence online for authenticated users only
	if authenticated && isFirstConnection {
		h.BroadcastPresence(userID, nickname, "online")
	}

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
		offlineNow := h.RemoveClient(c)
		if c.userID > 0 && offlineNow {
			db.Exec("UPDATE presence SET status='offline', updated_at = datetime('now') WHERE user_id = ?", c.userID)
			h.BroadcastPresence(c.userID, "", "offline")
		}
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

		if c.userID <= 0 {
			// guests cannot send commands over websocket
			c.send <- WSMessage{"type": "error", "message": "Unauthorized websocket action"}
			continue
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

			// store message
			mid, createdAt, err := database.InsertMessage(db, c.userID, toID, content)
			if err != nil {
				c.send <- WSMessage{"type": "error", "message": "Failed to save message"}
				continue
			}

			createdAtRFC3339 := createdAt
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
			h.mu.RLock()
			recipientSet, ok := h.clients[toID]
			recipients := make([]*Client, 0, len(recipientSet))
			if ok {
				for recipient := range recipientSet {
					recipients = append(recipients, recipient)
				}
			}
			h.mu.RUnlock()
			for _, recipient := range recipients {
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
