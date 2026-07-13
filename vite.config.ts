import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const base = env.VITE_BASE_PATH || "./";

  return {
    base,
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        manifest: false,
        workbox: {
          cacheId: "study-clock",
          globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true
        }
      })
    ]
  };
});
