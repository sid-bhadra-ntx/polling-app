package main

import (
	"log"
	"net/http"
	"os"

	"poll-app/backend/internal/api"
	"poll-app/backend/internal/config"
	"poll-app/backend/internal/database"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("load configuration: %v", err)
	}

	client, err := database.Open(cfg)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	defer client.Close()

	staticDir := os.Getenv("STATIC_DIR")
	if staticDir == "" {
		staticDir = "frontend/dist"
	}
	handler, err := newApplicationHandler(api.NewHandler(client, cfg), staticDir)
	if err != nil {
		log.Fatalf("configure frontend assets: %v", err)
	}

	addr := ":" + os.Getenv("PORT")
	if os.Getenv("PORT") == "" {
		addr = ":8080"
	}
	log.Printf("poll application listening on %s", addr)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}
