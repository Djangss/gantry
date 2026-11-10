import { Excalidraw, getSceneVersion, serializeAsJSON } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useMemo, useRef, useState } from "react";
import FileBar from "@/components/FileBar";
import QueryError from "@/components/QueryError";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { drawingMountKey, parseDrawing, sceneEdit, withLinks } from "@/lib/drawing";
import { useDark } from "@/lib/theme";
import { useEditableFile } from "@/lib/useEditableFile";

type Props = { owner: string; repo: string; path: string; message: string };

const linkList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export default function DrawingEditor({ owner, repo, path, message }: Props) {
  const f = useEditableFile(owner, repo, path, message);
  const mountKey = drawingMountKey(f.generation, !!f.file.data);
  // Excalidraw reads initialData once per mount, so re-parse only when the mount key changes.
  const initial = useMemo(() => parseDrawing(f.value), [mountKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const [links, setLinks] = useState("");
  const linksRef = useRef("");
  const base = useRef<{ key: string; json: string } | null>(null);
  const seen = useRef(""); // cheap scene fingerprint; onChange also fires on pointer moves and scrolls
  const dark = useDark();

  // After a save the file holds our own serialization, so it becomes the new "nothing to save" baseline.
  const savedSha = f.file.data?.sha;
  useEffect(() => {
    if (base.current && f.file.data) base.current.json = f.file.data.content;
  }, [savedSha]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const l = initial?.links.join(", ") ?? "";
    setLinks(l);
    linksRef.current = l;
  }, [initial]);

  if (f.file.isPending) return <Skeleton className="m-4 h-96" />;
  if (f.file.isError) return <QueryError className="p-4" error={f.file.error} retry={f.file.refetch} />;
  if (!initial)
    return <p className="p-4 text-destructive">{path} is not valid Excalidraw JSON. Gantry won't open it, so it can't be overwritten by mistake.</p>;

  function onScene(serialized: string) {
    const json = withLinks(serialized, linkList(linksRef.current));
    // The first change after mount is Excalidraw normalizing the file, not an edit.
    if (base.current?.key !== mountKey) {
      base.current = { key: mountKey, json };
      return;
    }
    const next = sceneEdit(json, base.current.json);
    if (next === null) f.resetContent();
    else f.setContent(next);
  }

  function onLinks(v: string) {
    setLinks(v);
    linksRef.current = v;
    f.setContent(withLinks(f.value, linkList(v)));
  }

  return (
    <div className="flex h-full flex-col">
      <FileBar f={f} path={path} />
      <div className="flex items-center gap-2 px-4 py-2">
        <label htmlFor="links" className="shrink-0 text-sm text-muted-foreground">Linked issues</label>
        <Input id="links" className="font-mono text-xs" placeholder="owner/repo#12, owner/repo#34" value={links} onChange={(e) => onLinks(e.target.value)} />
      </div>
      <div className="min-h-0 flex-1">
        <Excalidraw
          key={mountKey}
          initialData={initial as never}
          theme={dark ? "dark" : "light"}
          onChange={(elements, appState, files) => {
            // Serialize only when something saved to the file changed, not on every pointer move.
            const fp = `${mountKey}|${getSceneVersion(elements)}|${appState.viewBackgroundColor}|${appState.gridModeEnabled}|${appState.gridSize}|${appState.gridStep}|${Object.keys(files).length}`;
            if (fp === seen.current) return;
            seen.current = fp;
            onScene(serializeAsJSON(elements, appState, files, "local"));
          }}
        />
      </div>
    </div>
  );
}
