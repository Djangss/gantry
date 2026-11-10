import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import type { Board } from "@/types";
import { boardKey, columns, isDone, moveItem, optimisticMove } from "./board";

const board: Board = {
  title: "Gantry",
  fieldId: "F1",
  options: [{ id: "O1", name: "Todo" }, { id: "O2", name: "Done" }],
  items: [
    { id: "I1", optionId: "O1", kind: "Issue", title: "Write spec", labels: [] },
    { id: "I2", optionId: "", kind: "DraftIssue", title: "Idea", labels: [] },
    { id: "I3", optionId: "gone", kind: "Issue", title: "Stale option", labels: [] },
  ],
};

test("columns groups by option and puts unknown or empty status first", () => {
  const cols = columns(board);
  expect(cols.map((c) => [c.id, c.items.map((i) => i.id)])).toEqual([
    ["", ["I2", "I3"]],
    ["O1", ["I1"]],
    ["O2", []],
  ]);
});

test("columns omits the No status column when empty", () => {
  expect(columns({ ...board, items: [board.items[0]] }).map((c) => c.id)).toEqual(["O1", "O2"]);
});

test("moveItem changes only the target item", () => {
  const next = moveItem(board, "I1", "O2");
  expect(next.items[0].optionId).toBe("O2");
  expect(next.items[1]).toBe(board.items[1]);
  expect(board.items[0].optionId).toBe("O1");
});

test("optimisticMove applies at once and rollback restores", async () => {
  const qc = new QueryClient();
  qc.setQueryData(boardKey("P1"), board);
  const rollback = await optimisticMove(qc, "P1", "I1", "O2");
  expect(qc.getQueryData<Board>(boardKey("P1"))!.items[0].optionId).toBe("O2");
  rollback();
  expect(qc.getQueryData<Board>(boardKey("P1"))!.items[0].optionId).toBe("O1");
});

test("isDone recognises finished columns", () => {
  expect(["Done", "shipped", "Closed", "Todo", "In progress"].map(isDone)).toEqual([true, true, true, false, false]);
});
