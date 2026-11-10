import { afterEach, expect, test, vi } from "vitest";
import { addWatched, groupRepos, parseRepoName, removeWatched, watchedFromFile } from "./repos";

afterEach(() => vi.unstubAllGlobals());

const r = (fullName: string) => ({ fullName, private: false });

test("groupRepos splits by owner, drops duplicates across groups, and filters", () => {
  const g = groupRepos("Djangss", [r("Djangss/gantry"), r("acme/api"), r("Djangss/cap")], [r("golang/go"), r("acme/api")], ["rust-lang/rust", "djangss/GANTRY"], "");
  expect(g.map((x) => [x.title, x.repos.map((y) => y.fullName)])).toEqual([
    ["Yours", ["Djangss/gantry", "Djangss/cap"]],
    ["Shared with you", ["acme/api"]],
    ["Contributed", ["golang/go"]],
    ["Watching", ["rust-lang/rust"]],
  ]);
  const f = groupRepos("Djangss", [r("Djangss/gantry"), r("acme/api")], [r("golang/go")], ["rust-lang/rust"], "GO");
  expect(f.map((x) => [x.title, x.repos.map((y) => y.fullName)])).toEqual([["Contributed", ["golang/go"]]]);
});

test("parseRepoName accepts owner/repo and GitHub URLs, rejects the rest", () => {
  expect(parseRepoName(" golang/go ")).toBe("golang/go");
  expect(parseRepoName("https://github.com/rust-lang/rust.git")).toBe("rust-lang/rust");
  expect(parseRepoName("https://github.com/rust-lang/rust/issues/3")).toBe("rust-lang/rust");
  expect(parseRepoName("golang")).toBeNull();
  expect(parseRepoName("a/b/c")).toBeNull();
  expect(parseRepoName("bad name/x")).toBeNull();
});

test("watchedFromFile reads gantry.json and tolerates junk", () => {
  expect(watchedFromFile('{"repos":["golang/go",3,"nope"]}')).toEqual(["golang/go"]);
  expect(watchedFromFile("not json")).toEqual([]);
});

test("addWatched keeps order, ignores case duplicates", () => {
  expect(addWatched(["golang/go"], "Golang/Go")).toEqual(["golang/go"]);
  expect(addWatched(["golang/go"], "rust-lang/rust")).toEqual(["golang/go", "rust-lang/rust"]);
});

test("removeWatched matches case-insensitively", () => {
  expect(removeWatched(["golang/go", "rust-lang/rust"], "GOLANG/go")).toEqual(["rust-lang/rust"]);
});
