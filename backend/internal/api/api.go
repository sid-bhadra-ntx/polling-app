package api

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/julienschmidt/httprouter"

	"poll-app/backend/ent"
	"poll-app/backend/ent/poll"
	"poll-app/backend/ent/polloption"
	"poll-app/backend/ent/user"
	"poll-app/backend/ent/vote"
	"poll-app/backend/internal/auth"
	"poll-app/backend/internal/config"
)

type contextKey string

const userIDKey contextKey = "authenticated_user_id"

// API contains the HTTP handlers for the polling application.
type API struct {
	client *ent.Client
	config config.Config
}

// NewHandler creates the API router. It does not create or migrate tables.
func NewHandler(client *ent.Client, cfg config.Config) http.Handler {
	api := &API{client: client, config: cfg}
	router := httprouter.New()

	router.POST("/api/signup", api.signup)
	router.POST("/api/login", api.login)
	router.GET("/api/polls", api.requireAuth(api.listPolls))
	router.GET("/api/polls/:id", api.requireAuth(api.getPoll))
	router.POST("/api/polls", api.requireAuth(api.createPoll))
	router.PUT("/api/polls/:id", api.requireAuth(api.updatePoll))
	router.DELETE("/api/polls/:id", api.requireAuth(api.deletePoll))
	router.POST("/api/polls/:id/vote", api.requireAuth(api.vote))
	router.DELETE("/api/polls/:id/vote", api.requireAuth(api.removeVote))
	router.GET("/api/polls/:id/my-votes", api.requireAuth(api.myVotes))
	router.GET("/api/polls/:id/counts", api.requireAuth(api.pollCounts))
	router.GET("/api/options/:id/voters", api.requireAuth(api.optionVoters))
	return router
}

type signupRequest struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginRequest struct {
	Identifier string `json:"identifier"`
	Password   string `json:"password"`
}

type pollRequest struct {
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Options     []string `json:"options"`
}

type updatePollRequest struct {
	Title       string              `json:"title"`
	Description string              `json:"description"`
	Options     []pollOptionRequest `json:"options"`
}

type pollOptionRequest struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

type voteRequest struct {
	OptionID int `json:"option_id"`
}

type userResponse struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Email    string `json:"email"`
}

type optionResponse struct {
	ID   int    `json:"id"`
	Text string `json:"text"`
}

type pollResponse struct {
	ID              int              `json:"id"`
	Title           string           `json:"title"`
	Description     string           `json:"description"`
	CreatorID       int              `json:"creator_id"`
	CreatorUsername string           `json:"creator_username"`
	HasVoted        bool             `json:"has_voted"`
	Options         []optionResponse `json:"options"`
}

func (a *API) signup(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var request signupRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Username = strings.TrimSpace(request.Username)
	request.Email = strings.TrimSpace(strings.ToLower(request.Email))
	if request.Username == "" || request.Email == "" || request.Password == "" {
		writeError(w, http.StatusBadRequest, "username, email, and password are required")
		return
	}

	passwordHash, err := auth.HashPassword(request.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	created, err := a.client.User.Create().
		SetUsername(request.Username).
		SetEmail(request.Email).
		SetPasswordHash(passwordHash).
		Save(r.Context())
	if err != nil {
		log.Printf("signup: database insert failed: %v", err)
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "username or email is already registered")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not create user")
		return
	}
	writeJSON(w, http.StatusCreated, userResponse{
		ID: created.ID, Username: created.Username, Email: created.Email,
	})
}

func (a *API) login(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var request loginRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	request.Identifier = strings.TrimSpace(request.Identifier)
	emailIdentifier := strings.ToLower(request.Identifier)
	if request.Identifier == "" || request.Password == "" {
		writeError(w, http.StatusBadRequest, "identifier and password are required")
		return
	}

	account, err := a.client.User.Query().
		Where(user.Or(
			user.UsernameEQ(request.Identifier),
			user.EmailEQ(emailIdentifier),
		)).
		Only(r.Context())
	if err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if err := auth.CheckPassword(account.PasswordHash, request.Password); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	token, err := auth.IssueToken(account.ID, account.Username, a.config.JWTSecret, 24*time.Hour)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create access token")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"token": token,
		"user":  userResponse{ID: account.ID, Username: account.Username, Email: account.Email},
	})
}

