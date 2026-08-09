import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    // PWA disabled: previous SW was caching a broken old UI and blocking updates.
    // Re-enable later with workbox navigateFallbackDenylist + skipWaiting.
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      selfDestroying: true,
      manifest: false,
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});
