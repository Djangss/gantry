import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("create an issue from the repo view", async ({ page }) => {
  const m = await mockApi(page);
  await page.goto("/repos/Djangss/gantry");
  await page.getByRole("button", { name: "New issue" }).click();
  await page.getByLabel("Title").fill("Add search");
  await page.getByLabel("ui").check();
  await page.getByRole("button", { name: "Create issue" }).click();
  await expect.poll(() => m.actions().created).toEqual({ title: "Add search", body: "", labels: ["ui"] });
});

test("close, relabel and assign from the drawer", async ({ page }) => {
  const m = await mockApi(page);
  await page.goto("/repos/Djangss/gantry?item=Djangss%2Fgantry%239");
  await page.getByRole("button", { name: "Close as not planned" }).click();
  await expect.poll(() => m.actions().updates).toContainEqual({ state: "closed", reason: "not_planned" });
  await page.getByRole("group", { name: "Labels" }).getByLabel("docs").click();
  await expect.poll(() => m.actions().updates).toContainEqual({ labels: ["ui", "docs"] });
  await page.getByRole("group", { name: "Assignees" }).getByLabel("bob").click();
  await expect.poll(() => m.actions().updates).toContainEqual({ assignees: ["bob"] });
});

test("convert a draft card to an issue", async ({ page }) => {
  const m = await mockApi(page);
  await page.goto("/projects/P1");
  await page.getByRole("button", { name: "Convert to issue" }).click();
  await page.getByLabel("Repository").selectOption("Djangss/gantry");
  await page.getByRole("button", { name: "Convert", exact: true }).click();
  await expect.poll(() => m.actions().converted).toEqual({ repo: "Djangss/gantry" });
});
