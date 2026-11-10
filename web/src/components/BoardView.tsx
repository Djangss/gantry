import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api, errorText, send } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemDrawer from "@/components/ItemDrawer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { boardKey, columns, isDone, optimisticMove, type Column } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Board, Item } from "@/types";

function Card({ item, canMove, onOpen }: { item: Item; canMove: boolean; onOpen: (i: Item) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !canMove });
  const openable = item.kind !== "DraftIssue";
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn("space-y-1.5 rounded-sm border bg-card p-2.5 text-card-foreground", isDragging && "relative z-10 shadow-lg")}
      {...listeners}
      {...attributes}
    >
      {openable ? (
        <button type="button" className="text-left text-[13px] font-medium leading-snug hover:underline" onClick={() => onOpen(item)}>
          {item.title}
        </button>
      ) : (
        <p className="text-[13px] font-medium leading-snug">{item.title}</p>
      )}
      <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="font-mono">{openable ? `${item.repo}#${item.number}` : "Draft"}</span>
        {item.kind === "PullRequest" && <span>Pull request</span>}
      </p>
      {item.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.labels.map((l) => (
            <Badge key={l.name} variant="outline" className="text-[11px]" style={{ borderColor: `#${l.color}` }}>
              {l.name}
            </Badge>
          ))}
        </div>
      )}
    </article>
  );
}

function BoardColumn({ col, canMove, onOpen }: { col: Column; canMove: boolean; onOpen: (i: Item) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id, disabled: col.id === "" });
  return (
    <section
      aria-label={col.name}
      ref={setNodeRef}
      className={cn("flex min-h-28 w-72 shrink-0 flex-col gap-2 rounded-sm bg-muted/60 p-2", isOver && "clearance")}
    >
      <h2 className="flex items-center gap-2 px-1 pb-1 text-base heading-condensed">
        {isDone(col.name) && <span aria-hidden className="size-2 rounded-full bg-go" />}
        {col.name}
        <span className="ml-auto text-xs font-normal text-muted-foreground">{col.items.length}</span>
      </h2>
      {col.items.map((it) => (
        <Card key={it.id} item={it} canMove={canMove} onOpen={onOpen} />
      ))}
    </section>
  );
}

export default function BoardView() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const close = useCallback(() => setParams({}), [setParams]);
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // Touch needs a short hold so swiping still scrolls the board.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }), useSensor(KeyboardSensor));
  const board = useQuery({ queryKey: boardKey(id), queryFn: () => api<Board>(`/api/projects/${encodeURIComponent(id)}/items`) });
  const move = useMutation({
    mutationFn: (v: { itemId: string; optionId: string }) =>
      send("PATCH", `/api/projects/${encodeURIComponent(id)}/items/${encodeURIComponent(v.itemId)}`, {
        fieldId: board.data!.fieldId,
        optionId: v.optionId,
      }),
    onMutate: (v) => optimisticMove(qc, id, v.itemId, v.optionId),
    onError: (e, _v, rollback) => {
      rollback?.();
      toast.error(`Move failed: ${errorText(e)}`);
    },
  });

  if (board.isPending)
    return (
      <div className="flex gap-3 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64 w-72" />
        ))}
      </div>
    );
  if (board.isError)
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertDescription className="flex items-center gap-3">
          {errorText(board.error)}
          <Button size="sm" variant="secondary" onClick={() => void board.refetch()}>Retry</Button>
        </AlertDescription>
      </Alert>
    );

  const b = board.data;
  const canMove = b.fieldId !== "";
  const item = params.get("item");
  const open = (it: Item) => it.repo && it.number && setParams({ item: `${it.repo}#${it.number}` });

  function onDragEnd(e: DragEndEvent) {
    const item = b.items.find((i) => i.id === e.active.id);
    const optionId = e.over?.id;
    if (!canMove || !item || typeof optionId !== "string" || optionId === "" || optionId === item.optionId) return;
    move.mutate({ itemId: item.id, optionId });
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <h1 className="text-xl heading-condensed">{b.title}</h1>
      {!canMove && <p className="text-sm text-muted-foreground">Add a single-select Status field to this project on GitHub to move cards.</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 items-start gap-3 overflow-x-auto pb-2">
          {columns(b).map((c) => (
            <BoardColumn key={c.id} col={c} canMove={canMove} onOpen={open} />
          ))}
        </div>
      </DndContext>
      {item && (
        <ErrorBoundary key={item}>
          <ItemDrawer itemRef={item} onClose={close} />
        </ErrorBoundary>
      )}
    </div>
  );
}
