package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"
)

func TestCreateIssue(t *testing.T) {
	var got map[string]any
	h, c := testServer(t, map[string]http.HandlerFunc{"POST /repos/o/r/issues": func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&got)
		w.WriteHeader(201)
		fmt.Fprint(w, `{"number":12,"html_url":"https://x/12"}`)
	}})
	w := call(h, c, "POST", "/api/repos/o/r/issues", `{"title":"Bug","body":"b","labels":["ui"]}`)
	if w.Code != 201 || !strings.Contains(w.Body.String(), `"number":12`) || got["title"] != "Bug" || fmt.Sprint(got["labels"]) != "[ui]" {
		t.Fatalf("%d %s %v", w.Code, w.Body, got)
	}
	if w := call(h, c, "POST", "/api/repos/o/r/issues", `{"title":" "}`); w.Code != 400 {
		t.Fatalf("blank title: %d", w.Code)
	}
}

func TestUpdateIssue(t *testing.T) {
	var got []map[string]any
	h, c := testServer(t, map[string]http.HandlerFunc{"PATCH /repos/o/r/issues/4": func(w http.ResponseWriter, r *http.Request) {
		var m map[string]any
		json.NewDecoder(r.Body).Decode(&m)
		got = append(got, m)
		fmt.Fprint(w, `{}`)
	}})
	for _, tc := range []struct{ body, key, want string }{
		{`{"state":"closed","reason":"not_planned"}`, "state_reason", "not_planned"},
		{`{"state":"closed"}`, "state_reason", "completed"},
		{`{"state":"open"}`, "state", "open"},
		{`{"labels":["a"],"assignees":[]}`, "labels", "[a]"},
	} {
		got = nil
		if w := call(h, c, "PATCH", "/api/repos/o/r/issues/4", tc.body); w.Code != 204 || len(got) != 1 || fmt.Sprint(got[0][tc.key]) != tc.want {
			t.Fatalf("%s: %d %v", tc.body, w.Code, got)
		}
	}
	if a, ok := got[0]["assignees"]; !ok || fmt.Sprint(a) != "[]" {
		t.Fatalf("empty assignees must clear: %v", got[0])
	}
	if w := call(h, c, "PATCH", "/api/repos/o/r/issues/4", `{"state":"merged"}`); w.Code != 400 {
		t.Fatalf("bad state: %d", w.Code)
	}
}

func TestLabelsAndAssignees(t *testing.T) {
	h, c := testServer(t, map[string]http.HandlerFunc{
		"GET /repos/o/r/labels":    func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `[{"name":"ui","color":"fff"}]`) },
		"GET /repos/o/r/assignees": func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `[{"login":"bob"}]`) },
	})
	if w := call(h, c, "GET", "/api/repos/o/r/labels", ""); !strings.Contains(w.Body.String(), `"name":"ui"`) {
		t.Fatal(w.Body)
	}
	if w := call(h, c, "GET", "/api/repos/o/r/assignees", ""); strings.TrimSpace(w.Body.String()) != `["bob"]` {
		t.Fatal(w.Body)
	}
}

func TestConvertDraft(t *testing.T) {
	var vars map[string]any
	h, c := testServer(t, map[string]http.HandlerFunc{
		"GET /repos/o/r": func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, `{"node_id":"R_1"}`) },
		"POST /graphql": func(w http.ResponseWriter, r *http.Request) {
			var b struct{ Variables map[string]any }
			json.NewDecoder(r.Body).Decode(&b)
			vars = b.Variables
			fmt.Fprint(w, `{"data":{"convertProjectV2DraftIssueItemToIssue":{"item":{"id":"I1"}}}}`)
		},
	})
	if w := call(h, c, "POST", "/api/projects/P1/items/DI1/convert", `{"repo":"o/r"}`); w.Code != 204 || vars["item"] != "DI1" || vars["repo"] != "R_1" {
		t.Fatalf("%d %v", w.Code, vars)
	}
	if w := call(h, c, "POST", "/api/projects/P1/items/DI1/convert", `{"repo":"nope"}`); w.Code != 400 {
		t.Fatalf("bad repo: %d", w.Code)
	}
}