func (a *API) listPolls(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	polls, err := a.client.Poll.Query().
		WithOptions().
		WithCreator().
		Order(ent.Asc("id")).
		All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load polls")
		return
	}
	votedPolls, err := a.votedPollIDs(r.Context(), authenticatedUserID(r.Context()))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load voting status")
		return
	}
	response := make([]pollResponse, 0, len(polls))
	for _, item := range polls {
		itemResponse := toPollResponse(item)
		itemResponse.HasVoted = votedPolls[item.ID]
		response = append(response, itemResponse)
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) getPoll(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id, ok := pathID(w, params)
	if !ok {
		return
	}
	item, err := a.client.Poll.Query().
		Where(poll.IDEQ(id)).
		WithOptions().
		WithCreator().
		Only(r.Context())
	if ent.IsNotFound(err) {
		writeError(w, http.StatusNotFound, "poll not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load poll")
		return
	}
	response := toPollResponse(item)
	response.HasVoted, err = a.userHasVotedInPoll(
		r.Context(),
		authenticatedUserID(r.Context()),
		id,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load voting status")
		return
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) createPoll(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var request pollRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := validatePollRequest(&request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	tx, err := a.client.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start transaction")
		return
	}
	created, err := tx.Poll.Create().
		SetTitle(strings.TrimSpace(request.Title)).
		SetDescription(request.Description).
		SetCreatorID(authenticatedUserID(r.Context())).
		Save(r.Context())
	if err == nil {
		for _, text := range request.Options {
			_, err = tx.PollOption.Create().
				SetText(strings.TrimSpace(text)).
				SetPollID(created.ID).
				Save(r.Context())
			if err != nil {
				break
			}
		}
	}
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "could not create poll")
		return
	}
	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save poll")
		return
	}
	result, err := a.client.Poll.Query().
		Where(poll.IDEQ(created.ID)).
		WithOptions().
		WithCreator().
		Only(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load created poll")
		return
	}
	writeJSON(w, http.StatusCreated, toPollResponse(result))
}

func (a *API) updatePoll(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id, ok := pathID(w, params)
	if !ok {
		return
	}
	var request updatePollRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if err := validateUpdatePollRequest(&request); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ownerID := authenticatedUserID(r.Context())

	tx, err := a.client.Tx(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not start transaction")
		return
	}

	existingPoll, err := tx.Poll.Query().
		Where(poll.IDEQ(id), poll.CreatorIDEQ(ownerID)).
		WithOptions().
		Only(r.Context())
	if ent.IsNotFound(err) {
		_ = tx.Rollback()
		writeError(w, http.StatusNotFound, "poll not found")
		return
	}
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "could not load poll")
		return
	}

	_, err = tx.Poll.UpdateOneID(id).
		SetTitle(request.Title).
		SetDescription(request.Description).
		Save(r.Context())
	if err != nil {
		_ = tx.Rollback()
		writeError(w, http.StatusInternalServerError, "could not update poll")
		return
	}

	existingOptions := existingPoll.Edges.Options
	existingByID := make(map[int]*ent.PollOption, len(existingOptions))
	for _, option := range existingOptions {
		existingByID[option.ID] = option
	}

	requestedIDs := make(map[int]struct{}, len(request.Options))
	for _, option := range request.Options {
		if option.ID == 0 {
			continue
		}
		if _, exists := existingByID[option.ID]; !exists {
			_ = tx.Rollback()
			writeError(w, http.StatusBadRequest, "option does not belong to this poll")
			return
		}
		requestedIDs[option.ID] = struct{}{}
	}

	for _, option := range existingOptions {
		if _, requested := requestedIDs[option.ID]; requested {
			continue
		}
		if err := tx.PollOption.DeleteOneID(option.ID).Exec(r.Context()); err != nil {
			_ = tx.Rollback()
			writeError(w, http.StatusInternalServerError, "could not update poll")
			return
		}
	}

	for _, option := range request.Options {
		if option.ID == 0 {
			_, err = tx.PollOption.Create().
				SetText(option.Text).
				SetPollID(id).
				Save(r.Context())
		} else if existingByID[option.ID].Text != option.Text {
			_, err = tx.Vote.Delete().
				Where(vote.OptionIDEQ(option.ID)).
				Exec(r.Context())
			if err == nil {
				_, err = tx.PollOption.UpdateOneID(option.ID).
					SetText(option.Text).
					Save(r.Context())
			}
		}
		if err != nil {
			_ = tx.Rollback()
			writeError(w, http.StatusInternalServerError, "could not update poll")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "could not save poll")
		return
	}
	result, err := a.client.Poll.Query().
		Where(poll.IDEQ(id)).
		WithOptions().
		WithCreator().
		Only(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load updated poll")
		return
	}
	writeJSON(w, http.StatusOK, toPollResponse(result))
}

