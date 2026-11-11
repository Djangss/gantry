package gh

import (
	"context"
	"fmt"

	"github.com/google/go-github/v93/github"
)

// searchKinds runs one search per kind, since /search/issues needs is:issue or is:pr.
func searchKinds(ctx context.Context, g *github.Client, tail string, perPage int) ([]IssueSummary, error) {
	out := []IssueSummary{}
	for _, kind := range []string{"is:issue", "is:pr"} {
		res, _, err := g.Search.Issues(ctx, kind+" "+tail,
			&github.SearchOptions{Sort: "updated", Order: "desc", ListOptions: github.ListOptions{PerPage: perPage}})
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

// Search finds issues and PRs login is involved in, or that sit in login's own repos, whose text matches q.
// Legacy search has no OR, so that is two queries per kind, merged without duplicates.
// shortcut: top 10 per query; refine the query rather than paging.
func (c *Client) Search(ctx context.Context, token, login, q string) ([]IssueSummary, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	out := []IssueSummary{}
	seen := map[string]bool{}
	for _, scope := range []string{"involves:", "user:"} {
		res, err := searchKinds(ctx, g, scope+login+" "+q, 10)
		if err != nil {
			return nil, err
		}
		for _, it := range res {
			if k := fmt.Sprint(it.Repo, "#", it.Number, it.IsPR); !seen[k] {
				seen[k] = true
				out = append(out, it)
			}
		}
	}
	return out, nil
}
