// Helpers for safely injecting external data into the DOM (the imperative
// search-results renderer builds HTML strings) and for highlighting the part
// of a name/title that matched a search query — shared between that renderer
// and the React `Highlight` component used by classroom cards elsewhere.

const ROOM_NAME_SEPARATORS = /[\s._\-/]+/g;

const HTML_ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ['"', "&quot;"],
  ["'", "&#39;"],
]);

export function escapeHtml(str: string) {
  return String(str).replace(/[&<>"']/g, (c) => HTML_ESCAPES.get(c)!);
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenizeQuery(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function identity(s: string) {
  return s;
}

// Builds the highlight regex against either raw text (React's <Highlight>,
// which lets JSX handle escaping) or HTML-escaped text (the imperative
// innerHTML-based search rows) depending on `escape`. Matches the full typed
// phrase, its individual words, the separator-less form (so "T11" highlights
// "T.1.1"), and any typo-corrected terms — longest alternative first so a
// full-phrase match wins over its own tokens in the alternation.
function highlightPattern(query: string, extraTerms: string[], escape: (s: string) => string) {
  if (!query) return null;

  const fullPattern = escapeRegExp(escape(query)).replace(/ /g, "[\\s.]");
  const tokenPatterns = tokenizeQuery(query).map((tok) => escapeRegExp(escape(tok)));
  const compactChars = [...query.toLowerCase().replace(ROOM_NAME_SEPARATORS, "")];

  const compactPattern = compactChars
    .map((ch) => escapeRegExp(escape(ch)))
    .join(`(?:${ROOM_NAME_SEPARATORS.source})?`);

  const extraPatterns = extraTerms.map((term) => escapeRegExp(escape(term)));

  const pieces = [fullPattern, ...tokenPatterns, compactPattern, ...extraPatterns]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);

  return pieces.length ? new RegExp(`(${pieces.join("|")})`, "gi") : null;
}

// For the React <Highlight> component: a regex to split raw (unescaped) text on.
export function highlightRegExp(query: string, extraTerms: string[] = []) {
  return highlightPattern(query, extraTerms, identity);
}

// Escapes `text` and wraps every match in <mark>, for HTML strings assigned to
// innerHTML (the search overlay's row builders). Returns plain escaped HTML
// when query is empty.
export function highlight(text: string, query: string, extraTerms: string[] = []) {
  const safe = escapeHtml(text);
  const pattern = highlightPattern(query, extraTerms, escapeHtml);

  return pattern ? safe.replace(pattern, "<mark>$1</mark>") : safe;
}

// External links retain the source HTTPS-only policy; React escapes their text.
export function safeUrl(url: string) {
  try {
    return new URL(url).protocol === "https:" ? url : "#";
  } catch {
    return "#";
  }
}
