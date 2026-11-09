import { useQuery } from "@tanstack/react-query";
import { NavLink, Outlet, useLocation } from "react-router";
import { api, errorText, send } from "@/api";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { meQuery } from "@/lib/me";
import { cn } from "@/lib/utils";
import type { Project, Repo } from "@/types";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn("block truncate rounded-md px-2 py-1 text-sm hover:bg-accent", isActive && "bg-accent font-medium");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <h2 className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      {children}
    </div>
  );
}

export default function Layout() {
  const location = useLocation();
  const me = useQuery(meQuery);
  const projects = useQuery({ queryKey: ["projects"], queryFn: () => api<Project[]>("/api/projects") });
  const repos = useQuery({ queryKey: ["repos"], queryFn: () => api<Repo[]>("/api/repos") });

  async function logout() {
    await send("POST", "/auth/logout");
    window.location.assign("/login");
  }

  return (
    <div className="flex h-svh flex-col bg-background md:flex-row">
      <nav aria-label="Main" className="flex max-h-[40svh] shrink-0 flex-col gap-4 overflow-y-auto border-b p-3 md:max-h-none md:w-64 md:border-b-0 md:border-r">
        <div className="px-2 text-lg font-semibold tracking-tight">Gantry</div>
        <Section title="Projects">
          {projects.isError && <p className="px-2 text-sm text-destructive">{errorText(projects.error)}</p>}
          {projects.data?.filter((p) => !p.closed).map((p) => (
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
      <main className="min-h-0 flex-1 overflow-auto">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
