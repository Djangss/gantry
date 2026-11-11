package notes

import (
	"context"
	"fmt"
	"testing"
)

func TestSearchRanksTitleFirstAndReadsDrawingText(t *testing.T) {
	f := &fakeSource{files: map[string]string{
		"notes/a-body.md":          "---\ntitle: Alpha\n---\nmentions Kanban in the body",
		"notes/z-title.md":         "---\ntitle: Kanban plan\n---\nnothing",
		"notes/other.md":           "unrelated",
		"drawings/flow.excalidraw": `{"elements":[{"type":"text","text":"kanban lanes"},{"type":"rectangle"}]}`,
	}}
	x := New(f, "o", "n")
	got, err := x.Search(context.Background(), "tok", "KANBAN")
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, e := range got {
		paths = append(paths, e.Path)
	}
	if fmt.Sprint(paths) != "[notes/z-title.md drawings/flow.excalidraw notes/a-body.md]" {
		t.Fatalf("got %v", paths)
	}
	x.Update("notes/other.md", "s2", "now kanban too")
	if got, _ := x.Search(context.Background(), "tok", "kanban"); len(got) != 4 {
		t.Fatalf("update not searchable: %v", got)
	}
	if got, _ := x.Search(context.Background(), "tok", " "); len(got) != 0 {
		t.Fatalf("blank query matched: %v", got)
	}
}
