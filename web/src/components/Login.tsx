import { Button } from "@/components/ui/button";

export default function Login() {
  return (
    <div className="grid min-h-svh place-items-center bg-background p-4">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl heading-condensed">Gantry</h1>
        <p className="text-muted-foreground">Plan, write and sketch next to your GitHub work.</p>
        <Button asChild size="lg">
          <a href="/auth/login">Sign in with GitHub</a>
        </Button>
      </div>
    </div>
  );
}