func (a *API) deletePoll(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id, ok := pathID(w, params)
	if !ok {
		return
	}
	err := a.client.Poll.DeleteOneID(id).Where(poll.CreatorIDEQ(authenticatedUserID(r.Context()))).Exec(r.Context())
	if err != nil {
		if ent.IsNotFound(err) {
			writeError(w, http.StatusNotFound, "poll not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not delete poll")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) vote(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	pollID, ok := pathID(w, params)
	if !ok {
		return
	}
	var request voteRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if request.OptionID <= 0 {
		writeError(w, http.StatusBadRequest, "option_id must be positive")
		return
	}
	option, err := a.client.PollOption.Query().
		Where(polloption.IDEQ(request.OptionID), polloption.PollIDEQ(pollID)).
		Only(r.Context())
	if ent.IsNotFound(err) {
		writeError(w, http.StatusBadRequest, "option does not belong to this poll")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not validate option")
		return
	}
	created, err := a.client.Vote.Create().
		SetUserID(authenticatedUserID(r.Context())).
		SetOptionID(option.ID).
		Save(r.Context())
	if err != nil {
		if ent.IsConstraintError(err) {
			writeError(w, http.StatusConflict, "user has already voted for this option")
			return
		}
		writeError(w, http.StatusInternalServerError, "could not record vote")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]int{"id": created.ID, "option_id": option.ID})
}

func (a *API) removeVote(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	pollID, ok := pathID(w, params)
	if !ok {
		return
	}
	var request voteRequest
	if !decodeJSON(w, r, &request) {
		return
	}
	if request.OptionID <= 0 {
		writeError(w, http.StatusBadRequest, "option_id must be positive")
		return
	}
	option, err := a.client.PollOption.Query().
		Where(polloption.IDEQ(request.OptionID), polloption.PollIDEQ(pollID)).
		Only(r.Context())
	if ent.IsNotFound(err) {
		writeError(w, http.StatusBadRequest, "option does not belong to this poll")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not validate option")
		return
	}
	deleted, err := a.client.Vote.Delete().
		Where(
			vote.UserIDEQ(authenticatedUserID(r.Context())),
			vote.OptionIDEQ(option.ID),
		).
		Exec(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not remove vote")
		return
	}
	if deleted == 0 {
		writeError(w, http.StatusNotFound, "vote not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) myVotes(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	pollID, ok := pathID(w, params)
	if !ok {
		return
	}
	exists, err := a.client.Poll.Query().Where(poll.IDEQ(pollID)).Exist(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load poll")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "poll not found")
		return
	}

	optionIDs, err := a.client.PollOption.Query().
		Where(polloption.PollIDEQ(pollID)).
		IDs(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load poll options")
		return
	}
	if len(optionIDs) == 0 {
		writeJSON(w, http.StatusOK, []int{})
		return
	}
	votes, err := a.client.Vote.Query().
		Where(
			vote.UserIDEQ(authenticatedUserID(r.Context())),
			vote.OptionIDIn(optionIDs...),
		).
		Order(ent.Asc("id")).
		All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load votes")
		return
	}
	response := make([]int, 0, len(votes))
	for _, item := range votes {
		response = append(response, item.OptionID)
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) pollCounts(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	pollID, ok := pathID(w, params)
	if !ok {
		return
	}
	exists, err := a.client.Poll.Query().Where(poll.IDEQ(pollID)).Exist(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load poll")
		return
	}
	if !exists {
		writeError(w, http.StatusNotFound, "poll not found")
		return
	}
	hasVoted, err := a.userHasVotedInPoll(
		r.Context(),
		authenticatedUserID(r.Context()),
		pollID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check voting status")
		return
	}
	if !hasVoted {
		writeError(w, http.StatusForbidden, "vote in this poll before viewing results")
		return
	}
	options, err := a.client.PollOption.Query().Where(polloption.PollIDEQ(pollID)).Order(ent.Asc("id")).All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load poll options")
		return
	}
	type count struct {
		OptionID int    `json:"option_id"`
		Text     string `json:"text"`
		Count    int    `json:"count"`
	}
	response := make([]count, 0, len(options))
	for _, option := range options {
		total, err := a.client.Vote.Query().Where(vote.OptionIDEQ(option.ID)).Count(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "could not count votes")
			return
		}
		response = append(response, count{OptionID: option.ID, Text: option.Text, Count: total})
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) optionVoters(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	optionID, ok := pathID(w, params)
	if !ok {
		return
	}
	option, err := a.client.PollOption.Query().
		Where(polloption.IDEQ(optionID)).
		Only(r.Context())
	if ent.IsNotFound(err) {
		writeError(w, http.StatusNotFound, "option not found")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load option")
		return
	}
	hasVoted, err := a.userHasVotedInPoll(
		r.Context(),
		authenticatedUserID(r.Context()),
		option.PollID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check voting status")
		return
	}
	if !hasVoted {
		writeError(w, http.StatusForbidden, "vote in this poll before viewing voters")
		return
	}
	votes, err := a.client.Vote.Query().
		Where(vote.OptionIDEQ(optionID)).
		WithUser().
		Order(ent.Asc("id")).
		All(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load voters")
		return
	}
	response := make([]userResponse, 0, len(votes))
	for _, item := range votes {
		if item.Edges.User != nil {
			response = append(response, userResponse{
				ID: item.Edges.User.ID, Username: item.Edges.User.Username, Email: item.Edges.User.Email,
			})
		}
	}
	writeJSON(w, http.StatusOK, response)
}

func (a *API) userHasVotedInPoll(ctx context.Context, userID, pollID int) (bool, error) {
	return a.client.Vote.Query().
		Where(
			vote.UserIDEQ(userID),
			vote.HasOptionWith(polloption.PollIDEQ(pollID)),
		).
		Exist(ctx)
}

func (a *API) votedPollIDs(ctx context.Context, userID int) (map[int]bool, error) {
	votes, err := a.client.Vote.Query().
		Where(vote.UserIDEQ(userID)).
		WithOption().
		All(ctx)
	if err != nil {
		return nil, err
	}
	votedPolls := make(map[int]bool, len(votes))
	for _, item := range votes {
		if item.Edges.Option != nil {
			votedPolls[item.Edges.Option.PollID] = true
		}
	}
	return votedPolls, nil
}

func (a *API) requireAuth(next httprouter.Handle) httprouter.Handle {
	return func(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
		header := strings.TrimSpace(r.Header.Get("Authorization"))
		if !strings.HasPrefix(header, "Bearer ") {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		claims, err := auth.ParseToken(strings.TrimSpace(strings.TrimPrefix(header, "Bearer ")), a.config.JWTSecret)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "invalid access token")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userIDKey, claims.UserID)), params)
	}
}

