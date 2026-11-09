package gh

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func fake(t *testing.T, routes map[string]http.HandlerFunc) *Client {
	mux := http.NewServeMux()
	for p, h := range routes {
		mux.HandleFunc(p, h)
	}
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	return New(srv.URL)
}

func body(s string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, s) }
}

func TestReposPaginates(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"GET /user/repos": func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("affiliation") != "owner" {
			t.Errorf("query %v", r.URL.Query())
		}
		if r.URL.Query().Get("page") == "2" {
			fmt.Fprint(w, `[{"full_name":"o/b","private":true}]`)
			return
		}
		w.Header().Set("Link", fmt.Sprintf(`<http://%s/user/repos?page=2>; rel="next"`, r.Host))
		fmt.Fprint(w, `[{"full_name":"o/a"}]`)
	}})
	rs, err := c.Repos(ctx, "tok")
	if err != nil || fmt.Sprint(rs) != "[{o/a false} {o/b true}]" {
		t.Fatalf("%v %v", err, rs)
	}
}

func TestRateLimitIsWrapped(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"GET /user/repos": func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-RateLimit-Remaining", "0")
		w.Header().Set("X-RateLimit-Reset", "1700000000")
		w.WriteHeader(403)
		fmt.Fprint(w, `{"message":"API rate limit exceeded"}`)
	}})
	_, err := c.Repos(ctx, "tok")
	var e *Error
	if !errors.As(err, &e) || !e.RateLimited || !e.Reset.Equal(time.Unix(1700000000, 0)) {
		t.Fatalf("got %#v", err)
	}
}

func TestIssuePR(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"GET /repos/o/r/issues/7":               body(`{"number":7,"title":"Add board","state":"open","body":"b","html_url":"https://github.com/o/r/pull/7","user":{"login":"Djangss"},"labels":[{"name":"ui","color":"00ff00"}],"pull_request":{}}`),
		"GET /repos/o/r/issues/7/comments":      body(`[{"id":1,"user":{"login":"bob"},"body":"lgtm","created_at":"2026-11-01T10:00:00Z"}]`),
		"GET /repos/o/r/pulls/7":                body(`{"merged":false,"draft":true,"head":{"sha":"abc"}}`),
		"GET /repos/o/r/pulls/7/reviews":        body(`[{"user":{"login":"bob"},"state":"CHANGES_REQUESTED"},{"user":{"login":"amy"},"state":"COMMENTED"},{"user":{"login":"bob"},"state":"APPROVED"}]`),
		"GET /repos/o/r/commits/abc/check-runs": body(`{"check_runs":[{"name":"ci","status":"completed","conclusion":"success"}]}`),
	})
	is, err := c.Issue(ctx, "tok", "o", "r", 7)
	if err != nil {
		t.Fatal(err)
	}
	if is.Title != "Add board" || is.User != "Djangss" || is.URL != "https://github.com/o/r/pull/7" || fmt.Sprint(is.Labels) != "[{ui 00ff00}]" {
		t.Fatalf("issue %+v", is)
	}
	if len(is.Comments) != 1 || is.Comments[0].User != "bob" || is.Comments[0].CreatedAt.Year() != 2026 {
		t.Fatalf("comments %+v", is.Comments)
	}
	if is.PR == nil || !is.PR.Draft || fmt.Sprint(is.PR.Reviews) != "[{bob APPROVED}]" || fmt.Sprint(is.PR.Checks) != "[{ci completed success}]" {
		t.Fatalf("pr %+v", is.PR)
	}
}

func TestIssuePlain(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"GET /repos/o/r/issues/3":          body(`{"number":3,"title":"Bug","state":"open","body":null,"user":{"login":"a"},"labels":[]}`),
		"GET /repos/o/r/issues/3/comments": body(`[]`),
	})
	is, err := c.Issue(ctx, "tok", "o", "r", 3)
	if err != nil || is.PR != nil || is.Comments == nil || is.Labels == nil {
		t.Fatalf("%v %+v", err, is)
	}
}

func TestCreateComment(t *testing.T) {
	var got map[string]string
	c := fake(t, map[string]http.HandlerFunc{"POST /repos/o/r/issues/3/comments": func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(201)
		fmt.Fprint(w, `{"id":9,"user":{"login":"Djangss"},"body":"hi","created_at":"2026-11-09T10:00:00Z"}`)
	}})
	cm, err := c.CreateComment(ctx, "tok", "o", "r", 3, "hi")
	if err != nil || got["body"] != "hi" || cm.ID != 9 || cm.User != "Djangss" {
		t.Fatalf("%v %v %+v", err, got, cm)
	}
}

