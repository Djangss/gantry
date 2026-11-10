package main

import (
	"encoding/base64"
	"strings"
	"testing"
)

func valid() map[string]string {
	return map[string]string{
		"GITHUB_CLIENT_ID":     "id",
		"GITHUB_CLIENT_SECRET": "secret",
		"COOKIE_KEY":           base64.StdEncoding.EncodeToString(make([]byte, 32)),
		"ALLOWED_LOGIN":        "Djangss",
		"NOTES_REPO":           "Djangss/notes",
		"BASE_URL":             "https://gantry.mijotez.me/",
	}
}

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestLoadConfigValid(t *testing.T) {
	cfg, err := loadConfig(env(valid()))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Port != "8080" || cfg.BaseURL != "https://gantry.mijotez.me" || len(cfg.CookieKey) != 32 {
		t.Fatalf("bad config: %+v", cfg)
	}
	if cfg.GitHubAPIURL != "https://api.github.com" || cfg.GitHubWebURL != "https://github.com" {
		t.Fatalf("bad GitHub URLs: %+v", cfg)
	}
}

func TestLoadConfigMissing(t *testing.T) {
	m := valid()
	delete(m, "GITHUB_CLIENT_SECRET")
	delete(m, "BASE_URL")
	_, err := loadConfig(env(m))
	if err == nil || !strings.Contains(err.Error(), "GITHUB_CLIENT_SECRET") || !strings.Contains(err.Error(), "BASE_URL") {
		t.Fatalf("want both missing vars named, got %v", err)
	}
}

func TestLoadConfigBadKey(t *testing.T) {
	m := valid()
	m["COOKIE_KEY"] = "c2hvcnQ="
	if _, err := loadConfig(env(m)); err == nil {
		t.Fatal("want error for short key")
	}
}

func TestLoadConfigBadNotesRepo(t *testing.T) {
	m := valid()
	m["NOTES_REPO"] = "notes"
	if _, err := loadConfig(env(m)); err == nil {
		t.Fatal("want error for NOTES_REPO without owner")
	}
}

func TestLoadConfigWebhookSecretOptional(t *testing.T) {
	m := valid()
	cfg, err := loadConfig(env(m))
	if err != nil || cfg.WebhookSecret != "" {
		t.Fatalf("without secret: %v %q", err, cfg.WebhookSecret)
	}
	m["WEBHOOK_SECRET"] = "hush"
	if cfg, _ := loadConfig(env(m)); cfg.WebhookSecret != "hush" {
		t.Fatalf("secret not read: %q", cfg.WebhookSecret)
	}
}
