# Complete frontend migration

Status: implementation authorized.

The existing Vite+ integration still executes forty JavaScript modules. Complete their conversion to checked TypeScript and React-owned UI without changing the source application's visible behavior.

The reference is PoliAule `dev` at `9b1b476172bcded479611588eeccce069aef187d`. Preserve availability filtering, campus/building browsing and maps, classroom details and schedules, search, favourites, settings, localization, keyboard shortcuts, splash/error states, deep links, and animations. Preserve existing storage keys, API contracts, breakpoints, and static assets.

Completion requires no unchecked application JavaScript, React components for application views and controls, file-based TanStack routes, TanStack Query for data requests, and clean `pnpm build` and `pnpm lint`. Animation math and imperative integrations with browser APIs may remain ordinary typed functions; they must have explicit ownership and preserve the original interactions.

No redesign, additional product features, dependency additions, new test suite, deployment, push, or PR creation. Existing third-party runtime integrations remain. Commit verified implementation milestones as requested. Browser verification uses the source app as the comparison rather than introducing application tests.
