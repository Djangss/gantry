package api

import (
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestInboxUsesLogin(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /search/issues": func(w http.ResponseWriter, r *http.Request) {
		if !strings.Contains(r.URL.Query().Get("q"), "author:Djangss") {
			t.Errorf("q %q", r.URL.Query().Get("q"))
		}
		fmt.Fprint(w, `{"items":[]}`)
	}})
	if w := call(h, c, "GET", "/api/inbox", ""); w.Code != 200 || strings.TrimSpace(w.Body.String()) != "[]" {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

// approveRoutes fakes an issue (or PR) #4 and records the calls in order.
func approveRoutes(isPR bool, calls *[]string, addStatus int) map[string]http.HandlerFunc {
	pr := ""
	if isPR {
		pr = `,"pull_request":{"url":"u"}`
	}
	return map[string]http.HandlerFunc{
		"GET /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) {
			fmt.Fprintf(w, `{"number":4,"node_id":"I_x","labels":[{"name":"proposed"}]%s}`, pr)
		},
		"POST /graphql": func(w http.ResponseWriter, r *http.Request) {
			*calls = append(*calls, "add")
			if addStatus != 200 {
				w.WriteHeader(addStatus)
				fmt.Fprint(w, `{"message":"boom"}`)
				return
			}
			fmt.Fprint(w, `{"data":{"addProjectV2ItemById":{"item":{"id":"I9"}}}}`)
		},
		"DELETE /repos/o/r/issues/4/labels/proposed": func(w http.ResponseWriter, r *http.Request) {
			*calls = append(*calls, "unlabel")
			fmt.Fprint(w, `[]`)
		},
		"PUT /repos/o/r/pulls/4/merge": func(w http.ResponseWriter, r *http.Request) {
			*calls = append(*calls, "merge")
			fmt.Fprint(w, `{"merged":true}`)
		},
		"PATCH /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) {
			*calls = append(*calls, "close-issue")
			fmt.Fprint(w, `{}`)
		},
		"PATCH /repos/o/r/pulls/4": func(w http.ResponseWriter, r *http.Request) { *calls = append(*calls, "close-pr"); fmt.Fprint(w, `{}`) },
	}
}

func TestApproveIssueAddsThenUnlabels(t *testing.T) {
	var calls []string
	h, c := testServer(t, approveRoutes(false, &calls, 200))
	if w := call(h, c, "POST", "/api/repos/o/r/issues/4/approve", `{"projectId":"P1"}`); w.Code != 204 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if fmt.Sprint(calls) != "[add unlabel]" {
		t.Fatalf("%v", calls)
	}
}

func TestApproveIssueWithoutProjectOnlyUnlabels(t *testing.T) {
	var calls []string
	h, c := testServer(t, approveRoutes(false, &calls, 200))
	if w := call(h, c, "POST", "/api/repos/o/r/issues/4/approve", `{}`); w.Code != 204 || fmt.Sprint(calls) != "[unlabel]" {
		t.Fatalf("%d %v", w.Code, calls)
	}
}

func TestApproveKeepsLabelWhenAddFails(t *testing.T) {
	var calls []string
	h, c := testServer(t, approveRoutes(false, &calls, 500))
	if w := call(h, c, "POST", "/api/repos/o/r/issues/4/approve", `{"projectId":"P1"}`); w.Code != 502 {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
	if fmt.Sprint(calls) != "[add]" {
		t.Fatalf("label removed after failed add: %v", calls)
	}
}

func TestApprovePRMerges(t *testing.T) {
	var calls []string
	h, c := testServer(t, approveRoutes(true, &calls, 200))
	if w := call(h, c, "POST", "/api/repos/o/r/issues/4/approve", `{"projectId":"P1"}`); w.Code != 204 || fmt.Sprint(calls) != "[merge]" {
		t.Fatalf("%d %v", w.Code, calls)
	}
}

func TestApproveMergeConflictShowsGitHubMessage(t *testing.T) {
	var calls []string
	routes := approveRoutes(true, &calls, 200)
	routes["PUT /repos/o/r/pulls/4/merge"] = func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(409)
		fmt.Fprint(w, `{"message":"Head branch was modified. Review and try the merge again."}`)
	}
	h, c := testServer(t, routes)
	w := call(h, c, "POST", "/api/repos/o/r/issues/4/approve", `{}`)
	if w.Code != 422 || !strings.Contains(w.Body.String(), "Head branch was modified") {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestReject(t *testing.T) {
	for _, isPR := range []bool{false, true} {
		var calls []string
		h, c := testServer(t, approveRoutes(isPR, &calls, 200))
		if w := call(h, c, "POST", "/api/repos/o/r/issues/4/reject", ""); w.Code != 204 {
			t.Fatalf("%d %s", w.Code, w.Body)
		}
		want := map[bool]string{false: "[close-issue]", true: "[close-pr]"}[isPR]
		if fmt.Sprint(calls) != want {
			t.Fatalf("pr=%v %v", isPR, calls)
		}
	}
}

func TestUnlabelledItemIsNotAProposal(t *testing.T) {
	for _, tc := range []struct{ name, path string }{{"approve", "approve"}, {"reject", "reject"}} {
		for _, isPR := range []bool{false, true} {
			if tc.name == "approve" && !isPR {
				continue // issue approve stays unguarded so a retry succeeds
			}
			var calls []string
			routes := approveRoutes(isPR, &calls, 200)
			routes["GET /repos/o/r/issues/4"] = func(w http.ResponseWriter, r *http.Request) {
				fmt.Fprintf(w, `{"number":4,"node_id":"I_x","labels":[{"name":"bug"}]%s}`, map[bool]string{true: `,"pull_request":{"url":"u"}`}[isPR])
			}
			h, c := testServer(t, routes)
			w := call(h, c, "POST", "/api/repos/o/r/issues/4/"+tc.path, `{}`)
			if w.Code != 422 || !strings.Contains(w.Body.String(), "not a proposal") || len(calls) != 0 {
				t.Fatalf("%s pr=%v: %d %s %v", tc.name, isPR, w.Code, w.Body, calls)
			}
		}
	}
}

func TestPRFilesRoute(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{"GET /repos/o/r/pulls/4/files": func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `[{"filename":"docs/a.md","status":"modified","patch":"+x"}]`)
	}})
	w := call(h, c, "GET", "/api/repos/o/r/pulls/4/files", "")
	if w.Code != 200 || !strings.Contains(w.Body.String(), `"filename":"docs/a.md"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}

func TestApproveRejectsBadNumber(t *testing.T) {
	h, c := testServer(t, nil)
	if w := call(h, c, "POST", "/api/repos/o/r/issues/x/approve", `{}`); w.Code != 400 {
		t.Fatalf("%d", w.Code)
	}
}
