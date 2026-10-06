// Builds every completed project and serves each on its own port so both engines
// can be measured in a real browser, which is the only fair way to compare a
// server-complete page against a client-rendered app.
import { readdir, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { FOLDERS } from "./folders.mjs";

const ROOT = "/Users/saramia/pagosYa-sep5-output/bench2";
const map = [];
let port = Number(process.env.BASE_PORT || 4500);
for (const mode of ["sep5", "engine"]) {
  for (const f of FOLDERS) {
    const dir = join(ROOT, mode, f.key);
    try { await access(join(dir, "index.html")); } catch { continue; }
    map.push({ mode, key: f.key, dir, port: port++ });
  }
}
for (const m of map) {
  await new Promise((resolve) => {
    const b = spawn("node", ["build.mjs"], { cwd: m.dir });
    b.on("close", resolve);
  });
  const s = spawn("node", ["server.mjs"], { cwd: m.dir, env: { ...process.env, PORT: String(m.port) }, detached: true, stdio: "ignore" });
  s.unref();
  m.url = `http://127.0.0.1:${m.port}/`;
}
await writeFile(join(ROOT, "serving.json"), JSON.stringify(map, null, 2));
console.log(map.map((m) => `${m.mode.padEnd(7)} ${m.key.padEnd(12)} ${m.url}`).join("\n"));
console.log(`\n${map.length} projects serving`);
