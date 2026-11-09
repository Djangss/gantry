import { expect, test } from "vitest";
import { drawingMountKey, emptyDrawing, parseDrawing, sceneEdit, withLinks } from "./drawing";

test("parseDrawing refuses invalid JSON instead of returning an empty canvas", () => {
  expect(parseDrawing("not json")).toBeNull();
  expect(parseDrawing("")).toBeNull();
  expect(parseDrawing("[1,2]")).toBeNull();
});

test("parseDrawing refuses JSON without an elements array", () => {
  expect(parseDrawing('{"type":"excalidraw"}')).toBeNull();
  expect(parseDrawing('{"elements":"oops"}')).toBeNull();
});

test("parseDrawing defaults missing links", () => {
  expect(parseDrawing('{"elements":[]}')).toMatchObject({ elements: [], links: [] });
});

test("sceneEdit clears the edit when the scene returns to the loaded state", () => {
  expect(sceneEdit("base", "base")).toBeNull();
  expect(sceneEdit("changed", "base")).toBe("changed");
});

test("drawingMountKey ignores saves and changes only on load, reload or restore", () => {
  expect(drawingMountKey(0, false)).not.toBe(drawingMountKey(0, true));
  expect(drawingMountKey(0, true)).not.toBe(drawingMountKey(1, true));
});

test("withLinks sets links and keeps elements", () => {
  const out = JSON.parse(withLinks('{"elements":[{"id":"a"}],"links":["x/y#1"]}', ["o/r#2"]));
  expect(out).toEqual({ elements: [{ id: "a" }], links: ["o/r#2"] });
});

test("emptyDrawing round-trips", () => {
  expect(parseDrawing(emptyDrawing(["o/r#1"]))).toMatchObject({ elements: [], links: ["o/r#1"] });
});
