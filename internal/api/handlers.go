package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/Djangss/gantry/internal/auth"
	"github.com/Djangss/gantry/internal/notes"
)

func token(r *http.Request) string {
	s, _ := auth.FromContext(r.Context())
	return s.Token
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) error {
	return json.NewDecoder(http.MaxBytesReader(w, r.Body, 50<<20)).Decode(v)
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	sess, _ := auth.FromContext(r.Context())
	writeJSON(w, http.StatusOK, map[string]string{"login": sess.Login, "notesRepo": s.cfg.NotesRepo})
}

func (s *Server) repos(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.Repos(r.Context(), token(r))
	s.reply(w, out, err)
}

func (s *Server) projects(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.Projects(r.Context(), token(r))
	s.reply(w, out, err)
}

func (s *Server) board(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.Board(r.Context(), token(r), r.PathValue("id"))
	s.reply(w, out, err)
}

func (s *Server) moveItem(w http.ResponseWriter, r *http.Request) {
	var in struct {
		FieldID  string `json:"fieldId"`
		OptionID string `json:"optionId"`
	}
	if err := readJSON(w, r, &in); err != nil || in.FieldID == "" || in.OptionID == "" {
		badRequest(w, "fieldId and optionId are required")
		return
	}
	if err := s.gh.MoveItem(r.Context(), token(r), r.PathValue("id"), r.PathValue("itemId"), in.FieldID, in.OptionID); err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func issueNumber(w http.ResponseWriter, r *http.Request) (int, bool) {
	n, err := strconv.Atoi(r.PathValue("n"))
	if err != nil || n < 1 {
		badRequest(w, "issue number must be a positive integer")
		return 0, false
	}
	return n, true
}

func (s *Server) issue(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	out, err := s.gh.Issue(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), n)
	s.reply(w, out, err)
}

func (s *Server) comment(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if err := readJSON(w, r, &in); err != nil || strings.TrimSpace(in.Body) == "" {
		badRequest(w, "body is required")
		return
	}
	out, err := s.gh.CreateComment(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), n, in.Body)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) tree(w http.ResponseWriter, r *http.Request) {
	prefix := strings.Trim(r.URL.Query().Get("path"), "/")
	out, err := s.gh.Tree(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), prefix)
	s.reply(w, out, err)
}

func (s *Server) getContents(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.GetContents(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), r.PathValue("path"))
	s.reply(w, out, err)
}

func (s *Server) putContents(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Content string `json:"content"`
		SHA     string `json:"sha"`
		Message string `json:"message"`
	}
	if err := readJSON(w, r, &in); err != nil {
		badRequest(w, "invalid JSON body")
		return
	}
	path := r.PathValue("path")
	if in.Message == "" {
		in.Message = "update " + path
	}
	sha, err := s.gh.PutContents(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), path, in.Content, in.SHA, in.Message)
	if err != nil {
		s.fail(w, err)
		return
	}
	if strings.EqualFold(r.PathValue("owner")+"/"+r.PathValue("repo"), s.cfg.NotesRepo) {
		s.links.Update(path, in.Content)
	}
	writeJSON(w, http.StatusOK, map[string]string{"sha": sha})
}

func (s *Server) linksFor(w http.ResponseWriter, r *http.Request) {
	ref := r.URL.Query().Get("ref")
	if !notes.ValidRef(ref) {
		badRequest(w, "ref must look like owner/repo#123")
		return
	}
	out, err := s.links.Lookup(r.Context(), token(r), ref)
	s.reply(w, out, err)
}

func (s *Server) rescan(w http.ResponseWriter, r *http.Request) {
	if err := s.links.Rebuild(r.Context(), token(r)); err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
