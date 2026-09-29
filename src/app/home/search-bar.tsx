import { useEffect, useRef, useState } from "react";
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
        className="search__field"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(draft);
          input.current?.blur();
        }}
      >
        <Icon name="search-01" className="search__icon" />
        <input
          ref={input}
          className="search__input"
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
            className="search__clear"
            aria-label={t("search.clear")}
            onClick={clear}
          >
            <Icon name="cancel-01" />
          </button>
        ) : (
          <kbd className="search__kbd" aria-hidden="true">
            /
          </kbd>
        )}
      </form>
    </div>
  );
}
