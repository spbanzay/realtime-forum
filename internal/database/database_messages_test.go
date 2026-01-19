package database

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

func setupInMemoryDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory db: %v", err)
	}
	// Run minimal migrations needed
	if _, err := db.Exec(createUsersTable); err != nil {
		t.Fatalf("migrate users: %v", err)
	}
	if _, err := db.Exec(createMessagesTable); err != nil {
		t.Fatalf("migrate messages: %v", err)
	}
	return db
}

func TestInsertAndQueryMessages(t *testing.T) {
	db := setupInMemoryDB(t)
	defer db.Close()

	// create two users
	res, err := db.Exec("INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)", "a@example.com", "alice", "x")
	if err != nil {
		t.Fatalf("insert user a: %v", err)
	}
	idA, _ := res.LastInsertId()
	res2, err := db.Exec("INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)", "b@example.com", "bob", "x")
	if err != nil {
		t.Fatalf("insert user b: %v", err)
	}
	idB, _ := res2.LastInsertId()

	// insert messages
	if _, _, err := InsertMessage(db, int(idA), int(idB), "hello"); err != nil {
		t.Fatalf("InsertMessage failed: %v", err)
	}
	if _, _, err := InsertMessage(db, int(idB), int(idA), "hi"); err != nil {
		t.Fatalf("InsertMessage failed: %v", err)
	}

	msgs, err := GetMessagesBetween(db, int(idA), int(idB), 0, 10)
	if err != nil {
		t.Fatalf("GetMessagesBetween failed: %v", err)
	}
	if len(msgs) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(msgs))
	}

	count, err := CountMessagesBetween(db, int(idA), int(idB))
	if err != nil {
		t.Fatalf("CountMessagesBetween failed: %v", err)
	}
	if count != 2 {
		t.Fatalf("expected count 2, got %d", count)
	}
}
