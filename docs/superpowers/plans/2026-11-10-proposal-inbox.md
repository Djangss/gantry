# Proposal Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An Inbox in Gantry listing open issues and PRs labelled `proposed`, with approve/reject from the item drawer and a diff view for PRs.

**Architecture:** Go `internal/gh` gets REST/GraphQL primitives (search, label removal, close, merge, PR files, add-to-project). `internal/api/inbox.go` adds four routes that orchestrate them. The React app adds an `/inbox` route, a nav entry with a count, approve/reject buttons and a Changes section in `ItemDrawer`, and wires the `inbox` and `prFiles` query keys into live updates.

**Tech Stack:** Go 1.x, go-github v93, GitHub GraphQL; React, TanStack Query, react-router, Tailwind, shadcn/ui, sonner; Vitest; Playwright.

**Spec:** `docs/superpowers/specs/2026-11-10-proposal-inbox-design.md`

## Global Constraints

- GitHub is the only store. No database, no new auth path, no new dependency (Go or npm).
- All new routes sit under `/api` (behind `a.Require(auth.CSRF(api))` in `internal/api/server.go`).
- Proposal label name: `proposed` (exact, lowercase).
- Inbox query: open, labelled `proposed`, authored by the session login.
- Approve issue: board add **before** label removal. Approve PR: squash-merge. Reject issue: close with `state_reason: not_planned`. Reject PR: close unmerged.
- localStorage access wrapped in try/catch.
- Light and dark themes, desktop and phone (`docs/design.md` tokens only, no raw colours).
- Shortcuts get a `// shortcut: <limit>, <when to upgrade>` comment.

## Review Focus

1. **Search index lag:** GitHub search updates seconds after a label change, so a refetch right after Approve can bring the item back. Expected: an approved/rejected item never reappears in this tab. Pinned by `handled` tests in Task 4.
2. **Merge conflict message:** GitHub answers 409 on a stale head; `fail()` maps every 409 to "file changed on GitHub". Expected: GitHub's own merge message. Pinned in Task 1 (`TestMergeConflictKeepsMessage`) and Task 2.
3. **Label already gone** (removed on GitHub, or approve retried): `RemoveLabelForIssue` returns 404. Expected: approve still succeeds. Pinned in Task 1.
4. **Search requires a type qualifier:** `/search/issues` rejects queries without `is:issue` or `is:pr`. Expected: issues and PRs both listed. Pinned in Task 1 (two queries, both asserted).
5. **Binary or huge files in a PR:** GitHub omits `patch`. Expected: the file row shows "No text diff" instead of an empty block. Pinned in Task 5.

---

### Task 1: GitHub client primitives

**Files:**
- Create: `internal/gh/inbox.go`
- Modify: `internal/gh/repos.go:58-69` (add `Repo` to `IssueSummary`)
- Modify: `internal/gh/projects.go` (append `AddToProject`)
- Test: `internal/gh/inbox_test.go`, `internal/gh/projects_test.go`

**Interfaces:**
- Produces:
  - `IssueSummary.Repo string` (json `repo,omitempty`)
  - `func (c *Client) Proposed(ctx context.Context, token, login string) ([]IssueSummary, error)`
  - `func (c *Client) ItemNode(ctx context.Context, token, owner, repo string, n int) (nodeID string, isPR bool, err error)`
  - `func (c *Client) RemoveLabel(ctx context.Context, token, owner, repo string, n int, label string) error` (404 = success)
  - `func (c *Client) Close(ctx context.Context, token, owner, repo string, n int, isPR bool) error`
  - `func (c *Client) Merge(ctx context.Context, token, owner, repo string, n int) error` (409 becomes 422, message kept)
  - `type PRFile struct { Filename, Status, Patch string }` (json `filename`, `status`, `patch`)
  - `func (c *Client) PRFiles(ctx context.Context, token, owner, repo string, n int) ([]PRFile, error)`
  - `func (c *Client) AddToProject(ctx context.Context, token, projectID, contentID string) error`

- [ ] **Step 1: Write the failing tests** in `internal/gh/inbox_test.go`:

```go
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
```

Add to `internal/gh/projects_test.go`, and add a `case` to the switch in `graphqlFake` **before** `case in.Variables["id"] == "missing":`:

```go
			case strings.Contains(in.Query, "addProjectV2ItemById"):
				*vars = in.Variables
				fmt.Fprint(w, `{"data":{"addProjectV2ItemById":{"item":{"id":"I9"}}}}`)
```

