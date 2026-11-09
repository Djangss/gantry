import { Component, type ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Alert variant="destructive" className="m-4 w-auto">
        <AlertTitle>This view crashed</AlertTitle>
        <AlertDescription>{this.state.error.message}</AlertDescription>
      </Alert>
    );
  }
}
