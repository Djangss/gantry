import { expect, test } from "vitest";
import { issuePath, notePath, searchQuery } from "./search";

test("search only runs while the dialog is open", () => {
  expect(searchQuery("kanban", true).enabled).toBe(true);
  expect(searchQuery("kanban", false).enabled).toBe(false);
  expect(searchQuery("k", true).enabled).toBe(false);
});

test("result links", () => {
  expect(notePath("o/notes", "notes/a b.md")).toBe("/files/o/notes?path=notes%2Fa+b.md");
  expect(issuePath("o/r", 7)).toBe("/repos/o/r?item=o%2Fr%237");
});
