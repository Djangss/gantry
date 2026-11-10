# Proposal inbox — design spec

Date: 2026-11-10
Status: draft, awaiting review
Issue: #33

## 1. Purpose

My role is shifting from writing code to managing issues, architecture and docs,
while agents (Claude Code) write most of the code. Brainstorms happen in Claude Code.
Their outcomes should land in GitHub as proposals that I approve or reject from one
place in Gantry, so nothing an agent suggests becomes planned work or live docs
without my say.

- **User:** me only, as today.
- **Store:** GitHub only. No database, no new auth path.
- **Writer:** Claude Code, using my own `gh` token, so I am the author of every proposal.

### Success criteria

1. An issue created with `gh issue create --label proposed` appears in the Gantry
   inbox without a reload (with `WEBHOOK_SECRET` set; otherwise on reload).
2. Approving an issue adds it to the Projects v2 board I pick and removes it from the inbox.
3. If adding to the board fails, the issue keeps its label and stays in the inbox.
4. A doc PR labelled `proposed` shows its changed files as a diff in the drawer and
   merges (squash) from there. A refused merge shows GitHub's error message.
5. Rejecting closes an issue as "not planned" and a PR without merging.
6. The proposed issue's drawer lists the brainstorm note that produced it.

## 2. Non-goals (v1)

- Grouping the inbox by brainstorm session (the drawer's note link covers it).
- Bulk approve or reject.
- Editing proposal text in the inbox (the drawer and GitHub already allow it).
- Inline diff comments, or a diff library.
- Drawings as brainstorm output.
- A Gantry API or MCP server for agents. Agents write to GitHub only.

## 3. Flow

1. I brainstorm with Claude Code.
2. Claude Code writes the session to the notes repo as
   `brainstorms/YYYY-MM-DD-<slug>.md`.
3. Claude Code opens each outcome as a proposal:
   - an issue: `gh issue create --label proposed`, body ending with a link to the note;
   - a doc change: branch `docs/<slug>`, then `gh pr create --label proposed`.
4. Claude Code updates the note's `links:` with the real `owner/repo#n` refs.
5. Webhooks Gantry already registers fire `issues` / `pull_request` events; the inbox refetches.
6. I approve or reject in Gantry. Agents then work approved issues as usual.

## 4. Claude Code side: skill `gantry-propose`

Lives in `~/claude-config/skills/gantry-propose/SKILL.md`, outside this repo.
It needs no Gantry code.

- **Note format:** the frontmatter Gantry already parses (`internal/notes/parse.go`):

  ```markdown
  ---
  title: <session title>
  links: [owner/repo#12, owner/repo#13]
  ---
  ```

- **Order:** write the note, open issues and PRs, then rewrite `links:` with the
  real numbers (issue numbers exist only after creation).
- **Label:** `gh label create proposed --force` in each target repo before use.
- **Body footer:** `Brainstorm: <notes repo blob URL of the note>`.

## 5. Gantry backend

All routes sit under `/api`, behind the existing `Require` and `CSRF` middleware.

| Route | Behaviour |
|-------|-----------|
| `GET /api/inbox` | GitHub search `is:open label:proposed author:<login>`. Returns `[]Issue` (existing shape; `IsPR` distinguishes PRs). |
| `POST /api/repos/{owner}/{repo}/issues/{n}/approve` | Body `{projectId?}`. Issue: if `projectId`, `addProjectV2ItemById` first, then remove label `proposed`. PR: squash-merge. |
| `POST /api/repos/{owner}/{repo}/issues/{n}/reject` | Issue: close with `state_reason: not_planned`. PR: close. |
| `GET /api/repos/{owner}/{repo}/pulls/{n}/files` | `[{filename, status, patch}]`. |

- **Approve order** keeps failures retryable: the board add is idempotent and runs
  before the label removal, so a failure leaves the item in the inbox.
- **Errors** map through the existing `errors.go`; a 405/409 on merge returns
  GitHub's message to the UI.
- **Rate limit:** search has its own limit (30/min). The ETag transport keeps
  repeated inbox loads cheap; the inbox does not poll.
- New `gh` client methods sit next to the existing ones in `internal/gh/`.

## 6. Gantry frontend

- **Live updates:** `affects` in `web/src/lib/events.ts` also matches the `inbox`
  query key for issue and PR events.
- **Inbox view:** new route and nav entry with an open-count badge. A list of cards
  built from `Badge` and `LabelChip`. Clicking a card opens `ItemDrawer`.
- **`ItemDrawer`:** when the item has label `proposed`, show **Approve** and
  **Reject**. For issues, Approve offers a project picker fed by `GET /api/projects`;
  the last choice is remembered in localStorage (wrapped in try/catch).
- **PR drawer:** a **Changes** section rendering each file's `patch` in a `<pre>`,
  added lines and removed lines coloured with the existing theme tokens.
- Both light and dark themes, desktop and phone, as per `docs/design.md`.

## 7. Testing

- **Go:** handler tests against a fake GitHub, following `internal/api/server_test.go`:
  - approve calls the board add before the label removal, and skips the removal when the add fails;
  - reject sends `state_reason: not_planned` for issues;
  - a merge error reaches the client with GitHub's message;
  - the inbox search query contains `label:proposed`, `is:open` and the login.
- **Playwright:** an inbox flow with `mockApi` (list, approve, the item disappears),
  and inbox plus diff screenshots added to `screens`.
