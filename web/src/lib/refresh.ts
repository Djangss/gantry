import type { QueryClient } from "@tanstack/react-query";

// After any issue action: the drawer, repo lists, boards and the inbox may all show the change.
export function refreshIssues(qc: QueryClient) {
  for (const k of ["issue", "repoIssues", "board", "inbox"]) void qc.invalidateQueries({ queryKey: [k] });
}
