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
 * the screen frozen. Browsers without view transitions just navigate.
 */
function navigate(direction: "forward" | "back", update: () => void) {
  if (!document.startViewTransition || reduceMotion.matches) {
    update();

    return;
  }

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
  navigate("forward", () => appHistory.push(path));
}

export function closePage() {
  // Already home: nothing changes on screen, so there is nothing to transition.
  if (appHistory.location.pathname === "/") appHistory.replace("/");
  else navigate("back", () => appHistory.replace("/"));
}

export function goBack() {
  navigate("back", () => appHistory.back());
}
