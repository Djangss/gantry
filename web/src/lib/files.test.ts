import { afterEach, expect, test, vi } from "vitest";
import { afterSave, contentsUrl, fileQueryOptions, overwrite, saveFile } from "./files";

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("contentsUrl escapes each segment", () => {
  expect(contentsUrl("o", "r", "docs/my file.md")).toBe("/api/repos/o/r/contents/docs/my%20file.md");
});

test("saveFile returns the new sha", async () => {
  const f = vi.fn().mockResolvedValue(json(200, { sha: "s2" }));
  vi.stubGlobal("fetch", f);
  expect(await saveFile("o", "r", "a.md", "x", "s1", "m")).toEqual({ ok: true, sha: "s2" });
  expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ content: "x", sha: "s1", message: "m" });
});

test("saveFile reports a 409 as a conflict, not an error", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { error: "file changed on GitHub", code: "conflict" })));
  expect(await saveFile("o", "r", "notes/a.md", "x", "", "m")).toEqual({ ok: false });
});

test("saveFile rethrows other errors", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(502, { error: "GitHub is unavailable", code: "upstream" })));
  await expect(saveFile("o", "r", "a.md", "x", "s1", "m")).rejects.toMatchObject({ status: 502 });
});

test("overwrite saves against the latest sha", async () => {
  const f = vi.fn()
    .mockResolvedValueOnce(json(200, { content: "theirs", sha: "s9" }))
    .mockResolvedValueOnce(json(200, { sha: "s10" }));
  vi.stubGlobal("fetch", f);
  expect(await overwrite("o", "r", "a.md", "mine", "m")).toEqual({ ok: true, sha: "s10" });
  expect(JSON.parse(f.mock.calls[1][1].body).sha).toBe("s9");
});

test("afterSave keeps edits typed during the save", () => {
  expect(afterSave("saved text", "saved text")).toBeNull();
  expect(afterSave("saved text plus more", "saved text")).toBe("saved text plus more");
  expect(afterSave(null, "saved text")).toBeNull();
});

test("an open file never refetches on its own, so its sha only moves on save or reload", () => {
  expect(fileQueryOptions("o", "r", "a.md")).toMatchObject({
    queryKey: ["file", "o/r/a.md"],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
});
