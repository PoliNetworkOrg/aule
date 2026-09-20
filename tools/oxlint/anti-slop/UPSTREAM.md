# Vendored anti-slop

Source: https://github.com/dmmulroy/anti-slop
Revision: c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b
Retrieved: 2026-09-20

Copied production `src/` and the root MIT license. Upstream test files and the optional Effect plugin are omitted. Generic rule implementation files are unchanged; the spacing rule's ESLint Stylistic license and provenance remain in `vendor/eslint-stylistic/`.

The upstream `.oxlintrc.json` enables `oxc/no-accumulating-spread`. The root configuration retains it and enables every generic plugin rule documented in the upstream README. `no-runtime-typeof` permits explicit type guards because this application has no schema dependency. Generated route code and this vendored implementation are excluded from lint and formatting.

Oxlint and `@oxlint/plugins` are pinned together at 1.83.0. No Effect dependency or rules are enabled.
