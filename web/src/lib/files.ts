import { api, ApiError, send } from "@/api";
import type { FileData } from "@/types";

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
