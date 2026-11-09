package api

import (
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestHealthzAndSPA(t *testing.T) {
	spa := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("js")},
	}
	h, err := NewServer(Config{}, spa)
	if err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]string{
		"/healthz":       "ok",
		"/assets/app.js": "js",
		"/projects/abc":  "<html>app</html>",
	} {
		w := httptest.NewRecorder()
		h.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
		if w.Code != 200 || w.Body.String() != want {
			t.Errorf("%s: got %d %q, want %q", path, w.Code, w.Body.String(), want)
		}
	}
}
