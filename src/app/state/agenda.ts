import type { Occupation } from "../types";
import type { BuildingOpening } from "./availability";
import { DAY_END, DAY_START, fromMinutes } from "./time";

export type AgendaItem =
  | { kind: "busy"; start: string; end: string; slot: Occupation }
  | { kind: "free"; start: string; end: string }
  | { kind: "closed"; start: string; end: string };

type Gap = Exclude<AgendaItem, { kind: "busy" }>;

/** A gap between lessons split into the time the building is closed and the time it is open. */
function splitByOpening(start: string, end: string, opening: BuildingOpening | null): Gap[] {
  if (!opening) return [{ kind: "free", start, end }];

  const opens = opening.closed || start > opening.opens ? start : opening.opens;
  const closes = opening.closed || end < opening.closes ? end : opening.closes;

  if (opening.closed || opens >= closes) return [{ kind: "closed", start, end }];

  const parts: Gap[] = [{ kind: "free", start: opens, end: closes }];

  if (start < opens) parts.unshift({ kind: "closed", start, end: opens });

  if (closes < end) parts.push({ kind: "closed", start: closes, end });

  return parts;
}

/**
 * The day from DAY_START to DAY_END as alternating busy, free and closed
 * intervals. Booked lessons are always shown; only the gaps between them are
 * cut to the building's opening hours (`null`: hours unknown, all gaps are free).
 */
export function buildAgenda(occupancy: Occupation[], opening: BuildingOpening | null) {
  const items: AgendaItem[] = [];
  let cursor = fromMinutes(DAY_START);

  const sorted = occupancy
    .filter((slot) => slot.inizio && slot.fine && slot.fine > slot.inizio)
    .sort((a, b) => a.inizio.localeCompare(b.inizio));

  for (const slot of sorted) {
    if (slot.inizio > cursor) items.push(...splitByOpening(cursor, slot.inizio, opening));

    items.push({ kind: "busy", start: slot.inizio, end: slot.fine, slot });

    if (slot.fine > cursor) cursor = slot.fine;
  }

  if (cursor < fromMinutes(DAY_END))
    items.push(...splitByOpening(cursor, fromMinutes(DAY_END), opening));

  return items;
}
