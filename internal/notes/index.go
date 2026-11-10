package notes

import (
	"context"
	"errors"
	"log/slog"
	pathpkg "path"
	"slices"
	"strings"
	"sync"

	"github.com/Djangss/gantry/internal/gh"
)

type Entry struct {
	Path  string `json:"path"`
	Title string `json:"title"`
	Kind  string `json:"kind"` // "note" or "drawing"
}

type Source interface {
	Tree(ctx context.Context, token, owner, repo, prefix string) ([]gh.TreeEntry, error)
	GetContents(ctx context.Context, token, owner, repo, path string) (*gh.File, error)
}

// Index maps issue refs to the notes and drawings that link them.
// shortcut: built by a full scan on first use; switch to a committed index.json if scans get slow.
type Index struct {
	src         Source
	owner, repo string
	build       sync.Mutex // serializes scans
	mu          sync.Mutex // guards files and built
	built       bool
	files       map[string]indexed
}

type indexed struct {
	entry Entry
	refs  []string // lower-cased
}

func New(src Source, owner, repo string) *Index {
	return &Index{src: src, owner: owner, repo: repo, files: map[string]indexed{}}
}

func kind(path string) string {
	switch {
	case strings.HasPrefix(path, "notes/") && strings.HasSuffix(path, ".md"):
		return "note"
	case strings.HasPrefix(path, "drawings/") && strings.HasSuffix(path, ".excalidraw"):
		return "drawing"
	}
	return ""
}

func parse(path, content string) indexed {
	k := kind(path)
	var title string
	var refs []string
	if k == "note" {
		title, refs = ParseNote(content)
	} else {
		refs = ParseDrawing(content)
	}
	if title == "" {
		title = strings.TrimSuffix(pathpkg.Base(path), pathpkg.Ext(path))
	}
	lower := make([]string, len(refs))
	for i, r := range refs {
		lower[i] = strings.ToLower(r)
	}
	return indexed{entry: Entry{Path: path, Title: title, Kind: k}, refs: lower}
}

func (x *Index) Rebuild(ctx context.Context, token string) error {
	x.build.Lock()
	defer x.build.Unlock()
	return x.scan(ctx, token)
}

func (x *Index) scan(ctx context.Context, token string) error {
	tree, err := x.src.Tree(ctx, token, x.owner, x.repo, "")
	if err != nil {
		return err
	}
	files := map[string]indexed{}
	var (
		wg       sync.WaitGroup
		mu       sync.Mutex
		firstErr error
	)
	sem := make(chan struct{}, 8)
	for _, e := range tree {
		if e.Type != "blob" || kind(e.Path) == "" {
			continue
		}
		wg.Go(func() {
			sem <- struct{}{}
			defer func() { <-sem }()
			f, err := x.src.GetContents(ctx, token, x.owner, x.repo, e.Path)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				if skippable(err) {
					slog.Warn("notes index: skipping unreadable file", "path", e.Path, "err", err)
					return
				}
				if firstErr == nil {
					firstErr = err
				}
				return
			}
			files[e.Path] = parse(e.Path, f.Content)
		})
	}
	wg.Wait()
	if firstErr != nil {
		return firstErr
	}
	x.mu.Lock()
	x.files, x.built = files, true
	x.mu.Unlock()
	return nil
}

// skippable reports whether one file's read error should not fail the whole scan.
// Only a file GitHub refuses for that file alone is skipped; rate limits, bad tokens and
// upstream failures fail the scan, so the index is never built from a partial view.
func skippable(err error) bool {
	var e *gh.Error
	return errors.As(err, &e) && !e.RateLimited && (e.Status == 400 || e.Status == 403 || e.Status == 404 || e.Status == 422)
}

func (x *Index) Lookup(ctx context.Context, token, ref string) ([]Entry, error) {
	x.build.Lock()
	x.mu.Lock()
	built := x.built
	x.mu.Unlock()
	var err error
	if !built {
		err = x.scan(ctx, token)
	}
	x.build.Unlock()
	if err != nil {
		return nil, err
	}
	ref = strings.ToLower(ref)
	out := []Entry{}
	x.mu.Lock()
	for _, f := range x.files {
		if slices.Contains(f.refs, ref) {
			out = append(out, f.entry)
		}
	}
	x.mu.Unlock()
	slices.SortFunc(out, func(a, b Entry) int { return strings.Compare(a.Path, b.Path) })
	return out, nil
}

// Update re-parses one saved file; before the first scan it does nothing, since the scan will read it.
func (x *Index) Update(path, content string) {
	if kind(path) == "" {
		return
	}
	x.mu.Lock()
	defer x.mu.Unlock()
	if x.built {
		x.files[path] = parse(path, content)
	}
}
