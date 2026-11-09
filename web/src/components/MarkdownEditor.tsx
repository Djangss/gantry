import { markdown } from "@codemirror/lang-markdown";
import CodeMirror from "@uiw/react-codemirror";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { errorText } from "@/api";
import FileBar from "@/components/FileBar";
import { Skeleton } from "@/components/ui/skeleton";
import { previewTitle, splitFrontmatter } from "@/lib/frontmatter";
import { useEditableFile } from "@/lib/useEditableFile";

type Props = { owner: string; repo: string; path: string; message: string };

export default function MarkdownEditor({ owner, repo, path, message }: Props) {
  const f = useEditableFile(owner, repo, path, message);
  if (f.file.isPending) return <Skeleton className="m-4 h-96" />;
  if (f.file.isError) return <p className="p-4 text-destructive">{errorText(f.file.error)}</p>;
  const { title, body } = splitFrontmatter(f.value);
  const dark = document.documentElement.classList.contains("dark");
  return (
    <div className="flex h-full flex-col">
      <FileBar f={f} path={path} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <CodeMirror
          className="min-h-0 overflow-auto border-r text-sm"
          value={f.value}
          onChange={f.setContent}
          extensions={[markdown()]}
          theme={dark ? "dark" : "light"}
          height="100%"
        />
        <article className="prose prose-sm hidden max-w-none overflow-auto p-6 dark:prose-invert lg:block">
          {previewTitle(title, body) && <h1 className="heading-condensed">{title}</h1>}
          <Markdown remarkPlugins={[remarkGfm]}>{body}</Markdown>
        </article>
      </div>
    </div>
  );
}
