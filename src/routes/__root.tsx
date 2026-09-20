import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../AppShell";
import { Application, ApplicationRoute } from "../Application";

function Root() {
  return (
    <Application>
      <AppShell />
      <Outlet />
    </Application>
  );
}

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => <ApplicationRoute page="home" />,
});
