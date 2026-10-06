// Downloads each project's API-hosted product photos into its own assets folder and
// rewrites config.js to relative paths. Makes every store self-contained — no live
// API, no cross-origin fetch — and is applied identically to both engines.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const serving = JSON.parse(await readFile("/Users/saramia/pagosYa-sep5-output/bench2/serving.json", "utf8"));
for (const p of serving) {
  const cfgPath = join(p.dir, "config.js");
  let text;
  try { text = await readFile(cfgPath, "utf8"); } catch { continue; }
  const urls = [...new Set([...text.matchAll(/https?:\/\/127\.0\.0\.1:3001\/v1\/uploads\/([a-f0-9-]+\.(?:jpe?g|png|webp))/gi)].map((m) => m[0]))];
  if (!urls.length) { console.log(`${p.mode}/${p.key}: no remote photos`); continue; }
  await mkdir(join(p.dir, "assets", "uploads"), { recursive: true });
  let ok = 0;
  for (const url of urls) {
    const name = url.split("/").pop();
    const res = await fetch(url);
    if (!res.ok) { console.error(`  ${name}: ${res.status}`); continue; }
    await writeFile(join(p.dir, "assets", "uploads", name), Buffer.from(await res.arrayBuffer()));
    text = text.split(url).join(`assets/uploads/${name}`);
    ok++;
  }
  await writeFile(cfgPath, text);
  console.log(`${p.mode}/${p.key}: localized ${ok}/${urls.length} photos`);
}
