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
   Markers across campuses, focus one campus with a top notice to switch to the others,
   panel title. Verify: R7 with Leonardo + Colombo and Leonardo + Mantova, switching
   campus closes the panel, selected-building fly-to, campus removal closing the panel
   and falling back to a remaining campus, light/dark.
5. **Final gate.** `pnpm build`, full lint and tests, single-campus regression pass,
   update these docs with what was verified.

Dependencies: 2–4 need 1; 3 and 4 are independent of each other; 5 needs all.

## Map focus regression check (2026-10-11)

Verified in the browser at 1280 × 800:

1. Select Leonardo, Lecco and Mantova; open the 3D map and focus Mantova.
2. Remove Mantova: Leonardo becomes the focused campus.
3. Add Mantova again: Leonardo stays focused, without a camera jump to Mantova.
4. Switch explicitly to Lecco: Lecco becomes the focused campus.

`pnpm test` (49 tests), `pnpm build` (including typecheck) and `pnpm lint` passed.
This records the focus regression only; the full acceptance pass above is still pending.
