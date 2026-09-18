import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.js";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    // crxjs' dev-server HMR needs a fixed, known port for the service
    // worker/content-script to reconnect to.
    port: 5173,
    strictPort: true,
    hmr: { port: 5173 },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    // No manual rollupOptions.input: @crxjs/vite-plugin reads
    // manifest.config.ts (action.default_popup, options_page,
    // background.service_worker, content_scripts) and wires up every
    // entry point itself.
  },
});
