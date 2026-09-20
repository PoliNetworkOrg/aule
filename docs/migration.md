# Migration notes

## Source and scope

The source is the existing local clone at `/home/ubuntu/dev/PoliAule`, fetched from `origin/dev` and exported at `9b1b476172bcded479611588eeccce069aef187d`. The clone's working tree and checked-out branch were left unchanged. Upstream has no application test suite to port; no application tests or test dependencies were added.

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

Run worker checks independently:

```sh
pnpm --dir workers/api install --frozen-lockfile
pnpm --dir workers/api run typecheck
pnpm --dir workers/cron install --frozen-lockfile
pnpm --dir workers/cron run typecheck
```
