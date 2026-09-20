# Migration notes

## Source and scope

The initial migration used the existing local clone at `/home/ubuntu/dev/PoliAule`, fetched from `origin/dev` and exported at `9b1b476172bcded479611588eeccce069aef187d`. The clone's working tree and checked-out branch were left unchanged. During the completion review on 2026-09-20, that clone was unavailable on the current machine; a temporary source archive at the same revision was used for comparison, after confirming that it still matched upstream `dev`. Upstream has no application test suite to port; no application tests or test dependencies were added.

The original application modules, component styles, assets, locale files, data snapshot, Python scripts, Cloudflare workers, and data-refresh workflows are retained. The upstream license and original documentation are in `docs/upstream/`. No application feature was deliberately dropped.

## Frontend

- React renders the original shell markup in `src/AppShell.tsx`. The splash and its critical styles remain in `index.html` so first paint does not wait for React.
- The custom elements and animation-heavy controls in `src/app/` remain JavaScript, with their original DOM state, event handling, spring animations, view transitions, and browser fallbacks. Startup is invoked once after React mounts. This is an incremental React migration, not a conversion of every control into a declarative React component. New integration code is strict TypeScript; existing JavaScript is linted but does not use TypeScript's `checkJs`.
- TanStack's Vite plugin generates the route tree from `src/routes/`. File routes own matching and parameter decoding, and their React components invoke the existing view controllers. The previous hash matcher/listeners were removed. A TanStack browser-history adapter preserves `#info`, `#classroom/{id}`, `#classroom/{campus}/{name}`, the hash-free home URL, outer query strings, and browser back/forward. Available/Campus tab selection remains outside the URL, as upstream.
- All programmatic frontend data requests run through TanStack Query: occupancy dates/days, opening hours, classroom directory, locale dictionaries, map configuration, and GitHub statistics. Automatic retries, focus refresh, and reconnect refresh are disabled to preserve the source's request policy. The original partial-day success handling, optional opening-hours failure, directory/config reuse, localStorage statistics cache, and error UI are retained. Image, font, and Mapbox resource loading remains browser-managed.
- Tailwind v4 runs through its Vite plugin. The CSS-first theme maps existing color variables; equivalent layout declarations use `@apply`. Custom selectors, measurements, colors, responsive breakpoints, keyframes, shadow-root styling, and browser-specific declarations remain. There was no Tailwind v3 configuration or syntax to port. Preflight is intentionally omitted to avoid resetting the source UI.

## Lint and dependencies

`.oxlintrc.json` includes the upstream anti-slop config's `oxc/no-accumulating-spread` and every generic vendored rule documented in its README. The optional Effect rules are not applicable. `no-runtime-typeof` permits explicit type guards, avoiding a new validation dependency. Unused state was removed, statement ternaries became `if` statements, and forced layout reads are explicitly `void`. A single documented suppression retains a required snapshot of a live HTMLCollection while its children are removed.

`@shadcn/lint` runs inside the `lint` script's Oxlint invocation. `shadcn/no-unknown-classes` and `shadcn/no-raw-colors` are enabled. The original external icon classes and named styling/state markers are allowed explicitly. These rules check React/class-expression syntax; they do not inspect the original controls' HTML template strings. No ESLint or Prettier pipeline/configuration was introduced. Oxfmt checks formatting after lint.

The only retained third-party frontend runtime package beyond the requested new stack is upstream's existing `web-haptics@0.0.6`, necessary to preserve vibration behavior. Floating UI and Mapbox retain their existing CDN loading instead of adding npm dependencies. Workers keep their original dependencies and versions from their source lockfiles, imported into independent pnpm lockfiles.

## Behavior and delivery differences

No UI redesign or intentional interaction change was made. Settings/storage keys, localization, favourites, search, availability calculations, photo handling, maps, keyboard shortcuts, and valid deep links retain the source implementation.

Build delivery changes:

- Beta builds now select favicons and the API preconnect in the output directory instead of overwriting tracked source assets. `scripts/build-beta.sh` remains as a wrapper around `pnpm build:beta`.
- CSS optimisation/minification is disabled both in Vite and the Tailwind plugin. The source explicitly works around Lightning CSS dropping unprefixed `backdrop-filter` declarations. Disabling both optimizers preserves those declarations without adding another minifier dependency. CSS and the public icon stylesheet may be larger; this does not intentionally change styling.
- The new React/Router/Query runtime changes bundle sizes. Deferred stylesheet loading, critical splash styles, fonts, and public asset paths are preserved.
- HTTP failures in the classroom-directory request are now rejected at the Query fetch boundary instead of parsing a non-success response as directory data; the existing splash error is still used.

An existing startup race is retained: if the classroom directory arrives after occupancy, the initial auto-search can run before campus/time controls are ready and show “No results” until another filter change triggers a search. Delaying the directory response reproduced the same behavior in both upstream and migrated apps; it was not silently changed during this parity migration.

