import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { t, useLocale } from "../i18n";
import { setQuery, useStore } from "../state/store";
import { Icon } from "../ui/icon";

function isTypingTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

export function SearchBar() {
  useLocale();
  const query = useStore((state) => state.query);
  const input = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(query);
  const [syncedQuery, setSyncedQuery] = useState(query);

  // Follow the store when something else sets the query (e.g. a professor chip).
  if (query !== syncedQuery) {
    setSyncedQuery(query);
    setDraft(query);
  }

  // Debounce typing into the store; the result lists are cheap but not free.
  useEffect(() => {
    if (draft === query) return;

    const timer = window.setTimeout(() => setQuery(draft), 150);

    return () => window.clearTimeout(timer);
  }, [draft, query]);

  // "/" or Ctrl/Cmd+K jumps to the search field from anywhere on the page.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      // The home stays mounted under other pages; only react while it's shown.
      if (!input.current?.offsetParent) return;

      const shortcut =
        (event.key === "/" && !isTypingTarget(event.target)) ||
        (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey));

      if (!shortcut) return;

      event.preventDefault();
      input.current?.focus();
      input.current?.select();
    }

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function clear() {
    setDraft("");
    setQuery("");
    input.current?.focus();
  }

  return (
    <div>
      <form
        className="relative flex items-center"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
          input.current?.blur();
        }}
      >
        <Icon
          name="search-01"
          className="pointer-events-none absolute left-3.5 text-20 text-accent"
        />
        <input
          ref={input}
          className={cn(
            // Phones and tablets: as compact as the controls summary below it.
            "h-10 w-full appearance-none rounded-lg border-[1.5px] border-border-strong bg-surface lg:h-13.5",
            "text-16 text-ellipsis lg:text-17 placeholder:text-subtle placeholder:text-ellipsis",
            // Room on the right only for the clear button or the "/" hint (fine pointers).
            "py-0 pr-4 pl-11.5 not-placeholder-shown:pr-12 pointer-fine:pr-12",
            "transition-[border-color,box-shadow] hover:border-accent-soft-border",
            "focus:border-accent focus:shadow-[0_0_0_4px_var(--color-focus-ring)] focus:[outline:none]",
            "[&::-webkit-search-cancel-button]:appearance-none",
          )}
          type="search"
          value={draft}
          placeholder={t("search.placeholder")}
          aria-label={t("search.label")}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (draft) clear();
              else input.current?.blur();
            }
          }}
        />
        {draft ? (
          <button
            type="button"
            className="absolute right-1.5 grid size-9 place-items-center rounded-md text-muted hover:bg-surface-muted"
            aria-label={t("search.clear")}
            onClick={clear}
          >
            <Icon name="cancel-01" />
          </button>
        ) : (
          <kbd
            className="absolute right-3 hidden h-6 min-w-6 place-items-center rounded-sm border border-border text-13 text-subtle [font-family:inherit] pointer-fine:grid"
            aria-hidden="true"
          >
            /
          </kbd>
        )}
      </form>
    </div>
  );
}
