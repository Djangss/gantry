package gh

import (
	"context"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Notification struct {
	ID        string    `json:"id"`
	Unread    bool      `json:"unread"`
	Reason    string    `json:"reason"`
	Title     string    `json:"title"`
	Type      string    `json:"type"`
	Repo      string    `json:"repo"`
	Ref       string    `json:"ref"` // owner/repo#n for issues and PRs, else empty
	UpdatedAt time.Time `json:"updatedAt"`
}

var subjectRef = regexp.MustCompile(`/repos/([^/]+/[^/]+)/(?:issues|pulls)/(\d+)$`)

// Notifications lists unread threads; participating limits them to review requests, mentions and replies.
// shortcut: first 50, no paging; page if the panel ever needs more.
func (c *Client) Notifications(ctx context.Context, token string, participating bool) ([]Notification, error) {
	var raw []struct {
		ID        string
		Reason    string
		Unread    bool
		UpdatedAt time.Time `json:"updated_at"`
		Subject   struct{ Title, Type, URL string }
		Repo      struct {
			FullName string `json:"full_name"`
		} `json:"repository"`
	}
	p := "/notifications?per_page=50"
	if participating {
		p += "&participating=true"
	}
	if err := c.do(ctx, token, "GET", p, "", nil, &raw); err != nil {
		return nil, notifErr(err)
	}
	out := []Notification{}
	for _, n := range raw {
		ref := ""
		if m := subjectRef.FindStringSubmatch(n.Subject.URL); m != nil {
			ref = m[1] + "#" + m[2]
		}
		out = append(out, Notification{ID: n.ID, Unread: n.Unread, Reason: n.Reason, Title: n.Subject.Title, Type: n.Subject.Type,
			Repo: n.Repo.FullName, Ref: ref, UpdatedAt: n.UpdatedAt})
	}
	return out, nil
}

func (c *Client) MarkNotificationRead(ctx context.Context, token, id string) error {
	return notifErr(c.do(ctx, token, "PATCH", "/notifications/threads/"+id, "", nil, nil))
}

// notifErr flags a 403 whose granted scopes (X-OAuth-Scopes) lack "notifications": a session from before that scope existed.
func notifErr(err error) error {
	if e, ok := err.(*Error); ok && e.Status == http.StatusForbidden && !e.RateLimited && e.Scopes != "" &&
		!strings.Contains(", "+e.Scopes+",", ", notifications,") {
		e.MissingScope = true
	}
	return err
}
