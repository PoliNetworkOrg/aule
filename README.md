# PoliNetwork Aule

Find a free classroom at Politecnico di Milano: search rooms, buildings, courses or professors, pick a day and time, and filter by what you need. Originally based on [SummaCristian/PoliAule](https://github.com/SummaCristian/PoliAule/tree/dev), revision `9b1b476172bcded479611588eeccce069aef187d`.

Requires Node.js 22.18+ and pnpm 11.15.1.

The production site is deployed to [aule.polinetwork.org](https://aule.polinetwork.org) by GitHub Pages whenever `main` changes.

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm lint
```

`pnpm preview` serves the production build. `pnpm build:beta` uses the beta API preconnect with the same branding as the production build. `pnpm lint:fix` applies Oxlint fixes and Oxfmt formatting; `pnpm format` only formats. Build includes TypeScript checking. There is no new test suite: upstream has no application tests to port.

The frontend uses the existing hosted APIs. Production hosts use the stable backend; other hosts default to beta and expose a switch on the info page. The 3D campus map renders with MapLibre GL JS over OpenFreeMap's keyless vector tiles (no token or usage caps). Google Fonts (DM Sans), OpenFreeMap tiles and classroom photos are the only third-party requests.

## Structure

- `src/routes/` — TanStack file routes. The root layout renders the header and keeps the home mounted (hidden) under the classroom and info pages, so its inputs and scroll position survive a round trip.
- `src/app/state/` — the home store (campus, day, time window, filters, query, view), time helpers (Europe/Rome, 07:15–20:15 grid), availability queries and navigation context.
- `src/app/home/` — search bar and results, date strip, time range, filters, favourites, results list and the lazily loaded 3D campus map (MapLibre GL over OpenFreeMap).
- `src/app/classroom/` — classroom page and its schedule (day tabs, day bar, agenda of busy/free intervals).
- `src/app/info/` — about/data page; on non-production hosts it also exposes the beta-backend switch.
- `src/app/ui/` — shared UI primitives (buttons, chips, segmented controls, tags, cards, notices, popups…) as Tailwind `cva` variants.
- `src/styles.css` holds the Tailwind v4 theme — design tokens (DM Sans, slate neutrals, PoliNetwork blue, light/dark colours, px type scale, radii, breakpoints) — and the base element styles. Components style themselves with utilities; combine classes with `cn()` from `src/lib/cn.ts`. No glass effects.
- `src/app/available-rooms-script.ts` and `src/app/classroom-search-data.ts` fetch occupancy and the classroom directory and run the room/lesson search.

Lint runs Oxlint's built-in rules, the vendored [anti-slop](https://github.com/dmmulroy/anti-slop) generic rules, and [@shadcn/lint](https://github.com/shadcn-ui/lint) class/color validation, followed by Oxfmt's formatting check. Both plugins are registered and enabled in `.oxlintrc.json`; shadcn runs inside Oxlint, without ESLint or a separate CLI. The shadcn rules only accept classes Tailwind can generate from the theme. Tailwind Preflight is omitted; `src/styles.css` has its own small reset in the base layer.

`workers/api/`, `workers/cron/`, `scripts/`, and the data-refresh GitHub workflows are retained. Workers remain independently deployed Cloudflare projects with their original dependencies and secrets; the frontend build does not deploy them. Their original API and architecture documentation is archived in `docs/upstream/` and describes the pre-migration frontend.

Original application copyright and MIT license are preserved in [docs/upstream/LICENSE](docs/upstream/LICENSE).