```go
func TestAddToProject(t *testing.T) {
	var v map[string]any
	if err := graphqlFake(t, &v).AddToProject(ctx, "tok", "P1", "I_x"); err != nil {
		t.Fatal(err)
	}
	if v["project"] != "P1" || v["content"] != "I_x" {
		t.Fatalf("%v", v)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/gh/ -run 'Proposed|ItemNode|RemoveLabel|Close|Merge|PRFiles|AddToProject'`
Expected: FAIL to compile, `c.Proposed undefined` and similar.

- [ ] **Step 3: Implement.** In `internal/gh/repos.go`, add to `IssueSummary` after `Number`:

```go
	Repo      string    `json:"repo,omitempty"` // owner/repo; set only on cross-repo lists like the inbox
```

Create `internal/gh/inbox.go`:

```go
package gh

import (
	"context"
	"strings"

	"github.com/google/go-github/v93/github"
)

type PRFile struct {
	Filename string `json:"filename"`
	Status   string `json:"status"`
	Patch    string `json:"patch"` // empty for binary or very large files
}

// Proposed lists open issues and PRs labelled "proposed" that login opened, across all repos.
// Search needs is:issue or is:pr, so it runs once for each.
// shortcut: first 100 of each; page if the inbox ever holds more.
func (c *Client) Proposed(ctx context.Context, token, login string) ([]IssueSummary, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	out := []IssueSummary{}
	for _, kind := range []string{"is:issue", "is:pr"} {
		res, _, err := g.Search.Issues(ctx, kind+" is:open label:proposed author:"+login,
			&github.SearchOptions{Sort: "updated", Order: "desc", ListOptions: github.ListOptions{PerPage: 100}})
		if err != nil {
			return nil, wrap(err)
		}
		for _, x := range res.Issues {
			it := IssueSummary{Number: x.GetNumber(), Repo: repoFromURL(x.GetRepositoryURL()), Title: x.GetTitle(), State: x.GetState(),
				URL: x.GetHTMLURL(), User: x.GetUser().GetLogin(), Labels: []Label{}, IsPR: x.IsPullRequest(), IsDraft: x.GetDraft(),
				Comments: x.GetComments(), UpdatedAt: x.GetUpdatedAt().Time}
			for _, l := range x.Labels {
				it.Labels = append(it.Labels, Label{Name: l.GetName(), Color: l.GetColor()})
			}
			out = append(out, it)
		}
	}
	return out, nil
}

// repoFromURL turns ".../repos/owner/repo" into "owner/repo".
func repoFromURL(u string) string {
	_, after, _ := strings.Cut(u, "/repos/")
	return after
}

// ItemNode returns the GraphQL node id Projects v2 needs, and whether the number is a PR.
func (c *Client) ItemNode(ctx context.Context, token, owner, repo string, n int) (string, bool, error) {
	g, err := c.rest(token)
	if err != nil {
		return "", false, err
	}
	gi, _, err := g.Issues.Get(ctx, owner, repo, n)
	if err != nil {
		return "", false, wrap(err)
	}
	return gi.GetNodeID(), gi.IsPullRequest(), nil
}

// RemoveLabel treats a label that is already gone as removed, so a retried approve succeeds.
func (c *Client) RemoveLabel(ctx context.Context, token, owner, repo string, n int, label string) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if _, err := g.Issues.RemoveLabelForIssue(ctx, owner, repo, n, label); err != nil {
		if e := wrap(err); e.Status != 404 {
			return e
		}
	}
	return nil
}

// Close closes an issue as not planned, or a PR without merging.
func (c *Client) Close(ctx context.Context, token, owner, repo string, n int, isPR bool) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if isPR {
		_, _, err = g.PullRequests.Edit(ctx, owner, repo, n, &github.PullRequest{State: github.Ptr("closed")})
	} else {
		_, _, err = g.Issues.Update(ctx, owner, repo, n, github.UpdateIssueRequest{State: github.Ptr("closed"), StateReason: github.Ptr("not_planned")})
	}
	if err != nil {
		return wrap(err)
	}
	return nil
}

// Merge squash-merges a PR. GitHub's 409 (stale head) becomes 422 so the API layer passes its message on
// instead of the generic "file changed on GitHub".
func (c *Client) Merge(ctx context.Context, token, owner, repo string, n int) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if _, _, err := g.PullRequests.Merge(ctx, owner, repo, n, "", &github.PullRequestOptions{MergeMethod: "squash"}); err != nil {
		e := wrap(err)
		if e.Status == 409 {
			e.Status = 422
		}
		return e
	}
	return nil
}

// shortcut: first 100 files; doc PRs are small, page if one ever is not.
func (c *Client) PRFiles(ctx context.Context, token, owner, repo string, n int) ([]PRFile, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	fs, _, err := g.PullRequests.ListFiles(ctx, owner, repo, n, &github.ListOptions{PerPage: 100})
	if err != nil {
		return nil, wrap(err)
	}
	out := []PRFile{}
	for _, f := range fs {
		out = append(out, PRFile{Filename: f.GetFilename(), Status: f.GetStatus(), Patch: f.GetPatch()})
	}
	return out, nil
}
```

