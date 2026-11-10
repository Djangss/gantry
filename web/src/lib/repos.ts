import { api, ApiError } from "@/api";
import type { FileData, Repo } from "@/types";
import { contentsUrl, saveFile } from "./files";

export type RepoGroup = { title: string; repos: Repo[] };

// groupRepos sorts every repo into one sidebar group; the first group a repo lands in wins.
export function groupRepos(login: string, accessible: Repo[], contributed: Repo[], watched: string[], query: string): RepoGroup[] {
  const seen = new Set<string>();
  const q = query.trim().toLowerCase();
  const take = (rs: Repo[]) =>
    rs.filter((r) => {
      const k = r.fullName.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return k.includes(q);
    });
  const mine = (r: Repo) => r.fullName.split("/")[0].toLowerCase() === login.toLowerCase();
  return [
    { title: "Yours", repos: take(accessible.filter(mine)) },
    { title: "Shared with you", repos: take(accessible.filter((r) => !mine(r))) },
    { title: "Contributed", repos: take(contributed) },
    { title: "Watching", repos: take(watched.map((fullName) => ({ fullName, private: false }))) },
  ].filter((g) => g.repos.length > 0);
}

const name = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;

// parseRepoName accepts "owner/repo" or a github.com URL and returns "owner/repo", or null.
export function parseRepoName(input: string): string | null {
  let s = input.trim().replace(/^https?:\/\/(www\.)?github\.com\//, "");
  if (s !== input.trim()) s = s.split("/").slice(0, 2).join("/");
  s = s.replace(/\.git$/, "");
  return name.test(s) ? s : null;
}

export function watchedFromFile(content: string): string[] {
  try {
    const repos = JSON.parse(content)?.repos;
    return Array.isArray(repos) ? repos.filter((r): r is string => typeof r === "string" && name.test(r)) : [];
  } catch {
    return [];
  }
}

export const addWatched = (list: string[], repo: string) =>
  list.some((r) => r.toLowerCase() === repo.toLowerCase()) ? list : [...list, repo];

// The watched list lives in gantry.json at the root of the notes repo, so it follows the user across devices.
const watchedPath = "gantry.json";

export const watchedQueryOptions = (notesRepo: string) => ({
  queryKey: ["watched", notesRepo],
  queryFn: async () => {
    const [o, r] = notesRepo.split("/");
    try {
      const f = await api<FileData>(contentsUrl(o, r, watchedPath));
      return { repos: watchedFromFile(f.content), sha: f.sha };
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return { repos: [] as string[], sha: "" };
      throw e;
    }
  },
  enabled: notesRepo !== "",
});

export function saveWatched(notesRepo: string, repos: string[], sha: string) {
  const [o, r] = notesRepo.split("/");
  return saveFile(o, r, watchedPath, JSON.stringify({ repos }, null, 2) + "\n", sha, "gantry: update watched repos");
}

export const removeWatched = (list: string[], repo: string) => list.filter((r) => r.toLowerCase() !== repo.toLowerCase());
