import { createBrowserHistory } from "@tanstack/react-router";

// Keep existing #info, #classroom/{id}, and #classroom/{campus}/{name}
// bookmarks, including the original hash-free home URL and outer search.
export const appHistory = createBrowserHistory({
  parseLocation: () => {
    const pathname = `/${window.location.hash.slice(1).replace(/^\//, "")}`;

    return { href: pathname, pathname, search: "", hash: "", state: window.history.state };
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
