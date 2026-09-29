// Query matching and ranking for the search (classroom-search-data.ts). Pure
// functions over strings, no data loading.
//
// Every query token is expanded, once, into the vocabulary words it could be a
// typo of: all distinct words across the rooms, buildings and lessons,
// compared accent-insensitively with an edit distance that counts a swap of
// two adjacent letters as one edit ("anlaisi" -> "analisi"). The corrections
// are then matched as plain substrings, exactly like the typed token, so the
// filters stay substring-based; fuzzy hits just score lower than exact ones
// (see scoreMatch).

/** Separators ignored when matching room names, so "T11" finds "T.1.1". */
export const ROOM_NAME_SEPARATORS = /[\s._\-/]+/g;

/** Lowercases `name` and drops its separators — "T.1.1" and "t 1-1" both become "t11". */
export function compactName(name: string): string {
  return name.toLowerCase().replace(ROOM_NAME_SEPARATORS, "");
}

/**
 * Splits a query into lowercase words, order-independent — "rossi analisi"
 * and "analisi rossi" tokenize the same.
 */
export function tokenize(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function foldAccents(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

// Edits allowed for a token of this (accent-folded) length. None for a word
// that exists as typed: "rossi" is a name, not a typo of "rossa". A 3-letter
// token gets one only when it matches nothing as typed: one edit on 3 letters
// reaches half the vocabulary, so it can't be the norm.
function maxTypos(length: number, hasExact: boolean, isWord: boolean) {
  if (length < 3 || isWord) return 0;

  if (length === 3) return hasExact ? 0 : 1;

  if (length < 7) return 1;

  return 2;
}

/**
 * Optimal-string-alignment distance between `a` and `b` (or, with `prefix`,
 * between `a` and the closest prefix of `b`, for a half-typed last word).
 * Returns Infinity as soon as it's certain to exceed `max`.
 */
export function editDistance(a: string, b: string, max: number, prefix = false): number {
  const m = a.length;
  const n = b.length;

  if (!prefix && Math.abs(m - n) > max) return Infinity;

  let prev2: number[] | null = null;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);

  for (let i = 1; i <= m; i++) {
    const cur = [i];
    let rowMin = i;

    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);

      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, prev2[j - 2] + 1);

      cur.push(d);

      if (d < rowMin) rowMin = d;
    }

    if (rowMin > max) return Infinity;

    prev2 = prev;
    prev = cur;
  }

  return prefix ? Math.min(...prev) : prev[n];
}

export interface TokenVariant {
  text: string;
  typos: number;
}

/** A query token and what it may match, best first: itself, then corrections. */
export interface ExpandedToken {
  raw: string;
  variants: TokenVariant[];
}

export interface VocabWord {
  word: string;
  folded: string;
}

/** Distinct lowercase words (letters only, 3+ chars) across `texts`. */
export function buildVocab(texts: Iterable<string | null | undefined>): VocabWord[] {
  const words = new Set<string>();

  for (const text of texts)
    for (const word of String(text ?? "")
      .toLowerCase()
      .split(/[^\p{L}]+/u))
      if (word.length >= 3) words.add(word);

  return [...words].map((word) => ({ word, folded: foldAccents(word) }));
}

// Caps how many corrections one token can pull in, closest first, so a vague
// token can't flood the results.
const MAX_CORRECTIONS = 12;

/**
 * Turns a query token into what it may match. Tokens with digits (codes, room
 * numbers) are never corrected: 61182 -> 61183 is a different course, not a
 * typo. `isLast`: the word may still be half-typed.
 */