If `x.GetDraft()` does not exist on `*github.Issue` in v93, `RepoIssues` would not compile either; it does, so keep it.

Append to `internal/gh/projects.go`:

```go
const addMutation = `mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } }
}`

// AddToProject is idempotent: adding an item already on the board returns the existing item.
func (c *Client) AddToProject(ctx context.Context, token, projectID, contentID string) error {
	var r json.RawMessage
	return c.graphql(ctx, token, addMutation, map[string]any{"project": projectID, "content": contentID}, &r)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test -race ./internal/gh/`
Expected: PASS (all, including existing tests).

- [ ] **Step 5: Commit**

```bash
git add internal/gh/inbox.go internal/gh/inbox_test.go internal/gh/repos.go internal/gh/projects.go internal/gh/projects_test.go
git commit -m "feat(gh): proposal search, approve and reject primitives (#33)"
```

---

### Task 2: API routes

**Files:**
- Create: `internal/api/inbox.go`
- Modify: `internal/api/server.go:58` (register routes after `comments`)
- Test: `internal/api/inbox_test.go`

**Interfaces:**
- Consumes: Task 1 methods.
- Produces (HTTP):
  - `GET /api/inbox` gives `IssueSummary[]` with `repo` set
  - `POST /api/repos/{owner}/{repo}/issues/{n}/approve` with body `{"projectId"?: string}` gives 204
  - `POST /api/repos/{owner}/{repo}/issues/{n}/reject` gives 204
  - `GET /api/repos/{owner}/{repo}/pulls/{n}/files` gives `PRFile[]`

- [ ] **Step 1: Write the failing tests** in `internal/api/inbox_test.go`:

```go
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
		"GET /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) { fmt.Fprintf(w, `{"number":4,"node_id":"I_x"%s}`, pr) },
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
		"PATCH /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) { *calls = append(*calls, "close-issue"); fmt.Fprint(w, `{}`) },
		"PATCH /repos/o/r/pulls/4":  func(w http.ResponseWriter, r *http.Request) { *calls = append(*calls, "close-pr"); fmt.Fprint(w, `{}`) },
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `go test ./internal/api/ -run 'Inbox|Approve|Reject|PRFilesRoute'`
Expected: FAIL, 404 from the mux for the new routes.

- [ ] **Step 3: Implement.** Create `internal/api/inbox.go`:

```go
package api

import (
	"errors"
	"io"
	"net/http"

	"github.com/Djangss/gantry/internal/auth"
)

const proposedLabel = "proposed"

func (s *Server) inbox(w http.ResponseWriter, r *http.Request) {
	sess, _ := auth.FromContext(r.Context())
	out, err := s.gh.Proposed(r.Context(), token(r), sess.Login)
	s.reply(w, out, err)
}

