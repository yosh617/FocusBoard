import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import packageJson from "./package.json";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const base = env.VITE_BASE_PATH || "./";

  return {
    base,
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version)
    },
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        manifest: false,
        workbox: {
          cacheId: "focusboard",
          globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
          navigateFallback: "index.html",
          cleanupOutdatedCaches: true
        }
      })
    ]
  };
});
