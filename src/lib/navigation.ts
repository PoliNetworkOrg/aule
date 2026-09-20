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

export function openPage(path: string) {
  appHistory.push(path);
}

export function closePage() {
  appHistory.replace("/");
}

export function goBack() {
  appHistory.back();
}
