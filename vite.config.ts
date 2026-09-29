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
}));
