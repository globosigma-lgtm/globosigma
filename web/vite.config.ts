import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// VERSAO-01: um carimbo por build, usado tanto no bundle (via `define`, vira a constante global
// __BUILD_VERSION__) quanto num arquivo estático `version.json` publicado junto — o front compara
// os dois periodicamente (ver VersionBanner.tsx) pra avisar quando alguém está com uma aba aberta
// rodando JS de uma build anterior.
const BUILD_VERSION = Date.now().toString();

function pluginVersaoDaBuild(): Plugin {
  return {
    name: "sigma-versao-da-build",
    writeBundle(options) {
      const dir = options.dir ?? "dist";
      writeFileSync(join(dir, "version.json"), JSON.stringify({ version: BUILD_VERSION }));
    },
  };
}

export default defineConfig({
  plugins: [react(), pluginVersaoDaBuild()],
  define: {
    __BUILD_VERSION__: JSON.stringify(BUILD_VERSION),
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
    },
  },
});
