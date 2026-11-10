import { useQuery } from "@tanstack/react-query";
import { api } from "@/api";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { PRFile } from "@/types";

const lineClass = (l: string) =>
  l.startsWith("+") ? "bg-go/15 text-foreground" : l.startsWith("-") ? "bg-destructive/15 text-foreground" : l.startsWith("@@") ? "text-muted-foreground" : "";

export default function PRChanges({ itemRef, filesUrl }: { itemRef: string; filesUrl: string }) {
  const files = useQuery({ queryKey: ["prFiles", itemRef], queryFn: () => api<PRFile[]>(filesUrl) });
  return (
    <section className="space-y-2 border-t pt-4">
      <h3 className="text-[17px] heading-condensed">Changes</h3>
      {files.isPending && <Skeleton className="h-24" />}
      {files.isError && <QueryError error={files.error} retry={files.refetch} />}
      {files.data?.map((f) => (
        <div key={f.filename} className="overflow-hidden rounded-sm border">
          <p className="flex items-center gap-2 bg-muted px-3 py-1.5 font-mono text-xs">
            <span className="truncate">{f.filename}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">{f.status}</span>
          </p>
          {f.patch ? (
            <pre className="overflow-x-auto text-xs leading-5">
              {f.patch.split("\n").map((l, i) => (
                <div key={i} className={cn("px-3 whitespace-pre", lineClass(l))}>
                  {l || " "}
                </div>
              ))}
            </pre>
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">No text diff (binary or too large).</p>
          )}
        </div>
      ))}
    </section>
  );
}
