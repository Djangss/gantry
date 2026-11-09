import { afterEach, expect, test, vi } from "vitest";
import { api, ApiError, errorText, send } from "./api";

afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

test("sends the CSRF header and parses JSON", async () => {
  const f = vi.fn().mockResolvedValue(json(200, { a: 1 }));
  vi.stubGlobal("fetch", f);
  expect(await api("/api/x")).toEqual({ a: 1 });
  expect(f.mock.calls[0][1].headers["X-Requested-With"]).toBe("gantry");
});

test("send serializes the body and handles 204", async () => {
  const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", f);
  await expect(send("PATCH", "/api/x", { a: 1 })).resolves.toBeUndefined();
  expect(f.mock.calls[0][1]).toMatchObject({ method: "PATCH", body: '{"a":1}' });
  expect(f.mock.calls[0][1].headers["Content-Type"]).toBe("application/json");
});

test("throws ApiError with server code", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(409, { error: "file changed on GitHub", code: "conflict" })));
  await expect(api("/api/x")).rejects.toMatchObject({ status: 409, code: "conflict", message: "file changed on GitHub" });
});

test("errorText shows the rate limit reset time", () => {
  const e = new ApiError(429, "rate_limited", "GitHub rate limit hit", "2026-11-09T14:05:00Z");
  expect(errorText(e)).toMatch(/^GitHub rate limit hit, retry at \d{1,2}:\d{2}/);
  expect(errorText(new Error("boom"))).toBe("boom");
});
