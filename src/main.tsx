import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { appHistory } from "./lib/navigation";
import { queryClient } from "./lib/query";
import "./styles.css";

const router = createRouter({
  routeTree,
  history: appHistory,
  caseSensitive: true,
  scrollRestoration: false,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");

if (!root) throw new Error("Application root is missing");

createRoot(root).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
