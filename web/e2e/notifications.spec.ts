import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("marking a notification read lowers the unread count", async ({ page }) => {
  await mockApi(page);
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("2 unread notifications")).toBeVisible();
  await nav.getByRole("button", { name: /Mark "Release 1.0 notes" as read/ }).click();
  await expect(nav.getByText("1 unread notifications")).toBeVisible();
  await expect(nav.getByText("Release 1.0 notes")).toHaveCount(0);
});

test("a notification on a PR opens the drawer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/projects/P1");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: /Review the kanban board/ }).click();
  await expect(page).toHaveURL(/\/inbox\?item=Djangss%2Fgantry%237/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("a token without the scope shows a sign-in link and keeps the session", async ({ page }) => {
  await mockApi(page);
  await page.route("**/api/notifications", (r) =>
    r.fulfill({ status: 403, json: { error: "Sign in again to grant the notifications scope", code: "missing_scope" } }));
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("Sign in again to see notifications.")).toBeVisible();
  await expect(nav.getByRole("link", { name: "Sign in", exact: true })).toHaveAttribute("href", "/auth/login");
  await expect(nav.getByRole("link", { name: /Inbox/ })).toBeVisible();
});
