// One-time discoverability hint under the header title ("Tap here to find out
// more"). Shows once, after a random delay, and never again once seen.
import { createPopover, type Popover } from "vitrium";
import { t } from "../i18n.ts";

const SEEN_KEY = "poliAule_infoHintSeen";

const MIN_DELAY_MS = 25_000;

const MAX_DELAY_MS = 60_000;

const store = {
  get: () => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  },
  set: () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // private mode
    }
  },
};

export function initInfoHint(): () => void {
  const trigger = document.getElementById("info-trigger");

  if (store.get() || !trigger) return () => {};

  let pop: Popover | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyTimer: ReturnType<typeof setTimeout> | undefined;

  const observer = new MutationObserver(() => {
    if (document.body.classList.contains("info-open")) dismiss();
  });

  function dismiss() {
    clearTimeout(timer);
    store.set();
    observer.disconnect();

    if (!pop) return;
    const p = pop;
    pop = null;
    p.hide();
    destroyTimer = setTimeout(() => p.destroy(), 500); // let the close animation finish
  }

  function show() {
    if (!trigger) return;

    if (document.hidden) {
      timer = setTimeout(show, 10_000);

      return;
    }

    const content = document.createElement("div");
    content.className = "info-hint";
    const text = document.createElement("span");
    text.className = "info-hint-text";
    text.textContent = t("infoHint.text");
    const close = document.createElement("button");
    close.className = "info-hint-close";
    close.type = "button";
    close.setAttribute("aria-label", t("infoHint.dismiss"));
    const icon = document.createElement("i");
    icon.className = "hgi-stroke hgi-cancel-01";
    icon.setAttribute("aria-hidden", "true");
    close.append(icon);
    close.addEventListener("click", dismiss);
    content.append(text, close);

    // Driven by hand (no `trigger`): the title button opens the info page, not
    // this. Not dismissable by a stray press, only by ✕ or opening the page.
    pop = createPopover({
      content,
      placement: "bottom-start",
      offset: -8,
      dismissable: false,
      role: "status",
    });
    pop.show(trigger);
    store.set();
  }

  // Opening the info page by any route (tap, hash, shortcut) means the user
  // found it: dismiss the hint, or cancel it if it hasn't appeared yet.
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });

  if (document.body.classList.contains("info-open")) {
    dismiss();
  } else {
    timer = setTimeout(show, MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  }

  return () => {
    clearTimeout(timer);
    clearTimeout(destroyTimer);
    observer.disconnect();
    pop?.destroy();
    pop = null;
  };
}
