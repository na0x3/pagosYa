// V2 prototype build sandbox — the child (docs/superpowers/specs/2026-11-14-v2-prototype-design.md §4).
// Started by v2-sandbox.ts under macOS sandbox-exec with an empty environment: no network, no writes outside its working directory,
// no reads of .env files. It reads in.json from its working directory, runs the platform's own prepare (validation + esbuild +
// Tailwind + kit runtime) on it, and writes out.json there: { ok: true, snapshot } or { ok: false, error }. Plain .cjs: the API
// watcher compiles every .ts under apps/api, and this file must not be part of the API process.
const fs = require('node:fs');
const path = require('node:path');

const dist = process.argv[2];
const write = value => fs.writeFileSync(path.join(process.cwd(), 'out.json'), JSON.stringify(value));
(async () => {
  const input = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'in.json'), 'utf8'));
  const { SourceProjectsService } = require(path.join(dist, 'storefront-source/source-projects.service.js'));
  // prepare() uses no instance state (it is the same code a save runs); a future `this` dependency fails loudly here.
  const snapshot = await SourceProjectsService.prototype.prepare.call(Object.freeze({}), input);
  write({ ok: true, snapshot });
})().catch(error => {
  write({ ok: false, error: String(error?.response?.message ?? error?.message ?? error).slice(0, 4000) });
});
