# Gantry — design spec

Date: 2026-11-09
Status: draft, awaiting review

## 1. Purpose

Gantry is a personal project hub: one place to plan work across my GitHub repos.
It shows GitHub Projects v2 boards as a kanban, opens issues and PRs in place,
browses and edits each repo's `docs/` folder, and holds my personal notes and
Excalidraw drawings linked to issues.

- **User:** me only (single GitHub login allowlisted).
- **Hosting:** my Hetzner VPS, behind Caddy, monitored by Uptime Kuma.
- **Secondary goal:** learning and portfolio showcase. Code quality, README and
  architecture matter as much as features.

### Success criteria

1. Log in with GitHub; any other account gets 403.
2. Open a Projects v2 board, drag a card to another column, and see the status
   change on github.com.
3. Open an issue or PR from a card: body, comments, labels, PR review/check state;
   post a comment.
4. Browse a repo's `docs/`, edit a Markdown file, save it as a commit.
5. Create a note or Excalidraw drawing in the notes repo, link it to an issue,
   and see it listed in that issue's drawer.
6. A save that conflicts with a change made elsewhere never silently loses either version.

## 2. Non-goals (v1)

WYSIWYG / Notion-style blocks, search, command palette, creating issues or
projects from the app, webhooks, multi-user, public demo mode, separate image
storage for drawings.

## 3. Architecture

- One Go binary (`cmd/server`). It serves `/api/*`, `/auth/*`, `/healthz`, and
  the built React SPA embedded with `go:embed`.
- The browser never sees the GitHub token. The SPA only calls Gantry's API;
  Go calls GitHub.
- No database. GitHub is the only store:
  - board data: Projects v2 (GraphQL);
  - issues/PRs: REST;
  - repo docs: `docs/` in each repo (contents API);
  - notes and drawings: one private repo, `NOTES_REPO`.
