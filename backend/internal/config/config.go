package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
)

// Config contains runtime settings injected by the deployment environment.
type Config struct {
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string
	DBSSLMode  string
	JWTSecret  string
}

// Load reads the backend configuration from environment variables.
func Load() (Config, error) {
	dbSSLMode := os.Getenv("DB_SSLMODE")
	if dbSSLMode == "" {
		dbSSLMode = "disable"
	}
	cfg := Config{
		DBHost:     os.Getenv("DB_HOST"),
		DBUser:     os.Getenv("DB_USER"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBName:     os.Getenv("DB_NAME"),
		DBSSLMode:  dbSSLMode,
		JWTSecret:  os.Getenv("JWT_SECRET"),
		DBPort:     5432,
	}

	if port := os.Getenv("DB_PORT"); port != "" {
		parsed, err := strconv.Atoi(port)
		if err != nil || parsed < 1 || parsed > 65535 {
			return Config{}, fmt.Errorf("DB_PORT must be a valid TCP port")
		}
		cfg.DBPort = parsed
	}

	missing := make([]string, 0, 5)
	for name, value := range map[string]string{
		"DB_HOST":    cfg.DBHost,
		"DB_USER":    cfg.DBUser,
		"DB_NAME":    cfg.DBName,
		"JWT_SECRET": cfg.JWTSecret,
	} {
		if value == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		return Config{}, fmt.Errorf("missing required environment variables: %v", missing)
	}
	return cfg, nil
}

// DSN returns a PostgreSQL URL with credentials safely escaped.
func (c Config) DSN() string {
	sslMode := c.DBSSLMode
	if sslMode == "" {
		sslMode = "disable"
	}
	return (&url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(c.DBUser, c.DBPassword),
		Host:   fmt.Sprintf("%s:%d", c.DBHost, c.DBPort),
		Path:   "/" + c.DBName,
		RawQuery: url.Values{
			"sslmode": {sslMode},
		}.Encode(),
	}).String()
}

// Validate ensures a configuration is suitable for starting the backend.
func (c Config) Validate() error {
	if c.DBHost == "" || c.DBUser == "" || c.DBName == "" || c.JWTSecret == "" {
		return errors.New("database and JWT configuration are incomplete")
	}
	if c.DBPort < 1 || c.DBPort > 65535 {
		return errors.New("DB_PORT is outside the valid TCP port range")
	}
	return nil
}
