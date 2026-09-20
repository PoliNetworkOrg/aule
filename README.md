# PoliAule

PoliAule's `dev` application migrated to Vite+, React, TypeScript, Tailwind CSS v4, TanStack Router, and TanStack Query. Source: [SummaCristian/PoliAule](https://github.com/SummaCristian/PoliAule/tree/dev), revision `9b1b476172bcded479611588eeccce069aef187d`.

Requires Node.js 22.18+ and pnpm 11.15.1.

The production site is deployed to [aule.polinetwork.org](https://aule.polinetwork.org) by GitHub Pages whenever `main` changes. The custom-domain DNS record can be reapplied from the **Configure GitHub Pages domain** workflow.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm lint
```

`pnpm preview` serves the production build. `pnpm build:beta` builds with the original beta favicons and API preconnect. `pnpm lint:fix` applies Oxlint fixes and Oxfmt formatting; `pnpm format` only formats. Build includes TypeScript checking. There is no new test suite: upstream has no application tests to port.

The frontend uses the existing hosted APIs. As upstream, `poliaule.com` uses the stable backend; other hosts default to beta and expose the backend setting. The Campus map gets its public Mapbox token from `/v1/config`. Google Fonts, Floating UI's CDN module, Mapbox resources, GitHub statistics, and classroom photos retain their upstream network requirements.

The React shell, application lifecycle, and file routes live in `src/`. All views and controls render in React with strict TypeScript; `allowJs` is disabled. Typed controllers in `src/app/` retain the original gestures, measurements, transitions, and Mapbox integration, and release their resources on unmount. The completed slices are recorded in [the roadmap](docs/roadmap.md). Their layout uses Tailwind v4 `@apply` with CSS-first theme tokens; custom animation and browser-specific CSS are preserved. See [migration details](docs/migration.md) for scope, compatibility, and validation.

Lint runs Oxlint's built-in rules, the vendored [anti-slop](https://github.com/dmmulroy/anti-slop) generic rules, and [@shadcn/lint](https://github.com/shadcn-ui/lint) class/color validation, followed by Oxfmt's formatting check. Both plugins are registered and enabled in `.oxlintrc.json`; shadcn runs inside Oxlint, without ESLint or a separate CLI. Tailwind Preflight is omitted to preserve the original controls' reset and appearance.

`workers/api/`, `workers/cron/`, `scripts/`, and the data-refresh GitHub workflows are retained. Workers remain independently deployed Cloudflare projects with their original dependencies and secrets; the frontend build does not deploy them. Their original API and architecture documentation is archived in `docs/upstream/` and describes the pre-migration frontend.

Original application copyright and MIT license are preserved in [docs/upstream/LICENSE](docs/upstream/LICENSE).
