import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate } from "react-router";
import remarkGfm from "remark-gfm";
import { api, errorText, send } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { meQuery } from "@/lib/me";
import { parseRef } from "@/lib/ref";
import { cn } from "@/lib/utils";
import type { Issue, LinkEntry, PR } from "@/types";

function stateText(i: Issue): string {
  if (!i.pr) return i.state === "open" ? "Open" : "Closed";
  if (i.pr.merged) return "Merged";
  return i.pr.draft ? "Draft pull request" : `Pull request ${i.state}`;
}

function PRStatus({ pr }: { pr: PR }) {
  if (!pr.reviews.length && !pr.checks.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {pr.reviews.map((r) => (
        <Badge key={r.user} variant="outline" className={cn(r.state === "APPROVED" && "border-go text-go")}>
          {r.user}: {r.state.toLowerCase().replace("_", " ")}
        </Badge>
      ))}
      {pr.checks.map((c) => (
        <Badge
          key={c.name}
          variant="outline"
          className={cn(c.conclusion === "success" && "border-go text-go", c.conclusion === "failure" && "border-destructive text-destructive")}
        >
          {c.name}: {c.conclusion || c.status}
        </Badge>
      ))}
    </div>
  );
}

export default function ItemDrawer({ itemRef, onClose }: { itemRef: string; onClose: () => void }) {
  const r = parseRef(itemRef);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const me = useQuery(meQuery);
  const base = r ? `/api/repos/${r.owner}/${r.repo}/issues/${r.number}` : "";
  const issue = useQuery({ queryKey: ["issue", itemRef], queryFn: () => api<Issue>(base), enabled: !!r });
  const links = useQuery({
    queryKey: ["links", itemRef.toLowerCase()],
    queryFn: () => api<LinkEntry[]>(`/api/links?ref=${encodeURIComponent(itemRef)}`),
    enabled: !!r,
  });
  const [text, setText] = useState("");
  const comment = useMutation({
    mutationFn: (body: string) => send("POST", `${base}/comments`, { body }),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["issue", itemRef] });
    },
  });
  const notesRepo = me.data?.notesRepo;
  const create = (kind: "note" | "drawing") =>
    notesRepo && navigate(`/files/${notesRepo}?new=${kind}&link=${encodeURIComponent(itemRef)}`);
  const i = issue.data;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="text-xl heading-condensed">{i ? i.title : itemRef}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {i && (
                <a href={i.url} target="_blank" rel="noreferrer" className="font-mono text-xs hover:underline">
                  {itemRef}
                </a>
              )}
              {i && <span>{stateText(i)}</span>}
              {i && <span>opened by {i.user}</span>}
              {i?.labels.map((l) => (
                <Badge key={l.name} variant="outline" style={{ borderColor: `#${l.color}` }}>
                  {l.name}
                </Badge>
              ))}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {!r && <p className="text-destructive">{itemRef} is not an issue reference like owner/repo#12.</p>}
          {issue.isPending && r && <Skeleton className="h-40" />}
          {issue.isError && <p className="text-destructive">{errorText(issue.error)}</p>}
          {i && (
            <>
              {i.pr && <PRStatus pr={i.pr} />}
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <Markdown remarkPlugins={[remarkGfm]}>{i.body || "_No description._"}</Markdown>
              </article>
              <section className="space-y-2 border-t pt-4">
                <h3 className="text-base heading-condensed">Notes</h3>
                {links.isError && <p className="text-sm text-destructive">{errorText(links.error)}</p>}
                {links.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing linked yet. Start a note or a drawing for this issue.</p>}
                <ul className="space-y-1">
                  {links.data?.map((l) => (
                    <li key={l.path}>
                      <Link className="text-sm hover:underline" to={`/files/${notesRepo}?path=${encodeURIComponent(l.path)}`}>
                        {l.title}
                        {l.kind === "drawing" && <span className="text-muted-foreground"> (drawing)</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => create("note")}>New note</Button>
                  <Button size="sm" variant="secondary" onClick={() => create("drawing")}>New drawing</Button>
                </div>
              </section>
              <section className="space-y-3 border-t pt-4">
                <h3 className="text-base heading-condensed">Comments ({i.comments.length})</h3>
                {i.comments.map((c) => (
                  <div key={c.id} className="space-y-1 border-l-2 pl-3">
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{c.user}</span> on {new Date(c.createdAt).toLocaleString()}
                    </p>
                    <article className="prose prose-sm max-w-none dark:prose-invert">
                      <Markdown remarkPlugins={[remarkGfm]}>{c.body}</Markdown>
                    </article>
                  </div>
                ))}
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim()) comment.mutate(text);
                  }}
                >
                  <Textarea placeholder="Add a comment" value={text} onChange={(e) => setText(e.target.value)} rows={4} />
                  {comment.isError && <p className="text-sm text-destructive">{errorText(comment.error)}</p>}
                  <Button type="submit" size="sm" disabled={comment.isPending || !text.trim()}>
                    Comment
                  </Button>
                </form>
              </section>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
