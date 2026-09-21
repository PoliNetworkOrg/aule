import { fetchJson } from "../lib/query";
// i18n.ts — lightweight localization module

const SUPPORTED = ["en", "it"];

const STORAGE_KEY = "poliAule_locale";

let translations: Record<string, string> = {};

let currentLocale = "en";

let translationVersion = 0;

const switchCallbacks: ((lang: string) => void)[] = [];

const translationListeners = new Set<() => void>();

export function onTranslationChange(listener: () => void) {
  translationListeners.add(listener);

  return () => {
    translationListeners.delete(listener);
  };
}

function notifyTranslations() {
  translationVersion++;
  translationListeners.forEach((listener) => listener());
}

export async function initI18n() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const detected = navigator.language.slice(0, 2).toLowerCase();
  currentLocale =
    saved !== null && SUPPORTED.includes(saved)
      ? saved
      : SUPPORTED.includes(detected)
        ? detected
        : "en";
  await loadLocale(currentLocale);
  notifyTranslations();
}

// Returns whether the load succeeded. On failure, deliberately leaves
// `translations`/`currentLocale` untouched — the previous (working) locale
// keeps rendering instead of every string falling back to its raw key.
async function loadLocale(lang: string): Promise<boolean> {
  try {
    translations = await fetchJson<Record<string, string>>(`/locales/${lang}.json`);
    currentLocale = lang;
    document.documentElement.lang = lang;

    return true;
  } catch (e) {
    console.warn(`i18n: failed to load locale "${lang}"`, e);

    return false;
  }
}

// Synchronous key lookup — call only after initI18n() resolves.
// Falls back to the key name itself so missing strings are visible.
export function t(key: string) {
  return translations[key] ?? key;
}

export function animateI18nElement(el: HTMLElement) {
  el.classList.remove("i18n-animate");
  void el.offsetWidth; // force reflow — restarts animation on repeated switches
  el.classList.add("i18n-animate");
}

export function getTranslationVersion() {
  return translationVersion;
}

export function getLocale() {
  return currentLocale;
}

// Register a callback to be invoked after every locale switch.
// Measured view controllers rebuild their React content after a locale change.
export function onLanguageSwitch(cb: (lang: string) => void) {
  switchCallbacks.push(cb);

  return () => {
    const index = switchCallbacks.indexOf(cb);

    if (index >= 0) switchCallbacks.splice(index, 1);
  };
}

// Returns whether the switch actually happened, so callers that optimistically
// moved a UI control (see settings.tsx's changeLanguage) can put it back when
// the locale couldn't be loaded.
export async function setLocale(lang: string): Promise<boolean> {
  if (!SUPPORTED.includes(lang)) return false;

  if (lang === currentLocale) return true;
  // Only persist/notify on success — a failed fetch shouldn't both wipe the
  // working translations *and* commit the broken language as the user's
  // saved preference (which initI18n() would then retry on every load).
  const ok = await loadLocale(lang);

  if (!ok) return false;
  localStorage.setItem(STORAGE_KEY, lang);
  notifyTranslations();
  switchCallbacks.forEach((cb) => cb(lang));

  return true;
}
