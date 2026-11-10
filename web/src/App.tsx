import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createBrowserRouter, RouterProvider } from "react-router";
import { ApiError } from "@/api";
import BoardView from "@/components/BoardView";
import FilesView from "@/components/FilesView";
import InboxView from "@/components/InboxView";
import Home from "@/components/Home";
import Layout from "@/components/Layout";
import Login from "@/components/Login";
import RepoView from "@/components/RepoView";
import { Toaster } from "@/components/ui/sonner";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: (n, e) => !(e instanceof ApiError && e.status < 500) && n < 2 },
  },
});

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: "inbox", element: <InboxView /> },
      { path: "projects/:id", element: <BoardView /> },
      { path: "files/:owner/:repo", element: <FilesView /> },
      { path: "repos/:owner/:repo", element: <RepoView /> },
    ],
  },
]);

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>
  );
}
