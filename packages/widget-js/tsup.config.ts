import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    outDir: "dist",
    clean: true,
    minify: true,
    target: "es2019",
  },
  {
    entry: { pagosya: "src/index.ts" },
    format: ["iife"],
    globalName: "PagosYa",
    outDir: "dist",
    clean: false,
    minify: true,
    target: "es2019",
    // esbuild's IIFE output for an ESM `export default` sets
    // `window.PagosYa = { default: fn }`; unwrap it for the CDN API.
    footer: {
      js: 'if (typeof window !== "undefined" && window.PagosYa && typeof window.PagosYa.default === "function") { window.PagosYa = window.PagosYa.default; }',
    },
  },
]);
