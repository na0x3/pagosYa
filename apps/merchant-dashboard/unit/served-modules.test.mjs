import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("every module the dashboard loads from /src is one the dev server serves", () => {
  const dashboard = readFileSync(new URL("../src/dashboard.js", import.meta.url), "utf8");
  const server = readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  const loaded = [...new Set([...dashboard.matchAll(/import\("(\/src\/[^"]+)"\)/g)].map((match) => match[1]))];
  assert.ok(loaded.length > 3);
  const missing = loaded.filter((file) => !server.includes(`"${file}"`));
  assert.deepEqual(missing, []);
});