The workers and scheduled data-refresh workflows have been carried over, not deployed. They still require the original Cloudflare resources, credentials, GitHub repository configuration, and secrets. The app still depends on its hosted APIs/CDNs and has no service worker or offline support. Browser-specific touch/haptics and Safari transition behavior retain upstream code, but were not verified on physical devices.

## Validation

- `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm build:beta`, and `pnpm lint`.
- TypeScript checks in both independently installed Cloudflare workers.
- Temporary lint probes confirmed both the shadcn class rule and anti-slop rules reject violations; probes were removed.
- Chromium checks against the original `dev` app at desktop (1440×1000) and mobile (390×844): availability results, classroom details, favourites, info/back navigation, search, and settings. Both versions produced matching route URLs, stored favourites, and search results, without page errors. Screenshots and computed styles were compared.
- Production-preview checks for numeric and named classroom bookmarks, info links, outer query preservation, direct-link close, language/24-hour preferences, and Campus map rendering.
- Beta output favicons and API preconnect were checked against upstream beta assets, and stable source assets remained unchanged. Built CSS was checked for both prefixed and unprefixed blur declarations.

### Completion review

Fresh installation, production and beta builds, lint/format checks, and both worker typechecks passed on the continuation machine. Temporary lint probes confirmed that anti-slop rejects unknown type aliases and shadcn rejects unknown classes and raw Tailwind palette colors. The probes were removed. Public assets, translations, and the classroom snapshot match upstream byte-for-byte.

Chromium comparisons against upstream at 1440×1000 and 390×844 matched the sampled layout dimensions, fonts, colors, classroom URLs, favourite state, info/back navigation, and outer query preservation, with no page errors. Malformed classroom bookmarks also retained upstream's home view behavior. Physical-device haptics and Safari-specific transitions remain unverified.

The review found and fixed two migration-specific cache regressions. Query freshness previously prevented the existing controllers from retrying an incomplete map configuration or partial GitHub statistics. These queries now use the default immediate staleness; the existing validated-token promise and complete statistics caches still prevent unnecessary requests. No automatic retries were introduced.

Reproducible browser checks used intercepted responses against both upstream and the migrated app:

1. Return HTTP 200 with `{}` from `/v1/config`, then a configuration containing a placeholder public map token. Call `getMapboxToken()` three times sequentially. The first call must reject, the second must recover, and the third must reuse the successful token: two requests total. Before the fix, the migrated app made one request and failed all three calls.
2. Make the first GitHub `/languages` response fail while the other statistics endpoints succeed, then let all endpoints succeed. Request statistics three times sequentially. The second call must recover the language data and the third must reuse the complete cache: ten endpoint requests total. Before the fix, the migrated app made five requests and never recovered the missing languages.

These checks passed after the fixes and matched upstream. They were temporary browser verification, not a new committed test suite.

Run worker checks independently:

```sh
pnpm --dir workers/api install --frozen-lockfile
pnpm --dir workers/api run typecheck
pnpm --dir workers/cron install --frozen-lockfile
pnpm --dir workers/cron run typecheck
```

### React settings checkpoint

Settings and its switches, segmented controls, stepper, warnings, and campus preferences now render in React. The popup retains the original CSS, markup classes, storage keys, native preference events, and motion calculations. The shared pill drag engine is checked TypeScript. For React controls it positions React-rendered duplicate labels; the remaining date controllers still use its original label-cloning mode. Unmounting releases the React controls' ResizeObservers, pointer listeners, timers, frame callbacks, and springs.

The existing startup controller mounts settings after translations load through a small portal host. This preserves the order in which legacy custom elements upgrade after the shell commits. Global translation updates skip React-owned text; a translation revision subscription also updates settings when a failed locale request clears the dictionary without changing the active locale. The shadcn allowlist retains two additional upstream markup markers, `settings-toggle__thumb` and `pill-active-cell`, which have no independent CSS rules.

Temporary Chromium checks compared the pinned upstream application with this checkpoint at 1440×1000 and 390×844. With glass effects set identically, sampled settings geometry, fonts, colors, labels, preference storage, switch states, warnings, and campus selections matched before and after switching to Italian. Dragging the time-format pill, arrow-key selection, swipe dismissal, Escape, desktop keyboard opening, and reopening by button matched. Unmounting and remounting the React popup produced one popup and 11 working controls. A failed Italian dictionary request followed by a successful retry preserved the source's fallback labels and recovery. No new test suite or dependencies were added.

`pnpm build`, `pnpm build:beta`, and `pnpm lint` pass for this checkpoint. The built preview also passed the locale failure/recovery check.

This checkpoint covers settings and shared control mechanics. The remaining pickers, cards, navigation, views, and startup have not yet completed the React/TypeScript conversion described in the roadmap. No feature was dropped or intentionally changed in this checkpoint. Physical-device haptics and Safari-specific transitions remain unverified.
