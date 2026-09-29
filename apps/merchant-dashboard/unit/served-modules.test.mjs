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
