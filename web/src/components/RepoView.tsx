import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, errorText } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import ItemDrawer from "@/components/ItemDrawer";
import QueryError from "@/components/QueryError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { meQuery } from "@/lib/me";
import { addWatched, removeWatched, saveWatched, watchedQueryOptions } from "@/lib/repos";
import { cn } from "@/lib/utils";
import type { IssueSummary, Repo } from "@/types";

const day = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

export default function RepoView() {
  const { owner = "", repo = "" } = useParams();
  const full = `${owner}/${repo}`;
  const [params, setParams] = useSearchParams();
  const kind = params.get("tab") === "prs" ? "pr" : "issue";
  const state = params.get("state") === "closed" ? "closed" : "open";
  const item = params.get("item");
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const notesRepo = me.data?.notesRepo ?? "";
  const watched = useQuery(watchedQueryOptions(notesRepo));
  const accessible = useQuery({ queryKey: ["repos"], queryFn: () => api<Repo[]>("/api/repos") });
  const list = useQuery({
    queryKey: ["repoIssues", full, kind, state],
    queryFn: () => api<IssueSummary[]>(`/api/repos/${owner}/${repo}/issues?state=${state}&kind=${kind}`),
  });
  const [watchError, setWatchError] = useState("");

  const set = (next: Record<string, string>) => {
    const p = Object.fromEntries(params);
    delete p.item;
    setParams({ ...p, ...next });
  };
  const isWatched = watched.data?.repos.some((r) => r.toLowerCase() === full.toLowerCase()) ?? false;
  const isAccessible = accessible.data?.some((r) => r.fullName.toLowerCase() === full.toLowerCase()) ?? false;

  async function toggleWatch() {
    if (!watched.data) return;
    setWatchError("");
    const next = isWatched ? removeWatched(watched.data.repos, full) : addWatched(watched.data.repos, full);
    try {
      const r = await saveWatched(notesRepo, next, watched.data.sha);
      if (!r.ok) setWatchError("Your watch list changed on another device. Try again.");
    } catch (e) {
      setWatchError(errorText(e));
    }
    void qc.invalidateQueries({ queryKey: ["watched"] });
  }

  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const rows = (list.data ?? []).filter((i) => !needle || i.title.toLowerCase().includes(needle) || String(i.number).startsWith(needle));
  const noun = kind === "pr" ? "pull requests" : "issues";

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="truncate text-xl heading-condensed">{full}</h1>
        <a href={`https://github.com/${full}`} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground hover:underline">
          Open on GitHub
        </a>
        {!isAccessible && list.isSuccess && watched.data && (
          <Button size="sm" variant={isWatched ? "secondary" : "default"} className="ml-auto" onClick={() => void toggleWatch()}>
            {isWatched ? "Stop watching" : "Watch"}
          </Button>
        )}
      </header>
      {watchError && <p className="text-sm text-destructive">{watchError}</p>}
      <nav aria-label="Repo sections" className="flex flex-wrap items-center gap-1 border-b pb-2">
        <Button size="sm" variant={kind === "issue" ? "secondary" : "ghost"} aria-pressed={kind === "issue"} onClick={() => set({ tab: "issues" })}>
          Issues
        </Button>
        <Button size="sm" variant={kind === "pr" ? "secondary" : "ghost"} aria-pressed={kind === "pr"} onClick={() => set({ tab: "prs" })}>
          Pull requests
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link to={`/files/${full}?root=docs`}>Docs</Link>
        </Button>
      </nav>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["open", "closed"] as const).map((s) => (
            <Button key={s} size="sm" variant={state === s ? "secondary" : "ghost"} aria-pressed={state === s} onClick={() => set({ state: s })}>
              {s === "open" ? "Open" : "Closed"}
            </Button>
          ))}
        </div>
        <Input type="search" aria-label={`Search ${noun}`} placeholder={`Search ${noun}`} value={q} onChange={(e) => setQ(e.target.value)} className="h-8 max-w-xs" />
      </div>
      {list.isPending && <Skeleton className="h-48" />}
      {list.isError && <QueryError error={list.error} retry={list.refetch} />}
      {list.data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">{needle ? `No ${noun} match "${q.trim()}".` : `No ${state} ${noun}.`}</p>
      )}
      <ul className="divide-y rounded-md border bg-card">
        {rows.map((i) => (
          <li key={i.number}>
            <button
              type="button"
              onClick={() => setParams({ ...Object.fromEntries(params), item: `${full}#${i.number}` })}
              className={cn("flex w-full flex-col gap-1 px-3 py-2 text-left hover:bg-accent", item === `${full}#${i.number}` && "bg-accent")}
            >
              <span className="text-sm font-medium">{i.title}</span>
              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-mono">#{i.number}</span>
                <span>{i.user}</span>
                <span>Updated {day.format(new Date(i.updatedAt))}</span>
                {i.comments > 0 && <span>{i.comments === 1 ? "1 comment" : `${i.comments} comments`}</span>}
                {i.isDraft && <span>Draft</span>}
                {i.labels.map((l) => (
                  <Badge key={l.name} variant="outline" className="text-[11px]" style={{ borderColor: `#${l.color}` }}>
                    {l.name}
                  </Badge>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.data?.length === 100 && <p className="text-xs text-muted-foreground">Showing the 100 most recently updated. Search on GitHub for older ones.</p>}
      {item && (
        <ErrorBoundary key={item}>
          <ItemDrawer
            itemRef={item}
            onClose={() => {
              const p = Object.fromEntries(params);
              delete p.item;
              setParams(p);
            }}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}
