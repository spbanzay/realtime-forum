package utils

import (
	"strings"
	"testing"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldError bool
	}{
		{
			name:        "Valid password",
			password:    "mySecurePassword123",
			shouldError: false,
		},
		{
			name:        "Empty password",
			password:    "",
			shouldError: true,
		},
		{
			name:        "Minimum length password",
			password:    "12345678",
			shouldError: false,
		},
		{
			name:        "Maximum length password (72 chars)",
			password:    strings.Repeat("a", 72),
			shouldError: false,
		},
		{
			name:        "Too long password (73 chars)",
			password:    strings.Repeat("a", 73),
			shouldError: true,
		},
		{
			name:        "Password with special characters",
			password:    "P@ssw0rd!#$%",
			shouldError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashPassword(tt.password)

			if tt.shouldError {
				if err == nil {
					t.Errorf("HashPassword() expected error but got none for password: %s", tt.password)
				}
			} else {
				if err != nil {
					t.Errorf("HashPassword() unexpected error: %v", err)
				}
				if hash == "" {
					t.Error("HashPassword() returned empty hash")
				}
				// Проверяем, что хеш начинается с bcrypt префикса
				if !strings.HasPrefix(hash, "$2a$") && !strings.HasPrefix(hash, "$2b$") {
					t.Errorf("HashPassword() returned invalid bcrypt hash: %s", hash)
				}
				// Проверяем, что хеш не равен оригинальному паролю
				if hash == tt.password {
					t.Error("HashPassword() returned unhashed password")
				}
			}
		})
	}
}

func TestVerifyPassword(t *testing.T) {
	// Создаем правильный хеш для тестов
	correctPassword := "correctPassword123"
	correctHash, err := HashPassword(correctPassword)
	if err != nil {
		t.Fatalf("Failed to create test hash: %v", err)
	}

	tests := []struct {
		name           string
		hashedPassword string
		password       string
		shouldError    bool
	}{
		{
			name:           "Correct password",
			hashedPassword: correctHash,
			password:       correctPassword,
			shouldError:    false,
		},
		{
			name:           "Incorrect password",
			hashedPassword: correctHash,
			password:       "wrongPassword",
			shouldError:    true,
		},
		{
			name:           "Empty password",
			hashedPassword: correctHash,
			password:       "",
			shouldError:    true,
		},
		{
			name:           "Empty hash",
			hashedPassword: "",
			password:       "somePassword",
			shouldError:    true,
		},
		{
			name:           "Invalid hash format",
			hashedPassword: "not-a-valid-hash",
			password:       "somePassword",
			shouldError:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := VerifyPassword(tt.hashedPassword, tt.password)

			if tt.shouldError {
				if err == nil {
					t.Errorf("VerifyPassword() expected error but got none")
				}
			} else {
				if err != nil {
					t.Errorf("VerifyPassword() unexpected error: %v", err)
				}
			}
		})
	}
}

func TestValidatePasswordStrength(t *testing.T) {
	tests := []struct {
		name        string
		password    string
		shouldError bool
		errorMsg    string
	}{
		{
			name:        "Valid password",
			password:    "SecurePass123",
			shouldError: false,
		},
		{
			name:        "Empty password",
			password:    "",
			shouldError: true,
			errorMsg:    "cannot be empty",
		},
		{
			name:        "Too short (7 chars)",
			password:    "1234567",
			shouldError: true,
			errorMsg:    "at least 8 characters",
		},
		{
			name:        "Minimum valid (8 chars)",
			password:    "12345678",
			shouldError: false,
		},
		{
			name:        "Maximum valid (72 chars)",
			password:    strings.Repeat("a", 72),
			shouldError: false,
		},
		{
			name:        "Too long (73 chars)",
			password:    strings.Repeat("a", 73),
			shouldError: true,
			errorMsg:    "too long",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidatePasswordStrength(tt.password)

			if tt.shouldError {
				if err == nil {
					t.Errorf("ValidatePasswordStrength() expected error but got none for password: %s", tt.password)
				} else if tt.errorMsg != "" && !strings.Contains(strings.ToLower(err.Error()), strings.ToLower(tt.errorMsg)) {
					t.Errorf("ValidatePasswordStrength() error = %v, want error containing %v", err, tt.errorMsg)
				}
			} else {
				if err != nil {
					t.Errorf("ValidatePasswordStrength() unexpected error: %v", err)
				}
			}
		})
	}
}

func TestHashPasswordDeterminism(t *testing.T) {
	// bcrypt должен генерировать разные хеши для одного и того же пароля (из-за соли)
	password := "testPassword123"

	hash1, err1 := HashPassword(password)
	if err1 != nil {
		t.Fatalf("HashPassword() failed: %v", err1)
	}

	hash2, err2 := HashPassword(password)
	if err2 != nil {
		t.Fatalf("HashPassword() failed: %v", err2)
	}

	// Хеши должны быть разными (bcrypt использует случайную соль)
	if hash1 == hash2 {
		t.Error("HashPassword() should generate different hashes for the same password due to salt")
	}

	// Но оба хеша должны проверяться успешно
	if err := VerifyPassword(hash1, password); err != nil {
		t.Errorf("VerifyPassword() failed for hash1: %v", err)
	}

	if err := VerifyPassword(hash2, password); err != nil {
		t.Errorf("VerifyPassword() failed for hash2: %v", err)
	}
}

func TestPasswordWorkflow(t *testing.T) {
	// Тест полного цикла: валидация -> хеширование -> верификация
	password := "MySecurePassword123!"

	// 1. Валидация
	if err := ValidatePasswordStrength(password); err != nil {
		t.Fatalf("ValidatePasswordStrength() failed: %v", err)
	}

	// 2. Хеширование
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword() failed: %v", err)
	}

	// 3. Проверка правильного пароля
	if err := VerifyPassword(hash, password); err != nil {
		t.Errorf("VerifyPassword() failed for correct password: %v", err)
	}

	// 4. Проверка неправильного пароля
	if err := VerifyPassword(hash, "WrongPassword"); err == nil {
		t.Error("VerifyPassword() should fail for incorrect password")
	}
}
