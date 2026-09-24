import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

// server.mjs serves the shared variant editor at these root URLs; the build resolves them to the package.
const variantEditorDir = path.dirname(createRequire(import.meta.url).resolve("@pagosya/variant-editor"));

export default defineConfig({
  resolve: {
    alias: [{ find: /^\/variant-editor\.(js|css)$/, replacement: path.join(variantEditorDir, "variant-editor.$1") }],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
