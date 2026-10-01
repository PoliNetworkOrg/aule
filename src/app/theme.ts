import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** What the user picked: a fixed theme, or whatever the system uses (nothing saved). */
export type ThemePreference = Theme | "system";

export const THEME_PREFERENCES: ThemePreference[] = ["light", "dark", "system"];

// A new key: "poliAule_theme" was written by the old light/dark toggle, so
// everyone who ever clicked it would never see the system theme again.
const STORAGE_KEY = "poliAule_themePreference";

localStorage.removeItem("poliAule_theme");

const systemTheme = matchMedia("(prefers-color-scheme: dark)");

const listeners = new Set<() => void>();

let currentTheme: Theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";

let currentPreference: ThemePreference = readPreference();

function readPreference(): ThemePreference {
  const saved = localStorage.getItem(STORAGE_KEY);

  return saved === "light" || saved === "dark" ? saved : "system";
}

function systemValue(): Theme {
  return systemTheme.matches ? "dark" : "light";
}

function notify() {
  listeners.forEach((listener) => listener());
}

function applyTheme(theme: Theme) {
  if (theme === currentTheme) return;

  currentTheme = theme;
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme === "dark" ? "#131c2e" : "#ffffff");
  notify();
}

systemTheme.addEventListener("change", () => {
  if (currentPreference === "system") applyTheme(systemValue());
});

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** The theme on screen, with "system" already resolved. */
export function getTheme() {
  return currentTheme;
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme);
}

export function useThemePreference() {
  return useSyncExternalStore(subscribe, () => currentPreference);
}

export function setThemePreference(preference: ThemePreference) {
  if (preference === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, preference);

  currentPreference = preference;
  notify();
  applyTheme(preference === "system" ? systemValue() : preference);
}
