/** Owner 2026-10-27 («they are the same, you feel me?»): a guarded personal touch — one new section made for this store, on the cheap
 *  model, that may not change anything else. The check below compares the authored files before and after; anything outside the
 *  one section (the hero, the header, the catalog, other styles, the store's data) undoes the touch. */
export const GUARDED_TOUCH_BRIEF = 'Toque personal: agrega UNA sola sección nueva a la portada que solo este negocio podría tener — algo propio de lo que vende '
  + 'y de cómo lo hace, hecho con sus fotos y sus palabras (por ejemplo, para una panadería un mostrador donde cada pieza se da vuelta y muestra '
  + 'su miga; para una soda, la tabla de sabores con su fruta; para un atelier, un muestrario de telas que se despliega al pasar el cursor; para una '
  + 'tienda de belleza, la rueda de tonos de sus labiales). Antes lee components/store-data.tsx: las secciones que ya están (sections y copy) no se '
  + 'repiten — ni su título, ni su tema, ni sus pasos con otras palabras; trae algo que la página todavía no tiene. '
  + 'Nunca un bloque genérico de foto con historia, ni testimonios, ni cifras o premios inventados. Debe verse '
  + 'especial y con movimiento (una animación suave al aparecer o al pasar el cursor), en el estilo de la tienda. Escríbela en un componente nuevo '
  + 'components/touch.tsx e insértala en components/home.tsx como una sola línea <Touch /> directa dentro de <main>, entre dos secciones '
  + 'existentes, con su import. Sus estilos van al final de styles/globals.css y cada regla empieza con .es-touch. No cambies, no borres ni reordenes '
  + 'nada más: ni la portada, ni el encabezado, ni el catálogo, ni otros estilos, ni store-data. No inventes datos, precios, premios ni reseñas.';

type File = { path: string; content: string };
const authored = (path: string) => /^components\/.+\.tsx$/.test(path) || /^styles\/.+\.css$/.test(path);
// Compared without spaces, empty rules or pointer-events:none: the save tidies the CSS on its own (ZARA, DEFTS, BAEK 2026-10-27).
const lines = (text: string) => text.split('\n').map(line => line.replace(/\s+/g, '').replace(/;?pointer-events:none(?=[;}])/g, '')).filter(line => line && !/^[^{}]+\{\}$/.test(line));
/** Lines of `before` that `after` no longer has, and lines `after` added (each line counted as often as it appears). */
function lineDiff(before: string, after: string) {
  const left = new Map<string, number>();
  for (const line of lines(before)) left.set(line, (left.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of lines(after)) { const n = left.get(line) ?? 0; if (n) left.set(line, n - 1); else added.push(line); }
  const removed = [...left.entries()].flatMap(([line, n]) => Array(n).fill(line) as string[]);
  return { removed, added };
}

export function touchStaysInside(before: File[], after: File[]): { ok: true } | { ok: false; why: string } {
  const old = new Map(before.filter(file => authored(file.path)).map(file => [file.path, file.content]));
  const now = new Map(after.filter(file => authored(file.path)).map(file => [file.path, file.content]));
  for (const path of old.keys()) if (!now.has(path)) return { ok: false, why: `${path} was deleted` };
  const fresh = [...now.keys()].filter(path => !old.has(path));
  if (fresh.length > 2 || fresh.some(path => !path.startsWith('components/'))) return { ok: false, why: `new files: ${fresh.join(', ')}` };
  for (const [path, content] of now) {
    const was = old.get(path);
    if (was === undefined || was === content) continue;
    const { removed, added } = lineDiff(was, content);
    if (path === 'components/home.tsx') {
      if (removed.length) return { ok: false, why: `home.tsx lost ${removed.length} lines` };
      if (added.length > 6) return { ok: false, why: `home.tsx gained ${added.length} lines` };
    } else if (path === 'styles/globals.css') {
      if (removed.length) return { ok: false, why: `globals.css lost ${removed.length} lines` };
      const foreign = added.filter(line => line.includes('{') && !/^(?:@media|@keyframes|@supports|from|to|\d+%)/.test(line) && !/^[^{]*\.es-touch/.test(line));
      if (foreign.length) return { ok: false, why: `styles outside .es-touch: ${foreign[0].slice(0, 60)}` };
    } else if (path === 'components/store-data.tsx') {
      // The save bundles upload photos into assets and refreshes the feature data on its own: those two lines are the platform's.
      // The store line's logo is bundled the same way (BAEK 2026-10-27): compared without it.
      const own = (line: string) => !/^exportconst(?:photos|features)\b/.test(line);
      const withoutLogo = (list: string[]) => list.filter(own).map(line => line.replace(/"logo":"[^"]*"/, '"logo":""'));
      const [gone, came] = [withoutLogo(removed), withoutLogo(added)];
      if (gone.length !== came.length || gone.some((line, index) => line !== came[index])) return { ok: false, why: 'store-data changed' };
    } else return { ok: false, why: `${path} changed` };
  }
  return { ok: true };
}
