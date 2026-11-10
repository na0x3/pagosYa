const fs = require('fs');
const img = f => fs.existsSync(f) ? `data:image/jpeg;base64,${fs.readFileSync(f).toString('base64')}` : '';
const STORES = [
  ['miga', 'Miga Dorada · panadería', 'Galleta con chispas · pide WhatsApp · tienda nueva (g3ndbtwc)'],
  ['ohbelly', 'Oh Belly · sodas', 'Lata · sus 5 sabores como favorito · pide WhatsApp (udty4710)'],
  ['boxy', 'BOXY · polerones', 'Prenda · pide el correo (elegido por chat) (delcsvzp)'],
  ['canasta', 'Canasta Viva · frutas y verduras', 'Caja · pide WhatsApp · tienda nueva (0zf7hrxe)'],
];
const STEPS = [['1-rasca', '1. Rasca'], ['3-intereses', '2. ¿Qué te interesa?'], ['4-favorito', '3. ¿Cuál es tu favorito?'], ['5-guardar', '4. Guarda tu premio'], ['6-favorito-en-tienda', '5. Su favorito, primero en la tienda']];
const sections = STORES.map(([key, title, sub]) => `<section class="store"><h2>${title}</h2><p class="meta">${sub}</p><div class="steps">${STEPS.map(([step, label]) => { const src = img(`${key}-${step}.jpg`); return src ? `<figure><img src="${src}" alt="${label} en ${title}"><figcaption>${label}</figcaption></figure>` : ''; }).join('')}</div></section>`).join('');
const html = `<title>Rasca y elige en vivo</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,700;12..96,800&family=Figtree:wght@400;600;700&display=swap">
<style>
/* Layout: a morning report — what was built and checked, then each store's five steps as a scrolling strip. */
:root{--bg:#f6f5f1;--fg:#1d1c19;--muted:#6b675e;--line:#dedbd2;--card:#fff;--ok:#1f7a4a;--display:'Bricolage Grotesque',system-ui,sans-serif;--body:'Figtree',system-ui,sans-serif}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#151513;--fg:#efede6;--muted:#a19d92;--line:#33322d;--card:#1e1e1b;--ok:#7fd3a3;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#151513;--fg:#efede6;--muted:#a19d92;--line:#33322d;--card:#1e1e1b;--ok:#7fd3a3;color-scheme:dark}
*{box-sizing:border-box}body{background:var(--bg);color:var(--fg);font:16px/1.55 var(--body)}
.wrap{max-width:1240px;margin:0 auto;padding-inline:clamp(16px,4vw,40px);padding-block:40px 80px;display:grid;gap:44px}
.eyebrow{font:600 12px/1 var(--body);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h1{font:800 clamp(30px,5vw,50px)/1.03 var(--display);margin:8px 0 12px;text-wrap:balance}
.intro p{margin:0 0 10px;color:var(--muted);max-width:72ch}
.checks{list-style:none;margin:14px 0 0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}
.checks li{padding:12px 14px;border:1px solid var(--line);border-radius:12px;background:var(--card);font-size:14px}
.checks b{display:block;color:var(--ok)}
.store h2{font:800 26px/1.1 var(--display);margin:0}.store .meta{margin:4px 0 12px;color:var(--muted);font-size:14px}
.steps{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(260px,32%);gap:14px;overflow-x:auto;padding-bottom:8px;scroll-snap-type:x mandatory}
figure{margin:0;display:grid;gap:6px;scroll-snap-align:start}figure img{width:100%;height:auto;display:block;border-radius:12px;border:1px solid var(--line)}
figcaption{font-size:13px;color:var(--muted);font-weight:600}
</style>
<div class="wrap"><header class="intro"><span class="eyebrow">pagosYa · noche del 9 al 10 de noviembre · para revisar en la mañana</span>
<h1>Rasca y elige, funcionando en cuatro tiendas</h1>
<p>El flujo de Bake Me ya está en las tiendas: la tarjeta para rascar con la forma del rubro, «¿qué te interesa?», «¿cuál es tu favorito?» con sus fotos, WhatsApp o correo, y su favorito primero en la tienda. Estas capturas son las tiendas reales con sus fotos, haciendo el recorrido completo (en modo prueba, nada se envía). Desliza cada fila.</p>
<ul class="checks">
<li><b>Cada tienda con su forma</b>Galleta, lata, prenda, caja (y botella, taza, flor, bolsa): YAPI la elige por lo que vende.</li>
<li><b>Preguntas de cada tienda</b>Intereses escritos para su rubro o con sus categorías; el favorito con sus productos (o sus sabores).</li>
<li><b>WhatsApp o correo</b>WhatsApp por defecto; BOXY pidió correo por chat. Tu panel muestra la lista con lo que eligió cada uno.</li>
<li><b>Su favorito, recordado</b>Al volver, ese producto sale primero y marcado «Tu favorito».</li>
</ul></header>${sections}</div>`;
fs.writeFileSync('rasca-y-elige-en-vivo.html', html); console.log((html.length / 1024 | 0) + ' KB');
