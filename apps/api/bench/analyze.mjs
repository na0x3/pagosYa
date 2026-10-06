// Mechanical checks of the hard constraints, run over each generated project's
// own source. Deliberately crude but identical for both sides, so the comparison
// is like for like; taste judgements stay out of here.
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const ROOT = "/Users/saramia/pagosYa-sep5-output/bench2";
const read = async (dir) => {
  const out = { css: "", html: "", js: "", bytes: 0, files: 0 };
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (["dist", "node_modules", "_compiled", "assets"].includes(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) { await walk(p); continue; }
      const s = await stat(p); out.bytes += s.size; out.files++;
      if (/\.css$/.test(e.name)) out.css += await readFile(p, "utf8");
      else if (/\.html$/.test(e.name)) out.html += await readFile(p, "utf8");
      else if (/\.js$/.test(e.name) && !/commerce\.js|config\.js/.test(e.name)) out.js += await readFile(p, "utf8");
    }
  };
  await walk(dir);
  return out;
};

const families = (css) => {
  const found = new Set();
  for (const m of css.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    const first = m[1].split(",")[0].trim().replace(/['"]/g, "").toLowerCase();
    if (first && !first.startsWith("var(") && !["inherit", "initial", "unset"].includes(first)) found.add(first);
  }
  return found;
};
const hexes = (css) => {
  const counts = new Map();
  for (const m of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
    counts.set(h.toLowerCase(), (counts.get(h.toLowerCase()) || 0) + 1);
  }
  return counts;
};
// "default neutral" = low-saturation beige/grey/white/near-black
const neutral = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat < 0.18;
};

const rows = [];
for (const mode of ["sep5", "engine"]) {
  let keys = [];
  try { keys = await readdir(join(ROOT, mode)); } catch { continue; }
  for (const key of keys.filter((k) => !k.startsWith("."))) {
    const src = await read(join(ROOT, mode, key));
    if (!src.html) continue;
    const fams = families(src.css);
    const cols = hexes(src.css);
    const chromatic = [...cols.entries()].filter(([h]) => !neutral(h)).sort((a, b) => b[1] - a[1]);
    rows.push({
      mode, key,
      files: src.files,
      cssKb: Math.round(src.css.length / 1024),
      typeFamilies: fams.size,
      families: [...fams].slice(0, 4).join(" / "),
      chromaticColours: chromatic.length,
      topColour: chromatic[0] ? "#" + chromatic[0][0] : "—",
      uniformGrid: /grid-template-columns\s*:\s*repeat\(\s*(?:auto-fi[lt]{1,2}|[2-6])/i.test(src.css),
      keyframes: (src.css.match(/@keyframes/g) || []).length,
      sticky: (src.css.match(/position\s*:\s*sticky/g) || []).length,
      gradients: (src.css.match(/gradient\(/g) || []).length,
      sections: (src.html.match(/<section/g) || []).length,
      centredHero: /<(?:section|header|div)[^>]*class="[^"]*hero[^"]*"[\s\S]{0,400}?text-align\s*:\s*center/i.test(src.html + src.css),
      observers: (src.js.match(/IntersectionObserver/g) || []).length,
      reducedMotion: /prefers-reduced-motion/.test(src.css + src.js),
    });
  }
}
rows.sort((a, b) => a.key.localeCompare(b.key) || a.mode.localeCompare(b.mode));
console.log(JSON.stringify(rows, null, 1));
