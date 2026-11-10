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
  labels: [{ name: "ui", color: "a2eeef" }],
  comments: [{ id: 1, user: "Djangss", body: "Works on mobile too.", createdAt: "2026-11-09T10:00:00Z" }],
  pr: { merged: false, draft: false, reviews: [{ user: "reviewer", state: "APPROVED" }], checks: [{ name: "ci", status: "completed", conclusion: "success" }] },
};

const note = "---\ntitle: Board UX ideas\nlinks: [Djangss/gantry#7]\n---\n\n# Board UX ideas\n\n- Compact cards\n- Keyboard moves\n";

export async function mockApi(page: Page) {
  let patched: unknown = null;
  let commented: unknown = null;
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, json: body });
    if (p === "/api/me") return json({ login: "Djangss", notesRepo: "Djangss/notes" });
    if (p === "/api/projects") return json([{ id: "P1", title: "Gantry v1", number: 1, closed: false }]);
    if (p === "/api/repos") return json([{ fullName: "Djangss/gantry", private: false }, { fullName: "Djangss/cap", private: false }]);
    if (p === "/api/projects/P1/items") return json(board);
    if (p === "/api/projects/P1/items/I1" && req.method() === "PATCH") {
      patched = req.postDataJSON();
      return route.fulfill({ status: 204 });
    }
    if (p === "/api/repos/Djangss/gantry/issues/7/comments" && req.method() === "POST") {
      commented = req.postDataJSON();
      return json({ id: 2, user: "Djangss", body: "x", createdAt: "2026-11-10T10:00:00Z" }, 201);
    }
    if (p === "/api/repos/Djangss/gantry/issues/7") return json(issue);
    if (p === "/api/links") return json([{ path: "notes/board-ux-ideas.md", title: "Board UX ideas", kind: "note" }]);
    if (p === "/api/repos/Djangss/notes/tree") return json([{ path: "notes/board-ux-ideas.md", type: "blob" }, { path: "drawings/architecture.excalidraw", type: "blob" }]);
    if (p === "/api/repos/Djangss/notes/contents/notes/board-ux-ideas.md") return json({ content: note, sha: "s1" });
    return json({ error: "not mocked: " + p, code: "not_found" }, 404);
  });
  return { patched: () => patched, commented: () => commented };
}
