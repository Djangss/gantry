package gh

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestProposedRunsIssueAndPRQueries(t *testing.T) {
	var qs []string
	c := fake(t, map[string]http.HandlerFunc{"GET /search/issues": func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query().Get("q")
		qs = append(qs, q)
		if strings.Contains(q, "is:pr") {
			fmt.Fprint(w, `{"items":[{"number":5,"title":"Docs","state":"open","repository_url":"https://api.github.com/repos/o/b","pull_request":{},"labels":[{"name":"proposed","color":"fff"}]}]}`)
			return
		}
		fmt.Fprint(w, `{"items":[{"number":2,"title":"Idea","state":"open","repository_url":"https://api.github.com/repos/o/a","labels":[]}]}`)
	}})
	out, err := c.Proposed(ctx, "tok", "Djangss")
	if err != nil {
		t.Fatal(err)
	}
	if len(qs) != 2 {
		t.Fatalf("queries %v", qs)
	}
	for _, q := range qs {
		for _, part := range []string{"is:open", "label:proposed", "author:Djangss"} {
			if !strings.Contains(q, part) {
				t.Errorf("query %q lacks %q", q, part)
			}
		}
	}
	if len(out) != 2 || out[0].Repo != "o/a" || out[1].Repo != "o/b" || !out[1].IsPR || out[0].IsPR {
		t.Fatalf("%+v", out)
	}
}

func TestItemNode(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"GET /repos/o/r/issues/4": body(`{"number":4,"node_id":"I_x","pull_request":{"url":"u"}}`)})
	id, isPR, err := c.ItemNode(ctx, "tok", "o", "r", 4)
	if err != nil || id != "I_x" || !isPR {
		t.Fatalf("%q %v %v", id, isPR, err)
	}
}

func TestRemoveLabelIgnoresMissing(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"DELETE /repos/o/r/issues/4/labels/proposed": func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(404)
		fmt.Fprint(w, `{"message":"Label does not exist"}`)
	}})
	if err := c.RemoveLabel(ctx, "tok", "o", "r", 4, "proposed"); err != nil {
		t.Fatal(err)
	}
}

func TestCloseIssueNotPlanned(t *testing.T) {
	var got map[string]any
	c := fake(t, map[string]http.HandlerFunc{"PATCH /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		fmt.Fprint(w, `{}`)
	}})
	if err := c.Close(ctx, "tok", "o", "r", 4, false); err != nil {
		t.Fatal(err)
	}
	if got["state"] != "closed" || got["state_reason"] != "not_planned" {
		t.Fatalf("%v", got)
	}
}

func TestClosePR(t *testing.T) {
	var got map[string]any
	c := fake(t, map[string]http.HandlerFunc{"PATCH /repos/o/r/pulls/4": func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		fmt.Fprint(w, `{}`)
	}})
	if err := c.Close(ctx, "tok", "o", "r", 4, true); err != nil || got["state"] != "closed" {
		t.Fatalf("%v %v", err, got)
	}
}

func TestMergeSquash(t *testing.T) {
	var got map[string]any
	c := fake(t, map[string]http.HandlerFunc{"PUT /repos/o/r/pulls/4/merge": func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		fmt.Fprint(w, `{"merged":true}`)
	}})
	if err := c.Merge(ctx, "tok", "o", "r", 4); err != nil || got["merge_method"] != "squash" {
		t.Fatalf("%v %v", err, got)
	}
}

func TestMergeConflictKeepsMessage(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"PUT /repos/o/r/pulls/4/merge": func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(409)
		fmt.Fprint(w, `{"message":"Head branch was modified. Review and try the merge again."}`)
	}})
	err := c.Merge(ctx, "tok", "o", "r", 4)
	e, ok := err.(*Error)
	if !ok || e.Status != 422 || !strings.HasPrefix(e.Message, "Head branch was modified") {
		t.Fatalf("%#v", err)
	}
}

func TestPRFiles(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"GET /repos/o/r/pulls/4/files": body(`[{"filename":"docs/a.md","status":"modified","patch":"@@ -1 +1 @@\n-a\n+b"},{"filename":"logo.png","status":"added"}]`)})
	fs, err := c.PRFiles(ctx, "tok", "o", "r", 4)
	if err != nil || len(fs) != 2 || fs[0].Patch == "" || fs[1].Patch != "" || fs[1].Status != "added" {
		t.Fatalf("%v %+v", err, fs)
	}
}
