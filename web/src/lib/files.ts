import { api, ApiError, send } from "@/api";
import type { FileData, TreeEntry } from "@/types";


export const contentsUrl = (owner: string, repo: string, path: string) =>
  `/api/repos/${owner}/${repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}`;

export type SaveResult = { ok: true; sha: string } | { ok: false };

export async function saveFile(owner: string, repo: string, path: string, content: string, sha: string, message: string): Promise<SaveResult> {
  try {
    const r = await send<{ sha: string }>("PUT", contentsUrl(owner, repo, path), { content, sha, message });
    return { ok: true, sha: r.sha };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) return { ok: false };
    throw e;
  }
}

export async function overwrite(owner: string, repo: string, path: string, content: string, message: string) {
  const latest = await api<FileData>(contentsUrl(owner, repo, path));
  return saveFile(owner, repo, path, content, latest.sha, message);
}

// After a save, drop the local edit only if nothing was typed while the save was in flight.
export const afterSave = (edited: string | null, saved: string) => (edited === saved ? null : edited);

// No background refetches: a refetch while editing would move the sha and let a save overwrite a remote change.
export const fileQueryOptions = (owner: string, repo: string, path: string) => ({
  queryKey: ["file", `${owner}/${repo}/${path}`],
  queryFn: () => api<FileData>(contentsUrl(owner, repo, path)),
  staleTime: Infinity,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
});

// exclusive runs fn unless a call guarded by the same flag is still in flight; a dropped call resolves to undefined.
export async function exclusive<T>(busy: { current: boolean }, fn: () => Promise<T>): Promise<T | undefined> {
  if (busy.current) return undefined;
  busy.current = true;
  try {
    return await fn();
  } finally {
    busy.current = false;
  }
}

// Typing during a save leaves the buffer ahead of what was saved, so it is not "Saved".
export const savedStatus = (current: string, saved: string) => (current === saved ? "Saved" : "");

export const editable = (p: string) => p.endsWith(".md") || p.endsWith(".excalidraw");

const byPath = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export const visibleFiles = (tree: TreeEntry[], query: string) => {
  const q = query.trim().toLowerCase();
  return tree
    .filter((e) => e.type === "blob" && editable(e.path) && e.path.toLowerCase().includes(q))
    .sort((a, b) => byPath.compare(a.path, b.path));
};
