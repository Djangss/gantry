export default function Home() {
  return (
    <div className="grid h-full place-items-center p-6">
      <div className="max-w-xs space-y-3 text-center">
        <img src="/favicon.svg" alt="" width={56} height={56} className="mx-auto" />
        <p className="text-muted-foreground">Pick a project, your notes, or a repo in the sidebar.</p>
      </div>
    </div>
  );
}
