package main

import (
	"fmt"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// newApplicationHandler combines the API and the compiled React application.
// API paths remain owned by the API handler; every other unknown path falls
// back to index.html so client-side routes work after a browser refresh.
func newApplicationHandler(apiHandler http.Handler, staticDir string) (http.Handler, error) {
	indexPath := filepath.Join(staticDir, "index.html")
	if info, err := os.Stat(indexPath); err != nil {
		return nil, fmt.Errorf("frontend index at %q: %w", indexPath, err)
	} else if info.IsDir() {
		return nil, fmt.Errorf("frontend index at %q is a directory", indexPath)
	}

	fileServer := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			apiHandler.ServeHTTP(w, r)
			return
		}

		cleanPath := path.Clean("/" + r.URL.Path)
		relativePath := strings.TrimPrefix(cleanPath, "/")
		requestedPath := filepath.Join(staticDir, filepath.FromSlash(relativePath))
		if info, err := os.Stat(requestedPath); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}

		fallbackRequest := r.Clone(r.Context())
		fallbackRequest.URL.Path = "/"
		fileServer.ServeHTTP(w, fallbackRequest)
	}), nil
}
