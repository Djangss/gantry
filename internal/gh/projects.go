package gh

import (
	"context"
	"encoding/json"
	"log/slog"
)

type Project struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Number int    `json:"number"`
	Closed bool   `json:"closed"`
}

type Option struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Item struct {
	ID       string  `json:"id"`
	OptionID string  `json:"optionId"`
	Kind     string  `json:"kind"`
	Title    string  `json:"title"`
	Number   int     `json:"number,omitempty"`
	Repo     string  `json:"repo,omitempty"`
	URL      string  `json:"url,omitempty"`
	State    string  `json:"state,omitempty"`
	IsDraft  bool    `json:"isDraft,omitempty"`
	Labels   []Label `json:"labels"`
}

type Board struct {
	Title   string   `json:"title"`
	FieldID string   `json:"fieldId"`
	Options []Option `json:"options"`
	Items   []Item   `json:"items"`
}

func (c *Client) graphql(ctx context.Context, token, query string, vars map[string]any, out any) error {
	var resp struct {
		Data   json.RawMessage `json:"data"`
		Errors []struct {
			Type    string `json:"type"`
			Message string `json:"message"`
		} `json:"errors"`
	}
	if err := c.do(ctx, token, "POST", "/graphql", "", map[string]any{"query": query, "variables": vars}, &resp); err != nil {
		return err
	}
	// GitHub returns partial data with errors for items the token cannot see; keep the readable part.
	if len(resp.Errors) > 0 && len(resp.Data) > 0 && string(resp.Data) != "null" {
		slog.Warn("graphql partial errors", "first", resp.Errors[0].Message, "count", len(resp.Errors))
	} else if len(resp.Errors) > 0 {
		e := resp.Errors[0]
		status := map[string]int{"NOT_FOUND": 404, "FORBIDDEN": 403, "RATE_LIMITED": 429}[e.Type]
		if status == 0 {
			status = 502
		}
		return &Error{Status: status, Message: e.Message, RateLimited: status == 429}
	}
	return json.Unmarshal(resp.Data, out)
}

const projectsQuery = `query { viewer { projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { id title number closed } } } }`

func (c *Client) Projects(ctx context.Context, token string) ([]Project, error) {
	var r struct {
		Viewer struct {
			ProjectsV2 struct {
				Nodes []Project `json:"nodes"`
			} `json:"projectsV2"`
		} `json:"viewer"`
	}
	if err := c.graphql(ctx, token, projectsQuery, nil, &r); err != nil {
		return nil, err
	}
	if r.Viewer.ProjectsV2.Nodes == nil {
		return []Project{}, nil
	}
	return r.Viewer.ProjectsV2.Nodes, nil
}

const contributedQuery = `query { viewer { repositoriesContributedTo(first: 100, includeUserRepositories: false,
  contributionTypes: [COMMIT, ISSUE, PULL_REQUEST, PULL_REQUEST_REVIEW], orderBy: {field: PUSHED_AT, direction: DESC}) {
  nodes { nameWithOwner isPrivate } } } }`

// Contributed lists repos the viewer contributed to without owning them, newest push first.
func (c *Client) Contributed(ctx context.Context, token string) ([]Repo, error) {
	var r struct {
		Viewer struct {
			Repos struct {
				Nodes []*struct {
					NameWithOwner string `json:"nameWithOwner"`
					IsPrivate     bool   `json:"isPrivate"`
				} `json:"nodes"`
			} `json:"repositoriesContributedTo"`
		} `json:"viewer"`
	}
	if err := c.graphql(ctx, token, contributedQuery, nil, &r); err != nil {
		return nil, err
	}
	out := []Repo{}
	for _, n := range r.Viewer.Repos.Nodes {
		if n != nil { // repos the token cannot see come back as null
			out = append(out, Repo{FullName: n.NameWithOwner, Private: n.IsPrivate})
		}
	}
	return out, nil
}

// shortcut: first 100 items, no pagination; add cursor paging if a board outgrows it.
const boardQuery = `query($id: ID!) { node(id: $id) { ... on ProjectV2 {
  title
  field(name: "Status") { ... on ProjectV2SingleSelectField { id options { id name } } }
  items(first: 100) { nodes {
    id
    fieldValueByName(name: "Status") { ... on ProjectV2ItemFieldSingleSelectValue { optionId } }
    content {
      __typename
      ... on Issue { number title state url repository { nameWithOwner } labels(first: 10) { nodes { name color } } }
      ... on PullRequest { number title state url isDraft repository { nameWithOwner } labels(first: 10) { nodes { name color } } }
      ... on DraftIssue { title }
    }
  } }
} } }`

func (c *Client) Board(ctx context.Context, token, projectID string) (*Board, error) {
	var r struct {
		Node struct {
			Title string `json:"title"`
			Field *struct {
				ID      string   `json:"id"`
				Options []Option `json:"options"`
			} `json:"field"`
			Items struct {
				Nodes []struct {
					ID               string `json:"id"`
					FieldValueByName *struct {
						OptionID string `json:"optionId"`
					} `json:"fieldValueByName"`
					Content *struct {
						Typename   string `json:"__typename"`
						Number     int    `json:"number"`
						Title      string `json:"title"`
						State      string `json:"state"`
						URL        string `json:"url"`
						IsDraft    bool   `json:"isDraft"`
						Repository *struct {
							NameWithOwner string `json:"nameWithOwner"`
						} `json:"repository"`
						Labels *struct {
							Nodes []Label `json:"nodes"`
						} `json:"labels"`
					} `json:"content"`
				} `json:"nodes"`
			} `json:"items"`
		} `json:"node"`
	}
	if err := c.graphql(ctx, token, boardQuery, map[string]any{"id": projectID}, &r); err != nil {
		return nil, err
	}
	b := &Board{Title: r.Node.Title, Options: []Option{}, Items: []Item{}}
	if f := r.Node.Field; f != nil && f.ID != "" {
		b.FieldID, b.Options = f.ID, f.Options
	}
	for _, n := range r.Node.Items.Nodes {
		if n.Content == nil { // items the token cannot see
			continue
		}
		it := Item{ID: n.ID, Kind: n.Content.Typename, Title: n.Content.Title, Number: n.Content.Number,
			URL: n.Content.URL, State: n.Content.State, IsDraft: n.Content.IsDraft, Labels: []Label{}}
		if n.FieldValueByName != nil {
			it.OptionID = n.FieldValueByName.OptionID
		}
		if n.Content.Repository != nil {
			it.Repo = n.Content.Repository.NameWithOwner
		}
		if n.Content.Labels != nil && n.Content.Labels.Nodes != nil {
			it.Labels = n.Content.Labels.Nodes
		}
		b.Items = append(b.Items, it)
	}
	return b, nil
}

const moveMutation = `mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
  updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: {singleSelectOptionId: $option}}) { projectV2Item { id } }
}`

func (c *Client) MoveItem(ctx context.Context, token, projectID, itemID, fieldID, optionID string) error {
	var r json.RawMessage
	return c.graphql(ctx, token, moveMutation,
		map[string]any{"project": projectID, "item": itemID, "field": fieldID, "option": optionID}, &r)
}

const addMutation = `mutation($project: ID!, $content: ID!) {
  addProjectV2ItemById(input: {projectId: $project, contentId: $content}) { item { id } }
}`

// AddToProject is idempotent: adding an item already on the board returns the existing item.
func (c *Client) AddToProject(ctx context.Context, token, projectID, contentID string) error {
	var r json.RawMessage
	return c.graphql(ctx, token, addMutation, map[string]any{"project": projectID, "content": contentID}, &r)
}
