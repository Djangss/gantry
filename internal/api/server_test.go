package api

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/Djangss/gantry/internal/auth"
)

func testServer(t *testing.T, routes map[string]http.HandlerFunc) (http.Handler, *http.Cookie) {
	mux := http.NewServeMux()
	for p, h := range routes {
		mux.HandleFunc(p, h)
	}
	fake := httptest.NewServer(mux)
	t.Cleanup(fake.Close)
	cfg := Config{ClientID: "id", ClientSecret: "s", CookieKey: make([]byte, 32), AllowedLogin: "Djangss",
		NotesRepo: "Djangss/notes", BaseURL: "http://gantry.test", Port: "8080", GitHubWebURL: fake.URL, GitHubAPIURL: fake.URL}
	h, err := NewServer(cfg, fstest.MapFS{"index.html": {Data: []byte("app")}})
	if err != nil {
		t.Fatal(err)
	}
	a, _ := auth.New(auth.Options{AllowedLogin: "Djangss", BaseURL: cfg.BaseURL, Key: cfg.CookieKey})
	w := httptest.NewRecorder()
	a.SetSession(w, auth.Session{Token: "tok", Login: "Djangss"})
	return h, w.Result().Cookies()[0]
}

func call(h http.Handler, c *http.Cookie, method, path, body string) *httptest.ResponseRecorder {
	var rd io.Reader
	if body != "" {
		rd = strings.NewReader(body)
	}
	r := httptest.NewRequest(method, path, rd)
	if c != nil {
		r.AddCookie(c)
	}
	r.Header.Set("X-Requested-With", "gantry")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func status(code int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(code) }
}

func TestHealthzAndSPA(t *testing.T) {
	h, _ := testServer(t, nil)
	if w := call(h, nil, "GET", "/healthz", ""); w.Body.String() != "ok" {
		t.Fatalf("healthz %q", w.Body)
	}
	if w := call(h, nil, "GET", "/projects/abc", ""); w.Body.String() != "app" {
		t.Fatalf("spa fallback %q", w.Body)
	}
}

func TestAPIRequiresSession(t *testing.T) {
	h, _ := testServer(t, nil)
	if w := call(h, nil, "GET", "/api/me", ""); w.Code != 401 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestMe(t *testing.T) {
	h, c := testServer(t, nil)
	w := call(h, c, "GET", "/api/me", "")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"login":"Djangss","notesRepo":"Djangss/notes"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestRateLimitMapping(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /user/repos": func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", "1700000000")
		w.WriteHeader(403)
	}})
	w := call(h, c, "GET", "/api/repos", "")
	if w.Code != 429 || !strings.Contains(w.Body.String(), `"code":"rate_limited"`) || !strings.Contains(w.Body.String(), `"reset":"2023-11-14T22:13:20Z"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestRevokedTokenClearsCookie(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /user/repos": status(401)})
	w := call(h, c, "GET", "/api/repos", "")
	if w.Code != 401 {
		t.Fatalf("got %d", w.Code)
	}
	cleared := false
	for _, ck := range w.Result().Cookies() {
		cleared = cleared || (ck.Name == "gantry_session" && ck.MaxAge < 0)
	}
	if !cleared {
		t.Fatal("session cookie not cleared")
	}
}

func TestUpstream5xx(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /user/repos": status(500)})
	if w := call(h, c, "GET", "/api/repos", ""); w.Code != 502 || !strings.Contains(w.Body.String(), `"code":"upstream"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestPutConflict(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"PUT /repos/o/r/contents/docs/a.md": status(409)})
	w := call(h, c, "PUT", "/api/repos/o/r/contents/docs/a.md", `{"content":"x","sha":"old","message":"m"}`)
	if w.Code != 409 || !strings.Contains(w.Body.String(), `"code":"conflict"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestMoveItemValidation(t *testing.T) {
	h, c := testServer(t, nil)
	if w := call(h, c, "PATCH", "/api/projects/P1/items/I1", `{"fieldId":"F1"}`); w.Code != 400 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestMutationNeedsCSRFHeader(t *testing.T) {
	h, c := testServer(t, nil)
	r := httptest.NewRequest("PUT", "/api/repos/o/r/contents/a.md", strings.NewReader(`{}`))
	r.AddCookie(c)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestContentsNestedPath(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /repos/o/r/contents/docs/guide/a.md": func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"type":"file","encoding":"base64","content":%q,"sha":"s1"}`, base64.StdEncoding.EncodeToString([]byte("hello")))
	}})
	w := call(h, c, "GET", "/api/repos/o/r/contents/docs/guide/a.md", "")
	if w.Code != 200 || strings.TrimSpace(w.Body.String()) != `{"content":"hello","sha":"s1"}` {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestLinksRejectsBadRef(t *testing.T) {
	h, c := testServer(t, nil)
	if w := call(h, c, "GET", "/api/links?ref=nope", ""); w.Code != 400 {
		t.Fatalf("got %d", w.Code)
	}
}

func TestFrameHeaders(t *testing.T) {
	h, _ := testServer(t, nil)
	w := call(h, nil, "GET", "/", "")
	if w.Header().Get("X-Frame-Options") != "DENY" || !strings.Contains(w.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
		t.Fatalf("headers %v", w.Header())
	}
}
