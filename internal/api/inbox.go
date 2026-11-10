package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/Djangss/gantry/internal/auth"
)

const proposedLabel = "proposed"

func (s *Server) inbox(w http.ResponseWriter, r *http.Request) {
	sess, _ := auth.FromContext(r.Context())
	out, err := s.gh.Proposed(r.Context(), token(r), sess.Login)
	s.reply(w, out, err)
}

// approve merges a proposed PR, or puts a proposed issue on a board and drops its label.
// The board add runs first so a failure leaves the issue labelled, still in the inbox, ready to retry.
func (s *Server) approve(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	var in struct {
		ProjectID string `json:"projectId"`
	}
	if err := readJSON(w, r, &in); err != nil && !errors.Is(err, io.EOF) {
		badRequest(w, "invalid JSON body")
		return
	}
	ctx, tok, owner, repo := r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo")
	node, isPR, proposed, err := s.gh.ItemNode(ctx, tok, owner, repo, n, proposedLabel)
	switch {
	case err != nil: // falls through to the failure check below
	case isPR && !proposed:
		notProposal(w)
		return
	case isPR:
		err = s.gh.Merge(ctx, tok, owner, repo, n)
	default:
		if in.ProjectID != "" {
			err = s.gh.AddToProject(ctx, tok, in.ProjectID, node)
		}
		if err == nil {
			err = s.gh.RemoveLabel(ctx, tok, owner, repo, n, proposedLabel)
		}
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) reject(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	ctx, tok, owner, repo := r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo")
	_, isPR, proposed, err := s.gh.ItemNode(ctx, tok, owner, repo, n, proposedLabel)
	if err == nil && !proposed {
		notProposal(w)
		return
	}
	if err == nil {
		err = s.gh.Close(ctx, tok, owner, repo, n, isPR)
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func notProposal(w http.ResponseWriter) {
	writeJSON(w, http.StatusUnprocessableEntity, apiError{Error: "not a proposal", Code: "bad_request"})
}

func (s *Server) prFiles(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	out, err := s.gh.PRFiles(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), n)
	s.reply(w, out, err)
}
