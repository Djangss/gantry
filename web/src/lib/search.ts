import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api";
import type { SearchResults } from "@/types";

export const MIN_QUERY = 2;

// Not wired into affects(): results are short-lived (gcTime 0) and refetch on every open.
export const searchQuery = (q: string) =>
  queryOptions({
    queryKey: ["search", q],
    queryFn: () => api<SearchResults>(`/api/search?q=${encodeURIComponent(q)}`),
    enabled: q.length >= MIN_QUERY,
    gcTime: 0,
  });

export const notePath = (notesRepo: string, path: string) => `/files/${notesRepo}?${new URLSearchParams({ path })}`;
export const issuePath = (repo: string, n: number) => `/repos/${repo}?${new URLSearchParams({ item: `${repo}#${n}` })}`;
