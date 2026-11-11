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
	return searchKinds(ctx, g, "is:open label:proposed author:"+login, 100, false)
}

// repoFromURL turns ".../repos/owner/repo" into "owner/repo".
func repoFromURL(u string) string {
	_, after, _ := strings.Cut(u, "/repos/")
	return after
}

// ItemNode returns the GraphQL node id Projects v2 needs, whether the number is a PR, whether it is a draft, and whether it carries label.
func (c *Client) ItemNode(ctx context.Context, token, owner, repo string, n int, label string) (string, bool, bool, bool, error) {
	g, err := c.rest(token)
	if err != nil {
		return "", false, false, false, err
	}
	gi, _, err := g.Issues.Get(ctx, owner, repo, n)
	if err != nil {
		return "", false, false, false, wrap(err)
	}
	has := false
	for _, l := range gi.Labels {
		has = has || l.GetName() == label
	}
	return gi.GetNodeID(), gi.IsPullRequest(), gi.GetDraft(), has, nil
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

// Close closes an issue with reason ("completed" or "not_planned"), or a PR without merging.
func (c *Client) Close(ctx context.Context, token, owner, repo string, n int, isPR bool, reason string) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if isPR {
		_, _, err = g.PullRequests.Edit(ctx, owner, repo, n, &github.PullRequest{State: github.Ptr("closed")})
	} else {
		_, _, err = g.Issues.Update(ctx, owner, repo, n, github.UpdateIssueRequest{State: github.Ptr("closed"), StateReason: github.Ptr(reason)})
	}
	if err != nil {
		return wrap(err)
	}
	return nil
}

const readyMutation = `mutation($id: ID!) {
  markPullRequestReadyForReview(input: {pullRequestId: $id}) { pullRequest { id } }
}`

// MarkReady takes a draft PR out of draft, which GitHub requires before it can merge.
func (c *Client) MarkReady(ctx context.Context, token, nodeID string) error {
	var r struct {
		Ready *struct {
			PullRequest struct {
				ID string `json:"id"`
			} `json:"pullRequest"`
		} `json:"markPullRequestReadyForReview"`
	}
	if err := c.graphql(ctx, token, readyMutation, map[string]any{"id": nodeID}, &r); err != nil {
		return err
	}
	if r.Ready == nil || r.Ready.PullRequest.ID == "" { // partial errors are only warned about by graphql
		return &Error{Status: 422, Message: "GitHub rejected marking the PR ready"}
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
