package gh

import (
	"context"
	"encoding/json"

	"github.com/google/go-github/v93/github"
)

// CreateIssue opens an issue and returns its number and URL.
func (c *Client) CreateIssue(ctx context.Context, token, owner, repo, title, body string, labels []string) (int, string, error) {
	g, err := c.rest(token)
	if err != nil {
		return 0, "", err
	}
	x, _, err := g.Issues.Create(ctx, owner, repo, github.CreateIssueRequest{Title: title, Body: &body, Labels: labels})
	if err != nil {
		return 0, "", wrap(err)
	}
	return x.GetNumber(), x.GetHTMLURL(), nil
}

// Reopen reopens a closed issue or PR.
func (c *Client) Reopen(ctx context.Context, token, owner, repo string, n int) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if _, _, err = g.Issues.Update(ctx, owner, repo, n, github.UpdateIssueRequest{State: github.Ptr("open")}); err != nil {
		return wrap(err)
	}
	return nil
}

// SetLabelsAssignees replaces the full label and/or assignee set; nil leaves that set untouched.
func (c *Client) SetLabelsAssignees(ctx context.Context, token, owner, repo string, n int, labels, assignees []string) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	if _, _, err = g.Issues.Update(ctx, owner, repo, n, github.UpdateIssueRequest{Labels: labels, Assignees: assignees}); err != nil {
		return wrap(err)
	}
	return nil
}

// shortcut: first 100 labels and assignees; page if a repo outgrows it.
func (c *Client) RepoLabels(ctx context.Context, token, owner, repo string) ([]Label, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	ls, _, err := g.Issues.ListLabels(ctx, owner, repo, &github.ListOptions{PerPage: 100})
	if err != nil {
		return nil, wrap(err)
	}
	out := []Label{}
	for _, l := range ls {
		out = append(out, Label{Name: l.GetName(), Color: l.GetColor()})
	}
	return out, nil
}

func (c *Client) Assignable(ctx context.Context, token, owner, repo string) ([]string, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	us, _, err := g.Issues.ListAssignees(ctx, owner, repo, &github.ListOptions{PerPage: 100})
	if err != nil {
		return nil, wrap(err)
	}
	out := []string{}
	for _, u := range us {
		out = append(out, u.GetLogin())
	}
	return out, nil
}

const convertMutation = `mutation($item: ID!, $repo: ID!) {
  convertProjectV2DraftIssueItemToIssue(input: {itemId: $item, repositoryId: $repo}) { item { id } }
}`

// ConvertDraft turns a draft board card into an issue in owner/repo.
func (c *Client) ConvertDraft(ctx context.Context, token, itemID, owner, repo string) error {
	g, err := c.rest(token)
	if err != nil {
		return err
	}
	r, _, err := g.Repositories.Get(ctx, owner, repo)
	if err != nil {
		return wrap(err)
	}
	var out json.RawMessage
	return c.graphql(ctx, token, convertMutation, map[string]any{"item": itemID, "repo": r.GetNodeID()}, &out)
}
