package notes

import (
	"context"
	"fmt"
	"sync/atomic"
	"testing"

	"github.com/Djangss/gantry/internal/gh"
)

type fakeSource struct {
	files map[string]string
	trees atomic.Int32
}

func (f *fakeSource) Tree(ctx context.Context, token, owner, repo, prefix string) ([]gh.TreeEntry, error) {
	f.trees.Add(1)
	out := []gh.TreeEntry{{Path: "notes", Type: "tree"}}
	for p := range f.files {
		out = append(out, gh.TreeEntry{Path: p, Type: "blob"})
	}
	return out, nil
}

func (f *fakeSource) GetContents(ctx context.Context, token, owner, repo, path string) (*gh.File, error) {
	return &gh.File{Content: f.files[path], SHA: "x"}, nil
}

func newFake() *fakeSource {
	return &fakeSource{files: map[string]string{
		"notes/ideas.md":           "---\ntitle: Ideas\nlinks: [Djangss/cap#3]\n---\n",
		"notes/plain.md":           "no links",
		"drawings/flow.excalidraw": `{"elements":[],"links":["djangss/CAP#3"]}`,
		"README.md":                "---\nlinks: [Djangss/cap#3]\n---\n",
		"notes/image.png":          "png",
	}}
}

func TestLookupCaseInsensitive(t *testing.T) {
	x := New(newFake(), "Djangss", "notes")
	got, err := x.Lookup(context.Background(), "tok", "Djangss/Cap#3")
	if err != nil {
		t.Fatal(err)
	}
	if fmt.Sprint(got) != "[{drawings/flow.excalidraw flow drawing} {notes/ideas.md Ideas note}]" {
		t.Fatalf("got %v", got)
	}
}

func TestLookupBuildsOnce(t *testing.T) {
	src := newFake()
	x := New(src, "Djangss", "notes")
	x.Lookup(context.Background(), "tok", "o/r#1")
	x.Lookup(context.Background(), "tok", "o/r#2")
	if n := src.trees.Load(); n != 1 {
		t.Fatalf("tree listed %d times", n)
	}
	x.Rebuild(context.Background(), "tok")
	if n := src.trees.Load(); n != 2 {
		t.Fatalf("rebuild did not rescan: %d", n)
	}
}

func TestUpdate(t *testing.T) {
	x := New(newFake(), "Djangss", "notes")
	x.Lookup(context.Background(), "tok", "o/r#1")
	x.Update("notes/ideas.md", "---\nlinks: [o/r#9]\n---\n")
	x.Update("README.md", "---\nlinks: [o/r#9]\n---\n")
	old, _ := x.Lookup(context.Background(), "tok", "Djangss/cap#3")
	now, _ := x.Lookup(context.Background(), "tok", "o/r#9")
	if len(old) != 1 || fmt.Sprint(now) != "[{notes/ideas.md ideas note}]" {
		t.Fatalf("old %v now %v", old, now)
	}
}
