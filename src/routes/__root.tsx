import { useEffect } from "react";
import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { startApplication } from "../app/boot";
import { notifyPageRendered } from "../lib/navigation";
import { HomePage } from "../app/home/home-page";
import { Header } from "../app/ui/header";
import { PageLoading } from "../app/ui/page-loading";

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

  // After the page's own effects (a classroom scrolls to the top): the view
  // transition of this navigation can now capture the new page.
  useEffect(() => {
    notifyPageRendered();
  }, [pathname]);

  return (
    <>
      <Header page={page} />
      <HomePage hidden={page !== "home"} />
      <Outlet />
      <PageLoading />
    </>
  );
}

export const Route = createRootRoute({
  component: Root,
  notFoundComponent: () => null,
});
