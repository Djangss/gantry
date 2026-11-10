import { test } from "@playwright/test";
import { mockApi } from "./mocks";

const views = {
  login: "/login",
  board: "/projects/P1",
  drawer: "/projects/P1?item=Djangss%2Fgantry%237",
  notes: "/files/Djangss/notes?path=notes%2Fboard-ux-ideas.md",
  repo: "/repos/Djangss/gantry",
};

for (const width of [1440, 390]) {
  for (const scheme of ["light", "dark"] as const) {
    for (const [name, url] of Object.entries(views)) {
      test(`${name} ${width} ${scheme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width > 800 ? 900 : 844 });
        await page.emulateMedia({ colorScheme: scheme });
        await mockApi(page);
        await page.goto(url);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: `screenshots/${name}-${width}-${scheme}.png` });
      });
    }
  }
}
