import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { toast } from "sonner";
import { api, errorText, send } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { meQuery } from "@/lib/me";
import { cn } from "@/lib/utils";
import type { Project, Repo } from "@/types";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn("block truncate rounded-md px-2 py-1 text-sm hover:bg-accent", isActive && "bg-accent font-medium");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="px-2 text-xs font-medium text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

function Nav() {
  const me = useQuery(meQuery);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects") });
  const repos = useQuery({ queryKey: ["repos"], queryFn: () => api<Repo[]>("/api/repos") });
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
    <nav aria-label="Main" className="flex h-full flex-col gap-4 overflow-y-auto p-3">
      <div className="px-2 text-xl heading-condensed">Gantry</div>
      <Section title="Projects">
        {projects.isError && <p className="px-2 text-sm text-destructive">{errorText(projects.error)}</p>}
        {openProjects?.length === 0 && <p className="px-2 text-sm text-muted-foreground">No projects yet. Create one on GitHub.</p>}
        {openProjects?.map((p) => (
          <NavLink key={p.id} to={`/projects/${encodeURIComponent(p.id)}`} className={linkClass}>
            {p.title}
          </NavLink>
        ))}
      </Section>
      {me.data && (
        <Section title="Notes">
          <NavLink to={`/files/${me.data.notesRepo}`} className={linkClass}>
            My notes
          </NavLink>
        </Section>
      )}
      <Section title="Docs">
        {repos.isError && <p className="px-2 text-sm text-destructive">{errorText(repos.error)}</p>}
        {repos.data?.map((r) => (
          <NavLink key={r.fullName} to={`/files/${r.fullName}?root=docs`} className={linkClass}>
            {r.fullName}
          </NavLink>
        ))}
      </Section>
      <Separator className="mt-auto" />
      <div className="flex items-center justify-between px-2 text-sm">
        <span className="truncate text-muted-foreground">{me.data?.login}</span>
        <Button variant="ghost" size="sm" onClick={logout}>
          Sign out
        </Button>
      </div>
    </nav>
  );
}

export default function Layout() {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  return (
    <div className="flex h-svh flex-col bg-background md:flex-row">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <Nav />
      </aside>
      <header className="flex items-center justify-between border-b px-4 py-2 md:hidden">
        <span className="text-lg heading-condensed">Gantry</span>
        <Button variant="secondary" size="sm" onClick={() => setMenuOpen(true)}>
          Menu
        </Button>
      </header>
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
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
