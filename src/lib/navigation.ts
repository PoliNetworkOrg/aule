import { useSyncExternalStore } from "react";
import { createBrowserHistory } from "@tanstack/react-router";

// Native hash navigation creates history entries with null state. Supply the
// same initial index/key that TanStack uses when parsing an untracked entry.
// Keep existing #info, #classroom/{id}, and #classroom/{campus}/{name}
// bookmarks, including the original hash-free home URL and outer search.
export const appHistory = createBrowserHistory({
  parseLocation: () => {
    const pathname = `/${window.location.hash.slice(1).replace(/^\//, "")}`;

    return {
      href: pathname,
      pathname,
      search: "",
      hash: "",
      state: window.history.state ?? { __TSR_index: 0, __TSR_key: crypto.randomUUID() },
    };
  },
  createHref: (path) =>
    `${window.location.pathname}${window.location.search}${path === "/" ? "" : `#${path.replace(/^\//, "")}`}`,
});

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

let preloadRoute: ((path: string) => Promise<void>) | null = null;

/** Lets navigate() load a page's code before the transition starts (see main.tsx). */
export function registerPreload(preload: (path: string) => Promise<void>) {
  preloadRoute = preload;
}

// A page that loads quickly should not flash a spinner: it only shows once the
// wait is long enough to notice.
const SPINNER_DELAY_MS = 400;

let pageLoading = false;

const loadingListeners = new Set<() => void>();

function setPageLoading(loading: boolean) {
  if (pageLoading === loading) return;

  pageLoading = loading;
  loadingListeners.forEach((listener) => listener());
}

function subscribeToLoading(listener: () => void) {
  loadingListeners.add(listener);

  return () => {
    loadingListeners.delete(listener);
  };
}

/** Whether a navigation is waiting for the next page's code to arrive. */
export function usePageLoading() {
  return useSyncExternalStore(subscribeToLoading, () => pageLoading);
}

let pageRendered: (() => void) | null = null;

/** Called by the root layout once a navigation's page is on screen. */
export function notifyPageRendered() {
  pageRendered?.();
}

/**
 * Runs a navigation as a view transition: the pages slide (see "Page
 * transitions" in styles.css), forward when opening a page and back when
 * leaving one. The router renders after the history changes, so the transition
 * waits for notifyPageRendered, and gives up after a moment rather than leave
 * the screen frozen. Pages are code-split, so a page that is not loaded yet is
 * loaded first (`preload`): otherwise the transition would capture the new
 * page still blank on a slow connection. Browsers without view transitions
 * just navigate.
 */
async function navigate(
  direction: "forward" | "back",
  update: () => void,
  preload?: () => Promise<void>,
) {
  if (!document.startViewTransition || reduceMotion.matches) {
    update();

    return;
  }

  // A failed preload is not fatal: the router retries when it renders the page.
  const spinner = window.setTimeout(() => setPageLoading(true), SPINNER_DELAY_MS);

  await preload?.().catch(() => undefined);
  window.clearTimeout(spinner);
  setPageLoading(false);

  const root = document.documentElement;

  root.dataset.transition = direction;

  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const timer = window.setTimeout(done, 400);

        function done() {
          window.clearTimeout(timer);
          pageRendered = null;
          resolve();
        }

        pageRendered = done;
        update();
      }),
  );

  void transition.finished.finally(() => delete root.dataset.transition);
}

export function openPage(path: string) {
  void navigate(
    "forward",
    () => appHistory.push(path),
    () => preloadRoute?.(path) ?? Promise.resolve(),
  );
}

export function closePage() {
  // Already home: nothing changes on screen, so there is nothing to transition.
  if (appHistory.location.pathname === "/") appHistory.replace("/");
  else void navigate("back", () => appHistory.replace("/"));
}

export function goBack() {
  void navigate("back", () => appHistory.back());
}
