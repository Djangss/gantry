import { afterEach, expect, test, vi } from "vitest";
import { afterSave, contentsUrl, exclusive, fileQueryOptions, overwrite, savedStatus, saveFile, visibleFiles } from "./files";

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

test("exclusive drops calls made while one is in flight", async () => {
  const busy = { current: false };
  let release = () => {};
  const fn = vi.fn(() => new Promise<string>((r) => (release = () => r("done"))));
  const first = exclusive(busy, fn);
  expect(await exclusive(busy, fn)).toBeUndefined();
  release();
  expect(await first).toBe("done");
  expect(fn).toHaveBeenCalledTimes(1);
  expect(busy.current).toBe(false);
});

test("exclusive frees the slot when the call fails", async () => {
  const busy = { current: false };
  await expect(exclusive(busy, () => Promise.reject(new Error("x")))).rejects.toThrow("x");
  expect(busy.current).toBe(false);
});

test("savedStatus only says Saved when the buffer matches what was saved", () => {
  expect(savedStatus("abc", "abc")).toBe("Saved");
  expect(savedStatus("abcd", "abc")).toBe("");
});

test("visibleFiles keeps editable blobs, sorted, filtered case-insensitively", () => {
  const tree = [
    { path: "notes/b.md", type: "blob" },
    { path: "notes", type: "tree" },
    { path: "notes/A.md", type: "blob" },
    { path: "notes/img.png", type: "blob" },
    { path: "drawings/flow.excalidraw", type: "blob" },
    { path: "notes/note10.md", type: "blob" },
    { path: "notes/note9.md", type: "blob" },
  ] as const;
  expect(visibleFiles([...tree], "").map((f) => f.path)).toEqual([
    "drawings/flow.excalidraw", "notes/A.md", "notes/b.md", "notes/note9.md", "notes/note10.md",
  ]);
  expect(visibleFiles([...tree], "FLOW").map((f) => f.path)).toEqual(["drawings/flow.excalidraw"]);
  expect(visibleFiles([...tree], " note1 ").map((f) => f.path)).toEqual(["notes/note10.md"]);
});
