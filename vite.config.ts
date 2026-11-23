import { fileURLToPath } from "node:url";

import { defineConfig, type Plugin } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

function shellStyles(): Plugin {
  return {
    name: "poliaule-shell-styles",
    transformIndexHtml: {
      order: "post",
      handler(html, context) {
        if (context.server) {
          return html.replace(
            "<!-- JS -->",
            "<script>document.documentElement.classList.add('css-ready');</script><!-- JS -->",
          );
        }

        return html.replace(
          /<link rel="stylesheet" crossorigin href="([^"]+)">/,
          (_, href: string) =>
            `<link rel="stylesheet" href="${href}" data-shell-css media="print" onload="window.__onShellCssLoad(this)" onerror="window.__onShellCssLoad(this)" crossorigin><noscript><link rel="stylesheet" href="${href}" crossorigin></noscript>`,
        );
      },
    },
  };
}

function betaBackend(): Plugin {
  return {
    name: "poliaule-beta-backend",
    apply: "build",
    transformIndexHtml(html) {
      return html.replaceAll("https://api.poliaule.com", "https://api-beta.poliaule.com");
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    shellStyles(),
    ...(mode === "beta" ? [betaBackend()] : []),
  ],
  build: {
    sourcemap: !process.env.CF_PAGES_BRANCH || process.env.CF_PAGES_BRANCH === "dev",
    target: "es2020",
    cssCodeSplit: false,
  },
  test: {
    // The API worker has its own node:test suite.
    exclude: ["**/node_modules/**", "workers/**"],
  },
  fmt: {
    ignorePatterns: [
      "dist/**",
      "tools/oxlint/anti-slop/**",
      "src/routeTree.gen.ts",
      "public/**",
      "data/**",
      "docs/upstream/**",
    ],
  },
  lint: {
    plugins: ["typescript", "react", "unicorn", "oxc"],
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: fileURLToPath(new URL("./tools/oxlint/anti-slop/index.ts", import.meta.url)),
      },
      "@shadcn/lint",
    ],
    ignorePatterns: ["dist/**", "tools/oxlint/anti-slop/**", "src/routeTree.gen.ts"],
    rules: {
      "oxc/no-accumulating-spread": "error",
      "anti-slop/no-array-filter-map": "error",
      "anti-slop/no-reduce-accumulator-copy": "error",
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-module-mocking": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-reflect-apply": "error",
      "anti-slop/no-reflect-get": "error",
      "anti-slop/no-runtime-typeof": [
        "error",
        {
          allowInTypeGuards: true,
        },
      ],
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-returns": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-widen-then-assert": "error",
      "anti-slop/require-readable-spacing": "error",
      "anti-slop/require-safety-comment-for-type-assertion": "error",
      "shadcn/no-unknown-classes": [
        "error",
        {
          allow: ["hgi-*"],
        },
      ],
      "shadcn/no-raw-colors": "error",
    },
  },
}));
