import { expect, test } from "@playwright/test";
import { mockApi } from "./mocks";

test("board loads and dragging a card sends PATCH", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/projects/P1");
  const card = page.getByRole("button", { name: "Move Write spec" });
  await expect(card).toBeVisible();
  const done = page.getByRole("region", { name: "Done" });
  const a = (await card.boundingBox())!;
  const b = (await done.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + 40, { steps: 10 });
  await page.mouse.up();
  await expect.poll(api.patched).toEqual({ fieldId: "F1", optionId: "O3" });
  await expect(done.getByRole("button", { name: "Write spec", exact: true })).toBeVisible();
});

test("the grip moves a card with the keyboard and the card itself is not a button", async ({ page }) => {
  const api = await mockApi(page);
  await page.goto("/projects/P1");
  await expect(page.locator("article", { hasText: "Write spec" })).not.toHaveAttribute("role", "button");
  await page.getByRole("button", { name: "Move Write spec" }).focus();
  await page.keyboard.press("Space");
  // the keyboard sensor moves 25px per press; ~330px reaches the next column's rect
  for (let i = 0; i < 14; i++) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await expect.poll(api.patched).toEqual({ fieldId: "F1", optionId: "O2" });
});
