import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: mode === "embedded" ? "/studio/" : "/",
  server: {
    port: 4312,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  preview: {
    port: 4312,
  },
  build: {
    target: "es2022",
    ...(mode === "embedded" ? { outDir: "../merchant-dashboard/public/studio", emptyOutDir: true } : {}),
    sourcemap: true,
  },
}));