func TestGetContents(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"GET /repos/o/r/contents/docs/a.md": body(`{"type":"file","encoding":"base64","content":"aGVs\nbG8=","sha":"s1"}`),
		"GET /repos/o/r/contents/drawings/big.excalidraw": func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Accept") == "application/vnd.github.raw+json" {
				fmt.Fprint(w, "big")
				return
			}
			fmt.Fprint(w, `{"type":"file","encoding":"none","content":"","sha":"s2"}`)
		},
		"GET /repos/o/r/contents/docs": body(`[{"type":"file","path":"docs/a.md"}]`),
	})
	f, err := c.GetContents(ctx, "tok", "o", "r", "docs/a.md")
	if err != nil || f.Content != "hello" || f.SHA != "s1" {
		t.Fatalf("small: %v %+v", err, f)
	}
	f, err = c.GetContents(ctx, "tok", "o", "r", "drawings/big.excalidraw")
	if err != nil || f.Content != "big" || f.SHA != "s2" {
		t.Fatalf("large: %v %+v", err, f)
	}
	var e *Error
	if _, err = c.GetContents(ctx, "tok", "o", "r", "docs"); !errors.As(err, &e) || e.Status != 400 {
		t.Fatalf("directory: %#v", err)
	}
}

func TestPutContentsUpdate(t *testing.T) {
	var got map[string]string
	c := fake(t, map[string]http.HandlerFunc{
		"PUT /repos/o/r/contents/docs/a.md": func(w http.ResponseWriter, r *http.Request) {
			json.NewDecoder(r.Body).Decode(&got)
			fmt.Fprint(w, `{"content":{"sha":"s2"}}`)
		},
	})
	sha, err := c.PutContents(ctx, "tok", "o", "r", "docs/a.md", "hi", "s1", "docs: update docs/a.md")
	if err != nil || sha != "s2" {
		t.Fatalf("%v %q", err, sha)
	}
	if got["sha"] != "s1" || got["message"] != "docs: update docs/a.md" || got["content"] != base64.StdEncoding.EncodeToString([]byte("hi")) {
		t.Fatalf("body %v", got)
	}
}

func TestPutContentsStaleSHAIsConflict(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"PUT /repos/o/r/contents/docs/a.md": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(409)
			fmt.Fprint(w, `{"message":"docs/a.md does not match s1"}`)
		},
	})
	_, err := c.PutContents(ctx, "tok", "o", "r", "docs/a.md", "x", "s1", "m")
	var e *Error
	if !errors.As(err, &e) || e.Status != 409 {
		t.Fatalf("want 409, got %#v", err)
	}
}

func TestPutContentsCreateExistingIsConflict(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"PUT /repos/o/r/contents/notes/a.md": func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(422)
			fmt.Fprint(w, `{"message":"Invalid request. \"sha\" wasn't supplied."}`)
		},
	})
	_, err := c.PutContents(ctx, "tok", "o", "r", "notes/a.md", "x", "", "notes: add notes/a.md")
	var e *Error
	if !errors.As(err, &e) || e.Status != 409 {
		t.Fatalf("want 409, got %#v", err)
	}
}

func TestTree(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{
		"GET /repos/o/r":                    body(`{"default_branch":"main"}`),
		"GET /repos/o/r/git/trees/main":     body(`{"tree":[{"path":"docs","type":"tree"},{"path":"docs/a.md","type":"blob"},{"path":"docsx/b.md","type":"blob"},{"path":"README.md","type":"blob"}]}`),
		"GET /repos/o/empty":                body(`{"default_branch":"main"}`),
		"GET /repos/o/empty/git/trees/main": func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(409) },
	})
	tr, err := c.Tree(ctx, "tok", "o", "r", "docs")
	if err != nil || fmt.Sprint(tr) != "[{docs tree} {docs/a.md blob}]" {
		t.Fatalf("%v %v", err, tr)
	}
	tr, err = c.Tree(ctx, "tok", "o", "empty", "")
	if err != nil || tr == nil || len(tr) != 0 {
		t.Fatalf("empty repo: %v %v", err, tr)
	}
}

func TestRESTUsesETagCache(t *testing.T) {
	var inm []string
	c := fake(t, map[string]http.HandlerFunc{"GET /user/repos": func(w http.ResponseWriter, r *http.Request) {
		inm = append(inm, r.Header.Get("If-None-Match"))
		if r.Header.Get("If-None-Match") == `"r1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("ETag", `"r1"`)
		fmt.Fprint(w, `[{"full_name":"o/a"}]`)
	}})
	for range 2 {
		if rs, err := c.Repos(ctx, "tok"); err != nil || len(rs) != 1 {
			t.Fatalf("%v %v", err, rs)
		}
	}
	if fmt.Sprint(inm) != `[ "r1"]` {
		t.Fatalf("If-None-Match sent: %q", inm)
	}
}
