import { expect, test } from "vitest";
import { affects } from "./events";

const keys: unknown[][] = [
  ["issue", "Djangss/gantry#7"],
  ["issue", "Djangss/gantry#8"],
  ["repoIssues", "Djangss/gantry", "issue", "open"],
  ["repoIssues", "Djangss/cap", "issue", "open"],
  ["board", "P1"],
  ["projects"],
  ["tree", "Djangss", "notes", ""],
  ["tree", "Djangss", "gantry", "docs"],
  ["file", "Djangss/notes/notes/a.md"],
  ["links", "djangss/gantry#7"],
  ["repos"],
];
const hit = (e: Parameters<typeof affects>[0]) => keys.filter(affects(e, "Djangss/notes")).map((k) => k.join(" "));

test("an issue event refreshes that issue, its repo lists and boards", () => {
  expect(hit({ type: "issues", repo: "djangss/GANTRY", number: 7 })).toEqual([
    "issue Djangss/gantry#7",
    "repoIssues Djangss/gantry issue open",
    "board P1",
  ]);
  expect(hit({ type: "pull_request_review", repo: "Djangss/gantry", number: 8 })).toEqual([
    "issue Djangss/gantry#8",
    "repoIssues Djangss/gantry issue open",
    "board P1",
  ]);
});

test("a project item event refreshes boards and the project list", () => {
  expect(hit({ type: "projects_v2_item", repo: "", number: 0 })).toEqual(["board P1", "projects"]);
});

test("a push to the notes repo refreshes its tree and links, never an open file", () => {
  expect(hit({ type: "push", repo: "Djangss/notes", number: 0 })).toEqual(["tree Djangss notes ", "links djangss/gantry#7"]);
  expect(hit({ type: "push", repo: "Djangss/gantry", number: 0 })).toEqual(["tree Djangss gantry docs"]);
});

test("repository events refresh the repo lists; unknown events refresh nothing", () => {
  expect(hit({ type: "repository", repo: "Djangss/new", number: 0 })).toEqual(["repos"]);
  expect(hit({ type: "star", repo: "Djangss/gantry", number: 0 })).toEqual([]);
});
