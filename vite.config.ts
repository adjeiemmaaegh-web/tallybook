import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      devOptions: { enabled: true, type: "module" },
      manifest: {
        name: "Tallybook — Business Ledger",
        short_name: "Tallybook",
        description: "A simple, offline-first daily ledger for micro-business owners.",
        theme_color: "#176B4D",
        background_color: "#F7F1E6",
        display: "standalone",
        start_url: "/",
        id: "/",
        scope: "/",
        lang: "en",
        categories: ["business", "finance", "productivity"],
        icons: [
          { src: "/tallybook-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/tallybook-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          // Padded copy so Android's adaptive-icon masks never crop the mark.
          { src: "/tallybook-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webp,jpg,jpeg,woff2}"],
        // Offline app-shell precache includes split route chunks. Do not
        // cache or request Google Fonts or third-party scripts by default.
        runtimeCaching: [],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.resolve(import.meta.dirname, "client/src/test/setup.ts")],
    include: ["src/**/*.test.{ts,tsx}"],
    clearMocks: true,
    // Bound concurrent jsdom workers and allow real PBKDF2 work on slower CI hosts.
    maxWorkers: 2,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
