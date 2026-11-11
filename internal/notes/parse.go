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

var (
	wikiRE   = regexp.MustCompile(`\[\[([^\[\]|]+)(?:\|[^\[\]]*)?\]\]`)
	inlineRE = regexp.MustCompile("`[^`\n]*`")
)

var accents = strings.NewReplacer(
	"à", "a", "á", "a", "â", "a", "ã", "a", "ä", "a", "å", "a", "ç", "c", "è", "e", "é", "e", "ê", "e", "ë", "e",
	"ì", "i", "í", "i", "î", "i", "ï", "i", "ñ", "n", "ò", "o", "ó", "o", "ô", "o", "õ", "o", "ö", "o",
	"ù", "u", "ú", "u", "û", "u", "ü", "u", "ý", "y", "ÿ", "y")

// Slugify mirrors slugify in web/src/lib/frontmatter.ts, the rule that names created notes; keep both in sync.
// shortcut: strips Latin-1 accents only (no Unicode normalisation without a dependency); extend the table if other scripts need it.
func Slugify(s string) string {
	s = accents.Replace(strings.ToLower(s))
	s = strings.Trim(slugRE.ReplaceAllString(s, "-"), "-")
	if s == "" {
		return "untitled"
	}
	return s
}

var slugRE = regexp.MustCompile(`[^\p{L}\p{M}\p{N}]+`)

// WikiLinks returns the slugified [[target]] and [[target|label]] targets in a note body,
// skipping fenced code blocks and inline code spans.
// shortcut: indented (4-space) code blocks are not skipped, since list continuations look the same; use a markdown parser if that bites.
// shortcut: fences close on any line starting with the same fence, spans must sit on one line; use a markdown parser if that bites.
func WikiLinks(src string) []string {
	var out []string
	var fence string
	for _, line := range strings.Split(strings.ReplaceAll(src, "\r\n", "\n"), "\n") {
		t := strings.TrimLeft(line, " ")
		if f := t[:min(3, len(t))]; f == "```" || f == "~~~" {
			if fence == "" {
				fence = f
			} else if fence == f {
				fence = ""
			}
			continue
		}
		if fence != "" {
			continue
		}
		for _, m := range wikiRE.FindAllStringSubmatch(inlineRE.ReplaceAllString(line, ""), -1) {
			if strings.TrimSpace(m[1]) != "" {
				out = append(out, Slugify(m[1]))
			}
		}
	}
	return out
}
