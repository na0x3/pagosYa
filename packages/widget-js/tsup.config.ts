import { defineConfig } from "tsup";

export default defineConfig({
  entry: { pagosya: "src/index.ts" },
  format: ["iife"],
  globalName: "PagosYa",
  outDir: "dist",
  clean: true,
  minify: true,
  target: "es2019",
  // esbuild's IIFE output for an ESM `export default` sets
  // `window.PagosYa = { default: fn }`, but the public API is
  // `PagosYa('pk_test_xxx')` called directly — unwrap it.
  footer: {
    js: 'if (typeof window !== "undefined" && window.PagosYa && typeof window.PagosYa.default === "function") { window.PagosYa = window.PagosYa.default; }',
  },
});
