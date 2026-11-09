import { expect, test } from "vitest";
import { noteTemplate, slugify, splitFrontmatter } from "./frontmatter";

test("flow links, colon in title, body split", () => {
  expect(splitFrontmatter("---\ntitle: Cap: phase 3\nlinks: [Djangss/cap#3, \"o/r#7\"]\n---\n\n# Body")).toEqual({
    title: "Cap: phase 3",
    links: ["Djangss/cap#3", "o/r#7"],
    body: "\n# Body",
  });
});

test("block links and CRLF", () => {
  const n = splitFrontmatter("---\r\ntitle: 'Q'\r\nlinks:\r\n  - a/b#1\r\n  - c/d#2\r\n---\r\nx");
  expect([n.title, n.links, n.body]).toEqual(["Q", ["a/b#1", "c/d#2"], "x"]);
});

test("no or unterminated frontmatter keeps the source as body", () => {
  expect(splitFrontmatter("plain")).toEqual({ title: "", links: [], body: "plain" });
  expect(splitFrontmatter("---\ntitle: x\n")).toEqual({ title: "", links: [], body: "---\ntitle: x\n" });
});

test("noteTemplate round-trips", () => {
  const n = splitFrontmatter(noteTemplate("Ideas", ["o/r#1"]));
  expect([n.title, n.links]).toEqual(["Ideas", ["o/r#1"]]);
});

test("slugify strips French accents and punctuation", () => {
  expect(slugify("Idées pour Cap: phase 3!")).toBe("idees-pour-cap-phase-3");
  expect(slugify("***")).toBe("untitled");
});
