package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

// event is what the browser gets: enough to know which queries to refetch.
type event struct {
	Type   string `json:"type"`
	Repo   string `json:"repo"`
	Number int    `json:"number"`
}

// hub fans webhook events out to every open /api/events stream.
type hub struct {
	mu   sync.Mutex
	subs map[chan event]struct{}
}

func newHub() *hub { return &hub{subs: map[chan event]struct{}{}} }

func (h *hub) subscribe() chan event {
	ch := make(chan event, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *hub) unsubscribe(ch chan event) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}

// publish never blocks: a stream that has fallen 16 events behind misses this one.
func (h *hub) publish(e event) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.subs {
		select {
		case ch <- e:
		default:
		}
	}
}

func eventFrom(kind string, body []byte) (event, error) {
	var p struct {
		Number int `json:"number"`
		Issue  *struct {
			Number int `json:"number"`
		} `json:"issue"`
		Repository *struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
	}
	if err := json.Unmarshal(body, &p); err != nil {
		return event{}, err
	}
	e := event{Type: kind, Number: p.Number}
	if p.Issue != nil {
		e.Number = p.Issue.Number
	}
	if p.Repository != nil {
		e.Repo = p.Repository.FullName
	}
	return e, nil
}

func (s *Server) webhook(w http.ResponseWriter, r *http.Request) {
	if s.cfg.WebhookSecret == "" {
		http.NotFound(w, r)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 25<<20)) // GitHub caps payloads at 25 MB
	if err != nil {
		badRequest(w, "unreadable body")
		return
	}
	m := hmac.New(sha256.New, []byte(s.cfg.WebhookSecret))
	m.Write(body)
	want := "sha256=" + hex.EncodeToString(m.Sum(nil))
	if !hmac.Equal([]byte(r.Header.Get("X-Hub-Signature-256")), []byte(want)) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "bad signature", "code": "unauthorized"})
		return
	}
	kind := r.Header.Get("X-GitHub-Event")
	if kind == "ping" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	e, err := eventFrom(kind, body)
	if err != nil {
		badRequest(w, "payload is not JSON")
		return
	}
	s.gh.ClearCache() // the next read must see what changed, not a cached copy
	if e.Repo != "" && strings.EqualFold(e.Repo, s.cfg.NotesRepo) && kind == "push" {
		s.links.Invalidate()
	}
	s.hub.publish(e)
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) events(w http.ResponseWriter, r *http.Request) {
	flush := http.NewResponseController(w)
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("X-Accel-Buffering", "no")
	ch := s.hub.subscribe()
	defer s.hub.unsubscribe(ch)
	fmt.Fprint(w, ": connected\n\n")
	if err := flush.Flush(); err != nil {
		slog.Warn("events: streaming unsupported", "err", err)
		return
	}
	ping := time.NewTicker(25 * time.Second) // keeps proxies from closing an idle stream
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
		case e := <-ch:
			b, _ := json.Marshal(e)
			fmt.Fprintf(w, "data: %s\n\n", b)
		}
		if err := flush.Flush(); err != nil {
			return
		}
	}
}

// hookSync remembers the last webhook sync so opening the app doesn't re-check every repo each time.
type hookSync struct {
	mu   sync.Mutex
	at   time.Time
	last syncResult
}

type syncResult struct {
	Enabled bool     `json:"enabled"`
	Added   []string `json:"added"`
	Failed  []string `json:"failed"`
}

const syncEvery = 6 * time.Hour

// syncHooks adds Gantry's webhook to every repo the user administers. Repos without admin rights
// can't take a webhook; they still refresh on reload.
func (s *Server) syncHooks(w http.ResponseWriter, r *http.Request) {
	if s.cfg.WebhookSecret == "" {
		writeJSON(w, http.StatusOK, syncResult{Added: []string{}, Failed: []string{}})
		return
	}
	s.sync.mu.Lock()
	defer s.sync.mu.Unlock()
	if time.Since(s.sync.at) < syncEvery {
		writeJSON(w, http.StatusOK, s.sync.last)
		return
	}
	repos, err := s.gh.Repos(r.Context(), token(r))
	if err != nil {
		s.fail(w, err)
		return
	}
	url := s.cfg.BaseURL + "/webhooks/github"
	res := syncResult{Enabled: true, Added: []string{}, Failed: []string{}}
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 4)
	for _, repo := range repos {
		if !repo.Admin {
			continue
		}
		owner, name, _ := strings.Cut(repo.FullName, "/")
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			added, err := s.gh.EnsureHook(r.Context(), token(r), owner, name, url, s.cfg.WebhookSecret)
			mu.Lock()
			defer mu.Unlock()
			switch {
			case err != nil:
				slog.Warn("webhook sync", "repo", repo.FullName, "err", err)
				res.Failed = append(res.Failed, repo.FullName)
			case added:
				res.Added = append(res.Added, repo.FullName)
			}
		})
	}
	wg.Wait()
	slices.Sort(res.Added)
	slices.Sort(res.Failed)
	s.sync.last = res
	if len(res.Failed) == 0 { // retry failed repos on the next call, not after the window
		s.sync.at = time.Now()
	}
	writeJSON(w, http.StatusOK, res)
}
