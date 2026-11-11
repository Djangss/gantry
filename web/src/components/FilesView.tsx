import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, PenTool } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, errorText, send } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import QueryError from "@/components/QueryError";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { emptyDrawing } from "@/lib/drawing";
import { saveFile, visibleFiles } from "@/lib/files";
import { noteTemplate, slugify } from "@/lib/frontmatter";
import { meQuery } from "@/lib/me";
import { cn } from "@/lib/utils";
import type { TreeEntry } from "@/types";

const DrawingEditor = lazy(() => import("@/components/DrawingEditor"));

export default function FilesView() {
  const { owner = "", repo = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const root = params.get("root") ?? "";
  const path = params.get("path");
  const qc = useQueryClient();
  const me = useQuery(meQuery);
  const isNotes = me.data?.notesRepo.toLowerCase() === `${owner}/${repo}`.toLowerCase();
  const tree = useQuery({
    queryKey: ["tree", owner, repo, root],
    queryFn: () => api<TreeEntry[]>(`/api/repos/${owner}/${repo}/tree?path=${encodeURIComponent(root)}`),
  });
  const [error, setError] = useState("");
  const [naming, setNaming] = useState<{ kind: "note" | "drawing"; link?: string } | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");

  const open = (p: string) => {
    setError("");
    setParams(root ? { root, path: p } : { path: p });
  };

  const startCreate = (kind: "note" | "drawing", link?: string) => {
    setError("");
    setNaming({ kind, link });
  };

  async function create(kind: "note" | "drawing", name: string, link?: string) {
    const p = kind === "note" ? `notes/${slugify(name)}.md` : `drawings/${slugify(name)}.excalidraw`;
    const links = link ? [link] : [];
    const content = kind === "note" ? noteTemplate(name, links) : emptyDrawing(links);
    try {
      const r = await saveFile(owner, repo, p, content, "", `notes: add ${p}`);
      if (!r.ok) return setError(`${p} already exists. Pick another name.`);
      setNaming(null);
      setName("");
      await qc.invalidateQueries({ queryKey: ["tree", owner, repo] });
      void qc.invalidateQueries({ queryKey: ["links"] });
      open(p);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // The item drawer links here with ?new=note|drawing&link=owner/repo#n.
  useEffect(() => {
    const kind = params.get("new");
    if (!isNotes || (kind !== "note" && kind !== "drawing")) return;
    const link = params.get("link") ?? undefined;
    const next = new URLSearchParams(params); // keep root and path; replace so Back does not reopen the dialog
    for (const k of ["new", "name", "link"]) next.delete(k);
    setParams(next, { replace: true });
    setName(params.get("name") ?? "");
    startCreate(kind, link);
  }, [isNotes, params.get("new")]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rescan() {
    try {
      await send("POST", "/api/links/rescan");
      void qc.invalidateQueries({ queryKey: ["links"] });
    } catch (e) {
      setError(errorText(e));
    }
  }

  const files = visibleFiles(tree.data ?? [], query);
  const message = `${isNotes ? "notes" : "docs"}: update ${path}`;

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[16rem_1fr]">
      <aside aria-label="Files" className="space-y-3 overflow-y-auto border-b bg-muted/50 p-3 md:border-b-0 md:border-r">
        <h1 className="truncate px-1 text-[22px] heading-condensed">
          {isNotes ? "My notes" : `${owner}/${repo}`}
          {root && <span className="font-normal text-muted-foreground"> / {root}</span>}
        </h1>
        {isNotes && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => startCreate("note")}>
              <FileText aria-hidden /> New note
            </Button>
            <Button size="sm" variant="secondary" onClick={() => startCreate("drawing")}>
              <PenTool aria-hidden /> New drawing
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void rescan()}>Rescan links</Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {tree.isPending && <Skeleton className="h-32" />}
        {tree.isError && <QueryError error={tree.error} retry={tree.refetch} />}
        {tree.data && (
          <Input type="search" aria-label="Filter files" placeholder="Filter files" value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 bg-card" />
        )}
        {tree.data && files.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {query.trim()
              ? `No files match "${query.trim()}".`
              : isNotes
                ? "No notes yet. Create one above."
                : `No Markdown files${root ? ` in ${root}/` : ""}.`}
          </p>
        )}
        <ul className="space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => open(f.path)}
                aria-current={f.path === path ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left font-mono text-xs hover:bg-card",
                  f.path === path && "bg-card font-semibold shadow-[inset_3px_0_0_var(--hazard)]",
                )}
              >
                {f.path.endsWith(".excalidraw") ? (
                  <PenTool aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{root ? f.path.slice(root.length + 1) : f.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <Dialog open={naming !== null} onOpenChange={(o) => !o && setNaming(null)}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (naming && name.trim()) void create(naming.kind, name.trim(), naming.link);
            }}
          >
            <DialogHeader>
              <DialogTitle className="heading-condensed">{naming?.kind === "drawing" ? "New drawing" : "New note"}</DialogTitle>
            </DialogHeader>
            <Input autoFocus placeholder={naming?.kind === "drawing" ? "Drawing name" : "Note title"} value={name} onChange={(e) => setName(e.target.value)} />
            {naming?.link && <p className="text-sm text-muted-foreground">Linked to <span className="font-mono text-xs">{naming.link}</span></p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="submit" disabled={!name.trim()}>Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <section className="min-h-0 overflow-hidden">
        {!path ? (
          <div className="grid h-full place-items-center p-6 text-center text-muted-foreground">
            <div className="space-y-2">
              <FileText aria-hidden className="mx-auto size-8 opacity-50" />
              <p>Pick a file on the left.</p>
            </div>
          </div>
        ) : path.endsWith(".excalidraw") ? (
          <ErrorBoundary key={path}>
            <Suspense fallback={<Skeleton className="m-4 h-96" />}>
              <DrawingEditor owner={owner} repo={repo} path={path} message={message} />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <MarkdownEditor key={path} owner={owner} repo={repo} path={path} message={message} />
        )}
      </section>
    </div>
  );
}
