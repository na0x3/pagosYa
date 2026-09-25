import { createRequire } from "node:module";
import path from "node:path";
import { defineConfig } from "vite";

const requireFromDashboard = createRequire(import.meta.url);
// server.mjs serves the shared variant editor at these root URLs; the build resolves them to the package.
const variantEditorDir = path.dirname(requireFromDashboard.resolve("@pagosya/variant-editor"));
// server.mjs serves the blob modules under /vendor/* for the import map; the build resolves the same files.
const blobatarDist = path.join(path.dirname(requireFromDashboard.resolve("blobatar/package.json")), "dist");
const blobCharactersDir = path.dirname(requireFromDashboard.resolve("@pagosya/blob-characters/package.json"));

export default defineConfig({
  resolve: {
    alias: [
      { find: /^\/variant-editor\.(js|css)$/, replacement: path.join(variantEditorDir, "variant-editor.$1") },
      { find: /^\/vendor\/blobatar\/(.*)$/, replacement: path.join(blobatarDist, "$1") },
      { find: /^\/vendor\/blob-characters\/(.*)$/, replacement: path.join(blobCharactersDir, "$1") },
    ],
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
