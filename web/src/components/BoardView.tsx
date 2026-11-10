import {
  DndContext, KeyboardSensor, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, CircleCheck, CircleDashed, CircleDot, GitPullRequest } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { api, errorText, send } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemDrawer from "@/components/ItemDrawer";
import LabelChip from "@/components/LabelChip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { boardKey, columns, optimisticMove, stage, type Column, type Stage } from "@/lib/board";
import { cn } from "@/lib/utils";
import type { Board, Item } from "@/types";

const plateClass: Record<Stage, string> = {
  todo: "bg-stage-todo text-white",
  doing: "bg-hazard text-hazard-foreground",
  done: "bg-stage-done text-white",
};

function KindIcon({ item, done }: { item: Item; done: boolean }) {
  const cls = cn("mt-0.5 size-[15px] shrink-0", done ? "text-go" : "text-muted-foreground");
  if (done) return <CircleCheck aria-hidden className={cls} />;
  if (item.kind === "PullRequest") return <GitPullRequest aria-hidden className={cls} />;
  if (item.kind === "DraftIssue") return <CircleDashed aria-hidden className={cls} />;
  return <CircleDot aria-hidden className={cls} />;
}

function Card({ item, done, canMove, onOpen }: { item: Item; done: boolean; canMove: boolean; onOpen: (i: Item) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, disabled: !canMove });
  const openable = item.kind !== "DraftIssue";
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(
        "space-y-2 rounded-sm border border-b-2 bg-card px-3 py-2.5 text-card-foreground hover:border-muted-foreground/50",
        canMove && "cursor-grab",
        isDragging && "relative z-10 -rotate-2 cursor-grabbing border-hazard shadow-xl hover:border-hazard",
      )}
      {...listeners}
      {...attributes}
    >
      <div className="flex gap-2">
        <KindIcon item={item} done={done} />
        {openable ? (
          <button type="button" className="text-left text-sm font-medium leading-snug hover:underline underline-offset-3" onClick={() => onOpen(item)}>
            {item.title}
          </button>
        ) : (
          <p className="text-sm font-medium leading-snug">{item.title}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 pl-[23px]">
        <span className="font-mono text-[11px] text-muted-foreground">{openable ? `${item.repo}#${item.number}` : "Draft"}</span>
        {item.labels.map((l) => <LabelChip key={l.name} label={l} />)}
      </div>
    </article>
  );
}

function BoardColumn({ col, first, canMove, onOpen }: { col: Column; first: boolean; canMove: boolean; onOpen: (i: Item) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id, disabled: col.id === "" });
  const s = stage(col.name);
  return (
    <section aria-label={col.name} ref={setNodeRef} className="flex w-78 shrink-0 flex-col">
      <h2 className={cn("flex h-10 items-center gap-2 pr-7 text-[17px] heading-condensed", first ? "plate-start pl-3.5" : "plate pl-7", plateClass[s])}>
        {s === "done" && <Check aria-hidden className="size-4" strokeWidth={2.4} />}
        <span className="flex-1 truncate">{col.name}</span>
        <span className="min-w-6 rounded-full bg-black/15 px-1.5 text-center text-xs font-semibold">{col.items.length}</span>
      </h2>
      <div className={cn("mr-3.5 flex min-h-40 flex-col gap-2 bg-muted px-2 pt-2.5 pb-3", isOver && "clearance")}>
        {col.items.map((it) => (
          <Card key={it.id} item={it} done={s === "done"} canMove={canMove} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

// One segment per column, sized by its card count and coloured by stage.
function StageTrack({ cols }: { cols: Column[] }) {
  const total = cols.reduce((n, c) => n + c.items.length, 0);
  const done = cols.filter((c) => stage(c.name) === "done").reduce((n, c) => n + c.items.length, 0);
  if (total === 0) return null;
  return (
    <div className="space-y-1.5">
      <div aria-hidden className="flex h-2 w-56 gap-0.5">
        {cols.filter((c) => c.items.length).map((c) => (
          <span key={c.id} className={plateClass[stage(c.name)]} style={{ flexGrow: c.items.length }} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{done} of {total} done</p>
    </div>
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
          <Skeleton key={i} className="h-64 w-78" />
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
  const cols = columns(b);
  const item = params.get("item");
  const open = (it: Item) => it.repo && it.number && setParams({ item: `${it.repo}#${it.number}` });

  function onDragEnd(e: DragEndEvent) {
    const item = b.items.find((i) => i.id === e.active.id);
    const optionId = e.over?.id;
    if (!canMove || !item || typeof optionId !== "string" || optionId === "" || optionId === item.optionId) return;
    move.mutate({ itemId: item.id, optionId });
  }

  return (
    <div className="flex h-full flex-col gap-5 p-4 md:px-7 md:pt-6">
      <header className="flex flex-wrap items-end gap-x-7 gap-y-3">
        <h1 className="text-[34px] leading-none heading-condensed">{b.title}</h1>
        <StageTrack cols={cols} />
      </header>
      {!canMove && <p className="text-sm text-muted-foreground">Add a single-select Status field to this project on GitHub to move cards.</p>}
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex min-h-0 flex-1 items-start gap-1.5 overflow-x-auto pb-2">
          {cols.map((c, i) => (
            <BoardColumn key={c.id} col={c} first={i === 0} canMove={canMove} onOpen={open} />
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
