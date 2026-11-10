// Drafts are a crash net; storage can be unavailable (private mode), so failures are ignored.
const k = (key: string) => `gantry:draft:${key}`;

export function saveDraft(key: string, content: string) {
  try {
    localStorage.setItem(k(key), content);
  } catch {}
}

export function loadDraft(key: string): string | null {
  try {
    return localStorage.getItem(k(key));
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(k(key));
  } catch {}
}
