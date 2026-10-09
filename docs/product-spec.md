# Multiple campuses at once (issue #17)

Status: planned, not yet implemented.

The previous plan in this file (the complete frontend migration) is finished; its record is
`docs/migration.md` and the git history.

## Problem

Only one campus can be selected. Students who can use rooms on more than one campus
(Leonardo and Colombo are next to each other; so are Durando and La Masa) must switch back
and forth to compare. Issue #17 asks to select several campuses and see all their free rooms
in one results list.

## Users and flows

Anyone looking for a free room on the home screen.

1. Open "Dove" → the popup lists the campuses grouped as today (Città Studi, Bovisa,
   Altre città). Tapping a campus toggles it; the popup stays open. The header of a real
   group (Città Studi, Bovisa) has a "Tutti" toggle that selects or clears the whole group.
   The popup closes as every Popup does (outside click, Esc, close button).
2. Results, filters, the 3D map and the empty/closed states immediately cover every
   selected campus.
3. The selection is remembered for the next visit.

## Functional requirements

- **R1 Selection.** Any non-empty set of campuses can be selected, across cities. The last
  selected campus cannot be removed (its row stays ticked and does nothing; a group toggle
  that would empty the selection does nothing either).
- **R2 Group toggle.** Shown only for groups whose campuses have `group` set and that have
  at least two campuses. Pressed when every campus of the group is selected; pressing it
  then clears the group (subject to R1), otherwise selects the whole group.
- **R3 Trigger label.** One campus: as today (name, then "group · city"). Exactly one whole
  group: the group name, then the campus names ("Leonardo · Colombo"). Otherwise: the names
  joined with ", " (truncated with an ellipsis), then "{n} campus".
  The results summary subtitle and the phone controls summary use the same short label.
- **R4 Results.** One list for all selected campuses, ordered by campus (directory order),
  then building as today. With two or more campuses selected, each building header reads
  "Edificio 8 · Lecco"; with one campus it is unchanged. Counts, partial-room hints and the
  "few results" filter hints cover all selected campuses.
- **R5 Same-named buildings stay distinct.** Leonardo and Lecco both have buildings "8" and
  "9": they are separate groups, separate map markers and separate building-filter choices.
- **R6 Building filter.** Lists the buildings of every selected campus, grouped by campus
  (campus name as a small label) when two or more are selected. Removing a campus clears the
  building filter only if the chosen building belongs to it.
- **R7 Map.** Markers for every building of every selected campus. With one campus the
  camera behaves as today. With several, it focuses the first selected campus at the usual
  campus zoom. A notice at the top names the focused campus and offers "View {campus}"
  for each other selected campus; switching closes the building panel. The focused campus
  is kept while selected, falling back to the first remaining campus when removed.
  A selected building still flies to that building; its panel title follows R4.
  Removing the campus of the selected building closes the panel.
- **R8 Closed state.** "Tutto chiuso" only when every building of every selected campus is
  shut for the window.
- **R9 Persistence.** The selection persists across visits. Existing users start with the
  campus they used last (`poliAule_lastCampusId`), so nobody loses their choice.

## Edge cases

- A saved campus no longer in the directory is dropped; if none remain, the first campus is
  used (as today).
- Occupancy data missing for one selected campus on a day: the others still show.
- Search, favourites and classroom pages are already campus-independent: unchanged.

## Non-goals

- Changing the campus grouping or adding new groups.
- Campus in the URL / shareable selections (the campus isn't in the URL today).
- Fixing opening-hours resolution for same-named buildings in different campuses (see the
  technical spec, risks).

## Acceptance criteria

| Req | Criterion                                                                                                  | Verified by                     |
| --- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| R1  | Toggling campuses adds/removes them; the last one can't be removed                                         | Browser check                   |
| R2  | "Tutti" on Città Studi selects Leonardo + Colombo; again clears them unless they're all that's selected    | Browser check                   |
| R3  | Labels for one campus, one whole group, a mixed selection                                                  | Browser check, it + en          |
| R4  | Leonardo + Lecco: one list, Leonardo first, headers carry the campus name                                  | Unit test (ordering), browser   |
| R5  | Leonardo + Lecco show two "Edificio 8" groups with their own rooms and markers                             | Unit test, browser (list + map) |
| R6  | Building filter on Lecco's "8" shows only Lecco rooms; removing Lecco clears it, removing Leonardo doesn't | Unit test, browser              |
| R7  | Leonardo + Mantova: focus one campus, switch from the top notice, markers for both                         | Browser (map)                   |
| R8  | Closed only when all selected campuses are closed                                                          | Unit test                       |
| R9  | Reload keeps the selection; a user with only `poliAule_lastCampusId` starts with that campus               | Unit test, browser              |
