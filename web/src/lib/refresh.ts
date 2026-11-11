import type { QueryClient } from "@tanstack/react-query";

// After any issue action: the drawer, repo lists, boards and the inbox may all show the change.
export function refreshIssues(qc: QueryClient) {
  return Promise.all(["issue", "repoIssues", "board", "inbox"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
