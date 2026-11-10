import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import FileBar from "@/components/FileBar";
import QueryError from "@/components/QueryError";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { editorTheme } from "@/lib/editorTheme";
import { previewTitle, splitFrontmatter } from "@/lib/frontmatter";
import { useDark } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { useEditableFile } from "@/lib/useEditableFile";

type Props = { owner: string; repo: string; path: string; message: string };

export default function MarkdownEditor({ owner, repo, path, message }: Props) {
  const f = useEditableFile(owner, repo, path, message);
  const dark = useDark();
  const [preview, setPreview] = useState(false); // narrow screens show one pane at a time
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
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </article>
      </div>
    </div>
  );
}
