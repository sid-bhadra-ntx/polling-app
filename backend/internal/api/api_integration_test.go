package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"entgo.io/ent/dialect"
	_ "github.com/lib/pq"
	"poll-app/backend/ent"
	"poll-app/backend/ent/enttest"
	"poll-app/backend/internal/config"
)

const integrationJWTSecret = "api-integration-test-secret"

func TestAPIWorkflow(t *testing.T) {
	handler := newIntegrationHandler(t)
	suffix := time.Now().UnixNano()
	ownerUsername := fmt.Sprintf("api_owner_%d", suffix)
	ownerEmail := fmt.Sprintf("api_owner_%d@example.test", suffix)
	otherUsername := fmt.Sprintf("api_other_%d", suffix)
	otherEmail := fmt.Sprintf("api_other_%d@example.test", suffix)
	password := "correct horse battery staple"

	t.Run("signup and login", func(t *testing.T) {
		response := jsonRequest(t, handler, http.MethodPost, "/api/signup", "", map[string]string{
			"username": ownerUsername,
			"email":    ownerEmail,
			"password": password,
		})
		assertStatus(t, response, http.StatusCreated)

		var created userResponse
		decodeResponse(t, response, &created)
		if created.Username != ownerUsername || created.Email != ownerEmail {
			t.Fatalf("unexpected signup response: %#v", created)
		}

		loginResponse := jsonRequest(t, handler, http.MethodPost, "/api/login", "", map[string]string{
			"identifier": ownerUsername,
			"password":   password,
		})
		assertStatus(t, loginResponse, http.StatusOK)
		var loginResult struct {
			Token string `json:"token"`
			User  userResponse
		}
		decodeResponse(t, loginResponse, &loginResult)
		if loginResult.Token == "" || loginResult.User.ID != created.ID {
			t.Fatalf("unexpected login response: %#v", loginResult)
		}

		invalidLogin := jsonRequest(t, handler, http.MethodPost, "/api/login", "", map[string]string{
			"identifier": ownerUsername,
			"password":   "wrong password",
		})
		assertStatus(t, invalidLogin, http.StatusUnauthorized)
	})

	ownerToken := loginUser(t, handler, ownerUsername, password)

	t.Run("duplicate accounts and invalid payloads", func(t *testing.T) {
		duplicateUsername := jsonRequest(t, handler, http.MethodPost, "/api/signup", "", map[string]string{
			"username": ownerUsername,
			"email":    fmt.Sprintf("different_%d@example.test", suffix),
			"password": password,
		})
		assertStatus(t, duplicateUsername, http.StatusConflict)

		duplicateEmail := jsonRequest(t, handler, http.MethodPost, "/api/signup", "", map[string]string{
			"username": fmt.Sprintf("different_%d", suffix),
			"email":    ownerEmail,
			"password": password,
		})
		assertStatus(t, duplicateEmail, http.StatusConflict)

		unknownField := jsonRequest(t, handler, http.MethodPost, "/api/signup", "", map[string]any{
			"username": fmt.Sprintf("unknown_%d", suffix),
			"email":    fmt.Sprintf("unknown_%d@example.test", suffix),
			"password": password,
			"extra":    true,
		})
		assertStatus(t, unknownField, http.StatusBadRequest)

		tooFewOptions := jsonRequest(t, handler, http.MethodPost, "/api/polls", ownerToken, map[string]any{
			"title":   "Invalid poll",
			"options": []string{"Only option"},
		})
		assertStatus(t, tooFewOptions, http.StatusBadRequest)
	})

	var poll pollResponse
	t.Run("poll creation and listing", func(t *testing.T) {
		response := jsonRequest(t, handler, http.MethodPost, "/api/polls", ownerToken, map[string]any{
			"title":       "Integration poll",
			"description": "Created by the API integration test",
			"options":     []string{"Option A", "Option B"},
		})
		assertStatus(t, response, http.StatusCreated)
		decodeResponse(t, response, &poll)
		if poll.ID <= 0 || poll.CreatorID <= 0 || len(poll.Options) != 2 {
			t.Fatalf("unexpected poll response: %#v", poll)
		}

		listResponse := jsonRequest(t, handler, http.MethodGet, "/api/polls", ownerToken, nil)
		assertStatus(t, listResponse, http.StatusOK)
		var polls []pollResponse
		decodeResponse(t, listResponse, &polls)
		found := false
		for _, listed := range polls {
			if listed.ID == poll.ID {
				found = true
				break
			}
		}
		if !found {
			t.Fatalf("created poll %d was not returned in poll listing", poll.ID)
		}
	})

	otherToken := signupAndLoginUser(t, handler, otherUsername, otherEmail, password)

	t.Run("creator-only update and deletion", func(t *testing.T) {
		unauthorizedUpdate := jsonRequest(t, handler, http.MethodPut, fmt.Sprintf("/api/polls/%d", poll.ID), otherToken, map[string]any{
			"title":   "Unauthorized update",
			"options": []string{"A", "B"},
		})
		assertStatus(t, unauthorizedUpdate, http.StatusNotFound)

		response := jsonRequest(t, handler, http.MethodPut, fmt.Sprintf("/api/polls/%d", poll.ID), ownerToken, map[string]any{
			"title":       "Updated integration poll",
			"description": "Updated by the creator",
			"options":     []string{"Option A updated", "Option B", "Option C"},
		})
		assertStatus(t, response, http.StatusOK)
		decodeResponse(t, response, &poll)
		if poll.Title != "Updated integration poll" || len(poll.Options) != 3 {
			t.Fatalf("unexpected updated poll: %#v", poll)
		}

		unauthorizedDelete := jsonRequest(t, handler, http.MethodDelete, fmt.Sprintf("/api/polls/%d", poll.ID), otherToken, nil)
		assertStatus(t, unauthorizedDelete, http.StatusNotFound)
	})

	t.Run("voting counts and voters", func(t *testing.T) {
		optionA := poll.Options[0].ID
		optionB := poll.Options[1].ID

		firstVote := jsonRequest(t, handler, http.MethodPost, fmt.Sprintf("/api/polls/%d/vote", poll.ID), ownerToken, map[string]int{
			"option_id": optionA,
		})
		assertStatus(t, firstVote, http.StatusCreated)

		secondVote := jsonRequest(t, handler, http.MethodPost, fmt.Sprintf("/api/polls/%d/vote", poll.ID), ownerToken, map[string]int{
			"option_id": optionB,
		})
		assertStatus(t, secondVote, http.StatusCreated)

		duplicateVote := jsonRequest(t, handler, http.MethodPost, fmt.Sprintf("/api/polls/%d/vote", poll.ID), ownerToken, map[string]int{
			"option_id": optionA,
		})
		assertStatus(t, duplicateVote, http.StatusConflict)

		countsResponse := jsonRequest(t, handler, http.MethodGet, fmt.Sprintf("/api/polls/%d/counts", poll.ID), ownerToken, nil)
		assertStatus(t, countsResponse, http.StatusOK)
		var counts []struct {
			OptionID int `json:"option_id"`
			Count    int `json:"count"`
		}
		decodeResponse(t, countsResponse, &counts)
		if countForOption(counts, optionA) != 1 || countForOption(counts, optionB) != 1 {
			t.Fatalf("expected one vote for each option, got %#v", counts)
		}

		votersResponse := jsonRequest(t, handler, http.MethodGet, fmt.Sprintf("/api/options/%d/voters", optionA), ownerToken, nil)
		assertStatus(t, votersResponse, http.StatusOK)
		var voters []userResponse
		decodeResponse(t, votersResponse, &voters)
		if len(voters) != 1 || voters[0].Username != ownerUsername {
			t.Fatalf("unexpected voters response: %#v", voters)
		}
	})

	t.Run("missing resources and deletion", func(t *testing.T) {
		missingID := 999999999
		missingCounts := jsonRequest(t, handler, http.MethodGet, fmt.Sprintf("/api/polls/%d/counts", missingID), ownerToken, nil)
		assertStatus(t, missingCounts, http.StatusNotFound)

		missingVoters := jsonRequest(t, handler, http.MethodGet, fmt.Sprintf("/api/options/%d/voters", missingID), ownerToken, nil)
		assertStatus(t, missingVoters, http.StatusNotFound)

		missingUpdate := jsonRequest(t, handler, http.MethodPut, fmt.Sprintf("/api/polls/%d", missingID), ownerToken, map[string]any{
			"title":   "Missing poll",
			"options": []string{"A", "B"},
		})
		assertStatus(t, missingUpdate, http.StatusNotFound)

		deleteResponse := jsonRequest(t, handler, http.MethodDelete, fmt.Sprintf("/api/polls/%d", poll.ID), ownerToken, nil)
		assertStatus(t, deleteResponse, http.StatusNoContent)

		repeatedDelete := jsonRequest(t, handler, http.MethodDelete, fmt.Sprintf("/api/polls/%d", poll.ID), ownerToken, nil)
		assertStatus(t, repeatedDelete, http.StatusNotFound)

		listResponse := jsonRequest(t, handler, http.MethodGet, "/api/polls", ownerToken, nil)
		assertStatus(t, listResponse, http.StatusOK)
		var polls []pollResponse
		decodeResponse(t, listResponse, &polls)
		for _, listed := range polls {
			if listed.ID == poll.ID {
				t.Fatalf("deleted poll %d was returned in poll listing", poll.ID)
			}
		}
	})
}

