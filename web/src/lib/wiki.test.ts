import { expect, test } from "vitest";
import { remarkWiki, slugOf } from "./wiki";

const notes = [{ path: "notes/sub/Ideas.md", title: "Ideas", kind: "note" as const }];
const run = (value: string) => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value }] }] };
  remarkWiki("o/n", notes)()(tree);
  return tree.children[0].children as { type: string; url?: string; value?: string; children?: { value: string }[] }[];
};

test("slugOf drops folders and extension", () => expect(slugOf("a/b/Ideas.md")).toBe("ideas"));

test("known slug links to the note, label overrides text, case ignored", () => {
  const [a, b, , c] = run("see [[IDEAS]] or [[ideas|the list]]!");
  expect(a.value).toBe("see ");
  expect(b.url).toBe("/files/o/n?path=notes%2Fsub%2FIdeas.md");
  expect(b.children?.[0].value).toBe("IDEAS");
  expect(c.url).toBe(b.url);
  expect(c.children?.[0].value).toBe("the list");
});

test("unknown slug links to creating the note", () => {
  const [l] = run("[[Brand New]]");
  expect(l.url).toBe("/files/o/n?new=note&name=brand%20new");
});

test("text without wiki links is untouched", () => {
  expect(run("plain [x] text")).toHaveLength(1);
});
