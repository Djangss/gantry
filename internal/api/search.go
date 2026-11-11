package api

import (
	"net/http"

	"github.com/Djangss/gantry/internal/auth"
	"github.com/Djangss/gantry/internal/gh"
	"github.com/Djangss/gantry/internal/notes"
)

// search backs the Ctrl/Cmd+K box: notes from the in-memory index, issues and PRs from GitHub.
func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	out := struct {
		Notes  []notes.Entry     `json:"notes"`
		Issues []gh.IssueSummary `json:"issues"`
	}{[]notes.Entry{}, []gh.IssueSummary{}}
	if len(q) < 2 {
		writeJSON(w, http.StatusOK, out)
		return
	}
	sess, _ := auth.FromContext(r.Context())
	var err error
	if out.Notes, err = s.links.Search(r.Context(), sess.Token, q); err == nil {
		out.Issues, err = s.gh.Search(r.Context(), sess.Token, sess.Login, q)
	}
	s.reply(w, out, err)
}