// approve merges a proposed PR, or puts a proposed issue on a board and drops its label.
// The board add runs first so a failure leaves the issue labelled, still in the inbox, ready to retry.
func (s *Server) approve(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	var in struct {
		ProjectID string `json:"projectId"`
	}
	if err := readJSON(w, r, &in); err != nil && !errors.Is(err, io.EOF) {
		badRequest(w, "invalid JSON body")
		return
	}
	ctx, tok, owner, repo := r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo")
	node, isPR, err := s.gh.ItemNode(ctx, tok, owner, repo, n)
	switch {
	case err != nil:
	case isPR:
		err = s.gh.Merge(ctx, tok, owner, repo, n)
	default:
		if in.ProjectID != "" {
			err = s.gh.AddToProject(ctx, tok, in.ProjectID, node)
		}
		if err == nil {
			err = s.gh.RemoveLabel(ctx, tok, owner, repo, n, proposedLabel)
		}
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) reject(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	ctx, tok, owner, repo := r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo")
	_, isPR, err := s.gh.ItemNode(ctx, tok, owner, repo, n)
	if err == nil {
		err = s.gh.Close(ctx, tok, owner, repo, n, isPR)
	}
	if err != nil {
		s.fail(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) prFiles(w http.ResponseWriter, r *http.Request) {
	n, ok := issueNumber(w, r)
	if !ok {
		return
	}
	out, err := s.gh.PRFiles(r.Context(), token(r), r.PathValue("owner"), r.PathValue("repo"), n)
	s.reply(w, out, err)
}
```

In `internal/api/server.go`, after the `comments` line:

```go
	api.HandleFunc("GET /api/inbox", s.inbox)
	api.HandleFunc("POST /api/repos/{owner}/{repo}/issues/{n}/approve", s.approve)
	api.HandleFunc("POST /api/repos/{owner}/{repo}/issues/{n}/reject", s.reject)
	api.HandleFunc("GET /api/repos/{owner}/{repo}/pulls/{n}/files", s.prFiles)
```

`TestApproveKeepsLabelWhenAddFails` expects 502. The fake answers HTTP 500 on `/graphql`, `do` returns `*Error{Status: 500}`, and `fail` maps 5xx to 502.

- [ ] **Step 4: Run tests to verify they pass**

Run: `go test -race ./internal/api/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add internal/api/inbox.go internal/api/inbox_test.go internal/api/server.go
git commit -m "feat(api): inbox, approve, reject and PR files routes (#33)"
```

---

### Task 3: Live updates for inbox and PR files

**Files:**
- Modify: `web/src/lib/events.ts:18`
- Test: `web/src/lib/events.test.ts`

**Interfaces:**
- Produces: query keys `["inbox"]` and `["prFiles", "<owner>/<repo>#<n>"]`, refetched by issue/PR events. Tasks 4 and 5 must use exactly these keys.

- [ ] **Step 1: Write the failing test.** In `web/src/lib/events.test.ts`, append `["inbox"]` and `["prFiles", "Djangss/gantry#7"]` to the `keys` array. In the first test's first `expect`, change the expected list to:

```ts
  expect(hit({ type: "issues", repo: "djangss/GANTRY", number: 7 })).toEqual([
    "issue Djangss/gantry#7",
    "repoIssues Djangss/gantry issue open",
    "board P1",
    "inbox",
    "prFiles Djangss/gantry#7",
  ]);
```

and the second (`pull_request_review`, number 8) to:

```ts
    "issue Djangss/gantry#8",
    "repoIssues Djangss/gantry issue open",
    "board P1",
    "inbox",
```

Run the whole file once. For any other test whose `issueEvents` expectation now also gets `inbox`, add `"inbox"` (and `prFiles` when the number is 7) to it. Non-issue events (push, repository, projects_v2) must not match these keys.

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/lib/events.test.ts`
Expected: FAIL, `inbox` missing from received.

- [ ] **Step 3: Implement.** Replace line 18 of `web/src/lib/events.ts`:

```ts
    if (issueEvents.has(e.type))
      return (
        ((kind === "issue" || kind === "prFiles") && same(a, ref)) || (kind === "repoIssues" && same(a, e.repo)) || kind === "board" || kind === "inbox"
      );
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd web && npx vitest run src/lib/events.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/events.ts web/src/lib/events.test.ts
git commit -m "feat(web): live-refresh inbox and PR files (#33)"
```

---

### Task 4: Inbox query, handled set and Inbox view

**Files:**
- Create: `web/src/lib/inbox.ts`, `web/src/lib/inbox.test.ts`, `web/src/components/InboxView.tsx`
- Modify: `web/src/types.ts` (add `repo?` to `IssueSummary`, add `PRFile`)
- Modify: `web/src/App.tsx` (route `inbox`)
- Modify: `web/src/components/Layout.tsx` (nav Section "Inbox" above "Projects")

**Interfaces:**
- Consumes: `GET /api/inbox`; query key `["inbox"]` (Task 3).
- Produces:
  - `inboxQuery` (TanStack query options, key `["inbox"]`, returns `IssueSummary[]` with handled items filtered out)
  - `markHandled(ref: string): void`
  - `unhandled(list: IssueSummary[]): IssueSummary[]`
  - `refOf(i: IssueSummary): string` gives `"owner/repo#n"`
  - `type PRFile = { filename: string; status: string; patch: string }` in `types.ts`

- [ ] **Step 1: Write the failing test** `web/src/lib/inbox.test.ts`:

```ts
import { expect, test } from "vitest";
import type { IssueSummary } from "@/types";
import { markHandled, refOf, unhandled } from "./inbox";

const item = (repo: string, number: number): IssueSummary => ({
  number, repo, title: "t", state: "open", url: "", user: "u", labels: [], isPR: false, isDraft: false, comments: 0, updatedAt: "",
});

test("refOf builds owner/repo#n", () => {
  expect(refOf(item("o/a", 3))).toBe("o/a#3");
});

test("handled items stay hidden even when stale search results bring them back", () => {
  markHandled("O/A#3");
  expect(unhandled([item("o/a", 3), item("o/a", 4)]).map(refOf)).toEqual(["o/a#4"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd web && npx vitest run src/lib/inbox.test.ts`
Expected: FAIL, cannot resolve `./inbox`.

- [ ] **Step 3: Implement.** In `web/src/types.ts`, add `repo?: string;` to `IssueSummary` after `number`, and append:

```ts
export type PRFile = { filename: string; status: string; patch: string };
```

Create `web/src/lib/inbox.ts`:

```ts
import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api";
import type { IssueSummary } from "@/types";

// GitHub search lags label changes by seconds, so a refetch right after approve can return the item again.
// shortcut: remembered for this tab only; a reload trusts search again, which has caught up by then.
const handled = new Set<string>();

export const refOf = (i: IssueSummary) => `${i.repo}#${i.number}`;
export const markHandled = (ref: string) => void handled.add(ref.toLowerCase());
export const unhandled = (list: IssueSummary[]) => list.filter((i) => !handled.has(refOf(i).toLowerCase()));

export const inboxQuery = queryOptions({
  queryKey: ["inbox"],
  queryFn: () => api<IssueSummary[]>("/api/inbox"),
  select: unhandled,
});
```

Create `web/src/components/InboxView.tsx`, reusing RepoView's row markup and drawer wiring:

```tsx
import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, CircleDot } from "lucide-react";
import { useSearchParams } from "react-router";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemDrawer from "@/components/ItemDrawer";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import { inboxQuery, refOf } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const day = new Intl.DateTimeFormat([], { dateStyle: "medium" });

export default function InboxView() {
  const [params, setParams] = useSearchParams();
  const item = params.get("item");
  const list = useQuery(inboxQuery);
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <header className="space-y-1">
        <h1 className="text-[26px] heading-condensed">Inbox</h1>
        <p className="text-sm text-muted-foreground">Issues and doc changes proposed by agents. Approve or reject each one.</p>
      </header>
      {list.isPending && <Skeleton className="h-48" />}
      {list.isError && <QueryError error={list.error} retry={list.refetch} />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review. Proposals labelled "proposed" show up here.</p>}
      {!!list.data?.length && (
        <ul className="divide-y rounded-md border bg-card">
          {list.data.map((i) => {
            const ref = refOf(i);
            const Icon = i.isPR ? GitPullRequest : CircleDot;
            return (
              <li key={ref}>
                <button
                  type="button"
                  onClick={() => setParams({ item: ref })}
                  className={cn("flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent", item === ref && "bg-accent")}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{i.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{ref}</span>
                      <span>{i.isPR ? "Doc change" : "Issue"}</span>
                      <span>Updated {day.format(new Date(i.updatedAt))}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {item && (
        <ErrorBoundary key={item}>
          <ItemDrawer itemRef={item} onClose={() => setParams({})} />
        </ErrorBoundary>
      )}
    </div>
  );
}
```

Match the page padding and heading classes RepoView uses at its top. Check `RepoView.tsx` lines 60-85 and copy its wrapper `className`s if they differ from the above.

In `web/src/App.tsx`, import `InboxView` and add `{ path: "inbox", element: <InboxView /> },` after the index route.

In `web/src/components/Layout.tsx`, add above `<Section title="Projects">`:

```tsx
      <Section title="Review">
        <NavLink to="/inbox" className={linkClass}>
          <Inbox aria-hidden className="size-4 shrink-0 text-rail-muted" />
          Inbox
          {!!inbox.data?.length && (
            <span className="ml-auto rounded-sm bg-hazard px-1.5 text-xs font-semibold text-hazard-foreground" aria-label={`${inbox.data.length} to review`}>
              {inbox.data.length}
            </span>
          )}
        </NavLink>
      </Section>
```

with `const inbox = useQuery(inboxQuery);` next to the existing `projects` query, `Inbox` imported from `lucide-react` (next to `NotebookText`), and `inboxQuery` from `@/lib/inbox`.

- [ ] **Step 4: Run tests and typecheck**

Run: `cd web && npx vitest run && npx tsc -b`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/inbox.ts web/src/lib/inbox.test.ts web/src/components/InboxView.tsx web/src/types.ts web/src/App.tsx web/src/components/Layout.tsx
git commit -m "feat(web): inbox view and nav count (#33)"
```

---

### Task 5: Drawer actions and diff

**Files:**
- Modify: `web/src/components/ItemDrawer.tsx`
- Create: `web/src/components/ProposalActions.tsx`, `web/src/components/PRChanges.tsx`

**Interfaces:**
- Consumes: `POST .../approve` `{projectId?}`, `POST .../reject`, `GET .../pulls/{n}/files` (Task 2); `markHandled`, `inboxQuery` key `["inbox"]` (Task 4); `PRFile` type; `Project` type; `GET /api/projects` with key `["projects"]` (used by `Layout.tsx`).
- Produces: `<ProposalActions itemRef base isPR onDone />` and `<PRChanges itemRef filesUrl />`.

- [ ] **Step 1: Create `web/src/components/PRChanges.tsx`:**

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PRFile } from "@/types";

const lineClass = (l: string) =>
  l.startsWith("+") ? "bg-go/15 text-foreground" : l.startsWith("-") ? "bg-destructive/15 text-foreground" : l.startsWith("@@") ? "text-muted-foreground" : "";

export default function PRChanges({ itemRef, filesUrl }: { itemRef: string; filesUrl: string }) {
  const files = useQuery({ queryKey: ["prFiles", itemRef], queryFn: () => api<PRFile[]>(filesUrl) });
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-[17px] heading-condensed">Changes</h3>
      {files.isPending && <Skeleton className="h-24" />}
      {files.isError && <QueryError error={files.error} retry={files.refetch} />}
      {files.data?.map((f) => (
        <div key={f.filename} className="overflow-hidden rounded-sm border">
          <p className="flex items-center gap-2 bg-muted px-3 py-1.5 font-mono text-xs">
            <span className="truncate">{f.filename}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">{f.status}</span>
          </p>
          {f.patch ? (
            <pre className="overflow-x-auto text-xs leading-5">
              {f.patch.split("\n").map((l, i) => (
                <div key={i} className={cn("px-3 whitespace-pre", lineClass(l))}>
                  {l || " "}
                </div>
              ))}
            </pre>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">No text diff (binary or too large).</p>
          )}
        </div>
      ))}
    </section>
  );
}
```

Check that `go` exists as a colour token (ItemDrawer uses `text-go`). If `bg-go/15` does not render, use the token the board uses for done or added states.

- [ ] **Step 2: Create `web/src/components/ProposalActions.tsx`:**

```tsx
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { api, errorText, send } from "@/api";
import { Button } from "@/components/ui/button";
import { markHandled } from "@/lib/inbox";
import type { Project } from "@/types";

const lastKey = "gantry.approveProject";
const readLast = () => {
  try {
    return localStorage.getItem(lastKey) ?? "";
  } catch {
    return "";
  }
};

export default function ProposalActions({ itemRef, base, isPR }: { itemRef: string; base: string; isPR: boolean }) {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), enabled: !isPR });
  const open = projects.data?.filter((p) => !p.closed) ?? [];
  const [projectId, setProjectId] = useState(readLast);
  const chosen = open.some((p) => p.id === projectId) ? projectId : "";
  const act = useMutation({
    mutationFn: (verb: "approve" | "reject") => send("POST", `${base}/${verb}`, verb === "approve" && chosen ? { projectId: chosen } : {}),
    onSuccess: () => {
      markHandled(itemRef);
      try {
        if (chosen) localStorage.setItem(lastKey, chosen);
      } catch {
        /* storage blocked: the picker just won't remember */
      }
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["issue", itemRef] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
  return (
    <section aria-label="Proposal" className="space-y-2 rounded-sm border border-hazard bg-hazard/10 p-3">
      <p className="text-sm font-medium">{isPR ? "Proposed doc change" : "Proposed issue"}</p>
      {!isPR && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Add to</span>
          <select className="h-8 rounded-sm border bg-background px-2 text-sm" value={chosen} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No board</option>
            {open.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("approve")}>
          <Check aria-hidden /> {isPR ? "Approve and merge" : "Approve"}
        </Button>
        <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate("reject")}>
          <X aria-hidden /> Reject
        </Button>
      </div>
      {act.isError && <p className="text-sm text-destructive">{errorText(act.error)}</p>}
    </section>
  );
}
```

Check `Project` is exported from `@/types` (it is: `export type Project`). Check that `hazard` is a valid Tailwind token (ItemDrawer uses `bg-hazard`).

- [ ] **Step 3: Wire into `ItemDrawer.tsx`.** Import both components. Inside `{i && (<>`, before `{i.pr && <PRStatus pr={i.pr} />}`:

```tsx
              {r && i.state === "open" && i.labels.some((l) => l.name === "proposed") && <ProposalActions itemRef={itemRef} base={base} isPR={!!i.pr} />}
```

After the `<article>` that renders the body:

```tsx
              {r && i.pr && <PRChanges itemRef={itemRef} filesUrl={`/api/repos/${r.owner}/${r.repo}/pulls/${r.number}/files`} />}
```

- [ ] **Step 4: Typecheck and unit tests**

Run: `cd web && npx tsc -b && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/ItemDrawer.tsx web/src/components/ProposalActions.tsx web/src/components/PRChanges.tsx
git commit -m "feat(web): approve, reject and diff in the item drawer (#33)"
```

---

### Task 6: End-to-end flow and screenshots

**Files:**
- Modify: `web/e2e/mocks.ts`
- Create: `web/e2e/inbox.spec.ts`
- Modify: `web/e2e/screens.spec.ts` (add views)

**Interfaces:**
- Consumes: every route from Task 2; UI from Tasks 4 and 5.

- [ ] **Step 1: Extend `mockApi`.** In `web/e2e/mocks.ts`, add near the other fixtures:

```ts
const proposedIssue = {
  number: 41, title: "Add keyboard shortcuts to the board", state: "open", user: "Djangss", url: "https://github.com/Djangss/gantry/issues/41",
  body: "From the brainstorm on board UX.", labels: [{ name: "proposed", color: "fbca04" }], comments: [], pr: null,
};
const proposedPR = {
  number: 42, title: "docs: describe the proposal inbox", state: "open", user: "Djangss", url: "https://github.com/Djangss/gantry/pull/42",
  body: "Updates docs/design.md.", labels: [{ name: "proposed", color: "fbca04" }], comments: [],
  pr: { merged: false, draft: false, reviews: [], checks: [] },
};
const inboxRow = (i: typeof proposedIssue | typeof proposedPR, isPR: boolean) => ({
  number: i.number, repo: "Djangss/gantry", title: i.title, state: "open", url: i.url, user: "Djangss", labels: i.labels,
  isPR, isDraft: false, comments: 0, updatedAt: "2026-11-10T12:00:00Z",
});
```

Inside `mockApi`, add `let approved: unknown = null;` with the other `let`s, and add these branches **before** the `/api/repos/Djangss/gantry/issues/7` line:

```ts
    if (p === "/api/inbox") return json(approved ? [inboxRow(proposedPR, true)] : [inboxRow(proposedIssue, false), inboxRow(proposedPR, true)]);
    if (p === "/api/repos/Djangss/gantry/issues/41/approve" && req.method() === "POST") {
      approved = req.postDataJSON();
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/repos/Djangss/gantry/issues/42/approve" && req.method() === "POST")
      return json({ error: "Head branch was modified. Review and try the merge again.", code: "bad_request" }, 422);
    if (p === "/api/repos/Djangss/gantry/issues/41") return json(approved ? { ...proposedIssue, labels: [] } : proposedIssue);
    if (p === "/api/repos/Djangss/gantry/issues/42") return json(proposedPR);
    if (p === "/api/repos/Djangss/gantry/pulls/42/files")
      return json([
        { filename: "docs/design.md", status: "modified", patch: "@@ -1,2 +1,3 @@\n # Design\n-Old line\n+New line\n+Inbox section" },
        { filename: "docs/inbox.png", status: "added", patch: "" },
      ]);
```

Return `approved: () => approved` from `mockApi` next to the other getters.

- [ ] **Step 2: Write `web/e2e/inbox.spec.ts`:**

```ts
import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("approve a proposed issue onto a board", async ({ page }) => {
  const m = await mockApi(page);
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: /Inbox/ })).toContainText("2");
  await page.getByRole("button", { name: /Add keyboard shortcuts/ }).click();
  await page.getByRole("combobox").selectOption("P1");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => m.approved()).toEqual({ projectId: "P1" });
  await expect(page.getByRole("button", { name: /Add keyboard shortcuts/ })).toHaveCount(0);
});

test("a doc PR shows its diff and a refused merge shows GitHub's reason", async ({ page }) => {
  await mockApi(page);
  await page.goto("/inbox?item=Djangss%2Fgantry%2342");
  await expect(page.getByText("+Inbox section")).toBeVisible();
  await expect(page.getByText("No text diff (binary or too large).")).toBeVisible();
  await page.getByRole("button", { name: "Approve and merge" }).click();
  await expect(page.getByText("Head branch was modified")).toBeVisible();
});
```

- [ ] **Step 3: Add screenshot views.** In `web/e2e/screens.spec.ts`, add to `views`:

```ts
  inbox: "/inbox",
  proposal: "/inbox?item=Djangss%2Fgantry%2342",
```

- [ ] **Step 4: Run e2e**

Run: `cd web && npx playwright test inbox smoke && npx playwright test screens`
Expected: PASS. Open `web/screenshots/inbox-390-dark.png` and `proposal-1440-light.png` and check that the layout is readable, there's no horizontal scroll at 390px, and the diff colours are visible in both themes.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/mocks.ts web/e2e/inbox.spec.ts web/e2e/screens.spec.ts
git commit -m "test(e2e): proposal inbox flow and screenshots (#33)"
```

---

### Task 7: Claude Code skill and README

**Files:**
- Create: `~/claude-config/skills/gantry-propose/SKILL.md` (outside the repo, not committed here)
- Modify: `README.md` (Features list)

- [ ] **Step 1: Write the skill** `~/claude-config/skills/gantry-propose/SKILL.md`:

````markdown
---
name: gantry-propose
description: Use at the end of a brainstorm or design session when outcomes should become proposed GitHub issues or doc PRs for review in Gantry ("propose these", "send to gantry", "open as proposals", "/gantry-propose").
---

# gantry-propose

Turns a brainstorm into proposals that Mathieu approves or rejects in Gantry's Inbox.
Nothing here is planned work until it is approved.

## Inputs
- Notes repo: the `NOTES_REPO` Gantry uses (ask once if unknown; default `Djangss/notes`).
- Target repo(s) for issues and doc changes.

## Steps (in this order: issue numbers exist only after creation)

1. Write the session note to the notes repo at `brainstorms/YYYY-MM-DD-<slug>.md`:

   ```markdown
   ---
   title: <session title>
   links: []
   ---

   # <session title>

   ## Context
   ## Decisions
   ## Open questions
   ```

   Commit and push it (`gh api` PUT contents, or a local clone).
2. In each target repo: `gh label create proposed --color fbca04 --description "Awaiting review in Gantry" --force`.
3. For each proposed issue:
   `gh issue create -R <owner/repo> --label proposed --title "<title>" --body "<body>\n\nBrainstorm: https://github.com/<notes repo>/blob/main/brainstorms/<file>"`
4. For each doc change: branch `docs/<slug>` in the target repo, commit only files under `docs/`, push, then
   `gh pr create -R <owner/repo> --label proposed --title "docs: <summary>" --body "<why>\n\nBrainstorm: <same link>"`.
5. Rewrite the note's `links:` to the created refs, e.g. `links: [Djangss/gantry#41, Djangss/gantry#42]`, and push.
6. Report one line per proposal: ref and title. Point to Gantry's Inbox.

## Rules
- Never remove the `proposed` label or merge a proposal yourself. Approval happens in Gantry.
- One issue per independently shippable outcome; doc PRs touch `docs/` only.
````

- [ ] **Step 2: README.** In `README.md`, add to the Features list after "Notes and drawings":

```markdown
- **Proposal inbox.** Agents open issues and doc PRs labelled `proposed`; approve them onto a board (or merge), or reject them, from one Inbox.
```

- [ ] **Step 3: Full check**

Run: `go test -race ./cmd/... ./internal/... && cd web && npm test && npx tsc -b && npx playwright test smoke inbox`
Expected: PASS.

- [ ] **Step 4: Commit** (README only; the skill lives outside this repo)

```bash
git add README.md
git commit -m "docs: mention the proposal inbox (#33)"
```
