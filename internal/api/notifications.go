package api

import (
	"net/http"
	"regexp"
)

var threadID = regexp.MustCompile(`^\d+$`)

func (s *Server) notifications(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.Notifications(r.Context(), token(r), r.URL.Query().Get("participating") != "false")
	s.reply(w, out, err)
}

func (s *Server) markNotificationRead(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !threadID.MatchString(id) {
		badRequest(w, "invalid thread id")
		return
	}
	if err := s.gh.MarkNotificationRead(r.Context(), token(r), id); err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
