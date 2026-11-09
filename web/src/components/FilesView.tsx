import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { api, errorText, send } from "@/api";
import MarkdownEditor from "@/components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { saveFile } from "@/lib/files";
import { noteTemplate, slugify } from "@/lib/frontmatter";
import { meQuery } from "@/lib/me";
import { cn } from "@/lib/utils";
import type { TreeEntry } from "@/types";

const editable = (p: string) => p.endsWith(".md") || p.endsWith(".excalidraw");

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

  const open = (p: string) => setParams(root ? { root, path: p } : { path: p });

  async function create(kind: "note" | "drawing", link?: string) {
    const name = window.prompt(kind === "note" ? "Note title" : "Drawing name");
    if (!name) return;
    const p = kind === "note" ? `notes/${slugify(name)}.md` : `drawings/${slugify(name)}.excalidraw`;
    const links = link ? [link] : [];
    const content = kind === "note" ? noteTemplate(name, links) : JSON.stringify({ type: "excalidraw", version: 2, source: "gantry", elements: [], appState: {}, files: {}, links }, null, 2);
    try {
      const r = await saveFile(owner, repo, p, content, "", `notes: add ${p}`);
      if (!r.ok) return setError(`${p} already exists. Pick another name.`);
      await qc.invalidateQueries({ queryKey: ["tree", owner, repo] });
      void qc.invalidateQueries({ queryKey: ["links"] });
      open(p);
    } catch (e) {
      setError(errorText(e));
    }
  }

  // The item drawer links here with ?new=note|drawing&link=owner/repo#n.
  const started = useRef(false);
  useEffect(() => {
    const kind = params.get("new");
    if (started.current || !isNotes || (kind !== "note" && kind !== "drawing")) return;
    started.current = true;
    const link = params.get("link") ?? undefined;
    setParams(root ? { root } : {});
    void create(kind, link);
  }, [isNotes]); // eslint-disable-line react-hooks/exhaustive-deps

  async function rescan() {
    try {
      await send("POST", "/api/links/rescan");
      void qc.invalidateQueries({ queryKey: ["links"] });
    } catch (e) {
      setError(errorText(e));
    }
  }

  const files = (tree.data ?? []).filter((e) => e.type === "blob" && editable(e.path));
  const message = `${isNotes ? "notes" : "docs"}: update ${path}`;

  return (
    <div className="grid h-full grid-cols-1 md:grid-cols-[16rem_1fr]">
      <aside aria-label="Files" className="space-y-3 overflow-y-auto border-b p-3 md:border-b-0 md:border-r">
        <h1 className="truncate text-base heading-condensed">
          {isNotes ? "My notes" : `${owner}/${repo}`}
          {root && <span className="font-normal text-muted-foreground"> / {root}</span>}
        </h1>
        {isNotes && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void create("note")}>New note</Button>
            <Button size="sm" variant="secondary" onClick={() => void create("drawing")}>New drawing</Button>
            <Button size="sm" variant="ghost" onClick={() => void rescan()}>Rescan links</Button>
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {tree.isPending && <Skeleton className="h-32" />}
        {tree.isError && <p className="text-sm text-destructive">{errorText(tree.error)}</p>}
        {tree.data && files.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {isNotes ? "No notes yet. Create one above." : `No Markdown files${root ? ` in ${root}/` : ""}.`}
          </p>
        )}
        <ul className="space-y-0.5">
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => open(f.path)}
                className={cn("block w-full truncate rounded-sm px-2 py-1 text-left font-mono text-xs hover:bg-accent", f.path === path && "bg-accent")}
              >
                {root ? f.path.slice(root.length + 1) : f.path}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <section className="min-h-0 overflow-hidden">
        {!path ? (
          <p className="p-6 text-muted-foreground">Pick a file on the left.</p>
        ) : (
          <MarkdownEditor key={path} owner={owner} repo={repo} path={path} message={message} />
        )}
      </section>
    </div>
  );
}
