import { expect, test } from "vitest";
import type { IssueSummary } from "@/types";
import { markHandled, refOf, unhandled } from "./inbox";

const item = (repo: string, number: number): IssueSummary => ({
  number, repo, title: "t", state: "open", url: "", user: "u", labels: [], isPR: false, isDraft: false, comments: 0, updatedAt: "",
});

test("refOf builds owner/repo#n", () => {
  expect(refOf(item("o/a", 3))).toBe("o/a#3");
});

test("handled items stay hidden even when stale search results bring them back", () => {
  markHandled("O/A#3");
  expect(unhandled([item("o/a", 3), item("o/a", 4)]).map(refOf)).toEqual(["o/a#4"]);
});
