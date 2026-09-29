import { useSyncExternalStore } from "react";
import { fetchJson } from "../lib/query";

// Lightweight localisation. Every supported locale is loaded up front (a few KB
// each) so that <Stable> labels can reserve the width of their longest
// translation: switching language never resizes buttons, chips or boxes.

export const LOCALES = ["it", "en"] as const;

export type Locale = (typeof LOCALES)[number];

const STORAGE_KEY = "poliAule_locale";

const bundles = new Map<Locale, Record<string, string>>();

let currentLocale: Locale = "it";

let version = 0;

const listeners = new Set<() => void>();

function isLocale(value: string | null): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

function subscribe(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getVersion() {
  return version;
}

function apply(locale: Locale) {
  currentLocale = locale;
  document.documentElement.lang = locale;
  version++;
  listeners.forEach((listener) => listener());
}

export async function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const detected = navigator.language.slice(0, 2).toLowerCase();
  const initial: Locale = isLocale(saved) ? saved : isLocale(detected) ? detected : "it";

  const loaded = await Promise.allSettled(
    LOCALES.map(async (locale) => {
      bundles.set(locale, await fetchJson<Record<string, string>>(`/locales/${locale}.json`));
    }),
  );

  if (loaded.every((result) => result.status === "rejected"))
    throw new Error("i18n: no locale could be loaded");

  apply(bundles.has(initial) ? initial : (LOCALES.find((locale) => bundles.has(locale)) ?? "it"));
}

/** `key` in `locale`, falling back to the key itself so missing strings are visible. */
export function translate(locale: Locale, key: string, values?: Record<string, string | number>) {
  const text = bundles.get(locale)?.[key] ?? key;

  if (!values) return text;

  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in values ? String(values[name]) : match,
  );
}

export function t(key: string) {
  return translate(currentLocale, key);
}

/** Looks up `key` and replaces each `{name}` placeholder with its value. */
export function tf(key: string, values: Record<string, string | number>) {
  return translate(currentLocale, key, values);
}

export function getLocale() {
  return currentLocale;
}

/** Re-renders the calling component on every language switch and returns the locale. */
export function useLocale() {
  useSyncExternalStore(subscribe, getVersion);

  return currentLocale;
}

export function setLocale(locale: Locale) {
  if (locale === currentLocale || !bundles.has(locale)) return;

  localStorage.setItem(STORAGE_KEY, locale);
  apply(locale);
}
