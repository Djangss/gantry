import { Button } from "@/components/ui/button";

export default function Login() {
  return (
    <div className="grid min-h-svh place-items-center bg-rail p-4 text-rail-foreground">
      <div className="flex flex-col items-center gap-5 text-center">
        <img src="/favicon.svg" alt="" width={88} height={88} />
        <h1 className="text-5xl heading-condensed">Gantry</h1>
        <p className="text-rail-muted">Plan, write and sketch next to your GitHub work.</p>
        <Button asChild size="lg" className="bg-hazard text-hazard-foreground hover:bg-hazard/90">
          <a href="/auth/login">Sign in with GitHub</a>
        </Button>
      </div>
    </div>
  );
}
