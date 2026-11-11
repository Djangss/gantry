package gh

import (
	"context"

	"github.com/google/go-github/v93/github"
)

// searchKinds runs one search per kind, since /search/issues needs is:issue or is:pr.
func searchKinds(ctx context.Context, g *github.Client, tail string, perPage int, advanced bool) ([]IssueSummary, error) {
	out := []IssueSummary{}
	for _, kind := range []string{"is:issue", "is:pr"} {
		res, _, err := g.Search.Issues(ctx, kind+" "+tail,
			&github.SearchOptions{Sort: "updated", Order: "desc", AdvancedSearch: github.Ptr(advanced), ListOptions: github.ListOptions{PerPage: perPage}})
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
// OR needs advanced search, so one query per kind covers both scopes.
// shortcut: top 10 per kind; refine the query rather than paging.
func (c *Client) Search(ctx context.Context, token, login, q string) ([]IssueSummary, error) {
	g, err := c.rest(token)
	if err != nil {
		return nil, err
	}
	return searchKinds(ctx, g, "(involves:"+login+" OR user:"+login+") "+q, 10, true)
}
