import type { QueryClient } from "@tanstack/react-query";
import type { Board, Item } from "@/types";

export const boardKey = (id: string) => ["board", id] as const;

export type Column = { id: string; name: string; items: Item[] };

export function columns(board: Board): Column[] {
  const cols: Column[] = board.options.map((o) => ({ id: o.id, name: o.name, items: [] }));
  const none: Column = { id: "", name: "No status", items: [] };
  for (const it of board.items) (cols.find((c) => c.id === it.optionId) ?? none).items.push(it);
  return none.items.length ? [none, ...cols] : cols;
}

export const moveItem = (board: Board, itemId: string, optionId: string): Board => ({
  ...board,
  items: board.items.map((i) => (i.id === itemId ? { ...i, optionId } : i)),
});

export async function optimisticMove(qc: QueryClient, projectId: string, itemId: string, optionId: string) {
  const key = boardKey(projectId);
  await qc.cancelQueries({ queryKey: key });
  const prev = qc.getQueryData<Board>(key);
  if (prev) qc.setQueryData(key, moveItem(prev, itemId, optionId));
  return () => qc.setQueryData(key, prev);
}

// Finished columns get the "go" marker (docs/design.md).
export const isDone = (name: string) => /^(done|shipped|closed)$/i.test(name.trim());
