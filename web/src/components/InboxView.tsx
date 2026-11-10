import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, CircleDot } from "lucide-react";
import { useSearchParams } from "react-router";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemDrawer from "@/components/ItemDrawer";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import { inboxQuery, refOf } from "@/lib/inbox";
import { cn } from "@/lib/utils";

const day = new Intl.DateTimeFormat([], { dateStyle: "medium" });

export default function InboxView() {
  const [params, setParams] = useSearchParams();
  const item = params.get("item");
  const list = useQuery(inboxQuery);
  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="text-xl heading-condensed">Inbox</h1>
        <p className="text-sm text-muted-foreground">Issues and doc changes proposed by agents. Approve or reject each one.</p>
      </header>
      {list.isPending && <Skeleton className="h-48" />}
      {list.isError && <QueryError error={list.error} retry={list.refetch} />}
      {list.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing to review. Proposals labelled "proposed" show up here.</p>}
      {!!list.data?.length && (
        <ul className="divide-y rounded-md border bg-card">
          {list.data.map((i) => {
            const ref = refOf(i);
            const Icon = i.isPR ? GitPullRequest : CircleDot;
            return (
              <li key={ref}>
                <button
                  type="button"
                  onClick={() => setParams({ item: ref })}
                  className={cn("flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-accent", item === ref && "bg-accent")}
                >
                  <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-sm font-medium">{i.title}</span>
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{ref}</span>
                      <span>{i.isPR ? "Doc change" : "Issue"}</span>
                      <span>Updated {day.format(new Date(i.updatedAt))}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {item && (
        <ErrorBoundary key={item}>
          <ItemDrawer itemRef={item} onClose={() => setParams({})} />
        </ErrorBoundary>
      )}
    </div>
  );
}
