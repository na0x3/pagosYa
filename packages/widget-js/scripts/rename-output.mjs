// tsup names IIFE output "<entry>.global.js" to disambiguate from other
// formats even when IIFE is the only format built; rename to the plain
// "pagosya.js" that <script src="https://js.pagosya.com/v1/pagosya.js">
// actually references.
import { renameSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const from = path.join(distDir, "pagosya.global.js");
const to = path.join(distDir, "pagosya.js");

if (existsSync(from)) renameSync(from, to);
