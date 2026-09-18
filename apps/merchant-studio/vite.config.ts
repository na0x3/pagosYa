import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig(({ mode }) => ({
  resolve: { alias: { "@pagosya/shared-types": fileURLToPath(new URL("../../packages/shared-types/src/index.ts", import.meta.url)) } },
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
