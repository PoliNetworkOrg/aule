import { useEffect } from "react";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { startApplication } from "../app/boot";
import { HomePage } from "../app/home/home-page";
import { Header } from "../app/ui/header";

function pageOf(pathname: string) {
  if (pathname.startsWith("/classroom/")) return "classroom";

  return pathname === "/info" ? "info" : "home";
}

function Root() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const page = pageOf(pathname);

  useEffect(() => {
    void startApplication();
  }, []);

  useEffect(() => {
    document.body.dataset.page = page;
  }, [page]);

  return (
    <>
      <Header page={page} />
      <HomePage hidden={page !== "home"} />
      <Outlet />
    </>
  );
}

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => null,
});
