package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestApplicationHandlerServesAssetsAndSPAForwards(t *testing.T) {
	staticDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(staticDir, "index.html"), []byte("app shell"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(staticDir, "assets"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(staticDir, "assets", "app.js"), []byte("bundle"), 0o644); err != nil {
		t.Fatal(err)
	}

	apiHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte("api response"))
	})
	handler, err := newApplicationHandler(apiHandler, staticDir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name   string
		path   string
		status int
		body   string
	}{
		{name: "asset", path: "/assets/app.js", status: http.StatusOK, body: "bundle"},
		{name: "client route", path: "/polls/123", status: http.StatusOK, body: "app shell"},
		{name: "api route", path: "/api/polls", status: http.StatusAccepted, body: "api response"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, test.path, nil)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)

			if response.Code != test.status {
				t.Fatalf("expected status %d, got %d", test.status, response.Code)
			}
			if response.Body.String() != test.body {
				t.Fatalf("expected body %q, got %q", test.body, response.Body.String())
			}
		})
	}
}

func TestApplicationHandlerRequiresIndex(t *testing.T) {
	_, err := newApplicationHandler(http.NotFoundHandler(), t.TempDir())
	if err == nil {
		t.Fatal("expected missing frontend index to fail")
	}
}
