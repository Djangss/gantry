import { expect, test } from "vitest";
import { parseRef } from "./ref";

test("parseRef", () => {
  expect(parseRef("Djangss/cap#3")).toEqual({ owner: "Djangss", repo: "cap", number: 3 });
  expect(parseRef(" a.b/c-d#10 ")).toEqual({ owner: "a.b", repo: "c-d", number: 10 });
  expect(parseRef("cap#3")).toBeNull();
  expect(parseRef("o/r#x")).toBeNull();
});
