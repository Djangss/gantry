package notes

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
)

// maxText caps the text kept per file, so the index stays small.
// shortcut: text past 64 KB of a file is not searchable, raise it or store offsets if notes grow that long.
const maxText = 64 << 10

const maxResults = 20

// drawingText joins the text of an Excalidraw drawing's text elements.
func drawingText(src string) string {
	var d struct {
		Elements []struct {
			Text string `json:"text"`
		} `json:"elements"`
	}
	if json.Unmarshal([]byte(src), &d) != nil {
		return ""
	}
	var parts []string
	for _, e := range d.Elements {
		if e.Text != "" {
			parts = append(parts, e.Text)
		}
	}
	return strings.Join(parts, "\n")
}

// Search finds notes and drawings whose title or text contains q, case-insensitively.
// Title matches come first, then path order.
func (x *Index) Search(ctx context.Context, token, q string) ([]Entry, error) {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return []Entry{}, nil
	}
	if err := x.ensure(ctx, token); err != nil {
		return nil, err
	}
	type hit struct {
		e     Entry
		title bool
	}
	var hits []hit
	x.mu.Lock()
	for _, f := range x.files {
		title := strings.Contains(strings.ToLower(f.entry.Title), q)
		if title || strings.Contains(f.text, q) {
			hits = append(hits, hit{f.entry, title})
		}
	}
	x.mu.Unlock()
	slices.SortFunc(hits, func(a, b hit) int {
		if a.title != b.title {
			if a.title {
				return -1
			}
			return 1
		}
		return strings.Compare(a.e.Path, b.e.Path)
	})
	out := []Entry{}
	for _, h := range hits[:min(len(hits), maxResults)] {
		out = append(out, h.e)
	}
	return out, nil
}
