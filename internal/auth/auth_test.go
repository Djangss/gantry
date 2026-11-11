package auth

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func fakeGitHub(t *testing.T, login string) *httptest.Server {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /login/oauth/access_token", func(w http.ResponseWriter, r *http.Request) {
		r.ParseForm()
		w.Header().Set("Content-Type", "application/json")
		if r.Form.Get("code") != "good-code" || r.Form.Get("client_secret") != "secret" {
			fmt.Fprint(w, `{"error":"bad_verification_code"}`)
			return
		}
		fmt.Fprint(w, `{"access_token":"tok-123"}`)
	})
	mux.HandleFunc("GET /user", func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok-123" {
			w.WriteHeader(401)
			return
		}
		fmt.Fprintf(w, `{"login":%q}`, login)
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return srv
}

func newAuth(t *testing.T, gh *httptest.Server) *Auth {
	a, err := New(Options{ClientID: "id", ClientSecret: "secret", AllowedLogin: "Djangss",
		BaseURL: "https://gantry.test", WebURL: gh.URL, APIURL: gh.URL, Key: make([]byte, 32)})
	if err != nil {
		t.Fatal(err)
	}
	return a
}

func callback(a *Auth, code, state, cookieState string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "/auth/callback?code="+code+"&state="+state, nil)
	r.AddCookie(&http.Cookie{Name: stateCookie, Value: cookieState})
	w := httptest.NewRecorder()
	a.Callback(w, r)
	return w
}

func session(w *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if c.Name == sessionCookie && c.MaxAge > 0 {
			return c
		}
	}
	return nil
}

func TestLoginRedirect(t *testing.T) {
	gh := fakeGitHub(t, "Djangss")
	w := httptest.NewRecorder()
	newAuth(t, gh).Login(w, httptest.NewRequest("GET", "/auth/login", nil))
	if w.Code != http.StatusFound {
		t.Fatalf("code %d", w.Code)
	}
	loc, _ := url.Parse(w.Header().Get("Location"))
	if !strings.HasPrefix(loc.String(), gh.URL+"/login/oauth/authorize?") {
		t.Fatalf("location %s", loc)
	}
	q := loc.Query()
	if q.Get("scope") != "repo project" || q.Get("redirect_uri") != "https://gantry.test/auth/callback" {
		t.Fatalf("query %v", q)
	}
	var state string
	for _, c := range w.Result().Cookies() {
		if c.Name == stateCookie {
			state = c.Value
		}
	}
	if state == "" || state != q.Get("state") {
		t.Fatalf("state cookie %q vs param %q", state, q.Get("state"))
	}
}

func TestCallbackAllowedCaseInsensitive(t *testing.T) {
	w := callback(newAuth(t, fakeGitHub(t, "djangss")), "good-code", "s1", "s1")
	if w.Code != http.StatusFound || w.Header().Get("Location") != "/" {
		t.Fatalf("got %d %s", w.Code, w.Header().Get("Location"))
	}
	c := session(w)
	if c == nil || !c.HttpOnly || !c.Secure || c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("bad session cookie %+v", c)
	}
}

func TestCallbackRejectsOtherLogin(t *testing.T) {
	gh := fakeGitHub(t, "mallory")
	var revoked string
	gh.Config.Handler.(*http.ServeMux).HandleFunc("DELETE /applications/id/token", func(w http.ResponseWriter, r *http.Request) {
		var in struct {
			AccessToken string `json:"access_token"`
		}
		json.NewDecoder(r.Body).Decode(&in)
		revoked = in.AccessToken
		w.WriteHeader(204)
	})
	w := callback(newAuth(t, gh), "good-code", "s1", "s1")
	if w.Code != http.StatusForbidden || session(w) != nil {
		t.Fatalf("got %d, cookie %v", w.Code, session(w))
	}
	if revoked != "tok-123" {
		t.Fatalf("rejected token not revoked, got %q", revoked)
	}
}

