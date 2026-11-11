package gh

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/google/go-github/v93/github"
)

type Label struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type Comment struct {
	ID        int64     `json:"id"`
	User      string    `json:"user"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"createdAt"`
}

type Review struct {
	User  string `json:"user"`
	State string `json:"state"`
}

type Check struct {
	Name       string `json:"name"`
	Status     string `json:"status"`
	Conclusion string `json:"conclusion"`
}

type PR struct {
	Merged  bool     `json:"merged"`
	Draft   bool     `json:"draft"`
	Reviews []Review `json:"reviews"`
	Checks  []Check  `json:"checks"`
}

type Issue struct {
	Number    int       `json:"number"`
	Title     string    `json:"title"`
	State     string    `json:"state"`
	Body      string    `json:"body"`
	URL       string    `json:"url"`
	User      string    `json:"user"`
	Labels    []Label   `json:"labels"`
	Assignees []string  `json:"assignees"`
	Comments  []Comment `json:"comments"`
	PR        *PR       `json:"pr"`
}

// IssueSummary is one row of a repo's issue or pull request list.
type IssueSummary struct {
	Number    int       `json:"number"`
	Repo      string    `json:"repo,omitempty"` // owner/repo; set only on cross-repo lists like the inbox
	Title     string    `json:"title"`
	State     string    `json:"state"`
	URL       string    `json:"url"`
	User      string    `json:"user"`
	Labels    []Label   `json:"labels"`
	IsPR      bool      `json:"isPR"`
	IsDraft   bool      `json:"isDraft"`
	Comments  int       `json:"comments"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Repo struct {
	FullName string `json:"fullName"`
	Private  bool   `json:"private"`
	Admin    bool   `json:"admin"` // can manage the repo's webhooks
}

type TreeEntry struct {
	Path string `json:"path"`
	Type string `json:"type"` // "blob" or "tree"
	SHA  string `json:"sha"`  // git object id; changes exactly when the content does
}

type File struct {
	Content string `json:"content"`
	SHA     string `json:"sha"`
}

// rest returns a go-github client for one token. It shares c.HTTP, so the ETag cache sees every call.
func (c *Client) rest(token string) (*github.Client, error) {
	return github.NewClient(github.WithHTTPClient(c.HTTP), github.WithAuthToken(token), github.WithURLs(github.Ptr(c.APIURL+"/"), nil))
}

// wrap maps go-github errors onto *Error. Call it only with a non-nil error.
func wrap(err error) *Error {
	var rl *github.RateLimitError
	if errors.As(err, &rl) {
		return &Error{Status: 403, Message: rl.Message, Reset: rl.Rate.Reset.Time, RateLimited: true}
	}
	var ab *github.AbuseRateLimitError
	if errors.As(err, &ab) {
		reset := time.Now()
		if ab.RetryAfter != nil {
			reset = reset.Add(*ab.RetryAfter)
		}
		return &Error{Status: 403, Message: ab.Message, Reset: reset, RateLimited: true}
	}
	var er *github.ErrorResponse
	if errors.As(err, &er) && er.Response != nil {
		return &Error{Status: er.Response.StatusCode, Message: er.Message, RateLimited: er.Response.StatusCode == 429}
	}
	return &Error{Message: err.Error()}
}

func escapePath(p string) string {
	parts := strings.Split(p, "/")
	for i, s := range parts {
		parts[i] = url.PathEscape(s)
	}
	return strings.Join(parts, "/")
}

func (c *Client) Repos(ctx context.Context, token string) ([]Repo, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	opts := &github.RepositoryListByAuthenticatedUserOptions{Affiliation: "owner,collaborator,organization_member", Sort: "pushed", ListOptions: github.ListOptions{PerPage: 100}}
	out := []Repo{}
	for {
		rs, resp, err := g.Repositories.ListByAuthenticatedUser(ctx, opts)
		if err != nil {
			return nil, wrap(err)
		}
		for _, r := range rs {
			out = append(out, Repo{FullName: r.GetFullName(), Private: r.GetPrivate(), Admin: r.GetPermissions().GetAdmin()})
		}
		if resp.NextPage == 0 {
			return out, nil
		}
		opts.Page = resp.NextPage
	}
}

func (c *Client) Issue(ctx context.Context, token, owner, repo string, n int) (*Issue, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	gi, _, err := g.Issues.Get(ctx, owner, repo, n)
	if err != nil {
		return nil, wrap(err)
	}
	is := &Issue{Number: gi.GetNumber(), Title: gi.GetTitle(), State: gi.GetState(), Body: gi.GetBody(), URL: gi.GetHTMLURL(),
		User: gi.GetUser().GetLogin(), Labels: []Label{}, Assignees: []string{}, Comments: []Comment{}}
	for _, a := range gi.Assignees {
		is.Assignees = append(is.Assignees, a.GetLogin())
	}
	for _, l := range gi.Labels {
		is.Labels = append(is.Labels, Label{Name: l.GetName(), Color: l.GetColor()})
	}
	opts := &github.IssueListCommentsOptions{ListOptions: github.ListOptions{PerPage: 100}}
	for {
		cs, resp, err := g.Issues.ListComments(ctx, owner, repo, n, opts)
		if err != nil {
			return nil, wrap(err)
		}
		for _, x := range cs {
			is.Comments = append(is.Comments, comment(x))
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}
	if gi.IsPullRequest() {
		if is.PR, err = prDetails(ctx, g, owner, repo, n); err != nil {
			return nil, err
		}
	}
	return is, nil
}

// RepoIssues lists a repo's issues ("issue") or pull requests ("pr"), most recently updated first.
// shortcut: first 100 items only; add paging if a repo's list outgrows it.
func (c *Client) RepoIssues(ctx context.Context, token, owner, repo, state, kind string) ([]IssueSummary, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	is, _, err := g.Issues.ListByRepo(ctx, owner, repo, &github.IssueListByRepoOptions{
		State: state, Sort: "updated", Direction: "desc", ListOptions: github.ListOptions{PerPage: 100}})
	if err != nil {
		return nil, wrap(err)
	}
	out := []IssueSummary{}
	for _, x := range is {
		if x.IsPullRequest() != (kind == "pr") {
			continue
		}
		it := IssueSummary{Number: x.GetNumber(), Title: x.GetTitle(), State: x.GetState(), URL: x.GetHTMLURL(),
			User: x.GetUser().GetLogin(), Labels: []Label{}, IsPR: x.IsPullRequest(), IsDraft: x.GetDraft(),
			Comments: x.GetComments(), UpdatedAt: x.GetUpdatedAt().Time}
		for _, l := range x.Labels {
			it.Labels = append(it.Labels, Label{Name: l.GetName(), Color: l.GetColor()})
		}
		out = append(out, it)
	}
	return out, nil
}

// HookEvents are the webhook events Gantry turns into live updates.
var HookEvents = []string{"issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment", "push"}

// EnsureHook adds a webhook posting to url unless the repo already has one; it reports whether it added one.
// shortcut: looks at the first 100 hooks only; repos rarely have more.
func (c *Client) EnsureHook(ctx context.Context, token, owner, repo, url, secret string) (bool, error) {
	g, err := c.rest(token)
	if err != nil {
		return false, err
	}
	hooks, _, err := g.Repositories.ListHooks(ctx, owner, repo, &github.ListOptions{PerPage: 100})
	if err != nil {
		return false, wrap(err)
	}
	for _, h := range hooks {
		if h.GetConfig().GetURL() == url {
			return false, nil
		}
	}
	_, _, err = g.Repositories.CreateHook(ctx, owner, repo, &github.Hook{
		Name:   github.Ptr("web"),
		Active: github.Ptr(true),
		Events: HookEvents,
		Config: &github.HookConfig{URL: github.Ptr(url), ContentType: github.Ptr("json"), Secret: github.Ptr(secret)},
	})
	if err != nil {
		return false, wrap(err)
	}
	return true, nil
}

func comment(x *github.IssueComment) Comment {
	return Comment{ID: x.GetID(), User: x.GetUser().GetLogin(), Body: x.GetBody(), CreatedAt: x.GetCreatedAt().Time}
}

// shortcut: first 100 reviews and check runs; paginate if a PR outgrows that.
func prDetails(ctx context.Context, g *github.Client, owner, repo string, n int) (*PR, error) {
	p, _, err := g.PullRequests.Get(ctx, owner, repo, n)
	if err != nil {
		return nil, wrap(err)
	}
	rv, _, err := g.PullRequests.ListReviews(ctx, owner, repo, n, &github.ListOptions{PerPage: 100})
	if err != nil {
		return nil, wrap(err)
	}
	cr, _, err := g.Checks.ListCheckRunsForRef(ctx, owner, repo, p.GetHead().GetSHA(), &github.ListCheckRunsOptions{ListOptions: github.ListOptions{PerPage: 100}})
	if err != nil {
		return nil, wrap(err)
	}
	// Keep each reviewer's latest verdict; plain comments are not verdicts.
	reviews := []Review{}
	at := map[string]int{}
	for _, r := range rv {
		user, state := r.GetUser().GetLogin(), r.GetState()
		if state == "COMMENTED" {
			continue
		}
		if i, ok := at[user]; ok {
			reviews[i].State = state
			continue
		}
		at[user] = len(reviews)
		reviews = append(reviews, Review{User: user, State: state})
	}
	checks := []Check{}
	for _, r := range cr.CheckRuns {
		checks = append(checks, Check{Name: r.GetName(), Status: r.GetStatus(), Conclusion: r.GetConclusion()})
	}
	return &PR{Merged: p.GetMerged(), Draft: p.GetDraft(), Reviews: reviews, Checks: checks}, nil
}

func (c *Client) CreateComment(ctx context.Context, token, owner, repo string, n int, body string) (*Comment, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	x, _, err := g.Issues.CreateComment(ctx, owner, repo, n, github.IssueCommentRequest{Body: body})
	if err != nil {
		return nil, wrap(err)
	}
	cm := comment(x)
	return &cm, nil
}

// Tree lists the default branch recursively, filtered to prefix ("" = whole repo).
func (c *Client) Tree(ctx context.Context, token, owner, repo, prefix string) ([]TreeEntry, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	r, _, err := g.Repositories.Get(ctx, owner, repo)
	if err != nil {
		return nil, wrap(err)
	}
	t, _, err := g.Git.GetTree(ctx, owner, repo, r.GetDefaultBranch(), true)
	if err != nil {
		if e := wrap(err); e.Status != 409 { // 409 = empty repository
			return nil, e
		}
		return []TreeEntry{}, nil
	}
	if t.GetTruncated() {
		return nil, &Error{Status: 422, Message: "repository too large to list"}
	}
	out := []TreeEntry{}
	for _, x := range t.Entries {
		p := x.GetPath()
		if prefix == "" || p == prefix || strings.HasPrefix(p, prefix+"/") {
			out = append(out, TreeEntry{Path: p, Type: x.GetType(), SHA: x.GetSHA()})
		}
	}
	return out, nil
}

func (c *Client) GetContents(ctx context.Context, token, owner, repo, path string) (*File, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	fc, _, _, err := g.Repositories.GetContents(ctx, owner, repo, path, nil)
	if err != nil {
		return nil, wrap(err)
	}
	if fc == nil || fc.GetType() != "file" {
		return nil, &Error{Status: 400, Message: path + " is not a file"}
	}
	if fc.GetEncoding() != "none" {
		s, err := fc.GetContent()
		if err != nil {
			return nil, err
		}
		return &File{Content: s, SHA: fc.GetSHA()}, nil
	}
	// Files over 1 MB come back without content; the raw media type serves up to 100 MB.
	req, err := g.NewRequest(ctx, "GET", fmt.Sprintf("repos/%s/%s/contents/%s", url.PathEscape(owner), url.PathEscape(repo), escapePath(path)), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.raw+json")
	var raw bytes.Buffer
	if _, err := g.Do(req, &raw); err != nil {
		return nil, wrap(err)
	}
	return &File{Content: raw.String(), SHA: fc.GetSHA()}, nil
}

func (c *Client) PutContents(ctx context.Context, token, owner, repo, path, content, sha, message string) (string, error) {
	g, err := c.rest(token)
	if err != nil {
		return "", err
	}
	opts := &github.RepositoryContentFileOptions{Message: github.Ptr(message), Content: []byte(content)}
	var res *github.RepositoryContentResponse
	escaped := escapePath(path) // go-github escapes GetContents paths but not CreateFile/UpdateFile
	if sha == "" {
		res, _, err = g.Repositories.CreateFile(ctx, owner, repo, escaped, opts)
	} else {
		opts.SHA = github.Ptr(sha)
		res, _, err = g.Repositories.UpdateFile(ctx, owner, repo, escaped, opts)
	}
	if err != nil {
		e := wrap(err)
		if e.Status == 422 && sha == "" && strings.Contains(e.Message, `"sha" wasn't supplied`) { // creating a file that already exists
			e.Status = 409
		}
		return "", e
	}
	return res.GetContent().GetSHA(), nil
}
