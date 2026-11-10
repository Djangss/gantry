import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api, send } from "@/api";

// LiveEvent mirrors the server's /api/events payload.
export type LiveEvent = { type: string; repo: string; number: number };

const issueEvents = new Set(["issues", "issue_comment", "pull_request", "pull_request_review", "pull_request_review_comment", "check_run", "check_suite"]);
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

// affects returns a predicate over query keys: true for data the event may have changed.
// Open files ("file" keys) are never refetched: that would move their sha under an edit in progress.
export function affects(e: LiveEvent, notesRepo: string) {
  const ref = `${e.repo}#${e.number}`;
  const [owner, repo] = e.repo.split("/");
  return (key: readonly unknown[]) => {
    const [kind, a, b] = key;
    if (issueEvents.has(e.type))
      return ((kind === "issue" || kind === "prFiles") && same(a, ref)) || (kind === "repoIssues" && same(a, e.repo)) || kind === "board" || kind === "inbox";
    if (e.type.startsWith("projects_v2")) return kind === "board" || kind === "projects";
    if (e.type === "push") return (kind === "tree" && same(a, owner) && same(b, repo)) || (kind === "links" && same(e.repo, notesRepo));
    if (e.type === "repository") return kind === "repos" || kind === "contributed";
    return false;
  };
}

// recoverClosed handles a source the browser gave up on: check the session (api redirects to /login on 401), then reopen.
export async function recoverClosed(src: { readyState: number }, checkSession: () => Promise<unknown>, reopen: () => void) {
  if (src.readyState !== 2) return; // CONNECTING: the browser is already retrying
  await checkSession().catch(() => {}); // other errors: just try again
  reopen();
}

// useLiveUpdates keeps one /api/events stream open and refetches what each event touches.
// After a dropped connection it refetches everything except open files, since events may have been missed.
export function useLiveUpdates(notesRepo: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!notesRepo) return; // wait for /api/me so the stream opens once
    // Adds Gantry's webhook to repos you administer; the server does real work at most every 6 hours.
    send("POST", "/api/webhooks/sync").catch(() => {});
    let src: EventSource;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let dropped = false;
    const open = () => {
      src = new EventSource("/api/events");
      src.onerror = () => {
        dropped = true;
        // A closed source never retries by itself (e.g. 401): check the session, then reopen.
        void recoverClosed(src, () => api("/api/me"), () => {
          if (!stopped) timer = setTimeout(open, 5000);
        });
      };
      src.onopen = () => {
        if (dropped) void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== "file" });
        dropped = false;
      };
      src.onmessage = (m) => {
        try {
          const match = affects(JSON.parse(m.data) as LiveEvent, notesRepo);
          void qc.invalidateQueries({ predicate: (q) => match(q.queryKey) });
        } catch {
          // a malformed event changes nothing
        }
      };
    };
    open();
    return () => {
      stopped = true;
      clearTimeout(timer);
      src.close();
    };
  }, [qc, notesRepo]);
}
