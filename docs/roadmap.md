# Multiple campuses at once — roadmap

Behavior: `docs/product-spec.md`. Design: `docs/technical-spec.md`. Each milestone leaves the
app building and working with a single campus.

1. **State and availability (no UI change).**
   `campusIds` in the store with `toggleCampus` / `setCampusGroup` / `applyCampuses`,
   `poliAule_campusIds` with the `poliAule_lastCampusId` fallback, boot validation.
   `buildingKey`, `BuildingAvailability.campus` + `key`, multi-campus `findAvailability`,
   `closedBuildings`, `campusClosed`, `filterImpact`. Move every reader to `campusIds` and
   building keys (building filter, `mapBuilding`, React keys, header ids), still with one
   campus selectable. Add `multi-campus.test.ts`.
   Verify: typecheck, lint, tests; browser pass with one campus showing no visible change.
2. **Selection UI.**
   `CheckList` in `popup.tsx` (shared row classes), `where-panel.tsx` toggles and group
   "Tutti", `campusSelectionLabel` used by the trigger, results summary and phone summary,
   locale strings. Verify: R1–R3, R9 in the browser (it + en, desktop + 390px).
3. **Results and filters across campuses.**
   Campus name in building headers and filter chips when several are selected; building
   filter grouped by campus. Verify: R4–R6, R8 with Leonardo + Lecco and Leonardo +
   Colombo.
4. **Map.**
   Markers across campuses, `fitBounds` for several, panel title. Verify: R7 with
   Leonardo + Colombo and Leonardo + Lecco, selected-building fly-to, campus removal
   closing the panel, light/dark.
5. **Final gate.** `pnpm build`, full lint and tests, single-campus regression pass,
   update these docs with what was verified.

Dependencies: 2–4 need 1; 3 and 4 are independent of each other; 5 needs all.
