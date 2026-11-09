export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public reset?: string) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "X-Requested-With": "gantry",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401 && window.location.pathname !== "/login") window.location.assign("/login");
  if (!res.ok) {
    const b = await res.json().catch(() => ({}));
    throw new ApiError(res.status, b.code ?? "error", b.error ?? res.statusText, b.reset);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const send = <T = void>(method: string, path: string, body?: unknown) =>
  api<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export function errorText(e: unknown): string {
  if (e instanceof ApiError && e.code === "rate_limited" && e.reset) {
    const at = new Date(e.reset).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${e.message}, retry at ${at}`;
  }
  return e instanceof Error ? e.message : String(e);
}
