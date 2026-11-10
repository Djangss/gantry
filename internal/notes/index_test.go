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
	fail  map[string]error
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
	if err := f.fail[path]; err != nil {
		return nil, err
	}
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

func TestLookupSkipsUnreadableFile(t *testing.T) {
	src := newFake()
	src.files["notes/broken.md"] = ""
	src.fail = map[string]error{"notes/broken.md": &gh.Error{Status: 404, Message: "Not Found"}}
	x := New(src, "Djangss", "notes")
	got, err := x.Lookup(context.Background(), "tok", "Djangss/cap#3")
	if err != nil || len(got) != 2 {
		t.Fatalf("want 2 entries despite unreadable file, got %v %v", err, got)
	}
	x.Lookup(context.Background(), "tok", "Djangss/cap#3")
	if n := src.trees.Load(); n != 1 {
		t.Fatalf("index not kept: tree listed %d times", n)
	}
}

func TestLookupFailsOnRateLimit(t *testing.T) {
	src := newFake()
	src.fail = map[string]error{"notes/plain.md": &gh.Error{Status: 403, RateLimited: true}}
	if _, err := New(src, "Djangss", "notes").Lookup(context.Background(), "tok", "o/r#1"); err == nil {
		t.Fatal("rate limit mid-scan must fail the build, not leave a partial index")
	}
}