- Stack: Go stdlib only — `net/http` ServeMux patterns, direct REST and GraphQL
  calls (about 10 endpoints, which doesn't justify two SDKs), AES-GCM cookie
  sealing, `log/slog`. (Revised 2026-11-09: Gin, go-github, githubv4 and
  securecookie dropped.) Frontend: React + Vite + TypeScript, Tailwind CSS v4,
  shadcn/ui (Radix), TanStack Query, React Router, `dnd-kit`, CodeMirror 6,
  `react-markdown`, `@excalidraw/excalidraw`, sonner.
- UI tooling: frontend-design skill for direction (`docs/design.md`), shadcn
  MCP, Impeccable audits, Vercel Web Interface Guidelines, Playwright
  screenshots. Accessibility work is out of scope for v1.

## 4. Auth and sessions

- GitHub OAuth App, scopes `repo` and `project`.
- Routes: `GET /auth/login` (redirect with `state`), `GET /auth/callback`,
  `POST /auth/logout`.
- On callback, Go exchanges the code, fetches the user, and rejects with 403
  unless `login == ALLOWED_LOGIN`.
- The token is stored in an encrypted cookie (`securecookie`, key from
  `COOKIE_KEY`): `HttpOnly`, `Secure`, `SameSite=Lax`. No server-side session
  state; restarts do not log me out.
- `state` is a random value in a short-lived cookie, checked on callback.
- Mutating requests (`POST`, `PATCH`, `PUT`) require the header
  `X-Requested-With: gantry`. Cross-site forms cannot set it, and that is the CSRF guard.

## 5. Configuration (env)

| Var | Example | Purpose |
|-----|---------|---------|
| `GITHUB_CLIENT_ID` | — | OAuth App |
| `GITHUB_CLIENT_SECRET` | — | OAuth App |
| `COOKIE_KEY` | 32+ random bytes, base64 | cookie encryption + HMAC |
| `ALLOWED_LOGIN` | `Djangss` | allowlisted GitHub login |
| `NOTES_REPO` | `Djangss/notes` | private notes repo |
| `BASE_URL` | `https://gantry.<domain>` | OAuth callback + cookie domain |
| `PORT` | `8080` | listen port |

The server refuses to start if any required var is missing.

## 6. Backend components

- `internal/auth` — OAuth flow, cookie session, allowlist, auth middleware,
  CSRF header check.
- `internal/gh` — thin `net/http` client for REST and GraphQL, with the ETag
  cache. The board response includes the Status field ID, so the SPA sends it
  back on moves and the server keeps no per-project state.
- `internal/notes` — in-memory links index (issue ref → note paths).
- `internal/api` — Gin handlers and the error mapping.

### Endpoints

| Method | Path | Does |
|--------|------|------|
| GET | `/api/me` | `{login, notesRepo}` |
| GET | `/api/repos` | my repos (sidebar docs list) |
| GET | `/api/projects` | my Projects v2 boards |
| GET | `/api/projects/{id}/items` | cards + Status field ID and its options |
| PATCH | `/api/projects/{id}/items/{itemId}` | body `{fieldId, optionId}`; moves a card |
| GET | `/api/repos/{owner}/{repo}/issues/{n}` | issue or PR + comments; PRs add review state and checks |
| POST | `/api/repos/{owner}/{repo}/issues/{n}/comments` | body `{body}` |
| GET | `/api/repos/{owner}/{repo}/tree?path=docs` | file tree under a path |
| GET | `/api/repos/{owner}/{repo}/contents/{path}` | `{content, sha}` |
| PUT | `/api/repos/{owner}/{repo}/contents/{path}` | body `{content, sha?, message}`; omit `sha` to create |
| GET | `/api/links?ref={owner}/{repo}#{n}` | notes and drawings linked to an issue |
| POST | `/api/links/rescan` | rebuild links index from `NOTES_REPO` |
| GET | `/healthz` | `200 ok`, no GitHub call |

Notes use the same tree/contents endpoints with `NOTES_REPO` as owner/repo.

### ETag cache

- In-memory map: request key → `{etag, body}`.
- GET calls to GitHub send `If-None-Match`; a `304` reuses the cached body
  (304s do not count against the rate limit).
- Writes invalidate the matching keys.
- `shortcut:` an unbounded map. Fine for one user; add an LRU bound if memory grows.

## 7. Frontend

- **Layout:** sidebar (projects, repos with `docs/`, notes) + main view.
- **Board view:** columns from the project's Status options; cards draggable
  with `dnd-kit`. A drop updates the board at once and calls `PATCH`. On
  failure it rolls back and shows a toast. Draft items render read-only.
- **Item drawer:** opens over the board. Shows title, state, labels, body,
  comments, a comment box, PR review/check state, and linked notes (`/api/links`).
- **Docs / Notes view:** file tree + editor.
  - `.md`: CodeMirror 6 with side-by-side `react-markdown` preview.
  - `.excalidraw`: `@excalidraw/excalidraw` editor.
  - "New note" / "New drawing" create files under `notes/` or `drawings/` in
    `NOTES_REPO`.
- Data fetching via TanStack Query with refetch on window focus.
- Every request sends `X-Requested-With: gantry`.

## 8. Data formats

Note — `notes/<slug>.md`:

```markdown
---
title: Cap phase 3 ideas
links: [Djangss/cap#3, Djangss/cap#7]
---

Body in Markdown.
```

Drawing — `drawings/<slug>.excalidraw`: standard Excalidraw JSON plus a
top-level `"links": ["Djangss/cap#3"]` array, which Excalidraw ignores.

Link refs use the form `owner/repo#number`.

## 9. Data flows

### Card move

1. Drop card in a column; the SPA updates the board at once.
2. `PATCH /api/projects/{id}/items/{itemId} {status}`.
3. Go runs `updateProjectV2ItemFieldValue` with the cached Status field ID and
   option ID.
4. On error the SPA rolls back and shows a toast.

### Links index

1. On the first links lookup (a token only exists once someone signs in), Go
   lists `notes/` and `drawings/` in `NOTES_REPO`, fetches each file (through
   the ETag cache, 8 at a time), and parses `links`.
2. A save through Gantry updates the index for that file.
3. `shortcut:` a full scan on startup. Fine up to a few hundred files. Switch to
   a committed `index.json` if startup gets slow.
4. Files changed outside Gantry are picked up on the next restart or via
   `POST /api/links/rescan` (button in the notes view).

### Save

1. Open file: `GET contents` returns `{content, sha}`.
2. While editing, the SPA writes a draft to `localStorage` every few seconds,
   keyed by `owner/repo/path`.
3. `Ctrl+S` / Save: `PUT contents {content, sha, message}`. Default message:
   `docs: update <path>` or `notes: update <path>`.
4. Success: the new `sha` is stored and the draft is cleared.
5. `409` (file changed elsewhere): a dialog offers **Reload theirs** (the draft stays
   in `localStorage`) or **Overwrite with mine** (re-fetch `sha`, then `PUT`).
6. No autosave commits.

### Large files

The contents API returns inline content only up to 1 MB. For larger files
Go fetches with the raw media type (up to 100 MB). Drawing images stay embedded
in the `.excalidraw` JSON in v1.

## 10. Error handling

All API errors return `{error, code}`.

| GitHub / cause | Gantry response | SPA behavior |
|----------------|-----------------|--------------|
| 401 (token revoked) | 401, cookie cleared | redirect to login |
| 403/429 rate limit | 429 with `reset` time | "retry at HH:MM" |
| 403 other | 403 | message |
| 404 | 404 | "not found" view |
| 409 on PUT | 409 | conflict dialog |
| 5xx / network | 502 | retry button |

- Each view has its own React error boundary.
- `slog` JSON to stdout (read in Dozzle). Tokens and cookie values are never logged.

## 11. Testing

- **Go:** handlers tested against a fake GitHub (`httptest.Server`):
  allowlist reject, missing CSRF header reject, ETag 304 reuse, 409 pass-through,
  Status mutation payload, links frontmatter parse, `.excalidraw` links parse.
- **Frontend (Vitest):** frontmatter parse, optimistic move rollback, draft
  save/restore.
- **E2E (Playwright, one smoke test):** stubbed login, board loads, card drag
  sends `PATCH`.
- CI never calls real GitHub.

## 12. Repo layout

```
cmd/server/          main.go
internal/auth/
internal/gh/
internal/notes/
internal/api/
web/                 Vite React app (built to web/dist, embedded)
docs/                project docs (viewable in Gantry itself)
Dockerfile           node build → go build → distroless
compose.yaml
.github/workflows/
```

## 13. CI and deploy

- GitHub Actions on PR: `go vet`, `go test ./...`, `npm ci`, `npm test`,
  `tsc --noEmit`, Docker build.
- On tag `v*`: push image to `ghcr.io/djangss/gantry`.
- VPS: `docker compose` service pulling the GHCR image; env in a `.env` file not
  in git. Caddy site block `gantry.<domain>` with automatic TLS. Kuma HTTP monitor on `/healthz`.
- OAuth App callback: `https://gantry.<domain>/auth/callback`.

## 14. Portfolio

README with a pitch, screenshots, a GIF of a card drag, the architecture diagram,
and "run locally" steps (a dev OAuth App with callback `http://localhost:8080/auth/callback`).

## 15. Decisions

- Domain: `gantry.mijotez.me`. The container joins Docker network
  `norish_default`, and the existing Caddy proxies `gantry:8080`.
- Notes repo: `Djangss/notes`, private.
- The card-drag GIF is optional and recorded by hand. README screenshots come
  from the Playwright screenshot harness.
