package api

import (
	"io/fs"
	"net/http"
	"strings"

	"github.com/Djangss/gantry/internal/auth"
	"github.com/Djangss/gantry/internal/gh"
	"github.com/Djangss/gantry/internal/notes"
)

type Config struct {
	ClientID, ClientSecret     string
	CookieKey                  []byte
	AllowedLogin               string
	NotesRepo                  string // owner/repo
	BaseURL                    string
	Port                       string
	GitHubWebURL, GitHubAPIURL string
	WebhookSecret              string // empty disables POST /webhooks/github
}

type Server struct {
	cfg   Config
	auth  *auth.Auth
	gh    *gh.Client
	links *notes.Index
	hub   *hub
}

func NewServer(cfg Config, spa fs.FS) (http.Handler, error) {
	a, err := auth.New(auth.Options{ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, AllowedLogin: cfg.AllowedLogin,
		BaseURL: cfg.BaseURL, WebURL: cfg.GitHubWebURL, APIURL: cfg.GitHubAPIURL, Key: cfg.CookieKey})
	if err != nil {
		return nil, err
	}
	s := &Server{cfg: cfg, auth: a, gh: gh.New(cfg.GitHubAPIURL), hub: newHub()}
	owner, repo, _ := strings.Cut(cfg.NotesRepo, "/")
	s.links = notes.New(s.gh, owner, repo)

	api := http.NewServeMux()
	api.HandleFunc("GET /api/me", s.me)
	api.HandleFunc("GET /api/repos", s.repos)
	api.HandleFunc("GET /api/repos/contributed", s.contributed)
	api.HandleFunc("GET /api/repos/{owner}/{repo}/issues", s.repoIssues)
	api.HandleFunc("GET /api/projects", s.projects)
	api.HandleFunc("GET /api/projects/{id}/items", s.board)
	api.HandleFunc("PATCH /api/projects/{id}/items/{itemId}", s.moveItem)
	api.HandleFunc("GET /api/repos/{owner}/{repo}/issues/{n}", s.issue)
	api.HandleFunc("POST /api/repos/{owner}/{repo}/issues/{n}/comments", s.comment)
	api.HandleFunc("GET /api/repos/{owner}/{repo}/tree", s.tree)
	api.HandleFunc("GET /api/repos/{owner}/{repo}/contents/{path...}", s.getContents)
	api.HandleFunc("PUT /api/repos/{owner}/{repo}/contents/{path...}", s.putContents)
	api.HandleFunc("GET /api/links", s.linksFor)
	api.HandleFunc("POST /api/links/rescan", s.rescan)
	api.HandleFunc("GET /api/events", s.events)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.HandleFunc("GET /auth/login", a.Login)
	mux.HandleFunc("GET /auth/callback", a.Callback)
	mux.Handle("POST /auth/logout", auth.CSRF(http.HandlerFunc(a.Logout)))
	mux.Handle("/api/", a.Require(auth.CSRF(api)))
	mux.HandleFunc("POST /webhooks/github", s.webhook)
	mux.Handle("/", spaHandler(spa))
	return noFraming(mux), nil
}

// noFraming blocks clickjacking of actions like drag-to-move or "Overwrite with mine".
func noFraming(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Content-Security-Policy", "frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}
