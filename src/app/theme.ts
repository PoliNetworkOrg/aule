import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "poliAule_theme";

const systemTheme = matchMedia("(prefers-color-scheme: dark)");

const listeners = new Set<() => void>();

let currentTheme: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

function applyTheme(theme: Theme) {
  if (theme === currentTheme) return;

  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#131c2e" : "#ffffff");
  listeners.forEach((listener) => listener());
}

systemTheme.addEventListener("change", () => {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved !== "light" && saved !== "dark") applyTheme(systemTheme.matches ? "dark" : "light");
});

export function getTheme() {
  return currentTheme;
}

export function useTheme() {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);

    return () => listeners.delete(listener);
  }, getTheme);
}

export function setTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(theme);
}
