import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { modLabel } from "@/lib/keys";
import type { EditableFile } from "@/lib/useEditableFile";

export default function FileBar({ f, path }: { f: EditableFile; path: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 border-b px-4 py-2">
        <code title={path} className="truncate font-mono text-xs">{path}</code>
        <span role="status" className="ml-auto text-xs text-muted-foreground">
          {f.status || (f.dirty ? "Unsaved changes" : "")}
        </span>
        <Button size="sm" onClick={() => void f.save()} disabled={!f.dirty || f.status === "Saving…"}>
          Save <kbd className="ml-1 text-xs opacity-70">{modLabel(navigator.platform)}S</kbd>
        </Button>
      </div>
      <Dialog open={f.blocker.state === "blocked"} onOpenChange={(o) => !o && f.blocker.reset?.()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="heading-condensed">Leave without saving?</DialogTitle>
            <DialogDescription>Your edits to {path} are kept as a draft. You can restore them when you open the file again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => f.blocker.reset?.()}>Stay</Button>
            <Button onClick={() => f.blocker.proceed?.()}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
