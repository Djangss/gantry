import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { api } from "@/api";
import FileBar from "@/components/FileBar";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { editorTheme } from "@/lib/editorTheme";
import { previewTitle, splitFrontmatter } from "@/lib/frontmatter";
import { meQuery } from "@/lib/me";
import { remarkWiki, slugOf } from "@/lib/wiki";
import type { LinkEntry } from "@/types";
import { useDark } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEditableFile } from "@/lib/useEditableFile";

type Props = { owner: string; repo: string; path: string; message: string };

export default function MarkdownEditor({ owner, repo, path, message }: Props) {
  const f = useEditableFile(owner, repo, path, message);
  const dark = useDark();
  const [preview, setPreview] = useState(false); // narrow screens show one pane at a time
  const me = useQuery(meQuery);
  const isNotes = me.data?.notesRepo.toLowerCase() === `${owner}/${repo}`.toLowerCase();
  // Keys start with "links" so a save, a rescan or a push to the notes repo refreshes them.
  const notes = useQuery({ queryKey: ["links", "notes"], queryFn: () => api<LinkEntry[]>("/api/notes"), enabled: isNotes });
  const backlinks = useQuery({
    queryKey: ["links", "backlinks", slugOf(path)],
    queryFn: () => api<LinkEntry[]>(`/api/backlinks?slug=${encodeURIComponent(slugOf(path))}`),
    enabled: isNotes,
  });
  const wiki = useMemo(() => (isNotes ? [remarkWiki(`${owner}/${repo}`, notes.data ?? [], path)] : []), [isNotes, owner, repo, notes.data, path]);
  if (f.file.isPending) return <Skeleton className="m-4 h-96" />;
  if (f.file.isError) return <QueryError className="p-4" error={f.file.error} retry={f.file.refetch} />;
  const { title, body } = splitFrontmatter(f.value);
  return (
    <div className="flex h-full flex-col">
      <FileBar f={f} path={path} />
      <div className="flex gap-1 border-b bg-card px-4 py-1 lg:hidden">
        <Button size="sm" variant={preview ? "ghost" : "secondary"} aria-pressed={!preview} onClick={() => setPreview(false)}>Edit</Button>
        <Button size="sm" variant={preview ? "secondary" : "ghost"} aria-pressed={preview} onClick={() => setPreview(true)}>Preview</Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <CodeMirror
          className={cn("min-h-0 overflow-auto border-r bg-card text-sm", preview && "hidden lg:block")}
          value={f.value}
          onChange={f.setContent}
          extensions={[markdown()]}
          theme={editorTheme(dark)}
          height="100%"
        />
        <article className={cn("prose prose-sm max-w-none overflow-auto px-8 py-7 dark:prose-invert prose-headings:heading-condensed prose-a:decoration-hazard prose-a:decoration-2 prose-a:underline-offset-3", !preview && "hidden lg:block")}>
          {previewTitle(title, body) && <h1 className="text-[34px]">{title}</h1>}
          <Markdown remarkPlugins={[remarkGfm, ...wiki]} components={{ a: ({ href, node: _node, ...p }) => (href?.startsWith("/") ? <Link to={href} {...p} /> : <a href={href} {...p} />) }}>{body}</Markdown>
          {!!backlinks.data?.length && (
            <section aria-label="Backlinks" className="mt-8 border-t pt-4">
              <h2 className="text-base">Backlinks</h2>
              <ul>
                {backlinks.data.map((b) => (
                  <li key={b.path}><Link to={`/files/${owner}/${repo}?path=${encodeURIComponent(b.path)}`}>{b.title}</Link></li>
                ))}
              </ul>
            </section>
          )}
        </article>
      </div>
    </div>
  );
}