export function expandToken(token: string, isLast: boolean, vocab: VocabWord[]): ExpandedToken {
  const variants: TokenVariant[] = [{ text: token, typos: 0 }];

  // Codes are stored as numbers, so a leading zero the user typed
  // ("061182") is gone from the data ("61182").
  const unpadded = token.replace(/^0+/, "");

  if (unpadded && unpadded !== token) variants.push({ text: unpadded, typos: 0 });

  if (/\d/.test(token)) return { raw: token, variants };

  const folded = foldAccents(token);
  const hasExact = vocab.some(({ word }) => word.includes(token));
  const isWord = vocab.some(({ word }) => word === token);
  const max = maxTypos(folded.length, hasExact, isWord);

  // A half-typed last word is also compared against word prefixes, but only
  // when it matches nothing as typed (otherwise "rossi" drags in
  // "possibile"), and only with words sharing its first letter, which people
  // rarely mistype.
  const prefix = isLast && !hasExact;
  const corrections: TokenVariant[] = [];

  for (const { word, folded: foldedWord } of vocab) {
    if (word.includes(token)) continue; // already matched as typed

    // Accents alone ("universita" -> "università") count as exact.
    if (foldedWord.includes(folded)) {
      corrections.push({ text: word, typos: 0 });
      continue;
    }

    if (!max) continue;

    const d = editDistance(folded, foldedWord, max, prefix && foldedWord[0] === folded[0]);

    if (d <= max) corrections.push({ text: word, typos: d });
  }

  corrections.sort((a, b) => a.typos - b.typos || a.text.length - b.text.length);
  variants.push(...corrections.slice(0, MAX_CORRECTIONS));

  return { raw: token, variants };
}

/** The best variant of `token` found in `field` (lowercase), or null. */
export function fieldHasToken(field: string, token: ExpandedToken) {
  return token.variants.find((variant) => field.includes(variant.text)) ?? null;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Compiled once per term: the same few repeat across every field of every result.
const wordStartPatterns = new Map<string, RegExp>();

function isWordStart(field: string, term: string) {
  let pattern = wordStartPatterns.get(term);

  if (!pattern) {
    pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}`, "iu");
    wordStartPatterns.set(term, pattern);
  }

  return pattern.test(field);
}

// Separators (dots, dashes…) count as spaces, so "t 2 1" reads like "T.2.1".
function phrase(text: string) {
  return text.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

/**
 * How well `tokens` match `fields` (the first is the primary one, e.g. the
 * room or course name), 0 for no match. Every token must be found in some
 * field. `compactPrimary` also accepts the whole query inside the primary
 * field with separators stripped from both ("T11" -> "T.1.1").
 */
export function scoreMatch(
  fields: (string | null | undefined)[],
  tokens: ExpandedToken[],
  { compactPrimary = false } = {},
) {
  const values = fields.flatMap((field) => (field ? [field.toLowerCase()] : []));

  if (!tokens.length || !values.length) return 0;

  const [primary, ...secondary] = values;

  const allTokensHit = tokens.every(
    (token) => fieldHasToken(primary, token) || secondary.some((f) => fieldHasToken(f, token)),
  );

  if (!allTokensHit) {
    if (!compactPrimary) return 0;

    const query = compactName(tokens.map((token) => token.raw).join(""));
    const name = compactName(primary);

    if (!query || !name.includes(query)) return 0;

    return name === query ? 100 : name.startsWith(query) ? 60 : 30;
  }

  // Tokens match in any order, but typing them in the name's own order wins:
  // "t 2 1" ranks T.2.1 above T.1.2.
  const query = phrase(tokens.map((token) => token.raw).join(" "));
  const primaryPhrase = phrase(primary);
  let score = 0;

  if (primaryPhrase === query) score += 100;
  else if (primaryPhrase.startsWith(query)) score += 60;
  else if (` ${primaryPhrase} `.includes(` ${query} `)) score += 40;

  // A corrected token scores one step lower per typo, so an exact match
  // always outranks the same match through a typo.
  for (const token of tokens) {
    const primaryHit = fieldHasToken(primary, token);

    if (primaryHit) {
      score += (isWordStart(primary, primaryHit.text) ? 20 : 8) - primaryHit.typos * 6;
      continue;
    }

    for (const field of secondary) {
      const hit = fieldHasToken(field, token);

      if (hit) {
        score += Math.max(1, (isWordStart(field, hit.text) ? 6 : 2) - hit.typos * 2);
        break;
      }
    }
  }

  return Math.max(1, score);
}
