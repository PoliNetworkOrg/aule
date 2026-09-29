import { Fragment } from "react";
import {
  compactName,
  ROOM_NAME_SEPARATORS,
  searchCorrections,
  tokenize,
} from "../classroom-search-data";

/** Course and professor names come from the API in upper case; show them in title case. */
export function titleCase(text: string, locale: string) {
  if (text !== text.toLocaleUpperCase(locale)) return text;

  return text
    .toLocaleLowerCase(locale)
    .replace(/(^|[\s'(\-/])(\p{L})/gu, (_, before: string, letter: string) =>
      before.concat(letter.toLocaleUpperCase(locale)),
    )
    .replace(/\b(i{2,3}|iv|vi{1,3}|ix)\b/gi, (numeral) => numeral.toUpperCase());
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps every match of `query` (as a phrase, as separate words, compacted like
 * "T11", or through a typo correction) in <mark>.
 */
export function Highlight({ text, query = "" }: { text: string; query?: string }) {
  const trimmed = query.trim();

  if (!trimmed) return text;

  const phrase = escapeRegExp(trimmed).replace(/ /g, "[\\s.]");
  const words = [...tokenize(trimmed), ...searchCorrections(trimmed)].map(escapeRegExp);

  const compact = [...compactName(trimmed)]
    .map(escapeRegExp)
    .join(`(?:${ROOM_NAME_SEPARATORS.source})?`);

  const pattern = [phrase, ...words, compact]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .join("|");

  return text
    .split(new RegExp(`(${pattern})`, "gi"))
    .map((part, index) =>
      index % 2 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
    );
}
