import { expect, test, vi } from "vitest";
import { subscribeDark } from "./theme";

test("subscribeDark fires when the dark class flips, and stops after unsubscribe", async () => {
  const cb = vi.fn();
  const off = subscribeDark(cb);
  document.documentElement.classList.toggle("dark", true);
  await Promise.resolve();
  expect(cb).toHaveBeenCalledTimes(1);
  off();
  document.documentElement.classList.toggle("dark", false);
  await Promise.resolve();
  expect(cb).toHaveBeenCalledTimes(1);
});
