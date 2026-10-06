// Builds a single page that puts both engines' live stores side by side, scaled
// down in iframes, with the measured numbers under each pair.
import { readFile, writeFile } from "node:fs/promises";

const ROOT = "/Users/saramia/pagosYa-sep5-output/bench2";
const serving = JSON.parse(await readFile(`${ROOT}/serving.json`, "utf8"));
let metrics = [];
try { metrics = JSON.parse(await readFile(`${ROOT}/runtime-metrics.json`, "utf8")); } catch {}
const find = (mode, key) => serving.find((s) => s.mode === mode && s.key === key);
const met = (mode, key) => metrics.find((m) => m.mode === mode && m.key === key) || {};
const keys = [...new Set(serving.map((s) => s.key))];

const pane = (mode, key) => {
  const s = find(mode, key), m = met(mode, key);
  if (!s) return `<div class="pane missing"><div class="label">${mode}</div><p>no se generó</p></div>`;
  return `<div class="pane">
    <div class="label">${mode === "sep5" ? "Sep-5 · el modelo escribe el sitio" : "Motor de diseño · el modelo llena el esquema"}</div>
    <div class="frame"><iframe src="${s.url}" loading="lazy" scrolling="no"></iframe></div>
    <dl><div><dt>colores</dt><dd>${m.colours ?? "—"}</dd></div><div><dt>alto</dt><dd>${m.height ? m.height + "px" : "—"}</dd></div><div><dt>texto</dt><dd>${m.text ?? "—"}</dd></div></dl>
    <p class="h1">${m.h1 ? "“" + m.h1 + "”" : ""}</p>
    <a href="${s.url}" target="_blank">abrir →</a>
  </div>`;
};

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Benchmark de generación</title><style>
:root{--bg:#faf8f5;--fg:#17150f;--muted:#6f6a5f;--line:#ded7cb;--accent:#b2402a}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#14120f;--fg:#f2ede4;--muted:#9c958a;--line:#2e2a24}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 ui-sans-serif,system-ui,sans-serif}
header{padding:48px 24px 8px;max-width:1200px;margin:0 auto}
h1{font-size:clamp(28px,5vw,44px);margin:0 0 8px;letter-spacing:-.02em}
.sub{color:var(--muted);max-width:60ch}
table.sum{border-collapse:collapse;margin:24px 0;font-size:14px}
table.sum td,table.sum th{border:1px solid var(--line);padding:6px 12px;text-align:right}
table.sum th:first-child,table.sum td:first-child{text-align:left}
section{max-width:1200px;margin:0 auto;padding:32px 24px;border-top:1px solid var(--line)}
h2{font-size:22px;margin:0 0 16px;text-transform:lowercase;letter-spacing:.02em}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:20px}
@media (max-width:860px){.pair{grid-template-columns:1fr}}
.pane{min-width:0}.label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:8px}
.frame{height:420px;overflow:hidden;border:1px solid var(--line);border-radius:4px;background:#fff}
iframe{width:1440px;height:1680px;border:0;transform:scale(.38);transform-origin:0 0;pointer-events:none}
dl{display:flex;gap:18px;margin:10px 0 4px;font-size:13px}dl div{display:flex;gap:6px}
dt{color:var(--muted)}dd{margin:0;font-variant-numeric:tabular-nums}
.h1{font-size:13px;color:var(--muted);margin:4px 0;min-height:2.2em}
a{color:var(--accent);font-size:13px}
.missing{display:flex;flex-direction:column;justify-content:center;align-items:center;height:420px;border:1px dashed var(--line);border-radius:4px;color:var(--muted)}
</style></head><body>
<header><h1>Nueve tiendas, dos generadores</h1>
<p class="sub">Mismo catálogo, mismas fotos, mismas instrucciones difíciles. A la izquierda el generador de septiembre, que escribe el HTML, el CSS y el JS completos. A la derecha el motor de diseño actual, que llena el esquema de composiciones.</p>
<table class="sum"><tr><th></th><th>tiendas ok</th><th>colores</th><th>alto</th><th>texto</th><th>tiempo</th></tr>
<tr><td>Sep-5</td><td>SEP5_OK</td><td>SEP5_COL</td><td>SEP5_H</td><td>SEP5_T</td><td>250s</td></tr>
<tr><td>Motor</td><td>ENG_OK</td><td>ENG_COL</td><td>ENG_H</td><td>ENG_T</td><td>660s</td></tr></table>
</header>
${keys.map((k) => `<section><h2>${k}</h2><div class="pair">${pane("sep5", k)}${pane("engine", k)}</div></section>`).join("\n")}
</body></html>`;

const avg = (mode, field) => {
  const r = metrics.filter((m) => m.mode === mode);
  return r.length ? Math.round(r.reduce((n, m) => n + m[field], 0) / r.length) : "—";
};
const out = html
  .replace("SEP5_OK", metrics.filter((m) => m.mode === "sep5").length).replace("ENG_OK", metrics.filter((m) => m.mode === "engine").length)
  .replace("SEP5_COL", avg("sep5", "colours")).replace("ENG_COL", avg("engine", "colours"))
  .replace("SEP5_H", avg("sep5", "height") + "px").replace("ENG_H", avg("engine", "height") + "px")
  .replace("SEP5_T", avg("sep5", "text")).replace("ENG_T", avg("engine", "text"));
await writeFile(`${ROOT}/compare.html`, out);
console.log(`compare.html written with ${keys.length} stores`);
