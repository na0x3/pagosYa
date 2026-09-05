import { defineConfig } from "vite";

export default defineConfig({
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
    sourcemap: true,
  },
});
