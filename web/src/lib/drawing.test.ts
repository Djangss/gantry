import { expect, test } from "vitest";
import { emptyDrawing, parseDrawing, withLinks } from "./drawing";

test("parseDrawing refuses invalid JSON instead of returning an empty canvas", () => {
  expect(parseDrawing("not json")).toBeNull();
  expect(parseDrawing("")).toBeNull();
  expect(parseDrawing("[1,2]")).toBeNull();
});

test("parseDrawing defaults missing links and elements", () => {
  expect(parseDrawing('{"type":"excalidraw"}')).toMatchObject({ elements: [], links: [] });
});

test("withLinks sets links and keeps elements", () => {
  const out = JSON.parse(withLinks('{"elements":[{"id":"a"}],"links":["x/y#1"]}', ["o/r#2"]));
  expect(out).toEqual({ elements: [{ id: "a" }], links: ["o/r#2"] });
});

test("emptyDrawing round-trips", () => {
  expect(parseDrawing(emptyDrawing(["o/r#1"]))).toMatchObject({ elements: [], links: ["o/r#1"] });
});
