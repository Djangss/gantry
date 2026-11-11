import { expect, test } from "vitest";
import type { Notification } from "@/types";
import { markRead, unreadCount } from "./notifications";

const n = (id: string, unread = true): Notification => ({ id, unread, reason: "mention", title: "t", type: "Issue", repo: "o/r", ref: "o/r#1", updatedAt: "" });

test("marking a thread read drops it from the unread count", () => {
  const list = [n("1"), n("2"), n("3", false)];
  expect(unreadCount(list)).toBe(2);
  expect(unreadCount(markRead(list, "1"))).toBe(1);
});

test("count is zero without data", () => {
  expect(unreadCount(undefined)).toBe(0);
});
