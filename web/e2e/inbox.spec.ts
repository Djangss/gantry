import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("approve a proposed issue onto a board", async ({ page }) => {
  const m = await mockApi(page);
  await page.goto("/inbox");
  await expect(page.getByRole("link", { name: /Inbox/ })).toContainText("2");
  await page.getByRole("button", { name: /Add keyboard shortcuts/ }).click();
  await page.getByRole("combobox").selectOption("P1");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect.poll(() => m.approved()).toEqual({ projectId: "P1" });
  // the open drawer is modal and hides the list, so close it before asserting on rows
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Add keyboard shortcuts/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /docs: describe the proposal inbox/ })).toBeVisible();
});

test("a doc PR shows its diff and a refused merge shows GitHub's reason", async ({ page }) => {
  await mockApi(page);
  await page.goto("/inbox?item=Djangss%2Fgantry%2342");
  await expect(page.getByText("+Inbox section")).toBeVisible();
  await expect(page.getByText("No text diff (binary or too large).")).toBeVisible();
  await page.getByRole("button", { name: "Approve and merge" }).click();
  await expect(page.getByText("Head branch was modified")).toBeVisible();
});
