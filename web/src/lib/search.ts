import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api";
import type { SearchResults } from "@/types";

export const MIN_QUERY = 2;

// Not wired into affects(): results are cached 30 s. Disabled while the dialog is closed,
// so window focus never spends the shared GitHub search quota.
export const searchQuery = (q: string, open: boolean) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: open && q.length >= MIN_QUERY,
    staleTime: 30_000, // a repeated query (backspacing) is served from cache
  });

export const notePath = (notesRepo: string, path: string) => `/files/${notesRepo}?${new URLSearchParams({ path })}`;
export const issuePath = (repo: string, n: number) => `/repos/${repo}?${new URLSearchParams({ item: `${repo}#${n}` })}`;
