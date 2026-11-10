import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BookOpen, NotebookText } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, errorText, send } from "@/api";
import QueryError from "@/components/QueryError";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useLiveUpdates } from "@/lib/events";
import { meQuery } from "@/lib/me";
import { groupRepos, parseRepoName, watchedQueryOptions } from "@/lib/repos";
import { cn } from "@/lib/utils";
import type { Project, Repo } from "@/types";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex items-center gap-2.5 truncate rounded-sm px-2 py-1.5 text-sm hover:bg-white/7", isActive && "bg-white/10 font-semibold");

// The active item gets the yellow marker: it's where you are working.
const Marker = ({ isActive }: { isActive: boolean }) => (
  <span aria-hidden className={cn("size-[7px] shrink-0", isActive ? "bg-hazard" : "border border-rail-muted/60")} />
);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="px-2 pb-1 text-xs font-medium text-rail-muted">{title}</h2>
      {children}
    </div>
  );
}

function Nav() {
  const me = useQuery(meQuery);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects") });
  const repos = useQuery({ queryKey: ["repos"], queryFn: () => api<Repo[]>("/api/repos") });
  const contributed = useQuery({ queryKey: ["contributed"], queryFn: () => api<Repo[]>("/api/repos/contributed") });
  const watched = useQuery(watchedQueryOptions(me.data?.notesRepo ?? ""));
  const navigate = useNavigate();
  const [repoQuery, setRepoQuery] = useState("");
  const groups = groupRepos(me.data?.login ?? "", repos.data ?? [], contributed.data ?? [], watched.data?.repos ?? [], repoQuery);
  const typed = parseRepoName(repoQuery);
  const known = groups.some((g) => g.repos.some((r) => r.fullName.toLowerCase() === typed?.toLowerCase()));
  const openProjects = projects.data?.filter((p) => !p.closed);

  async function logout() {
    try {
      await send("POST", "/auth/logout");
      window.location.assign("/login");
    } catch (e) {
      toast.error(`Sign out failed: ${errorText(e)}`);
    }
  }

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-5 overflow-y-auto bg-rail px-3 py-4 text-rail-foreground">
      <Brand className="px-2" />
      <Section title="Projects">
        {projects.isPending && <ListSkeleton />}
        {projects.isError && <QueryError className="px-2 text-rail-foreground" error={projects.error} retry={projects.refetch} />}
        {openProjects?.length === 0 && <p className="px-2 text-sm text-rail-muted">No projects yet. Create one on GitHub.</p>}
        {openProjects?.map((p) => (
          <NavLink key={p.id} to={`/projects/${encodeURIComponent(p.id)}`} className={linkClass}>
            {({ isActive }) => (
              <>
                <Marker isActive={isActive} />
                <span className="truncate">{p.title}</span>
              </>
            )}
          </NavLink>
        ))}
      </Section>
      {me.data && (
        <Section title="Notes">
          <NavLink to={`/files/${me.data.notesRepo}`} className={linkClass}>
            <NotebookText aria-hidden className="size-4 shrink-0 text-rail-muted" />
            My notes
          </NavLink>
        </Section>
      )}
      <Section title="Repos">
        <form
          className="px-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!typed) return;
            setRepoQuery("");
            navigate(`/repos/${typed}`);
          }}
        >
          <Input
            type="search"
            aria-label="Filter repos or open owner/repo"
            placeholder="Filter, or open owner/repo"
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            className="h-8 border-white/15 bg-white/5 text-rail-foreground placeholder:text-rail-muted"
          />
        </form>
        {typed && !known && (
          <button
            type="button"
            onClick={() => {
              setRepoQuery("");
              navigate(`/repos/${typed}`);
            }}
            className="block w-full truncate rounded-sm px-2 py-1.5 text-left text-sm hover:bg-white/7"
          >
            Open <span className="font-mono text-xs">{typed}</span>
          </button>
        )}
        {repos.isPending && <ListSkeleton />}
        {repos.isError && <QueryError className="px-2 text-rail-foreground" error={repos.error} retry={repos.refetch} />}
        {contributed.isError && <QueryError className="px-2 text-rail-foreground" error={contributed.error} retry={contributed.refetch} />}
        {groups.map((g) => (
          <div key={g.title} className="space-y-0.5 pt-1">
            <h3 className="px-2 text-[11px] text-rail-muted">{g.title}</h3>
            {g.repos.map((r) => (
              <NavLink key={r.fullName} to={`/repos/${r.fullName}`} className={linkClass}>
                <BookOpen aria-hidden className="size-4 shrink-0 text-rail-muted" />
                <span className="truncate font-mono text-xs">{r.fullName}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </Section>
      <div className="mt-auto flex items-center gap-2.5 border-t border-white/10 px-2 pt-3 text-sm">
        <span aria-hidden className="grid size-6.5 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold uppercase">
          {me.data?.login.at(0)}
        </span>
        <span className="flex-1 truncate">{me.data?.login}</span>
        <Button variant="ghost" size="sm" className="hover:bg-white/10 hover:text-rail-foreground" onClick={logout}>
          Sign out
        </Button>
      </div>
    </nav>
  );
}


function Brand({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <img src="/favicon.svg" alt="" width={28} height={28} />
      <span className="text-[22px] heading-condensed">Gantry</span>
    </div>
  );
}

const ListSkeleton = () => (
  <div aria-hidden className="space-y-1.5 px-2">
    {[0, 1, 2].map((i) => <Skeleton key={i} className="h-5 bg-white/10" />)}
  </div>
);

export default function Layout() {
  const location = useLocation();
  const me = useQuery(meQuery);
  useLiveUpdates(me.data?.notesRepo ?? "");
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  return (
    <div className="flex h-svh flex-col bg-background md:flex-row">
      <aside className="hidden w-62 shrink-0 md:block">
        <Nav />
      </aside>
      <header className="flex items-center justify-between bg-rail px-4 py-2 text-rail-foreground md:hidden">
        <Brand />
        <Button variant="ghost" size="sm" className="hover:bg-white/10 hover:text-rail-foreground" onClick={() => setMenuOpen(true)}>
          Menu
        </Button>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 border-0 bg-rail p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Nav />
        </SheetContent>
      </Sheet>
      <main className="min-h-0 flex-1 overflow-auto">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
