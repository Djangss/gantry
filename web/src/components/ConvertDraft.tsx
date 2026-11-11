import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorText, send } from "@/api";
import { Button } from "@/components/ui/button";
import { refreshIssues } from "@/lib/refresh";
import type { Repo } from "@/types";

// Turns a draft card into an issue in the chosen repo.
export default function ConvertDraft({ projectId, itemId }: { projectId: string; itemId: string }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [repo, setRepo] = useState("");
  const repos = useQuery({ queryKey: ["repos"], queryFn: () => api<Repo[]>("/api/repos"), enabled: show });
  const convert = useMutation({
    mutationFn: () => send("POST", `/api/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}/convert`, { repo }),
    onSuccess: () => refreshIssues(qc),
  });
  if (!show)
    return (
      <Button size="sm" variant="secondary" onClick={() => setShow(true)}>
        Convert to issue
      </Button>
    );
  return (
    <div className="w-full space-y-1.5">
      <select aria-label="Repository" className="h-8 w-full rounded-sm border bg-background px-2 text-sm" value={repo} onChange={(e) => setRepo(e.target.value)}>
        <option value="">Choose a repo</option>
        {repos.data?.map((r) => (
          <option key={r.fullName} value={r.fullName}>
            {r.fullName}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button size="sm" disabled={!repo || convert.isPending} onClick={() => convert.mutate()}>
          Convert
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShow(false)}>
          Cancel
        </Button>
      </div>
      {convert.isError && <p className="text-xs text-destructive">{errorText(convert.error)}</p>}
    </div>
  );
}
