import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleSlash, RotateCcw } from "lucide-react";
import { api, errorText, send } from "@/api";
import { Button } from "@/components/ui/button";
import { refreshIssues } from "@/lib/refresh";
import type { Issue, Label } from "@/types";

function Picker({ title, options, chosen, disabled, onChange }: { title: string; options: string[]; chosen: string[]; disabled: boolean; onChange: (next: string[]) => void }) {
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-xs text-muted-foreground">{title}</legend>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={chosen.includes(o)} onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))} />
            {o}
          </label>
        ))}
        {options.length === 0 && <span className="text-sm text-muted-foreground">None available.</span>}
      </div>
    </fieldset>
  );
}

// Close, reopen and edit labels and assignees. Close and reopen are issues only: a PR closes by merging or on GitHub.
export default function IssueActions({ owner, repo, base, issue }: { owner: string; repo: string; base: string; issue: Issue }) {
  const qc = useQueryClient();
  const labels = useQuery({ queryKey: ["labels", owner, repo], queryFn: () => api<Label[]>(`/api/repos/${owner}/${repo}/labels`) });
  const people = useQuery({ queryKey: ["assignees", owner, repo], queryFn: () => api<string[]>(`/api/repos/${owner}/${repo}/assignees`) });
  const act = useMutation({
    mutationFn: (body: Record<string, unknown>) => send("PATCH", base, body),
    onSuccess: () => refreshIssues(qc) // returned so inputs stay disabled until the refetch lands,
  });
  const open = issue.state === "open";
  return (
    <section aria-label="Issue actions" className="space-y-3 rounded-sm border bg-card p-3">
      {!issue.pr && (
        <div className="flex flex-wrap gap-2">
          {open ? (
            <>
              <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ state: "closed", reason: "completed" })}>
                <CircleCheck aria-hidden /> Close as completed
              </Button>
              <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ state: "closed", reason: "not_planned" })}>
                <CircleSlash aria-hidden /> Close as not planned
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate({ state: "open" })}>
              <RotateCcw aria-hidden /> Reopen
            </Button>
          )}
        </div>
      )}
      <Picker title="Labels" options={labels.data?.map((l) => l.name) ?? []} chosen={issue.labels.map((l) => l.name)} disabled={act.isPending || !labels.data} onChange={(labels) => act.mutate({ labels })} />
      <Picker title="Assignees" options={people.data ?? []} chosen={issue.assignees} disabled={act.isPending || !people.data} onChange={(assignees) => act.mutate({ assignees })} />
      {act.isError && <p className="text-sm text-destructive">{errorText(act.error)}</p>}
    </section>
  );
}
