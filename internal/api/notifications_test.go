package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestNotificationsMapRefsAndDefaultParticipating(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /notifications": func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("participating") != "true" {
			t.Errorf("query %q", r.URL.RawQuery)
		}
		fmt.Fprint(w, `[{"id":"1","unread":true,"reason":"review_requested","updated_at":"2026-11-10T10:00:00Z","subject":{"title":"Fix","type":"PullRequest","url":"http://x/repos/o/r/pulls/12"},"repository":{"full_name":"o/r"}},
{"id":"2","unread":true,"reason":"mention","updated_at":"2026-11-10T10:00:00Z","subject":{"title":"v1","type":"Release","url":"http://x/repos/o/r/releases/3"},"repository":{"full_name":"o/r"}}]`)
	}})
	w := call(h, c, "GET", "/api/notifications", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"ref":"o/r#12"`) || !strings.Contains(w.Body.String(), `"ref":""`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestNotificationsForbiddenIsPlainForbidden(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /notifications": func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(403)
		fmt.Fprint(w, `{"message":"nope"}`)
	}})
	w := call(h, c, "GET", "/api/notifications", "")
	if w.Code != 403 || !strings.Contains(w.Body.String(), `"code":"forbidden"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestMarkNotificationRead(t *testing.T) {
	var got string
	h, c := testServer(t, map[string]http.HandlerFunc{"PATCH /notifications/threads/7": func(w http.ResponseWriter, r *http.Request) {
		got = r.URL.Path
		w.WriteHeader(205)
	}})
	if w := call(h, c, "PATCH", "/api/notifications/threads/7", ""); w.Code != 204 || got == "" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := call(h, c, "PATCH", "/api/notifications/threads/x%2F..", ""); w.Code != 400 {
		t.Fatalf("bad id %d", w.Code)
	}
}
