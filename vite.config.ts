import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";
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

function betaAssets(): Plugin {
  let outDir: string;

  return {
    name: "poliaule-beta-assets",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    transformIndexHtml(html) {
      return html.replaceAll("https://api.poliaule.com", "https://api-beta.poliaule.com");
    },
    async closeBundle() {
      const files = [
        "favicon-96x96.png",
        "favicon.svg",
        "favicon.ico",
        "apple-touch-icon.png",
        "web-app-manifest-192x192.png",
        "web-app-manifest-512x512.png",
        "site.webmanifest",
      ];

      await Promise.all(
        files.map((file) =>
          copyFile(resolve("public/favicons/beta", file), resolve(outDir, "favicons/main", file)),
        ),
      );
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    // Tailwind also runs Lightning CSS internally; disable that optimisation
    // to retain both prefixed and unprefixed backdrop-filter declarations.
    tailwindcss({ optimize: false }),
    shellStyles(),
    ...(mode === "beta" ? [betaAssets()] : []),
  ],
  build: {
    sourcemap: !process.env.CF_PAGES_BRANCH || process.env.CF_PAGES_BRANCH === "dev",
    target: "es2020",
    // Preserve both backdrop-filter declarations; the source documents a
    // Lightning CSS optimisation that drops the unprefixed declaration.
    cssMinify: false,
    cssCodeSplit: false,
  },
}));
