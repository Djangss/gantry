import { expect, test } from "vitest";
import { clearDraft, loadDraft, saveDraft } from "./drafts";

test("save, load, clear", () => {
  expect(loadDraft("o/r/a.md")).toBeNull();
  saveDraft("o/r/a.md", "text");
  expect(loadDraft("o/r/a.md")).toBe("text");
  expect(loadDraft("o/r/b.md")).toBeNull();
  clearDraft("o/r/a.md");
  expect(loadDraft("o/r/a.md")).toBeNull();
});
