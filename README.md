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