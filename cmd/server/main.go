package main

import (
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/Djangss/gantry/internal/api"
	"github.com/Djangss/gantry/web"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	cfg, err := loadConfig(os.Getenv)
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	h, err := api.NewServer(cfg, web.Dist())
	if err != nil {
		slog.Error("startup", "err", err)
		os.Exit(1)
	}
	slog.Info("listening", "port", cfg.Port)
	if err := http.ListenAndServe(":"+cfg.Port, h); err != nil {
		slog.Error("server", "err", err)
		os.Exit(1)
	}
}

func loadConfig(getenv func(string) string) (api.Config, error) {
	var missing []string
	need := func(k string) string {
		v := getenv(k)
		if v == "" {
			missing = append(missing, k)
		}
		return v
	}
	cfg := api.Config{
		ClientID:     need("GITHUB_CLIENT_ID"),
		ClientSecret: need("GITHUB_CLIENT_SECRET"),
		AllowedLogin: need("ALLOWED_LOGIN"),
		NotesRepo:    need("NOTES_REPO"),
		BaseURL:      strings.TrimRight(need("BASE_URL"), "/"),
		Port:         getenv("PORT"),
		GitHubWebURL: "https://github.com",
		GitHubAPIURL: "https://api.github.com",
	}
	key := need("COOKIE_KEY")
	if len(missing) > 0 {
		return cfg, fmt.Errorf("missing env: %s", strings.Join(missing, ", "))
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}
	k, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(k) != 32 {
		return cfg, errors.New("COOKIE_KEY must be 32 bytes, base64 (openssl rand -base64 32)")
	}
	cfg.CookieKey = k
	owner, repo, ok := strings.Cut(cfg.NotesRepo, "/")
	if !ok || owner == "" || repo == "" || strings.Contains(repo, "/") {
		return cfg, errors.New("NOTES_REPO must be owner/repo")
	}
	return cfg, nil
}
