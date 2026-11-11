package notes

import (
	"context"
	"crypto/sha1"
	"fmt"
	"sync/atomic"
	"testing"
	"time"

	"github.com/Djangss/gantry/internal/gh"
)

type fakeSource struct {
	files map[string]string
	fail  map[string]error
	trees atomic.Int32
	gets  atomic.Int32
}

// blobSHA stands in for git's blob hash: it changes exactly when the content does.
func blobSHA(content string) string { return fmt.Sprintf("%x", sha1.Sum([]byte(content))) }

func (f *fakeSource) Tree(ctx context.Context, token, owner, repo, prefix string) ([]gh.TreeEntry, error) {
	f.trees.Add(1)
	out := []gh.TreeEntry{{Path: "notes", Type: "tree"}}
	for p := range f.files {
		out = append(out, gh.TreeEntry{Path: p, Type: "blob", SHA: blobSHA(f.files[p])})
	}
	return out, nil
}

func (f *fakeSource) GetContents(ctx context.Context, token, owner, repo, path string) (*gh.File, error) {
	f.gets.Add(1)
	if err := f.fail[path]; err != nil {
		return nil, err
	}
	return &gh.File{Content: f.files[path], SHA: blobSHA(f.files[path])}, nil
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
	x.Update("notes/ideas.md", "s9", "---\nlinks: [o/r#9]\n---\n")
	x.Update("README.md", "s9", "---\nlinks: [o/r#9]\n---\n")
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

func TestLookupFailsOnUpstreamError(t *testing.T) {
	src := newFake()
	src.fail = map[string]error{"notes/plain.md": &gh.Error{Status: 502, Message: "Bad Gateway"}}
	if _, err := New(src, "Djangss", "notes").Lookup(context.Background(), "tok", "o/r#1"); err == nil {
		t.Fatal("a transient 5xx must fail the build, not drop the file from the index")
	}
}

func TestRescanFetchesOnlyChangedFiles(t *testing.T) {
	src := newFake()
	x := New(src, "Djangss", "notes")
	bg := context.Background()
	x.Lookup(bg, "tok", "o/r#1")
	if n := src.gets.Load(); n != 3 { // ideas.md, plain.md, flow.excalidraw
		t.Fatalf("first scan fetched %d files", n)
	}

	src.gets.Store(0)
	if err := x.Rebuild(bg, "tok"); err != nil || src.gets.Load() != 0 {
		t.Fatalf("unchanged rescan fetched %d files (err %v)", src.gets.Load(), err)
	}

	src.files["notes/plain.md"] = "---\nlinks: [o/r#1]\n---\n"           // changed
	src.files["notes/new.md"] = "---\ntitle: New\nlinks: [o/r#1]\n---\n" // added
	delete(src.files, "drawings/flow.excalidraw")                        // deleted
	src.gets.Store(0)
	x.Rebuild(bg, "tok")
	if n := src.gets.Load(); n != 2 {
		t.Fatalf("rescan fetched %d files, want the changed and the added one", n)
	}
	got, _ := x.Lookup(bg, "tok", "o/r#1")
	if fmt.Sprint(got) != "[{notes/new.md New note} {notes/plain.md plain note}]" {
		t.Fatalf("got %v", got)
	}
	if got, _ := x.Lookup(bg, "tok", "djangss/cap#3"); fmt.Sprint(got) != "[{notes/ideas.md Ideas note}]" {
		t.Fatalf("deleted drawing still indexed: %v", got)
	}
}

func TestUpdateRecordsSHA(t *testing.T) {
	src := newFake()
	x := New(src, "Djangss", "notes")
	bg := context.Background()
	x.Lookup(bg, "tok", "o/r#1")
	content := "---\nlinks: [o/r#5]\n---\n"
	src.files["notes/plain.md"] = content
	x.Update("notes/plain.md", blobSHA(content), content) // what the save handler does
	src.gets.Store(0)
	x.Rebuild(bg, "tok")
	if n := src.gets.Load(); n != 0 {
		t.Fatalf("a file saved through Gantry was fetched again (%d)", n)
	}
}

func TestInvalidateRescansOnNextLookup(t *testing.T) {
	src := newFake()
	x := New(src, "Djangss", "notes")
	bg := context.Background()
	x.Lookup(bg, "tok", "o/r#1")
	x.Invalidate()
	x.Lookup(bg, "tok", "o/r#1")
	if n := src.trees.Load(); n != 2 {
		t.Fatalf("tree listed %d times, want a rescan after Invalidate", n)
	}
}

// slowSource delays Tree so Update calls land while scan reads its snapshot of the files.
type slowSource struct{ *fakeSource }

func (s slowSource) Tree(ctx context.Context, token, owner, repo, prefix string) ([]gh.TreeEntry, error) {
	time.Sleep(20 * time.Millisecond)
	return s.fakeSource.Tree(ctx, token, owner, repo, prefix)
}

func TestRebuildWithConcurrentUpdate(t *testing.T) {
	src := newFake()
	for i := range 200 {
		src.files[fmt.Sprintf("notes/n%d.md", i)] = "x"
	}
	x := New(slowSource{src}, "Djangss", "notes")
	ctx := context.Background()
	if err := x.Rebuild(ctx, "tok"); err != nil {
		t.Fatal(err)
	}
	stop, done := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; ; i++ {
			select {
			case <-stop:
				return
			default:
				x.Update(fmt.Sprintf("notes/saved%d.md", i), "sha", "saved")
			}
		}
	}()
	err := x.Rebuild(ctx, "tok")
	close(stop)
	<-done
	if err != nil {
		t.Fatal(err)
	}
}

func TestBacklinksAndNotes(t *testing.T) {
	src := &fakeSource{files: map[string]string{
		"notes/a.md":     "see [[Target]]",
		"notes/sub/b.md": "[[target|label]] and `[[target2]]`",
		"notes/c.md":     "nothing",
	}}
	x := New(src, "o", "r")
	got, err := x.Backlinks(context.Background(), "t", "TARGET")
	if err != nil || len(got) != 2 || got[0].Path != "notes/a.md" || got[1].Path != "notes/sub/b.md" {
		t.Fatalf("backlinks %v %v", got, err)
	}
	if got, _ := x.Backlinks(context.Background(), "t", "target2"); len(got) != 0 {
		t.Errorf("code span link indexed: %v", got)
	}
	x.Update("notes/c.md", "new", "now [[target]]")
	if got, _ := x.Backlinks(context.Background(), "t", "target"); len(got) != 3 {
		t.Errorf("update not reflected: %v", got)
	}
	if got, _ := x.Notes(context.Background(), "t"); len(got) != 3 {
		t.Errorf("notes %v", got)
	}
}

func TestBacklinksSpacedTarget(t *testing.T) {
	src := &fakeSource{files: map[string]string{"notes/a.md": "see [[Not Yet]]", "notes/not-yet.md": "x"}}
	x := New(src, "o", "r")
	got, err := x.Backlinks(context.Background(), "t", "not-yet")
	if err != nil || len(got) != 1 || got[0].Path != "notes/a.md" {
		t.Fatalf("got %v %v", got, err)
	}
}
