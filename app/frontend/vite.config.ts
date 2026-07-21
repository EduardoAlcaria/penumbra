import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Dedicated port off Vite's default 5173 so Penumbra never squats the port
    // your other Vite apps want. strictPort: fail loudly if it's taken rather
    // than silently bumping (Tauri's devUrl below is fixed and must match).
    port: 8788,
    strictPort: true,
    proxy: {
      // dev: forward API calls to the Spring backend
      "/api": "http://127.0.0.1:8787",
    },
  },
});
