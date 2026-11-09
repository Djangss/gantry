package gh

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

var ctx = context.Background()

// recorder serves ETag "v1" for GETs and records each request's If-None-Match.
func recorder(t *testing.T) (*httptest.Server, *[]string) {
	var seen []string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen = append(seen, r.Method+" "+r.URL.Path+" inm="+r.Header.Get("If-None-Match"))
		if r.Method == "GET" && r.Header.Get("If-None-Match") == `"v1"` {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		if r.Method == "GET" {
			w.Header().Set("ETag", `"v1"`)
		}
		fmt.Fprint(w, `{"n":1}`)
	}))
	t.Cleanup(srv.Close)
	return srv, &seen
}

func get(t *testing.T, c *Client, token, path string) {
	t.Helper()
	var out struct{ N int }
	if err := c.do(ctx, token, "GET", path, "", nil, &out); err != nil || out.N != 1 {
		t.Fatalf("GET %s: %v %+v", path, err, out)
	}
}

func TestETagReuse(t *testing.T) {
	srv, seen := recorder(t)
	c := New(srv.URL)
	get(t, c, "tok", "/x")
	get(t, c, "tok", "/x")
	want := []string{`GET /x inm=`, `GET /x inm="v1"`}
	if fmt.Sprint(*seen) != fmt.Sprint(want) {
		t.Fatalf("got %v", *seen)
	}
}

func TestETagKeyedByToken(t *testing.T) {
	srv, seen := recorder(t)
	c := New(srv.URL)
	get(t, c, "tok-a", "/x")
	get(t, c, "tok-b", "/x")
	if (*seen)[1] != "GET /x inm=" {
		t.Fatalf("other token reused cache: %v", *seen)
	}
}

func TestWriteClearsCache(t *testing.T) {
	srv, seen := recorder(t)
	c := New(srv.URL)
	get(t, c, "tok", "/x")
	if err := c.do(ctx, "tok", "PUT", "/x", "", map[string]string{}, nil); err != nil {
		t.Fatal(err)
	}
	get(t, c, "tok", "/x")
	if (*seen)[2] != "GET /x inm=" {
		t.Fatalf("cache survived write: %v", *seen)
	}
}

func TestGraphQLDoesNotClearCache(t *testing.T) {
	srv, seen := recorder(t)
	c := New(srv.URL)
	get(t, c, "tok", "/x")
	if err := c.do(ctx, "tok", "POST", "/graphql", "", map[string]string{}, nil); err != nil {
		t.Fatal(err)
	}
	get(t, c, "tok", "/x")
	if (*seen)[2] != `GET /x inm="v1"` {
		t.Fatalf("graphql cleared cache: %v", *seen)
	}
}

func TestErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/limited" {
			w.Header().Set("X-RateLimit-Remaining", "0")
			w.Header().Set("X-RateLimit-Reset", "1700000000")
			w.WriteHeader(403)
			return
		}
		w.WriteHeader(404)
		fmt.Fprint(w, `{"message":"Not Found"}`)
	}))
	c := New(srv.URL)
	var e *Error
	if err := c.do(ctx, "tok", "GET", "/limited", "", nil, nil); !errors.As(err, &e) || !e.RateLimited || !e.Reset.Equal(time.Unix(1700000000, 0)) {
		t.Fatalf("rate limit: %#v", err)
	}
	if err := c.do(ctx, "tok", "GET", "/missing", "", nil, nil); !errors.As(err, &e) || e.Status != 404 || e.Message != "Not Found" {
		t.Fatalf("404: %#v", err)
	}
	srv.Close()
	if err := c.do(ctx, "tok", "GET", "/x", "", nil, nil); !errors.As(err, &e) || e.Status != 0 {
		t.Fatalf("network: %#v", err)
	}
}
