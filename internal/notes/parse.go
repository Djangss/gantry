// Package notes parses note/drawing links and indexes them by issue ref.
package notes

import (
	"encoding/json"
	"regexp"
	"strings"
)

var refRE = regexp.MustCompile(`^[\w.-]+/[\w.-]+#[0-9]+$`)

// ValidRef reports whether ref looks like owner/repo#number.
func ValidRef(ref string) bool { return refRE.MatchString(ref) }

func unquote(s string) string { return strings.Trim(s, `"'`) }

// ParseNote reads title and links from a leading --- frontmatter block.
// shortcut: only `key: value`, flow lists `[a, b]` and `- item` block lists; switch to a YAML parser if notes need more.
func ParseNote(src string) (title string, links []string) {
	src = strings.ReplaceAll(src, "\r\n", "\n")
	links = []string{}
	if !strings.HasPrefix(src, "---\n") {
		return "", links
	}
	end := strings.Index(src[4:], "\n---")
	if end < 0 {
		return "", links
	}
	lines := strings.Split(src[4:4+end], "\n")
	for i := 0; i < len(lines); i++ {
		key, val, ok := strings.Cut(lines[i], ":")
		if !ok {
			continue
		}
		val = strings.TrimSpace(val)
		switch strings.TrimSpace(key) {
		case "title":
			title = unquote(val)
		case "links":
			if strings.HasPrefix(val, "[") {
				for _, l := range strings.Split(strings.Trim(val, "[]"), ",") {
					if l = unquote(strings.TrimSpace(l)); l != "" {
						links = append(links, l)
					}
				}
				continue
			}
			for i+1 < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i+1]), "- ") {
				i++
				if l := unquote(strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(lines[i]), "- "))); l != "" {
					links = append(links, l)
				}
			}
		}
	}
	return title, links
}

// ParseDrawing reads the top-level "links" array Gantry adds to Excalidraw JSON.
func ParseDrawing(src string) []string {
	var d struct {
		Links []string `json:"links"`
	}
	if json.Unmarshal([]byte(src), &d) != nil {
		return nil
	}
	return d.Links
}
