/**
 * Parses every browser runtime this package ships into generated storefronts.
 *
 * These files are never compiled here: the API reads them as text (see
 * source-creative.ts / source-next.ts) and copies them into each merchant's
 * store, so a syntax error in one of them does not surface until a real
 * storefront is generated or, worse, served. Parsing them is the cheapest
 * check that they are at least valid before they ship.
 *
 * It compiles nothing and evaluates nothing — `new Script` parses only, the
 * same guard kit/build.mjs already applies when copying.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const root = dirname(fileURLToPath(import.meta.url));

async function scripts(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["dist", "node_modules"].includes(entry.name) || entry.name.startsWith(".")) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await scripts(path)));
    // Only .js: those are the classic browser scripts kit/build.mjs copies into
    // stores. The .mjs files here are build tooling that never ships, and they
    // are ES modules, which `new Script` cannot parse.
    else if (entry.name.endsWith(".js")) found.push(path);
  }
  return found;
}

const failures = [];
const files = await scripts(root);
for (const path of files) {
  const source = await readFile(path, "utf8");
  try {
    new Script(source, { filename: path });
  } catch (error) {
    failures.push(`${relative(root, path)}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`${failures.length} storefront runtime(s) failed to parse:`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`${files.length} storefront runtimes parsed cleanly.`);
