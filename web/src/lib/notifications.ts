import { queryOptions } from "@tanstack/react-query";
import { api } from "@/api";
import type { Notification } from "@/types";

export const unreadCount = (list?: Notification[]) => list?.filter((n) => n.unread).length ?? 0;
export const markRead = (list: Notification[], id: string) => list.map((n) => (n.id === id ? { ...n, unread: false } : n));

// shortcut: fixed 60s poll; the server does not forward GitHub's X-Poll-Interval. Forward it if GitHub ever asks for slower.
export const notificationsQuery = queryOptions({
  queryKey: ["notifications"],
  queryFn: () => api<Notification[]>("/api/notifications"),
  refetchInterval: 60_000,
});
