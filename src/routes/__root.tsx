import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "../AppShell";
import { PageController } from "../PageController";

function Root() {
  return (
    <>
      <AppShell />
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => <PageController page="home" />,
});
