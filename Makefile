FRONTEND_DIR := frontend
BACKEND_DIR := backend
BUILD_DIR := build
BINARY := $(BUILD_DIR)/poll-app
STATIC_DIR := $(BUILD_DIR)/static

.PHONY: all install frontend-build static backend-build backend-test frontend-lint verify run dev clean

all: static backend-build

install:
	cd $(FRONTEND_DIR) && npm ci

frontend-build: install
	cd $(FRONTEND_DIR) && npm run build

static: frontend-build
	rm -rf $(STATIC_DIR)
	mkdir -p $(STATIC_DIR)
	cp -R $(FRONTEND_DIR)/dist/. $(STATIC_DIR)/

backend-build:
	mkdir -p $(BUILD_DIR)
	cd $(BACKEND_DIR) && go build -o ../$(BINARY) .

backend-test:
	cd $(BACKEND_DIR) && go test ./... && go vet ./...

frontend-lint:
	cd $(FRONTEND_DIR) && npm run lint

verify: backend-test frontend-lint frontend-build

run: all
	cd $(BUILD_DIR) && STATIC_DIR=static ./poll-app

dev:
	cd $(FRONTEND_DIR) && npm run dev

clean:
	rm -rf $(BUILD_DIR) $(FRONTEND_DIR)/dist
