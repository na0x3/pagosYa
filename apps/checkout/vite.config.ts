import { defineConfig } from "vitest/config";
import { readFile } from 'node:fs/promises';
import { createStorefrontSeo } from './storefront-seo.mjs';
import { loadEnv } from 'vite';
import { fileURLToPath } from "node:url";

export default defineConfig({
  server: { port: 5174 },
  plugins: [{ name: 'storefront-seo', configureServer(server) {
    const env = loadEnv(server.config.mode, server.config.envDir, '');
    server.middlewares.use(createStorefrontSeo({ apiBase: process.env.INTERNAL_API_BASE_URL || env.INTERNAL_API_BASE_URL || process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || 'http://localhost:3001/v1', checkoutOrigin: process.env.CHECKOUT_ORIGIN || env.CHECKOUT_ORIGIN || 'http://localhost:5174', template: async (url: string) => server.transformIndexHtml(url, await readFile(fileURLToPath(new URL('./index.html', import.meta.url)), 'utf8')) }));
  } }],
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
