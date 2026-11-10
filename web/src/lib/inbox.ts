import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api";
import type { IssueSummary } from "@/types";

// GitHub search lags label changes by seconds, so a refetch right after approve can return the item again.
// shortcut: remembered for this tab only; a reload trusts search again, which has caught up by then.
const handled = new Set<string>();

export const refOf = (i: IssueSummary) => `${i.repo}#${i.number}`;
export const markHandled = (ref: string) => void handled.add(ref.toLowerCase());
export const unhandled = (list: IssueSummary[]) => list.filter((i) => !handled.has(refOf(i).toLowerCase()));

export const inboxQuery = queryOptions({
  queryKey: ["inbox"],
  queryFn: () => api<IssueSummary[]>("/api/inbox"),
  select: unhandled,
});
