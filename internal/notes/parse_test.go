package notes

import (
	"fmt"
	"testing"
)

func TestParseNote(t *testing.T) {
	cases := []struct{ src, title, links string }{
		{"---\ntitle: Cap: phase 3\nlinks: [Djangss/cap#3, \"Djangss/cap#7\"]\n---\nbody", "Cap: phase 3", "[Djangss/cap#3 Djangss/cap#7]"},
		{"---\r\ntitle: 'Quoted'\r\nlinks:\r\n  - Djangss/cap#1\r\n  - o/r#2\r\n---\r\n", "Quoted", "[Djangss/cap#1 o/r#2]"},
		{"---\nlinks: []\n---\n", "", "[]"},
		{"no frontmatter\nlinks: [o/r#1]", "", "[]"},
		{"---\ntitle: unterminated\n", "", "[]"},
	}
	for _, c := range cases {
		title, links := ParseNote(c.src)
		if title != c.title || fmt.Sprint(links) != c.links {
			t.Errorf("%q: got %q %v", c.src, title, links)
		}
	}
}

func TestParseDrawing(t *testing.T) {
	if l := ParseDrawing(`{"type":"excalidraw","elements":[],"links":["o/r#1"]}`); fmt.Sprint(l) != "[o/r#1]" {
		t.Fatalf("got %v", l)
	}
	if l := ParseDrawing(`not json`); l != nil {
		t.Fatalf("got %v", l)
	}
}

func TestValidRef(t *testing.T) {
	for ref, want := range map[string]bool{"Djangss/cap#3": true, "a.b/c-d#10": true, "cap#3": false, "o/r#x": false, "o/r/x#1": false} {
		if ValidRef(ref) != want {
			t.Errorf("%s: want %v", ref, want)
		}
	}
}
