import { expect, test } from "vitest";
import { isSubmit, modLabel } from "./keys";

test("modLabel shows the Command key on Apple platforms", () => {
  expect(modLabel("MacIntel")).toBe("⌘");
  expect(modLabel("iPhone")).toBe("⌘");
  expect(modLabel("Linux x86_64")).toBe("Ctrl+");
});

test("isSubmit matches Ctrl+Enter and Cmd+Enter only", () => {
  expect(isSubmit({ key: "Enter", ctrlKey: true, metaKey: false })).toBe(true);
  expect(isSubmit({ key: "Enter", ctrlKey: false, metaKey: true })).toBe(true);
  expect(isSubmit({ key: "Enter", ctrlKey: false, metaKey: false })).toBe(false);
  expect(isSubmit({ key: "s", ctrlKey: true, metaKey: false })).toBe(false);
});
