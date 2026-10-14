import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { icon, ICON_NAMES } from "./icons.mjs";

test("an icon is a decorative 18px line drawing by default", () => {
  const svg = icon("bell");
  assert.match(svg, /^<svg class="ui-icon" /);
  assert.match(svg, / width="18" height="18" /);
  assert.match(svg, / stroke-width="1.5" /);
  assert.match(svg, / aria-hidden="true"/);
  assert.match(svg, /<path d="[^"]+"\/>.*<\/svg>$/s);
});

test("a labelled icon is announced, with its label escaped", () => {
  const svg = icon("bell", { size: 16, label: 'Avisos "nuevos"' });
  assert.match(svg, / width="16" height="16" /);
  assert.match(svg, / role="img" aria-label="Avisos &quot;nuevos&quot;"/);
  assert.doesNotMatch(svg, /aria-hidden/);
});

test("an unknown icon name fails loudly instead of drawing nothing", () => {
  assert.throws(() => icon("no-such-icon"), /Unknown icon: no-such-icon/);
});

test("every icon name written in a dashboard module is in the set", () => {
  const dir = new URL("./", import.meta.url);
  const used = new Set();
  for (const file of readdirSync(dir).filter((name) => /\.(mjs|js)$/.test(name) && !name.endsWith(".test.mjs") && !name.startsWith("icon"))) {
    // icon("bell") calls and { icon: "bell" } options for the ui-kit helpers.
    for (const [, name] of readFileSync(new URL(file, dir), "utf8").matchAll(/\bicon(?:\(|: )"([a-z0-9-]+)"/g)) used.add(name);
  }
  assert.deepEqual([...used].filter((name) => !ICON_NAMES.includes(name)), []);
});

test("icon-paths.mjs is exactly what the generator writes today", () => {
  execFileSync(process.execPath, [fileURLToPath(new URL("../scripts/build-icons.mjs", import.meta.url)), "--check"], { stdio: "pipe" });
});
