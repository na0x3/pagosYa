import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: { port: 5174 },
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
  // @pagosya/shared-types builds as CommonJS (apps/api/NestJS needs that),
  // but pnpm symlinks workspace packages to a path outside node_modules
  // proper, so Vite serves it as raw source instead of running it through
  // esbuild's CJS->ESM interop. Forcing it into dependency pre-bundling
  // fixes that without giving up the CJS build the backend needs.
  optimizeDeps: { include: ["@pagosya/shared-types"] },
  // Same symlink issue applies to the production build, which goes through
  // Rollup's commonjs plugin instead of esbuild. That plugin only transforms
  // files under node_modules/** by default, so it must be told to also treat
  // the (real, symlinked-to) shared-types path as CommonJS.
  build: {
    rollupOptions: {
      input: {
        checkout: fileURLToPath(new URL("./index.html", import.meta.url)),
        stores: fileURLToPath(new URL("./stores/index.html", import.meta.url)),
      },
    },
    commonjsOptions: {
      include: [/shared-types/, /node_modules/],
    },
  },
});
