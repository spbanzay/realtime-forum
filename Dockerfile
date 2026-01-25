# Stage 1: Build
FROM golang:1.22-alpine AS builder
RUN apk add --no-cache gcc musl-dev # Нужно для SQLite

WORKDIR /build
# Кэшируем зависимости
COPY go.mod go.sum ./
RUN go mod download

# Копируем код и собираем
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o forum ./cmd/main.go

# Stage 2: Final
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata

# Создаем пользователя
RUN adduser -D forumuser

WORKDIR /app

# Создаем папку для базы заранее и даем права пользователю
RUN mkdir ./data && chown forumuser:forumuser ./data

COPY --from=builder /build/forum .
COPY --from=builder /build/static ./static

USER forumuser
EXPOSE 8080
CMD ["./forum"]