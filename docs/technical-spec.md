# Complete frontend migration — technical approach

Keep the installed stack and existing CSS. Use domain types for directory data, occupancy, search results, API responses, preferences, and animation geometry. Convert utility/data modules first so their contracts propagate into the UI. Do not replace type errors with `any`, `@ts-nocheck`, or disabled strict checks.

React owns view/control markup and lifecycle. Preserve existing DOM classes, attributes, shadow styling where needed, animation calculations, native events, and view-transition timing. Use refs and effects for measurement, pointer capture, Mapbox, and animation work; release listeners, observers, and animation subscriptions at their owning lifecycle boundary. Avoid competing React and imperative ownership of the same rendered children.

Keep the existing hash-compatible TanStack history and file routes. Preserve the source's request policy and validated success caches while using TanStack Query; incomplete results must remain retryable. Keep partial occupancy success and optional opening-hours failures. React subscriptions to preference/locale data must update existing controls without losing their interaction state.

Convert feature slices in dependency order, leaving each verified checkpoint buildable. Remove the global legacy startup bridge only when its responsibilities have moved into React. Finally disable `allowJs`, confirm no frontend `.js` files or unchecked modules remain, and update the migration notes to describe the actual final implementation.

Verification: strict TypeScript, Oxlint including both plugins, Oxfmt, production/beta builds, then Chromium comparisons at desktop/mobile widths. Exercise home filtering, details, favourites, search, settings/localization, map navigation, direct bookmarks, back/forward, loading and recoverable failures. Preserve the existing no-new-tests constraint. Physical-device haptics and Safari behavior remain explicitly unverified unless those environments become available.

Implementation is complete. `src/Application.tsx` owns startup and route effects; `src/app/application.tsx` provides the typed initialization/disposal boundary. React renders all view/control content and translations, while measured controllers own animation styles and third-party map hosts. `allowJs` is disabled; the generated TanStack route tree retains the framework's default generated assertions. The completed checks and browser limitations are recorded in `docs/migration.md`.
