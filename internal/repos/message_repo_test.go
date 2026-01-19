package repos

import (
	"database/sql"
	"testing"

	"real-time-forum/internal/database"

	_ "github.com/mattn/go-sqlite3"
)

func setupDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	// Run migrations to create required tables
	if err := database.RunMigrations(db); err != nil {
		t.Fatalf("run migrations: %v", err)
	}
	return db
}

func TestMessageRepo_InsertAndQuery(t *testing.T) {
	db := setupDB(t)
	defer db.Close()

	adapter := NewSQLiteAdapter(db)

	// insert users
	res, err := db.Exec("INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)", "a@a", "a", "x")
	if err != nil {
		t.Fatalf("insert user a: %v", err)
	}
	idA, _ := res.LastInsertId()
	res2, err := db.Exec("INSERT INTO users (email, username, password_hash) VALUES (?, ?, ?)", "b@b", "b", "x")
	if err != nil {
		t.Fatalf("insert user b: %v", err)
	}
	idB, _ := res2.LastInsertId()

	// use repo
	_, _, err = adapter.Insert(int(idA), int(idB), "hello")
	if err != nil {
		t.Fatalf("Insert failed: %v", err)
	}

	msgs, err := adapter.GetBetween(int(idA), int(idB), 0, 10)
	if err != nil {
		t.Fatalf("GetBetween failed: %v", err)
	}
	if len(msgs) != 1 {
		t.Fatalf("expected 1 message, got %d", len(msgs))
	}

	count, err := adapter.CountBetween(int(idA), int(idB))
	if err != nil {
		t.Fatalf("CountBetween failed: %v", err)
	}
	if count != 1 {
		t.Fatalf("expected count 1, got %d", count)
	}
}
