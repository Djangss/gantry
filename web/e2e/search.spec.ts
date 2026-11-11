import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("Ctrl+K searches and opens a note", async ({ page }) => {
  await mockApi(page);
  await page.goto("/inbox");
  await page.keyboard.press("Control+k");
  await page.getByRole("searchbox", { name: "Search" }).fill("kanban");
  await expect(page.getByRole("region", { name: "Notes" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Issues and PRs" })).toBeVisible();
  await page.getByRole("button", { name: /Board UX ideas/ }).click();
  await expect(page).toHaveURL(/\/files\/Djangss\/notes\?path=notes%2Fboard-ux-ideas\.md/);
});

test("an issue result opens the drawer from the mobile trigger", async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/inbox");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("searchbox", { name: "Search" }).fill("kanban");
  await page.getByRole("button", { name: /Kanban board/ }).click();
  await expect(page).toHaveURL(/\/repos\/Djangss\/gantry\?item=/);
  await expect(page.getByText("Drag cards between Status columns.")).toBeVisible();
});