func newIntegrationHandler(t *testing.T) http.Handler {
	t.Helper()
	dsn := os.Getenv("API_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set API_TEST_DATABASE_URL to run PostgreSQL API integration tests")
	}

	client := enttest.Open(t, dialect.Postgres, dsn)
	t.Cleanup(func() {
		client.Close()
	})
	clearTestData(t, client)
	return NewHandler(client, config.Config{JWTSecret: integrationJWTSecret})
}

func clearTestData(t *testing.T, client *ent.Client) {
	t.Helper()
	ctx := context.Background()
	if _, err := client.Vote.Delete().Exec(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.PollOption.Delete().Exec(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Poll.Delete().Exec(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := client.User.Delete().Exec(ctx); err != nil {
		t.Fatal(err)
	}
}

func loginUser(t *testing.T, handler http.Handler, username, password string) string {
	t.Helper()
	return loginUserWithIdentifier(t, handler, username, password)
}

func signupAndLoginUser(t *testing.T, handler http.Handler, username, email, password string) string {
	t.Helper()
	signupResponse := jsonRequest(t, handler, http.MethodPost, "/api/signup", "", map[string]string{
		"username": username,
		"email":    email,
		"password": password,
	})
	assertStatus(t, signupResponse, http.StatusCreated)
	return loginUser(t, handler, username, password)
}

func loginUserWithIdentifier(t *testing.T, handler http.Handler, identifier, password string) string {
	t.Helper()
	response := jsonRequest(t, handler, http.MethodPost, "/api/login", "", map[string]string{
		"identifier": identifier,
		"password":   password,
	})
	assertStatus(t, response, http.StatusOK)
	var result struct {
		Token string `json:"token"`
	}
	decodeResponse(t, response, &result)
	if result.Token == "" {
		t.Fatal("login response did not include a token")
	}
	return result.Token
}

func jsonRequest(t *testing.T, handler http.Handler, method, path, token string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(encoded)
	}
	request := httptest.NewRequest(method, path, reader)
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}

func assertStatus(t *testing.T, response *httptest.ResponseRecorder, expected int) {
	t.Helper()
	if response.Code != expected {
		t.Fatalf("expected status %d, got %d: %s", expected, response.Code, response.Body.String())
	}
}

func decodeResponse(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()
	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatalf("decode response: %v", err)
	}
}

func countForOption(counts []struct {
	OptionID int `json:"option_id"`
	Count    int `json:"count"`
}, optionID int) int {
	for _, item := range counts {
		if item.OptionID == optionID {
			return item.Count
		}
	}
	return 0
}
