import { errorText } from "@/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function QueryError({ error, retry, className }: { error: unknown; retry: () => unknown; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm text-destructive", className)}>
      <span>{errorText(error)}</span>
      <Button size="sm" variant="secondary" onClick={() => void retry()}>Retry</Button>
    </div>
  );
}
