import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorText, send } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { refreshIssues } from "@/lib/refresh";
import type { Label } from "@/types";

export default function NewIssue({ full, onCreated }: { full: string; onCreated: (number: number) => void }) {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const labels = useQuery({ queryKey: ["labels", ...full.split("/")], queryFn: () => api<Label[]>(`/api/repos/${full}/labels`), enabled: show });
  const create = useMutation({
    mutationFn: () => send<{ number: number }>("POST", `/api/repos/${full}/issues`, { title, body, labels: chosen }),
    onSuccess: (r) => {
      setShow(false);
      setTitle("");
      setBody("");
      setChosen([]);
      refreshIssues(qc);
      onCreated(r.number);
    },
  });
  if (!show)
    return (
      <Button size="sm" onClick={() => setShow(true)}>
        New issue
      </Button>
    );
  return (
    <form
      aria-label="New issue"
      className="w-full space-y-2 rounded-md border bg-card p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (title.trim() && !create.isPending) create.mutate();
      }}
    >
      <Input aria-label="Title" placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea aria-label="Description" placeholder="Description" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {labels.data?.map((l) => (
          <label key={l.name} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={chosen.includes(l.name)} onChange={(e) => setChosen(e.target.checked ? [...chosen, l.name] : chosen.filter((x) => x !== l.name))} />
            {l.name}
          </label>
        ))}
      </div>
      {create.isError && <p className="text-sm text-destructive">{errorText(create.error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={create.isPending || !title.trim()}>
          Create issue
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setShow(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
