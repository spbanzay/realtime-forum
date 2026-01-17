package config

import "os"

type Config struct {
	// Server settings
	ServerPort string
	ServerHost string

	// Database
	DatabasePath string

	// Authentication
	SessionSecret string
	SessionMaxAge int

	// App settings
	SiteName     string
	PostsPerPage int
	DevMode      bool

	// Path to files
	TemplatesPath string
	StaticPath    string
	UploadsPath   string
}

func Load() *Config {
	return &Config{
		// Server
		ServerPort: getEnv("SERVER_PORT", ":8080"),
		ServerHost: getEnv("SERVER_HOST", "localhost"),

		// Database
		DatabasePath: getEnv("DATABASE_PATH", "./data/forum.db"),

		// Authentication
		SessionSecret: getEnv("SESSION_SECRET", "your-secret-key-change-in-production"),
		SessionMaxAge: 3600, // 1 hour

		// App
		SiteName:     getEnv("SITE_NAME", "Forum"),
		PostsPerPage: 10,
		DevMode:      getEnv("DEV_MODE", "true") == "true",

		// Paths
		TemplatesPath: "./templates/",
		StaticPath:    "./static/",
		UploadsPath:   "./uploads/",
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
