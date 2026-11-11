package gh

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestSearchScopesToUserAndText(t *testing.T) {
	var qs []string
	c := fake(t, map[string]http.HandlerFunc{"GET /search/issues": func(w http.ResponseWriter, r *http.Request) {
		qs = append(qs, r.URL.Query().Get("q"))
		fmt.Fprint(w, `{"items":[{"number":2,"title":"Idea","state":"open","repository_url":"https://api.github.com/repos/o/a","labels":[]}]}`)
	}})
	out, err := c.Search(ctx, "tok", "Djangss", "kanban board")
	if err != nil || len(out) != 1 || out[0].Repo != "o/a" {
		t.Fatalf("%+v %v", out, err)
	}
	if len(qs) != 4 || !strings.Contains(qs[0], "is:issue") || !strings.Contains(qs[1], "is:pr") {
		t.Fatalf("queries %v", qs)
	}
	for i, q := range qs {
		scope := []string{"involves:Djangss", "user:Djangss"}[i/2]
		if !strings.Contains(q, scope) || !strings.Contains(q, "kanban board") {
			t.Errorf("query %q lacks %q", q, scope)
		}
	}
}
