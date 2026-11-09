package gh

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

const boardJSON = `{"data":{"node":{"title":"Gantry","field":{"id":"F1","options":[{"id":"O1","name":"Todo"},{"id":"O2","name":"Done"}]},"items":{"nodes":[
 {"id":"I1","fieldValueByName":{"optionId":"O1"},"content":{"__typename":"Issue","number":3,"title":"Write spec","state":"OPEN","url":"https://github.com/Djangss/gantry/issues/3","repository":{"nameWithOwner":"Djangss/gantry"},"labels":{"nodes":[{"name":"docs","color":"0000ff"}]}}},
 {"id":"I2","fieldValueByName":null,"content":{"__typename":"DraftIssue","title":"Idea"}},
 {"id":"I3","fieldValueByName":null,"content":null}]}}}}`

func graphqlFake(t *testing.T, vars *map[string]any) *Client {
	return fake(t, map[string]http.HandlerFunc{
		"POST /graphql": func(w http.ResponseWriter, r *http.Request) {
			var in struct {
				Query     string         `json:"query"`
				Variables map[string]any `json:"variables"`
			}
			json.NewDecoder(r.Body).Decode(&in)
			switch {
			case strings.Contains(in.Query, "updateProjectV2ItemFieldValue"):
				*vars = in.Variables
				fmt.Fprint(w, `{"data":{"updateProjectV2ItemFieldValue":{"projectV2Item":{"id":"I1"}}}}`)
			case in.Variables["id"] == "missing":
				fmt.Fprint(w, `{"data":null,"errors":[{"type":"NOT_FOUND","message":"Could not resolve to a node"}]}`)
			case strings.Contains(in.Query, "node(id"):
				fmt.Fprint(w, boardJSON)
			default:
				fmt.Fprint(w, `{"data":{"viewer":{"projectsV2":{"nodes":[{"id":"P1","title":"Gantry","number":1,"closed":false}]}}}}`)
			}
		},
	})
}

func TestProjects(t *testing.T) {
	var v map[string]any
	ps, err := graphqlFake(t, &v).Projects(ctx, "tok")
	if err != nil || fmt.Sprint(ps) != "[{P1 Gantry 1 false}]" {
		t.Fatalf("%v %v", err, ps)
	}
}

func TestBoard(t *testing.T) {
	var v map[string]any
	b, err := graphqlFake(t, &v).Board(ctx, "tok", "P1")
	if err != nil {
		t.Fatal(err)
	}
	if b.Title != "Gantry" || b.FieldID != "F1" || len(b.Options) != 2 || len(b.Items) != 2 {
		t.Fatalf("board %+v", b)
	}
	i := b.Items[0]
	if i.Kind != "Issue" || i.OptionID != "O1" || i.Repo != "Djangss/gantry" || i.Number != 3 || len(i.Labels) != 1 {
		t.Fatalf("issue item %+v", i)
	}
	d := b.Items[1]
	if d.Kind != "DraftIssue" || d.OptionID != "" || d.Labels == nil {
		t.Fatalf("draft item %+v", d)
	}
}

func TestBoardNotFound(t *testing.T) {
	var v map[string]any
	_, err := graphqlFake(t, &v).Board(ctx, "tok", "missing")
	var e *Error
	if !errors.As(err, &e) || e.Status != 404 {
		t.Fatalf("want 404, got %#v", err)
	}
}

func TestMoveItem(t *testing.T) {
	var v map[string]any
	if err := graphqlFake(t, &v).MoveItem(ctx, "tok", "P1", "I1", "F1", "O2"); err != nil {
		t.Fatal(err)
	}
	if v["project"] != "P1" || v["item"] != "I1" || v["field"] != "F1" || v["option"] != "O2" {
		t.Fatalf("vars %v", v)
	}
}

func TestBoardPartialErrorsKeepReadableItems(t *testing.T) {
	c := fake(t, map[string]http.HandlerFunc{"POST /graphql": func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, strings.Replace(boardJSON, `{"data":`, `{"errors":[{"type":"FORBIDDEN","message":"org restricts OAuth apps"}],"data":`, 1))
	}})
	b, err := c.Board(ctx, "tok", "P1")
	if err != nil || len(b.Items) != 2 {
		t.Fatalf("want readable items despite partial errors, got %v %+v", err, b)
	}
}
