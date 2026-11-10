package api

import (
	"bufio"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const secret = "s3cret"

func withSecret(c *Config) { c.WebhookSecret = secret }

func sign(body string) string {
	m := hmac.New(sha256.New, []byte(secret))
	m.Write([]byte(body))
	return "sha256=" + hex.EncodeToString(m.Sum(nil))
}

func hook(h http.Handler, event, body, sig string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("POST", "/webhooks/github", strings.NewReader(body))
	r.Header.Set("X-GitHub-Event", event)
	r.Header.Set("X-Hub-Signature-256", sig)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestWebhookDisabledWithoutSecret(t *testing.T) {
	h, _ := testServer(t, nil)
	if w := hook(h, "ping", "{}", sign("{}")); w.Code != 404 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestWebhookRejectsBadSignature(t *testing.T) {
	h, _ := testServer(t, nil, withSecret)
	for _, sig := range []string{"", "sha256=00", sign("other body")} {
		if w := hook(h, "issues", `{"action":"edited"}`, sig); w.Code != 401 {
			t.Fatalf("sig %q: got %d", sig, w.Code)
		}
	}
	if w := hook(h, "ping", "{}", sign("{}")); w.Code != 204 {
		t.Fatalf("ping: got %d", w.Code)
	}
}

func TestWebhookReachesEventStream(t *testing.T) {
	h, c := testServer(t, nil, withSecret)
	srv := httptest.NewServer(h)
	t.Cleanup(srv.Close)
	req, _ := http.NewRequest("GET", srv.URL+"/api/events", nil)
	req.AddCookie(c)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); ct != "text/event-stream" {
		t.Fatalf("content type %q", ct)
	}
	lines := bufio.NewScanner(resp.Body)
	lines.Scan() // ": connected" comes first, so the subscription exists before the webhook fires

	body := `{"action":"edited","issue":{"number":7},"repository":{"full_name":"Djangss/gantry"}}`
	if w := hook(h, "issues", body, sign(body)); w.Code != 204 {
		t.Fatalf("webhook: %d %s", w.Code, w.Body)
	}
	got := make(chan string, 1)
	go func() {
		for lines.Scan() {
			if l := lines.Text(); strings.HasPrefix(l, "data: ") {
				got <- l
				return
			}
		}
	}()
	select {
	case l := <-got:
		if l != `data: {"type":"issues","repo":"Djangss/gantry","number":7}` {
			t.Fatalf("event %q", l)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no event on the stream")
	}
}

func TestEventFromPayload(t *testing.T) {
	cases := map[string]struct{ event, body, want string }{
		"comment": {"issue_comment", `{"issue":{"number":3},"repository":{"full_name":"o/r"}}`, "{issue_comment o/r 3}"},
		"pr":      {"pull_request", `{"number":5,"pull_request":{"number":5},"repository":{"full_name":"o/r"}}`, "{pull_request o/r 5}"},
		"push":    {"push", `{"repository":{"full_name":"o/notes"}}`, "{push o/notes 0}"},
		"project": {"projects_v2_item", `{"projects_v2_item":{"id":1}}`, "{projects_v2_item  0}"},
	}
	for name, c := range cases {
		e, err := eventFrom(c.event, []byte(c.body))
		if err != nil || fmt.Sprint(e) != c.want {
			t.Errorf("%s: %v %s", name, err, fmt.Sprint(e))
		}
	}
}

func TestWebhookSyncAddsHooksToAdminRepos(t *testing.T) {
	var calls, created []string
	h, c := testServer(t, map[string]http.HandlerFunc{
		"GET /user/repos": func(w http.ResponseWriter, r *http.Request) {
			calls = append(calls, "repos")
			fmt.Fprint(w, `[{"full_name":"o/a","permissions":{"admin":true}},{"full_name":"o/b","permissions":{"admin":false}}]`)
		},
		"GET /repos/o/a/hooks": func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `[]`) },
		"POST /repos/o/a/hooks": func(w http.ResponseWriter, r *http.Request) {
			created = append(created, "o/a")
			w.WriteHeader(201)
			fmt.Fprint(w, `{"id":1}`)
		},
	}, withSecret)
	w := call(h, c, "POST", "/api/webhooks/sync", "")
	if w.Code != 200 || fmt.Sprint(created) != "[o/a]" || !strings.Contains(w.Body.String(), `"added":["o/a"]`) {
		t.Fatalf("%d %s created=%v", w.Code, w.Body, created)
	}
	call(h, c, "POST", "/api/webhooks/sync", "")
	if len(calls) != 1 {
		t.Fatalf("second sync inside the window hit GitHub again (%d)", len(calls))
	}
}

func TestWebhookSyncOffWithoutSecret(t *testing.T) {
	h, c := testServer(t, nil)
	if w := call(h, c, "POST", "/api/webhooks/sync", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"enabled":false`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
