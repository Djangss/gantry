package api

import (
	"net/http"
	"strings"
)

func (s *Server) createIssue(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Title  string   `json:"title"`
		Body   string   `json:"body"`
		Labels []string `json:"labels"`
	}
	if err := readJSON(w, r, &in); err != nil || strings.TrimSpace(in.Title) == "" {
		badRequest(w, "title is required")
		return
	}
	n, url, err := s.gh.CreateIssue(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), in.Title, in.Body, in.Labels)
	if err != nil {
		s.fail(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"number": n, "url": url})
}

// updateIssue applies whichever of state, labels and assignees the body carries.
// Labels and assignees replace the whole set; an absent field is left alone.
func (s *Server) updateIssue(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	var in struct {
		State     string   `json:"state"`
		Reason    string   `json:"reason"`
		Labels    []string `json:"labels"`
		Assignees []string `json:"assignees"`
	}
	if err := readJSON(w, r, &in); err != nil {
		badRequest(w, "invalid JSON body")
		return
	}
	badState := in.State != "" && in.State != "open" && in.State != "closed"
	badReason := in.Reason != "" && in.Reason != "completed" && in.Reason != "not_planned"
	if badState || badReason {
		badRequest(w, "state must be open or closed, reason completed or not_planned")
		return
	}
	ctx, tok, owner, repo := r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo")
	var err error
	if in.Labels != nil || in.Assignees != nil {
		err = s.gh.SetLabelsAssignees(ctx, tok, owner, repo, n, in.Labels, in.Assignees)
	}
	switch {
	case err != nil:
	case in.State == "open":
		err = s.gh.Reopen(ctx, tok, owner, repo, n)
	case in.State == "closed":
		if in.Reason == "" {
			in.Reason = "completed"
		}
		err = s.gh.Close(ctx, tok, owner, repo, n, false, in.Reason)
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) repoLabels(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.RepoLabels(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"))
	s.reply(w, out, err)
}

func (s *Server) assignees(w http.ResponseWriter, r *http.Request) {
	out, err := s.gh.Assignable(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"))
	s.reply(w, out, err)
}

func (s *Server) convertDraft(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Repo string `json:"repo"`
	}
	err := readJSON(w, r, &in)
	owner, repo, ok := strings.Cut(in.Repo, "/")
	if err != nil || !ok || owner == "" || repo == "" {
		badRequest(w, "repo must look like owner/repo")
		return
	}
	if err := s.gh.ConvertDraft(r.Context(), token(r), r.PathValue("itemId"), owner, repo); err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
