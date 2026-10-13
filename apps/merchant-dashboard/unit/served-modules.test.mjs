import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every module the dashboard loads from /src is one the dev server serves", () => {
  const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  // Both dynamic import("/src/…") and static `from "/src/…"`: the server answers 404 for anything not listed.
  const loaded = [...new Set([...dashboard.matchAll(/(?:import\(|from )"(\/src\/[^"]+)"/g)].map((match) => match[1]))];
  assert.ok(loaded.length > 3);
  const missing = loaded.filter((file) => !server.includes(`"${file}"`));
  assert.deepEqual(missing, []);
});

test("every module a served module imports is served too", () => {
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
  // Relative imports inside a served module resolve to /src/… in the browser and 404 the same way.
  const seen = new Set();
  const queue = [...dashboard.matchAll(/(?:import\(|from )"(\/src\/[^"]+)"/g)].map((match) => match[1]);
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (!file.endsWith(".mjs")) continue;
    const source = readFileSync(new URL(`..${file}`, import.meta.url), "utf8");
    for (const [, name] of source.matchAll(/(?:import\(|from )"(?:\.\/|\/src\/)([^"]+)"/g)) queue.push(`/src/${name}`);
  }
  assert.ok(seen.has("/src/email-list-panel.mjs"), "the dashboard loads the Correos list");
  assert.deepEqual([...seen].filter((file) => !server.includes(`"${file}"`)), []);
});
