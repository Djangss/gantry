import { api } from "@/api";
import type { Me } from "@/types";

export const meQuery = { queryKey: ["me"], queryFn: () => api<Me>("/api/me"), staleTime: Infinity };
