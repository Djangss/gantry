import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { EditableFile } from "@/lib/useEditableFile";

export default function FileBar({ f, path }: { f: EditableFile; path: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <code title={path} className="truncate font-mono text-xs">{path}</code>
        <span role="status" className="ml-auto text-xs text-muted-foreground">
          {f.status || (f.dirty ? "Unsaved changes" : "")}
        </span>
        <Button size="sm" onClick={() => void f.save()} disabled={!f.dirty}>
          Save <kbd className="ml-1 text-xs opacity-70">Ctrl+S</kbd>
        </Button>
      </div>
      {f.draftOffer !== null && (
        <Alert className="mx-4 w-auto">
          <AlertTitle>You have unsaved edits from last time</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={f.restoreDraft}>Restore edits</Button>
            <Button size="sm" variant="ghost" onClick={f.discardDraft}>Discard</Button>
          </AlertDescription>
        </Alert>
      )}
      {f.conflict && (
        <Alert variant="destructive" role="alertdialog" aria-label="Save conflict" className="mx-4 w-auto">
          <AlertTitle>This file changed on GitHub since you opened it</AlertTitle>
          <AlertDescription className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => void f.reloadTheirs()}>Load their version (keep mine as draft)</Button>
            <Button size="sm" variant="destructive" onClick={() => void f.overwriteMine()}>Overwrite with mine</Button>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
