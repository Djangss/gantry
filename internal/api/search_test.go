package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestSearchGroupsNotesAndIssues(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{
		"GET /search/issues": func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, `{"items":[{"number":2,"title":"Kanban","state":"open","repository_url":"https://api.github.com/repos/o/a","labels":[]}]}`)
		},
		"GET /repos/Djangss/notes": func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"default_branch":"main"}`) },
		"GET /repos/Djangss/notes/git/trees/main": func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, `{"tree":[{"path":"notes/k.md","type":"blob","sha":"s1"}]}`)
		},
		"GET /repos/Djangss/notes/contents/notes/k.md": func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprint(w, `{"type":"file","encoding":"base64","content":"a2FuYmFuIG5vdGU=","sha":"s1"}`)
		},
	})
	w := call(h, c, "GET", "/api/search?q=kanban", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"notes":[{"path":"notes/k.md"`) || !strings.Contains(w.Body.String(), `"issues":[{"number":2`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if w := call(h, c, "GET", "/api/search?q=", ""); w.Code != 200 || !strings.Contains(w.Body.String(), `"notes":[]`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