func TestCallbackBadState(t *testing.T) {
	w := callback(newAuth(t, fakeGitHub(t, "Djangss")), "good-code", "s1", "other")
	if w.Code != http.StatusBadRequest {
		t.Fatalf("got %d", w.Code)
	}
}

func TestCallbackBadCode(t *testing.T) {
	w := callback(newAuth(t, fakeGitHub(t, "Djangss")), "bad-code", "s1", "s1")
	if w.Code != http.StatusBadGateway {
		t.Fatalf("got %d", w.Code)
	}
}

func TestRequire(t *testing.T) {
	a := newAuth(t, fakeGitHub(t, "Djangss"))
	var seen Session
	h := a.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { seen, _ = FromContext(r.Context()) }))

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/api/me", nil))
	if w.Code != 401 || !strings.Contains(w.Body.String(), `"code":"unauthorized"`) {
		t.Fatalf("no cookie: %d %s", w.Code, w.Body)
	}

	r := httptest.NewRequest("GET", "/api/me", nil)
	r.AddCookie(&http.Cookie{Name: sessionCookie, Value: "tampered"})
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 401 {
		t.Fatalf("tampered: %d", w.Code)
	}

	set := httptest.NewRecorder()
	if err := a.SetSession(set, Session{Token: "tok", Login: "Djangss"}); err != nil {
		t.Fatal(err)
	}
	r = httptest.NewRequest("GET", "/api/me", nil)
	r.AddCookie(set.Result().Cookies()[0])
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 || seen.Token != "tok" {
		t.Fatalf("valid: %d %+v", w.Code, seen)
	}
}

func TestCSRF(t *testing.T) {
	h := CSRF(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	cases := []struct {
		method, header string
		want           int
	}{{"POST", "", 403}, {"PUT", "other", 403}, {"POST", "gantry", 200}, {"GET", "", 200}}
	for _, c := range cases {
		r := httptest.NewRequest(c.method, "/api/x", nil)
		if c.header != "" {
			r.Header.Set("X-Requested-With", c.header)
		}
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != c.want {
			t.Errorf("%s header=%q: got %d want %d", c.method, c.header, w.Code, c.want)
		}
	}
}

func TestLogoutRevokesToken(t *testing.T) {
	gh := fakeGitHub(t, "Djangss")
	var revoked string
	gh.Config.Handler.(*http.ServeMux).HandleFunc("DELETE /applications/id/token", func(w http.ResponseWriter, r *http.Request) {
		if u, p, _ := r.BasicAuth(); u == "id" && p == "secret" {
			var in struct {
				AccessToken string `json:"access_token"`
			}
			json.NewDecoder(r.Body).Decode(&in)
			revoked = in.AccessToken
		}
		w.WriteHeader(204)
	})
	a := newAuth(t, gh)
	set := httptest.NewRecorder()
	a.SetSession(set, Session{Token: "tok-123", Login: "Djangss"})
	r := httptest.NewRequest("POST", "/auth/logout", nil)
	r.AddCookie(set.Result().Cookies()[0])
	w := httptest.NewRecorder()
	a.Logout(w, r)
	if w.Code != 204 || revoked != "tok-123" {
		t.Fatalf("status %d, revoked %q", w.Code, revoked)
	}
	if c := w.Result().Cookies(); len(c) == 0 || c[0].MaxAge >= 0 {
		t.Fatal("session cookie not cleared")
	}
}

func TestLogoutClearsCookieWhenRevokeFails(t *testing.T) {
	a := newAuth(t, fakeGitHub(t, "Djangss")) // no revoke route: 404
	set := httptest.NewRecorder()
	a.SetSession(set, Session{Token: "tok-123", Login: "Djangss"})
	r := httptest.NewRequest("POST", "/auth/logout", nil)
	r.AddCookie(set.Result().Cookies()[0])
	w := httptest.NewRecorder()
	a.Logout(w, r)
	if c := w.Result().Cookies(); w.Code != 204 || len(c) == 0 || c[0].MaxAge >= 0 {
		t.Fatalf("status %d cookies %v", w.Code, c)
	}
}
