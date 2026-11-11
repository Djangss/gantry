import { useQuery } from "@tanstack/react-query";
import { CircleDot, FileText, GitPullRequest, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import QueryError from "@/components/QueryError";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { meQuery } from "@/lib/me";
import { issuePath, MIN_QUERY, notePath, searchQuery } from "@/lib/search";

const rowClass = "flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent";

export default function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 450);
    return () => clearTimeout(t);
  }, [text]);
  const res = useQuery(searchQuery(q, open));
  const empty = res.data && !res.data.notes.length && !res.data.issues.length;

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[20%] translate-y-0 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Notes, drawings, and issues or PRs you are involved in.</DialogDescription>
        </DialogHeader>
        <Input autoFocus type="search" aria-label="Search" placeholder="Search notes, issues, PRs" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="max-h-[50svh] space-y-3 overflow-y-auto">
          {q.length > 0 && q.length < MIN_QUERY && <p className="text-muted-foreground">Type at least {MIN_QUERY} characters.</p>}
          {res.isFetching && <p className="text-muted-foreground">Searching...</p>}
          {res.isError && <QueryError error={res.error} retry={res.refetch} />}
          {empty && <p className="text-muted-foreground">No results.</p>}
          {!!res.data?.notes.length && me.data && (
            <section aria-label="Notes" className="space-y-0.5">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">Notes</h3>
              {res.data.notes.map((n) => (
                <button key={n.path} type="button" className={rowClass} onClick={() => go(notePath(me.data.notesRepo, n.path))}>
                  {n.kind === "drawing" ? <PenLine aria-hidden className="size-4 shrink-0 text-muted-foreground" /> : <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="truncate">{n.title}</span>
                  <span className="ml-auto truncate font-mono text-xs text-muted-foreground">{n.path}</span>
                </button>
              ))}
            </section>
          )}
          {!!res.data?.issues.length && (
            <section aria-label="Issues and PRs" className="space-y-0.5">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">Issues and PRs</h3>
              {res.data.issues.map((i) => {
                const Icon = i.isPR ? GitPullRequest : CircleDot;
                return (
                  <button key={`${i.repo}#${i.number}${i.isPR}`} type="button" className={rowClass} onClick={() => go(issuePath(i.repo ?? "", i.number))}>
                    <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{i.title}</span>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{i.repo}#{i.number}</span>
                  </button>
                );
              })}
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
