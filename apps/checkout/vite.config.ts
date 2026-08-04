import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173 },
  // @pagosya/shared-types builds as CommonJS (apps/api/NestJS needs that),
  // but pnpm symlinks workspace packages to a path outside node_modules
  // proper, so Vite serves it as raw source instead of running it through
  // esbuild's CJS->ESM interop. Forcing it into dependency pre-bundling
  // fixes that without giving up the CJS build the backend needs.
  optimizeDeps: { include: ["@pagosya/shared-types"] },
});
