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

test("more than five unread link to GitHub", async ({ page }) => {
  await mockApi(page);
  const many = Array.from({ length: 7 }, (_, i) => ({ id: `${200 + i}`, unread: true, reason: "mention", title: `Thread ${i}`, type: "Issue", repo: "o/r", ref: "", updatedAt: "2026-11-10T12:00:00Z" }));
  await page.route("**/api/notifications", (r) => r.fulfill({ json: many }));
  await page.goto("/inbox");
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "+2 more on GitHub" })).toHaveAttribute("href", "https://github.com/notifications");
});
