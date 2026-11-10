import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

const notePage = "/files/Djangss/notes?path=notes%2Fboard-ux-ideas.md";

test("leaving a file with unsaved edits asks first", async ({ page }) => {
  await mockApi(page);
  await page.goto(notePage);
  await page.locator(".cm-content").click();
  await page.keyboard.type("more ideas");
  await page.getByRole("link", { name: "Gantry v1" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Leave without saving?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/board-ux-ideas/);
  await page.getByRole("link", { name: "Gantry v1" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/projects\/P1/);
});

test("a clean file leaves without asking", async ({ page }) => {
  await mockApi(page);
  await page.goto(notePage);
  await expect(page.locator(".cm-content")).toContainText("Compact cards");
  await page.getByRole("link", { name: "Gantry v1" }).first().click();
  await expect(page).toHaveURL(/\/projects\/P1/);
});

test("the file list filters as you type", async ({ page }) => {
  await mockApi(page);
  await page.goto("/files/Djangss/notes");
  const files = page.getByRole("complementary", { name: "Files" });
  await expect(files.getByRole("button", { name: "notes/board-ux-ideas.md" })).toBeVisible();
  await page.getByRole("searchbox", { name: "Filter files" }).fill("ARCH");
  await expect(files.getByRole("button", { name: "drawings/architecture.excalidraw" })).toBeVisible();
  await expect(files.getByRole("button", { name: "notes/board-ux-ideas.md" })).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Filter files" }).fill("zzz");
  await expect(files).toContainText('No files match "zzz".');
});

test("Ctrl+Enter posts a comment", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/projects/P1");
  await page.getByRole("button", { name: "Kanban board", exact: true }).click();
  const box = page.getByPlaceholder("Add a comment");
  await box.fill("Looks good");
  await box.press("Control+Enter");
  await expect.poll(api.commented).toEqual({ body: "Looks good" });
});

test("narrow screens toggle between editor and preview", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page);
  await page.goto(notePage);
  const preview = page.getByRole("article");
  await expect(page.locator(".cm-content")).toBeVisible();
  await expect(preview).toBeHidden();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(preview.getByRole("listitem").first()).toHaveText("Compact cards");
  await expect(page.locator(".cm-content")).toBeHidden();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("a failed sidebar list can be retried", async ({ page }) => {
  await mockApi(page);
  let calls = 0;
  await page.route("**/api/repos", (route) =>
    ++calls === 1
      ? route.fulfill({ status: 403, json: { error: "GitHub refused the request", code: "forbidden" } })
      : route.fulfill({ json: [{ fullName: "Djangss/gantry", private: false }] }),
  );
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toContainText("GitHub refused the request");
  await nav.getByRole("button", { name: "Retry" }).click();
  await expect(nav.getByRole("link", { name: "Djangss/gantry" })).toBeVisible();
});

test("a repo page lists issues and PRs and opens the drawer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("Shared with you")).toBeVisible();
  await expect(nav.getByRole("link", { name: "golang/go" })).toBeVisible();
  await nav.getByRole("link", { name: "Djangss/gantry" }).click();
  await expect(page.getByRole("button", { name: /Search across notes/ })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search issues" }).fill("kanban");
  await expect(page.getByRole("button", { name: /Search across notes/ })).toHaveCount(0);
  await page.getByRole("button", { name: /Kanban board/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Drag cards between Status columns.");
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox", { name: "Search issues" }).fill("");
  await page.getByRole("button", { name: "Pull requests" }).click();
  await expect(page.getByRole("button", { name: /Fix v1 deferred minors/ })).toContainText("Draft");
});

test("any repo can be opened by name and watched", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/");
  const box = page.getByRole("searchbox", { name: "Filter repos or open owner/repo" });
  await box.fill("https://github.com/rust-lang/rust");
  await box.press("Enter");
  await expect(page).toHaveURL(/\/repos\/rust-lang\/rust/);
  await expect(page.getByText("No open issues.")).toBeVisible();
  await page.getByRole("button", { name: "Watch" }).click();
  await expect.poll(() => JSON.parse(api.watched()?.content ?? "{}").repos).toEqual(["rust-lang/rust"]);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "rust-lang/rust" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Stop watching" })).toBeVisible();
});

test("an unknown repo shows the error and no Watch button", async ({ page }) => {
  await mockApi(page);
  await page.goto("/repos/nobody/nothing");
  await expect(page.getByText("Not Found")).toBeVisible();
  await expect(page.getByRole("button", { name: "Watch" })).toHaveCount(0);
});
