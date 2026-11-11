package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestSearchKeepsIssuesWhenNotesFail(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{
		"GET /search/issues": func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, `{"items":[{"number":2,"title":"Kanban","state":"open","repository_url":"https://api.github.com/repos/o/a","labels":[]}]}`)
		},
		"GET /repos/Djangss/notes": func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(500) },
	})
	w := call(h, c, "GET", "/api/search?q=kanban", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"notes":[]`) || !strings.Contains(w.Body.String(), `"issues":[{"number":2`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
