package api

import (
	"io/fs"
	"net/http"
)

type Config struct {
	ClientID, ClientSecret     string
	CookieKey                  []byte
	AllowedLogin               string
	NotesRepo                  string // owner/repo
	BaseURL                    string
	Port                       string
	GitHubWebURL, GitHubAPIURL string
}

func NewServer(cfg Config, spa fs.FS) (http.Handler, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("ok")) })
	mux.Handle("/", spaHandler(spa))
	return mux, nil
}
