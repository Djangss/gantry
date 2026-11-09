package api

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/Djangss/gantry/internal/gh"
)

type apiError struct {
	Error string     `json:"error"`
	Code  string     `json:"code"`
	Reset *time.Time `json:"reset,omitempty"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func badRequest(w http.ResponseWriter, msg string) {
	writeJSON(w, http.StatusBadRequest, apiError{Error: msg, Code: "bad_request"})
}

// fail maps a GitHub error to Gantry's error shape. Never log tokens; GitHub messages contain none.
func (s *Server) fail(w http.ResponseWriter, err error) {
	var e *gh.Error
	if !errors.As(err, &e) {
		slog.Error("request failed", "err", err)
		writeJSON(w, http.StatusBadGateway, apiError{Error: "upstream error", Code: "upstream"})
		return
	}
	switch {
	case e.Status == http.StatusUnauthorized:
		s.auth.ClearSession(w)
		writeJSON(w, http.StatusUnauthorized, apiError{Error: "GitHub token rejected, sign in again", Code: "unauthorized"})
	case e.RateLimited:
		reset := e.Reset.UTC()
		writeJSON(w, http.StatusTooManyRequests, apiError{Error: "GitHub rate limit hit", Code: "rate_limited", Reset: &reset})
	case e.Status == http.StatusForbidden:
		writeJSON(w, e.Status, apiError{Error: e.Message, Code: "forbidden"})
	case e.Status == http.StatusNotFound:
		writeJSON(w, e.Status, apiError{Error: e.Message, Code: "not_found"})
	case e.Status == http.StatusConflict:
		writeJSON(w, e.Status, apiError{Error: "file changed on GitHub", Code: "conflict"})
	case e.Status >= 400 && e.Status < 500:
		writeJSON(w, e.Status, apiError{Error: e.Message, Code: "bad_request"})
	default:
		slog.Warn("github upstream", "status", e.Status, "msg", e.Message)
		writeJSON(w, http.StatusBadGateway, apiError{Error: "GitHub is unavailable", Code: "upstream"})
	}
}

func (s *Server) reply(w http.ResponseWriter, v any, err error) {
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}
