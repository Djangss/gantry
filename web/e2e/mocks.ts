import type { Page } from "@playwright/test";

export const board = {
  title: "Gantry v1",
  fieldId: "F1",
  options: [{ id: "O1", name: "Todo" }, { id: "O2", name: "In progress" }, { id: "O3", name: "Done" }],
  items: [
    { id: "I1", optionId: "O1", kind: "Issue", title: "Write spec", number: 3, repo: "Djangss/gantry", url: "https://github.com/Djangss/gantry/issues/3", state: "OPEN", labels: [{ name: "docs", color: "0075ca" }] },
    { id: "I2", optionId: "O2", kind: "PullRequest", title: "Kanban board", number: 7, repo: "Djangss/gantry", url: "https://github.com/Djangss/gantry/pull/7", state: "OPEN", labels: [{ name: "ui", color: "a2eeef" }] },
    { id: "I3", optionId: "O3", kind: "Issue", title: "OAuth sign-in", number: 2, repo: "Djangss/gantry", url: "https://github.com/Djangss/gantry/issues/2", state: "CLOSED", labels: [] },
    { id: "I4", optionId: "O1", kind: "DraftIssue", title: "Command palette idea", labels: [] },
  ],
};

const issue = {
  number: 7, title: "Kanban board", state: "open", user: "Djangss", url: "https://github.com/Djangss/gantry/pull/7",
  body: "Drag cards between Status columns.\n\n- [x] columns\n- [ ] rollback toast",
  labels: [{ name: "ui", color: "a2eeef" }], assignees: [],
  comments: [{ id: 1, user: "Djangss", body: "Works on mobile too.", createdAt: "2026-11-09T10:00:00Z" }],
  pr: { merged: false, draft: false, reviews: [{ user: "reviewer", state: "APPROVED" }], checks: [{ name: "ci", status: "completed", conclusion: "success" }] },
};

const note = "---\ntitle: Board UX ideas\nlinks: [Djangss/gantry#7]\n---\n\n# Board UX ideas\n\n- Compact cards\n- Keyboard moves\n";

const repoIssues = [
  { number: 9, title: "Search across notes", state: "open", url: "https://github.com/Djangss/gantry/issues/9", user: "Djangss", labels: [{ name: "idea", color: "a2eeef" }], isPR: false, isDraft: false, comments: 1, updatedAt: "2026-11-10T09:00:00Z" },
  { number: 7, title: "Kanban board", state: "open", url: "https://github.com/Djangss/gantry/issues/7", user: "Djangss", labels: [], isPR: false, isDraft: false, comments: 0, updatedAt: "2026-11-09T09:00:00Z" },
];
const repoPRs = [
  { number: 15, title: "Fix v1 deferred minors", state: "open", url: "https://github.com/Djangss/gantry/pull/15", user: "Djangss", labels: [], isPR: true, isDraft: true, comments: 0, updatedAt: "2026-11-10T11:00:00Z" },
];

const proposedIssue = {
  number: 41, title: "Add keyboard shortcuts to the board", state: "open", user: "Djangss", url: "https://github.com/Djangss/gantry/issues/41",
  body: "From the brainstorm on board UX.", labels: [{ name: "proposed", color: "fbca04" }], assignees: [], comments: [], pr: null,
};
const proposedPR = {
  number: 42, title: "docs: describe the proposal inbox", state: "open", user: "Djangss", url: "https://github.com/Djangss/gantry/pull/42",
  body: "Updates docs/design.md.", labels: [{ name: "proposed", color: "fbca04" }], assignees: [], comments: [],
  pr: { merged: false, draft: false, reviews: [], checks: [] },
};
const inboxRow = (i: typeof proposedIssue | typeof proposedPR, isPR: boolean) => ({
  number: i.number, repo: "Djangss/gantry", title: i.title, state: "open", url: i.url, user: "Djangss", labels: i.labels,
  isPR, isDraft: false, comments: 0, updatedAt: "2026-11-10T12:00:00Z",
});

const notifications = [
  { id: "101", unread: true, reason: "review_requested", title: "Review the kanban board", type: "PullRequest", repo: "Djangss/gantry", ref: "Djangss/gantry#7", updatedAt: "2026-11-10T12:00:00Z" },
  { id: "102", unread: true, reason: "mention", title: "Release 1.0 notes", type: "Release", repo: "acme/api", ref: "", updatedAt: "2026-11-10T11:00:00Z" },
];

