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
  expect(l.url).toBe("/files/o/n?new=note&name=Brand%20New");
});

test("text without wiki links is untouched", () => {
  expect(run("plain [x] text")).toHaveLength(1);
});

test("spaced target resolves to the slugified file name, as create writes it", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "[[Not Yet]]" }] }] };
  remarkWiki("o/n", [{ path: "notes/not-yet.md", title: "Not Yet", kind: "note" }])()(tree);
  expect((tree.children[0].children[0] as unknown as { url: string }).url).toBe("/files/o/n?path=notes%2Fnot-yet.md");
});

test("unknown link keeps the current path", () => {
  const tree = { type: "root", children: [{ type: "paragraph", children: [{ type: "text", value: "[[Zed]]" }] }] };
  remarkWiki("o/n", [], "notes/a.md")()(tree);
  expect((tree.children[0].children[0] as unknown as { url: string }).url).toBe("/files/o/n?path=notes%2Fa.md&new=note&name=Zed");
});
