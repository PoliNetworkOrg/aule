# Multiple campuses at once — technical approach

See `docs/product-spec.md` for the behavior (R1–R9). No new dependencies, no API or worker
changes: every day's occupancy file already contains all campuses.

## Facts the design rests on

- The home screen is driven by one store (`src/app/state/store.ts`) holding `campusId: string`.
  Readers: `where-panel.tsx`, `filters.tsx` (building filter), `results.tsx` (results,
  summary, hints, closed state), `home-page.tsx` (phone summary), `campus-map.tsx`, `boot.ts`.
- `findAvailability`, `closedBuildings`, `campusClosed` and `filterImpact`
  (`src/app/state/availability.ts`) take one campus id.
- Buildings are identified by `building.name` alone: `filters.building`, `mapBuilding`,
  React keys, map markers, `closedBuildings` and the header ids `building-${name}`.
  Names collide across campuses: "8" and "9" exist in Leonardo (MIA01) and Lecco (LCF04).
- Opening hours are stamped on each building at load time (`applyOpeningHours`), so they
  don't depend on the selected campus.
- Unit tests run with `vp test` (`src/app/state/*.test.ts`), stubbing browser globals.

## State

- `AppState.campusId: string` → `campusIds: string[]`, non-empty, kept in directory order
  (not click order) so results ordering is stable.
- Setters replace `setCampus`:
  - `toggleCampus(id)`: add, or remove unless it is the last one.
  - `setCampusGroup(ids, selected)`: add or remove all; a removal that would empty the
    selection is ignored.
  - Both go through one internal `applyCampuses(next)`: sort by directory order, persist,
    and clear `filters.building` / `mapBuilding` only when their campus left the selection.
- Storage: new key `poliAule_campusIds` (JSON array). `readInitialCampuses()` reads it; if
  missing or invalid, falls back to the existing `readInitialCampus()` chain
  (`poliAule_lastCampusId`, the old preferred-campus migration, `"MIA01"`) as `[id]`.
  Writes also store the first id in `poliAule_lastCampusId`, so a rollback still opens on a
  selected campus.
- `boot.ts`: drop ids not in `campuses()`; if none remain, use `[campuses()[0].id]`.
- Sorting needs the directory, which loads after the store is created: `applyCampuses`
  sorts with `campuses()`; the boot validation also sorts once the directory is ready.

## Building identity

- `buildingKey(campusId, name)` → `"MIA01/8"` (exported from `availability.ts`).
- `BuildingAvailability` gains `campus: Campus` (the directory campus) and `key: string`.
- `filters.building` and `mapBuilding` hold a building key instead of a name. Neither is
  persisted today, so there is no stored value to migrate.
- `closedBuildings(campusIds, …)` returns a `Set` of keys.
- Header ids become `building-${key}` with `/` replaced (ids must stay valid for
  `aria-labelledby`; use a `domId(key)` helper mapping non-alphanumerics to `-`).

## Availability

- `findAvailability(campusIds: string[], …)`: for each id in order, the existing per-campus
  loop; results concatenated. Building filter compares keys.
- `campusClosed(campusIds, …)`: true when the union of buildings is non-empty and all are
  shut.
- `filterImpact(campusIds, …)`: unchanged logic over the new `findAvailability`.

## UI

- `popup.tsx`: add `CheckList` next to `OptionList`, reusing its row classes (extract them
  to a shared constant rather than duplicating). Props: `groups`, `values: string[]`,
  `onToggle(value)`, optional per-group `onToggleAll` + `allSelected` for the "Tutti" chip,
  and `locked: string | null` (the last remaining value) rendered `aria-disabled`. Rows are
  `aria-pressed` buttons, matching `OptionList` and the rest of the app.
- `where-panel.tsx`: uses `CheckList`; popup no longer closes on select. Builds the trigger
  label with a shared `campusSelectionLabel(campusIds)` (in `availability.ts` or a small
  `campus-label.ts`) that returns `{ title, subtitle }` per R3; `results.tsx` Summary and
  `home-page.tsx` ControlsSummary use its `title`.
- `results.tsx`: `BuildingGroup` header appends `· {campus.name}` when
  `campusIds.length > 1`; keys use `group.key`. Summary/hints/closed state pass `campusIds`.
- `filters.tsx`: building choices from all selected campuses; values are keys; with several
  campuses, a small campus label precedes each campus's buttons. "Edificio 8 · Lecco" is the
  active-filter chip text (`results.tsx` hint chips too).
- `campus-map.tsx`: markers over all selected campuses' buildings, matched to results by
  key. Camera effect: selected building → `flyTo` (unchanged); one campus → `flyTo` campus
  (unchanged); several → focus one campus at `CAMPUS_ZOOM`, honouring `reduceMotion`.
  A top notice names the focused campus and offers a button for each other selected campus.
  Local map state keeps the focused campus while selected; removing it falls back to the
  first remaining campus. Switching campus clears `mapBuilding`; closing a building panel
  keeps its campus in focus. Campuses without centre coordinates use a building coordinate.
  Initial centre: the first campus with coordinates. Building panel title follows R4.
- Locales (`public/locales/it.json`, `en.json`): `campus.choose` becomes "Scegli i campus" /
  "Choose campuses"; add `campus.selectAll` ("Tutti" / "All") and `campus.count`
  ("{n} campus" / "{n} campuses").

## Rejected alternatives

- Keeping `campusId` and adding `extraCampusIds`: two sources of truth for every reader.
- Prefixing building names only on collision: identity would depend on the selection.
- Nested sticky campus sections in the list: rejected by product (R4).

## Risks

- Opening hours are resolved by building number alone (`buildingHoursKey`), so Lecco "8"
  and Leonardo "8" share an explicit entry if one exists. Pre-existing, unchanged here;
  noted for a follow-up.
- With many selected campuses, verify the top map notice scrolls horizontally on phones without covering
  the map controls.
- Every reader of `campusId` must move; TypeScript will flag them once the field is renamed.

## Verification

- Unit tests (`src/app/state/multi-campus.test.ts`, same stubbing as
  `closed-buildings.test.ts`): ordering across campuses, two "8" groups with distinct keys,
  building-key filter, `campusClosed` over several campuses, `filterImpact` over several,
  `readInitialCampuses` fallback from `poliAule_lastCampusId` and invalid JSON.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- Chromium at desktop and 390px, light and dark: the R1–R9 browser checks in the product
  spec, plus a single-campus regression pass (labels, headers, map camera unchanged).
