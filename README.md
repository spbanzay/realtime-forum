# Real-Time Forum

Веб-приложение форума с поддержкой приватных сообщений в реальном времени.

## 🔒 Безопасность

Проект реализует современные практики безопасности:

- **Bcrypt** для хеширования паролей (cost=10)
- Безопасное хранение в SQLite (только хеши, никогда сырые пароли)
- Валидация на стороне сервера
- Защита сессий

📖 **Документация:**
- [Быстрый старт по паролям](docs/PASSWORD_QUICKSTART.md) - краткая справка
- [Полная документация по безопасности паролей](docs/PASSWORD_SECURITY.md)

## Быстрый пример

### Регистрация пользователя
```go
import "real-time-forum/internal/utils"

// Хеширование пароля перед сохранением
hash, err := utils.HashPassword(password)
db.Exec("INSERT INTO users (..., password_hash) VALUES (..., ?)", hash)
```

### Логин
```go
// Проверка пароля при входе
var hash string
db.QueryRow("SELECT password_hash FROM users WHERE username = ?", username).Scan(&hash)

if err := utils.VerifyPassword(hash, password); err != nil {
    // Неверный пароль
}
```

---

# API & WebSocket Contracts
---

## PRIVATE MESSAGES — HTTP API

### GET `/api/messages`

**Query params**
```
user_id=UUID&offset=0&limit=10
```

**Response**
```json
{
  "messages": [
    {
      "id": 1,
      "from": "uuid1",
      "to": "uuid2",
      "content": "hello",
      "created_at": "2025-01-14T12:30:00Z"
    }
  ],
  "has_more": true
}
```

---

## WEBSOCKET CONTRACTS

### WS `/ws`

Server endpoint: ws://localhost:8080/ws (requires session cookie created by login). See `internal/handlers/ws.go` for server behavior.

HTTP API:

GET /api/messages?user_id=UUID&offset=0&limit=10

Requires authentication (session cookie). Returns JSON {messages: [...], has_more: true|false} matching contract in this README.

---

### INIT (server → client)
```json
{
  "type": "init",
  "user_id": "uuid",
  "online_users": [
    {
      "user_id": "uuid2",
      "nickname": "alice"
    }
  ]
}
```

---

### PRESENCE (server → client)
```json
{
  "type": "presence",
  "user_id": "uuid",
  "nickname": "alice",
  "status": "online"
}
```

```json
{
  "type": "presence",
  "user_id": "uuid",
  "status": "offline"
}
```

---

### SEND MESSAGE (client → server)
```json
{
  "type": "message",
  "to": "uuid",
  "content": "hello"
}
```

---

### NEW MESSAGE (server → client)
```json
{
  "type": "message",
  "id": 123,
  "from": "uuid",
  "to": "uuid",
  "content": "hello",
  "created_at": "2025-01-14T12:31:00Z"
}
```

---

### WS ERROR
```json
{
  "type": "error",
  "message": "User offline"
}
```

___