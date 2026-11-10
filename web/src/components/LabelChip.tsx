import type { Label } from "@/types";

export default function LabelChip({ label }: { label: Label }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-muted px-2 text-[11px] font-medium text-foreground">
      <span aria-hidden className="size-[7px] rounded-full" style={{ background: `#${label.color}` }} />
      {label.name}
    </span>
  );
}
