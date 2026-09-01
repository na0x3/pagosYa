import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: { port: 5174 },
  resolve: {
    alias: {
      // Checkout runs in Vite, so consume the workspace package as native ESM
      // source. This keeps new shared exports available immediately instead of
      // leaving them behind in Vite's cached CommonJS dependency prebundle.
      "@pagosya/shared-types": fileURLToPath(
        new URL("../../packages/shared-types/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
  build: {
    rollupOptions: {
      input: {
        checkout: fileURLToPath(new URL("./index.html", import.meta.url)),
        stores: fileURLToPath(new URL("./stores/index.html", import.meta.url)),
      },
    },
  },
});