export async function mockApi(page: Page) {
  const readIds: string[] = [];
  let patched: unknown = null;
  let commented: unknown = null;
  let watched: { content: string } | null = null;
  let approved: unknown = null;
  const actions: { created: unknown; updates: unknown[]; converted: unknown } = { created: null, updates: [], converted: null };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (p === "/api/me") return json({ login: "Djangss", notesRepo: "Djangss/notes" });
    if (p === "/api/projects") return json([{ id: "P1", title: "Gantry v1", number: 1, closed: false }]);
    if (p === "/api/repos") return json([{ fullName: "Djangss/gantry", private: false }, { fullName: "Djangss/cap", private: false }, { fullName: "acme/api", private: true }]);
    if (p === "/api/repos/contributed") return json([{ fullName: "golang/go", private: false }]);
    if (p === "/api/repos/Djangss/notes/contents/gantry.json") {
      if (req.method() === "PUT") {
        watched = req.postDataJSON();
        return json({ sha: "w2" });
      }
      return watched ? json({ content: watched.content, sha: "w2" }) : json({ error: "not found", code: "not_found" }, 404);
    }
    if (p === "/api/repos/Djangss/gantry/issues" && req.method() === "GET") {
      const kind = new URL(req.url()).searchParams.get("kind");
      return json(kind === "pr" ? repoPRs : repoIssues);
    }
    if (p === "/api/repos/rust-lang/rust/issues") return json([]);
    if (p === "/api/repos/nobody/nothing/issues") return json({ error: "Not Found", code: "not_found" }, 404);
    if (p === "/api/projects/P1/items") return json(board);
    if (p === "/api/projects/P1/items/I1" && req.method() === "PATCH") {
      patched = req.postDataJSON();
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/repos/Djangss/gantry/issues/7/comments" && req.method() === "POST") {
      commented = req.postDataJSON();
      return json({ id: 2, user: "Djangss", body: "x", createdAt: "2026-11-10T10:00:00Z" }, 201);
    }
    if (p === "/api/notifications") return json(notifications.map((n) => ({ ...n, unread: !readIds.includes(n.id) })));
    if (p.startsWith("/api/notifications/threads/") && req.method() === "PATCH") {
      readIds.push(p.split("/").pop()!);
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/repos/Djangss/gantry/labels") return json([{ name: "ui", color: "a2eeef" }, { name: "docs", color: "0075ca" }]);
    if (p === "/api/repos/Djangss/gantry/assignees") return json(["Djangss", "bob"]);
    if (p === "/api/repos/Djangss/gantry/issues" && req.method() === "POST") {
      actions.created = req.postDataJSON();
      return json({ number: 9, url: "https://github.com/Djangss/gantry/issues/9" }, 201);
    }
    if (p === "/api/repos/Djangss/gantry/issues/9") {
      if (req.method() === "PATCH") {
        actions.updates.push(req.postDataJSON());
        return route.fulfill({ status: 204 });
      }
      return json({ ...issue, number: 9, title: "Search across notes", pr: null, labels: [{ name: "ui", color: "a2eeef" }] });
    }
    if (p === "/api/projects/P1/items/I4/convert") {
      actions.converted = req.postDataJSON();
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/inbox") return json(approved ? [inboxRow(proposedPR, true)] : [inboxRow(proposedIssue, false), inboxRow(proposedPR, true)]);
    if (p === "/api/repos/Djangss/gantry/issues/41/approve" && req.method() === "POST") {
      approved = req.postDataJSON();
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/repos/Djangss/gantry/issues/42/approve" && req.method() === "POST")
      return json({ error: "Head branch was modified. Review and try the merge again.", code: "bad_request" }, 422);
    if (p === "/api/repos/Djangss/gantry/issues/41") return json(approved ? { ...proposedIssue, labels: [] } : proposedIssue);
    if (p === "/api/repos/Djangss/gantry/issues/42") return json(proposedPR);
    if (p === "/api/repos/Djangss/gantry/pulls/42/files")
      return json([
        { filename: "docs/design.md", status: "modified", patch: "@@ -1,2 +1,3 @@\n # Design\n-Old line\n+New line\n+Inbox section" },
        { filename: "docs/inbox.png", status: "added", patch: "" },
      ]);
    if (p === "/api/repos/Djangss/gantry/issues/7") return json(issue);
    if (p === "/api/links") return json([{ path: "notes/board-ux-ideas.md", title: "Board UX ideas", kind: "note" }]);
    if (p === "/api/repos/Djangss/notes/tree") return json([{ path: "notes/board-ux-ideas.md", type: "blob" }, { path: "drawings/architecture.excalidraw", type: "blob" }]);
    if (p === "/api/repos/Djangss/notes/contents/notes/board-ux-ideas.md") return json({ content: note, sha: "s1" });
    return json({ error: "not mocked: " + p, code: "not_found" }, 404);
  });
  return { patched: () => patched, commented: () => commented, watched: () => watched, approved: () => approved, actions: () => actions };
}
