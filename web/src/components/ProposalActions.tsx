import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { api, errorText, send } from "@/api";
import { Button } from "@/components/ui/button";
import { markHandled, unhandled } from "@/lib/inbox";
import type { IssueSummary, Project } from "@/types";

const lastKey = "gantry.approveProject";
const readLast = () => {
  try {
    return localStorage.getItem(lastKey) ?? "";
  } catch {
    return "";
  }
};

export default function ProposalActions({ itemRef, base, isPR, isDraft }: { itemRef: string; base: string; isPR: boolean; isDraft?: boolean }) {
  const qc = useQueryClient();
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects"), enabled: !isPR });
  const open = projects.data?.filter((p) => !p.closed) ?? [];
  const [projectId, setProjectId] = useState(readLast);
  const chosen = open.some((p) => p.id === projectId) ? projectId : "";
  const act = useMutation({
    mutationFn: (verb: "approve" | "reject") => send("POST", `${base}/${verb}`, verb === "approve" && chosen ? { projectId: chosen } : {}),
    onSuccess: () => {
      markHandled(itemRef);
      // select only re-runs when the data reference changes, so refilter the cached list now.
      qc.setQueryData<IssueSummary[]>(["inbox"], (old) => old && unhandled(old));
      try {
        if (chosen) localStorage.setItem(lastKey, chosen);
      } catch {
        /* storage blocked: the picker just won't remember */
      }
      void qc.invalidateQueries({ queryKey: ["inbox"] });
      void qc.invalidateQueries({ queryKey: ["issue", itemRef] });
      void qc.invalidateQueries({ queryKey: ["board"] });
    },
  });
  return (
    <section aria-label="Proposal" className="space-y-2 rounded-sm border border-hazard bg-hazard/10 p-3">
      <p className="text-sm font-medium">{isPR ? "Proposed doc change" : "Proposed issue"}</p>
      {isPR && isDraft && <p className="text-sm text-muted-foreground">This PR is a draft.</p>}
      {!isPR && (
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Add to</span>
          <select className="h-8 rounded-sm border bg-background px-2 text-sm" value={chosen} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No board</option>
            {open.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={act.isPending} onClick={() => act.mutate("approve")}>
          <Check aria-hidden /> {isPR ? (isDraft ? "Mark ready and merge" : "Approve and merge") : "Approve"}
        </Button>
        <Button size="sm" variant="secondary" disabled={act.isPending} onClick={() => act.mutate("reject")}>
          <X aria-hidden /> Reject
        </Button>
      </div>
      {act.isError && <p className="text-sm text-destructive">{errorText(act.error)}</p>}
    </section>
  );
}
