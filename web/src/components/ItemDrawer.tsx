import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleCheck, CircleDashed, CircleDot, CircleX, ExternalLink, FileText, GitMerge, GitPullRequest, GitPullRequestClosed, GitPullRequestDraft,
  PenTool, type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import Markdown from "react-markdown";
import { Link, useNavigate } from "react-router";
import remarkGfm from "remark-gfm";
import { api, errorText, send } from "@/api";
import LabelChip from "@/components/LabelChip";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import PRChanges from "@/components/PRChanges";
import ProposalActions from "@/components/ProposalActions";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { isSubmit, modLabel } from "@/lib/keys";
import { meQuery } from "@/lib/me";
import { parseRef } from "@/lib/ref";
import { cn } from "@/lib/utils";
import type { Issue, LinkEntry, PR } from "@/types";

// The state plate reuses the board's stage colours: yellow while a PR is open, green once it lands.
function statePlate(i: Issue): { text: string; cls: string; Icon: LucideIcon } {
  const todo = "bg-stage-todo text-white";
  const done = "bg-stage-done text-white";
  if (!i.pr) return i.state === "open" ? { text: "Open issue", cls: todo, Icon: CircleDot } : { text: "Closed issue", cls: done, Icon: CircleCheck };
  if (i.pr.merged) return { text: "Merged", cls: done, Icon: GitMerge };
  if (i.state !== "open") return { text: "Closed pull request", cls: todo, Icon: GitPullRequestClosed };
  if (i.pr.draft) return { text: "Draft pull request", cls: todo, Icon: GitPullRequestDraft };
  return { text: "Open pull request", cls: "bg-hazard text-hazard-foreground", Icon: GitPullRequest };
}

function StatusRow({ ok, bad, label, detail }: { ok: boolean; bad: boolean; label: string; detail: string }) {
  const Icon = ok ? CircleCheck : bad ? CircleX : CircleDashed;
  return (
    <li className="flex items-center gap-2 text-sm">
      <Icon aria-hidden className={cn("size-4 shrink-0", ok ? "text-go" : bad ? "text-destructive" : "text-muted-foreground")} />
      <span className="truncate font-medium">{label}</span>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{detail}</span>
    </li>
  );
}

function PRStatus({ pr }: { pr: PR }) {
  if (!pr.reviews.length && !pr.checks.length) return null;
  return (
    <div className="grid gap-4 rounded-sm bg-muted p-3 sm:grid-cols-2">
      {pr.reviews.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs text-muted-foreground">Reviews</h3>
          <ul className="space-y-1">
            {pr.reviews.map((r) => (
              <StatusRow key={r.user} ok={r.state === "APPROVED"} bad={r.state === "CHANGES_REQUESTED"} label={r.user} detail={r.state.toLowerCase().replaceAll("_", " ")} />
            ))}
          </ul>
        </div>
      )}
      {pr.checks.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs text-muted-foreground">Checks</h3>
          <ul className="space-y-1">
            {pr.checks.map((c) => (
              <StatusRow key={c.name} ok={c.conclusion === "success"} bad={c.conclusion === "failure"} label={c.name} detail={c.conclusion || c.status} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const Avatar = ({ login }: { login: string }) => (
  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-stage-todo text-xs font-bold uppercase text-white">
    {login.at(0)}
  </span>
);

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
  const plate = i && statePlate(i);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto border-l-0 sm:max-w-xl [&>[data-slot=sheet-close]]:text-rail-foreground [&>[data-slot=sheet-close]]:hover:bg-white/10">
        <SheetHeader className="gap-3 bg-rail px-5 pt-5 pb-5 text-rail-foreground">
          {plate && (
            <span className={cn("plate-start inline-flex h-7 w-fit items-center gap-1.5 pr-6 pl-2.5 text-sm font-semibold", plate.cls)}>
              <plate.Icon aria-hidden className="size-4" />
              {plate.text}
            </span>
          )}
          <SheetTitle className="pr-8 text-[26px] leading-tight text-rail-foreground heading-condensed">{i ? i.title : itemRef}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-rail-muted">
              {i && (
                <a href={i.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-rail-foreground hover:underline">
                  {itemRef}
                  <ExternalLink aria-hidden className="size-3" />
                </a>
              )}
              {i && <span>opened by {i.user}</span>}
              {i?.labels.map((l) => <LabelChip key={l.name} label={l} />)}
            </div>
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 px-5 pt-5 pb-8">
          {!r && <p className="text-destructive">{itemRef} is not an issue reference like owner/repo#12.</p>}
          {issue.isPending && r && <Skeleton className="h-40" />}
          {issue.isError && <QueryError error={issue.error} retry={issue.refetch} />}
          {i && (
            <>
              {r && i.state === "open" && i.labels.some((l) => l.name === "proposed") && <ProposalActions itemRef={itemRef} base={base} isPR={!!i.pr} />}
              {i.pr && <PRStatus pr={i.pr} />}
              <article className="prose prose-sm max-w-none dark:prose-invert">
                <Markdown remarkPlugins={[remarkGfm]}>{i.body || "_No description._"}</Markdown>
              </article>
              {r && i.pr && <PRChanges itemRef={itemRef} filesUrl={`/api/repos/${r.owner}/${r.repo}/pulls/${r.number}/files`} />}
              <section className="space-y-2 border-t pt-4">
                <h3 className="text-[17px] heading-condensed">Notes</h3>
                {links.isError && <QueryError error={links.error} retry={links.refetch} />}
                {links.data?.length === 0 && <p className="text-sm text-muted-foreground">Nothing linked yet. Start a note or a drawing for this issue.</p>}
                <ul className="space-y-1">
                  {links.data?.map((l) => (
                    <li key={l.path}>
                      <Link
                        className="flex items-center gap-2 rounded-sm border border-b-2 bg-card px-3 py-2 text-sm font-medium hover:border-muted-foreground/50"
                        to={`/files/${notesRepo}?path=${encodeURIComponent(l.path)}`}
                      >
                        {l.kind === "drawing" ? <PenTool aria-hidden className="size-4 text-muted-foreground" /> : <FileText aria-hidden className="size-4 text-muted-foreground" />}
                        {l.title}
                        {l.kind === "drawing" && <span className="sr-only"> (drawing)</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" disabled={!notesRepo} onClick={() => create("note")}>
                    <FileText aria-hidden /> New note
                  </Button>
                  <Button size="sm" variant="secondary" disabled={!notesRepo} onClick={() => create("drawing")}>
                    <PenTool aria-hidden /> New drawing
                  </Button>
                </div>
              </section>
              <section className="space-y-3 border-t pt-4">
                <h3 className="text-[17px] heading-condensed">Comments ({i.comments.length})</h3>
                {i.comments.map((c) => (
                  <div key={c.id} className="flex gap-3">
                    <Avatar login={c.user} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{c.user}</span> on {new Date(c.createdAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                      <article className="prose prose-sm max-w-none dark:prose-invert">
                        <Markdown remarkPlugins={[remarkGfm]}>{c.body}</Markdown>
                      </article>
                    </div>
                  </div>
                ))}
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (text.trim() && !comment.isPending) comment.mutate(text);
                  }}
                >
                  <Textarea
                    placeholder="Add a comment"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => isSubmit(e) && e.currentTarget.form?.requestSubmit()}
                    rows={4}
                  />
                  {comment.isError && <p className="text-sm text-destructive">{errorText(comment.error)}</p>}
                  <Button type="submit" size="sm" disabled={comment.isPending || !text.trim()}>
                    Comment <kbd className="ml-1 text-xs opacity-70">{modLabel(navigator.platform)}Enter</kbd>
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
