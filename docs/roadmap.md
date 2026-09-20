# Complete frontend migration — roadmap

The user authorized implementation of the complete conversion. The existing stack integration and request-recovery fixes are committed; they are the starting point, not the definition of completion.

1. **Typed foundations:** domain/API contracts, data calculations, preferences, localization, and animation utilities. Verify TypeScript and lint; preserve outputs and requests.
2. **React controls:** render shared cards, toggles, segmented controls, pickers, popovers, and navigation with React; retain typed gesture and animation functions. Verify controls and layout against the source.
3. **React views:** availability/building results, search, favourites, classroom detail/schedules, info, settings, and campus map/sheet. Preserve routes, storage and loading/error states; verify each slice.
4. **React startup and final gate:** remove legacy application bootstrap and unchecked JavaScript, enable TypeScript-only compilation, run production/beta builds and full lint, repeat desktop/mobile parity and failure-recovery checks, and commit the completed migration.

Each item depends on the preceding contracts and is complete only after its implementation and verification. Update progress here at verified checkpoints; do not mark the migration complete while legacy modules remain.

## Verified progress

- `fe03016` completed the typed data and animation foundations.
- Settings now renders through a React portal, including switches, segmented controls, the interval stepper, warnings, and campus preferences. The shared pill drag engine and settings motion controller are checked TypeScript. React owns the control markup and translated text; effects release observers, listeners, timers, and springs when the popup unmounts.
- The settings slice preserves the source's storage keys, defaults, native events, popup geometry, and gesture calculations. Desktop/mobile comparisons and keyboard, drag, dismiss, remount, and locale failure/recovery checks accompany this checkpoint.

Step 2 remains in progress. Date/time/campus pickers, cards, popovers, and bottom navigation still need React conversion. Other views and startup also remain on the legacy controllers. There are 24 frontend JavaScript modules left; `allowJs` remains enabled until they are converted. The complete frontend migration is not finished.
