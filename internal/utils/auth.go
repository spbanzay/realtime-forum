package utils

import (
	"errors"

	"golang.org/x/crypto/bcrypt"
)

// HashPassword создает bcrypt хеш из пароля
// Использует bcrypt.DefaultCost (10) для баланса безопасности и производительности
func HashPassword(password string) (string, error) {
	if password == "" {
		return "", errors.New("password cannot be empty")
	}

	// bcrypt имеет ограничение на длину пароля в 72 байта
	if len(password) > 72 {
		return "", errors.New("password too long (max 72 characters)")
	}

	hashedBytes, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}

	return string(hashedBytes), nil
}

// VerifyPassword проверяет, соответствует ли пароль сохраненному хешу
// Возвращает nil, если пароль верный, иначе ошибку
func VerifyPassword(hashedPassword, password string) error {
	if hashedPassword == "" {
		return errors.New("hashed password cannot be empty")
	}

	if password == "" {
		return errors.New("password cannot be empty")
	}

	return bcrypt.CompareHashAndPassword([]byte(hashedPassword), []byte(password))
}

// ValidatePasswordStrength проверяет надежность пароля перед хешированием
func ValidatePasswordStrength(password string) error {
	if password == "" {
		return errors.New("password cannot be empty")
	}

	if len(password) < 8 {
		return errors.New("password must be at least 8 characters long")
	}

	if len(password) > 72 {
		return errors.New("password is too long (maximum 72 characters)")
	}

	// Дополнительные проверки (по желанию)
	// Можно добавить проверку на наличие цифр, заглавных букв и т.д.

	return nil
}
