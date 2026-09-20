# Complete frontend migration — roadmap

The user authorized implementation of the complete conversion. The existing stack integration and request-recovery fixes are committed; they are the starting point, not the definition of completion.

1. **Typed foundations:** domain/API contracts, data calculations, preferences, localization, and animation utilities. Verify TypeScript and lint; preserve outputs and requests.
2. **React controls:** render shared cards, toggles, segmented controls, pickers, popovers, and navigation with React; retain typed gesture and animation functions. Verify controls and layout against the source.
3. **React views:** availability/building results, search, favourites, classroom detail/schedules, info, settings, and campus map/sheet. Preserve routes, storage and loading/error states; verify each slice.
4. **React startup and final gate:** remove legacy application bootstrap and unchecked JavaScript, enable TypeScript-only compilation, run production/beta builds and full lint, repeat desktop/mobile parity and failure-recovery checks, and commit the completed migration.

Each item depends on the preceding contracts and is complete only after its implementation and verification. Update progress here at verified checkpoints; do not mark the migration complete while legacy modules remain.
