package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"poll-app/backend/internal/config"
)

func TestProtectedRoutesRequireBearerToken(t *testing.T) {
	handler := NewHandler(nil, config.Config{JWTSecret: "test-secret"})
	request := httptest.NewRequest(http.MethodGet, "/api/polls", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}

func TestCleanupRouteRequiresBearerToken(t *testing.T) {
	handler := NewHandler(nil, config.Config{JWTSecret: "test-secret"})
	request := httptest.NewRequest(http.MethodPost, "/api/admin/clear-data", nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
}