func authenticatedUserID(ctx context.Context) int {
	id, _ := ctx.Value(userIDKey).(int)
	return id
}

func validatePollRequest(request *pollRequest) error {
	request.Title = strings.TrimSpace(request.Title)
	if request.Title == "" {
		return errors.New("title is required")
	}
	if len(request.Options) < 2 {
		return errors.New("at least two options are required")
	}
	for i := range request.Options {
		request.Options[i] = strings.TrimSpace(request.Options[i])
		if request.Options[i] == "" {
			return errors.New("options cannot be empty")
		}
	}
	return nil
}

func validateUpdatePollRequest(request *updatePollRequest) error {
	request.Title = strings.TrimSpace(request.Title)
	if request.Title == "" {
		return errors.New("title is required")
	}
	if len(request.Options) < 2 {
		return errors.New("at least two options are required")
	}
	seenIDs := make(map[int]struct{}, len(request.Options))
	for i := range request.Options {
		request.Options[i].Text = strings.TrimSpace(request.Options[i].Text)
		if request.Options[i].Text == "" {
			return errors.New("options cannot be empty")
		}
		if request.Options[i].ID < 0 {
			return errors.New("option id must not be negative")
		}
		if request.Options[i].ID > 0 {
			if _, exists := seenIDs[request.Options[i].ID]; exists {
				return errors.New("an option cannot be included more than once")
			}
			seenIDs[request.Options[i].ID] = struct{}{}
		}
	}
	return nil
}

func toPollResponse(item *ent.Poll) pollResponse {
	response := pollResponse{
		ID:              item.ID,
		Title:           item.Title,
		Description:     item.Description,
		CreatorID:       item.CreatorID,
		CreatorUsername: "",
		Options:         make([]optionResponse, 0, len(item.Edges.Options)),
	}
	if item.Edges.Creator != nil {
		response.CreatorUsername = item.Edges.Creator.Username
	}
	for _, option := range item.Edges.Options {
		response.Options = append(response.Options, optionResponse{ID: option.ID, Text: option.Text})
	}
	return response
}

func pathID(w http.ResponseWriter, params httprouter.Params) (int, bool) {
	id, err := strconv.Atoi(params.ByName("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "id must be a positive integer")
		return 0, false
	}
	return id, true
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if r.Body == nil {
		writeError(w, http.StatusBadRequest, "request body is required")
		return false
	}
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
