import { ApiError } from './api';
import type { MerchantStudioApi, SourceVersion } from './api';
import './source-boceto.css';

/** Boceto: hand-editing panel for sketch-born stores (sketch-first sub-project 3).
 * Every merchant string reaches the DOM through value/textContent only — never markup. */

type Sketch = { palette: Record<'paper' | 'ink' | 'accent' | 'deep' | 'pop', string>; fonts: { display: string; text: string }; scale: string; blocks: any[] };
type Mount = { storeId: string; version: SourceVersion; locked: boolean; saved: (revision: number) => Promise<void>; close?: () => void };

const BG_ROLES = ['paper', 'ink', 'accent', 'deep', 'pop'] as const;
const SIZES = ['s', 'm', 'l', 'xl'];
const TYPE_LABEL: Record<string, string> = { announce: 'Aviso', split: 'Panel doble', hero: 'Portada', marquee: 'Marquesina', catalog: 'Catálogo', story: 'Historia', reviews: 'Reseñas', faq: 'Preguntas', banner: 'Banner', gallery: 'Galería', newsletter: 'Boletín', footer: 'Pie de página' };
const TEXT_FIELDS: Record<string, Array<[string, string]>> = {
  announce: [['left', 'Texto izquierdo'], ['right', 'Texto derecho']],
  split: [['headline', 'Título'], ['body', 'Texto'], ['cta', 'Botón']],
  hero: [['headline', 'Título'], ['sub', 'Subtítulo'], ['cta', 'Botón'], ['badge', 'Insignia'], ['note', 'Nota pequeña'], ['sticker', 'Sticker de la foto']],
  marquee: [['text', 'Texto']],
  catalog: [['kicker', 'Antetítulo'], ['title', 'Título']],
  story: [['title', 'Título']],
  reviews: [['title', 'Título']],
  faq: [['title', 'Título']],
  banner: [['headline', 'Título'], ['cta', 'Botón']],
  gallery: [['title', 'Título']],
  newsletter: [['title', 'Título'], ['note', 'Nota'], ['cta', 'Botón']],
  footer: [['tagline', 'Lema']],
};
const DEFAULT_BLOCK: Record<string, object> = {
  announce: { type: 'announce', left: 'Hecho fresco cada semana', right: 'Envíos a todo el país', bg: 'pop', size: 's' },
  split: { type: 'split', headline: 'Mezcla y combina', body: 'Arma tu caja a tu manera.', cta: 'Armar mi caja', href: 'checkout.html', pills: ['6 unidades', '12 unidades'], bg: 'accent', size: 'l' },
  hero: { type: 'hero', variant: 'photo-right', headline: 'Un título con carácter', sub: '', cta: 'Ver productos', badge: '', note: '', sticker: '', bg: 'paper', size: 'l' },
  marquee: { type: 'marquee', text: 'Hecho con calma · Hecho aquí', bg: 'pop', size: 's' },
  catalog: { type: 'catalog', kicker: '', title: 'Nuestros productos', bg: 'paper', size: 'm' },
  story: { type: 'story', title: 'Nuestra historia', paragraphs: ['Cuenta aquí tu proceso.'], bg: 'accent', size: 'l' },
  reviews: { type: 'reviews', title: 'Clientes felices', quotes: [{ text: 'Me encantó.', name: 'Cliente' }], bg: 'paper', size: 'm' },
  faq: { type: 'faq', title: 'Preguntas', items: [{ q: '¿Hacen envíos?', a: 'Sí.' }], bg: 'paper', size: 'm' },
  banner: { type: 'banner', headline: 'Haz espacio para algo bueno', cta: 'Comprar', href: 'checkout.html', bg: 'pop', size: 'xl' },
  gallery: { type: 'gallery', title: 'Galería', photos: [], bg: 'paper', size: 'm' },
  newsletter: { type: 'newsletter', title: 'Novedades', note: '', cta: 'Suscribirme', bg: 'deep', size: 'm' },
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { text?: string } = {}, children: HTMLElement[] = []) => {
  const node = document.createElement(tag);
  const { text, ...rest } = props as { text?: string } & Record<string, unknown>;
  Object.assign(node, rest);
  if (text !== undefined) node.textContent = text;
  for (const child of children) node.append(child);
  return node;
};

export function createBocetoPanel(api: MerchantStudioApi) {
  let host: HTMLElement | null = null, opts: Mount | null = null;
  let sketch: Sketch | null = null, photos: string[] = [], fonts: string[] = [], revision = 0;
  let selected = '', timer: ReturnType<typeof setTimeout> | null = null, pending = false, note = '';
  let editSeq = 0, lastSaved = '', statusNode: HTMLElement | null = null, rootNode: HTMLElement | null = null, mountToken = 0;
  let mountedStore = '', mountedRevision = -1;

  const status = (text: string) => { if (statusNode) statusNode.textContent = text; };
  // A longer idle window keeps revisions meaningful and the server load low; typing never loses focus because
  // saving updates only the status line, never the form.
  const schedule = () => { editSeq++; if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 1200); };
  async function save() {
    if (!opts || !sketch || pending) return;
    const payload = JSON.stringify(sketch);
    if (payload === lastSaved) return;
    const seqAtSave = editSeq;
    pending = true; status('Guardando…');
    try {
      const result = await api.putSketch(opts.storeId, { revision, sketch });
      revision = result.revision; mountedRevision = result.revision;
      if (editSeq === seqAtSave) {
        // Nothing changed while saving: adopt the repaired server truth so repairs show.
        sketch = result.sketch as Sketch; lastSaved = JSON.stringify(sketch); note = ''; pending = false; draw();
      } else {
        // The merchant kept editing: keep their local state and save again.
        lastSaved = payload; pending = false; status('Guardando…'); schedule();
      }
      try { await opts.saved(revision); } catch { /* preview reload is best-effort; the save itself succeeded */ }
      return;
    } catch (error) {
      pending = false;
      if (error instanceof ApiError && error.status === 409) {
        // Someone else saved: reload the server's truth; nothing was overwritten.
        try { const fresh = await api.getSketch(opts.storeId); revision = fresh.revision; sketch = fresh.sketch as Sketch; lastSaved = JSON.stringify(sketch); note = 'El boceto cambió en otra pestaña; se recargó.'; } catch { note = 'Se conservó la versión anterior.'; }
        draw();
      } else {
        // Rate limit or network: keep the merchant's edits and retry shortly.
        status('Reintentando…');
        if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 2500);
      }
    }
  }

  const MAXLEN: Record<string, number> = { headline: 120, title: 120, badge: 60, cta: 60, note: 120, sticker: 40, left: 200, right: 200, text: 200, kicker: 80, sub: 200, tagline: 200, body: 600, href: 200 };
  function field(block: any, key: string, label: string) {
    const input = el('input', { value: String(block[key] ?? ''), className: 'boceto-input', maxLength: MAXLEN[key] ?? 200 });
    input.dataset.bocetoField = key;
    input.addEventListener('input', () => { block[key] = input.value; schedule(); });
    return el('label', { className: 'boceto-label', text: label }, [input]);
  }
  function lines(block: any, key: string, label: string, toText: (items: any[]) => string, fromText: (value: string) => any[]) {
    const area = el('textarea', { value: toText(block[key] || []), className: 'boceto-area' });
    area.dataset.bocetoField = key;
    area.addEventListener('input', () => { block[key] = fromText(area.value); schedule(); });
    return el('label', { className: 'boceto-label', text: label }, [area]);
  }
  function choice(block: any, key: string, label: string, values: readonly string[], names?: string[]) {
    const select = el('select', { className: 'boceto-select' });
    select.dataset.bocetoField = key;
    values.forEach((value, index) => select.append(el('option', { value, text: names?.[index] ?? value, selected: block[key] === value })));
    select.addEventListener('change', () => { block[key] = select.value; schedule(); });
    return el('label', { className: 'boceto-label', text: label }, [select]);
  }
  function photoPick(block: any, key: string) {
    const select = el('select', { className: 'boceto-select' });
    select.dataset.bocetoField = key;
    select.append(el('option', { value: '', text: 'Sin foto', selected: !block[key] }));
    for (const path of photos) select.append(el('option', { value: path, text: path.replace(/^assets\//, ''), selected: block[key] === path }));
    select.addEventListener('change', () => { if (select.value) block[key] = select.value; else delete block[key]; schedule(); });
    return el('label', { className: 'boceto-label', text: 'Foto' }, [select]);
  }

  function blockForm(block: any) {
    const form = el('div', { className: 'boceto-fields' });
    for (const [key, label] of TEXT_FIELDS[block.type] || []) form.append(field(block, key, label));
    if (block.type === 'story') form.append(lines(block, 'paragraphs', 'Párrafos (uno por línea)', items => items.join('\n'), value => value.split('\n').filter(Boolean)));
    if (block.type === 'reviews') form.append(lines(block, 'quotes', 'Reseñas (texto — nombre)', items => items.map((q: any) => `${q.text} — ${q.name}`).join('\n'), value => value.split('\n').filter(Boolean).map(line => { const [text, name] = line.split(' — '); return { text: text || '', name: name || 'Cliente' }; })));
    if (block.type === 'faq') form.append(lines(block, 'items', 'Preguntas (pregunta — respuesta)', items => items.map((i: any) => `${i.q} — ${i.a}`).join('\n'), value => value.split('\n').filter(Boolean).map(line => { const [q, a] = line.split(' — '); return { q: q || '', a: a || '' }; })));
    if (block.type === 'hero') { form.append(choice(block, 'variant', 'Composición', ['photo-right', 'full-bleed', 'stacked'], ['Foto a la derecha', 'Foto completa', 'Apilada'])); form.append(photoPick(block, 'photo')); }
    if (block.type === 'story' || block.type === 'split') form.append(photoPick(block, 'photo'));
    if (block.type === 'split') { form.append(field(block, 'href', 'Enlace')); form.append(lines(block, 'pills', 'Pastillas (una por línea)', items => items.join('\n'), value => value.split('\n').filter(Boolean))); }
    if (block.type === 'banner') form.append(field(block, 'href', 'Enlace'));
    if (block.type === 'footer') form.append(choice(block, 'wordmark', 'Nombre gigante', ['giant', 'plain'], ['Sí', 'Discreto']));
    if (block.type === 'gallery') {
      const wrap = el('div', { className: 'boceto-gallery' });
      for (const path of photos) {
        const box = el('input', { type: 'checkbox', checked: (block.photos || []).includes(path) });
        box.addEventListener('change', () => { block.photos = box.checked ? [...(block.photos || []), path] : (block.photos || []).filter((p: string) => p !== path); schedule(); });
        wrap.append(el('label', { className: 'boceto-check', text: path.replace(/^assets\//, '') }, [box]));
      }
      form.append(el('div', { className: 'boceto-label', text: 'Fotos' }, [wrap]));
    }
    form.append(choice(block, 'bg', 'Fondo', BG_ROLES as unknown as string[], ['Claro', 'Tinta', 'Acento', 'Profundo', 'Vivo']));
    form.append(choice(block, 'size', 'Tamaño', SIZES, ['S', 'M', 'L', 'XL']));
    return form;
  }

  function draw() {
    if (!host || !opts) return;
    if (!sketch) { host.replaceChildren(); return; }
    const root = el('section', { className: 'boceto-panel' });
    const close = el('button', { type: 'button', className: 'boceto-close', text: '✕', title: 'Cerrar' });
    close.addEventListener('click', () => opts?.close?.());
    statusNode = el('p', { text: pending ? 'Guardando…' : note || '100% editable · se guarda solo' });
    root.append(el('header', { className: 'boceto-head' }, [el('h2', { text: 'Boceto' }), statusNode, close]));
    const style = el('div', { className: 'boceto-style' });
    style.append(choice(sketch, 'scale', 'Escala', SIZES, ['S', 'M', 'L', 'XL']));
    style.append(choice(sketch.fonts, 'display', 'Fuente títulos', fonts));
    style.append(choice(sketch.fonts, 'text', 'Fuente texto', fonts));
    for (const role of BG_ROLES) {
      const color = el('input', { type: 'color', value: sketch.palette[role] });
      color.addEventListener('input', () => { sketch!.palette[role] = color.value; schedule(); });
      style.append(el('label', { className: 'boceto-swatch', text: role }, [color]));
    }
    root.append(style);
    const list = el('div', { className: 'boceto-blocks' });
    sketch.blocks.forEach((block, index) => {
      const row = el('div', { className: `boceto-block${selected === block.id ? ' is-selected' : ''}` });
      row.dataset.bocetoBlock = block.id;
      const title = el('button', { type: 'button', className: 'boceto-block__name', text: `${TYPE_LABEL[block.type] || block.type} · ${String(block.headline || block.title || block.text || block.tagline || '').slice(0, 26)}` });
      row.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.boceto-block__tools, .boceto-fields')) return; selected = selected === block.id ? '' : block.id; draw(); });
      const tools = el('div', { className: 'boceto-block__tools' });
      const move = (delta: number) => { const target = index + delta; if (target < 0 || target >= sketch!.blocks.length) return; sketch!.blocks.splice(target, 0, sketch!.blocks.splice(index, 1)[0]); schedule(); draw(); };
      const up = el('button', { type: 'button', text: '↑', title: 'Mover arriba' }); up.dataset.bocetoMoveUp = ''; up.addEventListener('click', () => move(-1));
      const down = el('button', { type: 'button', text: '↓', title: 'Mover abajo' }); down.dataset.bocetoMoveDown = ''; down.addEventListener('click', () => move(1));
      const dup = el('button', { type: 'button', text: '⧉', title: 'Duplicar' }); dup.dataset.bocetoDuplicate = ''; dup.addEventListener('click', () => { let copy = `${block.id}-copia`; let n = 2; while (sketch!.blocks.some(item => item.id === copy)) copy = `${block.id}-copia-${n++}`; sketch!.blocks.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(block)), id: copy.slice(0, 32) }); schedule(); draw(); });
      const kill = el('button', { type: 'button', text: '✕', title: 'Eliminar' }); kill.dataset.bocetoDelete = ''; kill.addEventListener('click', () => { sketch!.blocks.splice(index, 1); schedule(); draw(); });
      tools.append(up, down, dup, kill);
      row.append(title, tools);
      if (selected === block.id) row.append(blockForm(block));
      list.append(row);
    });
    root.append(list);
    const add = el('select', { className: 'boceto-select' }); add.dataset.bocetoAdd = '';
    for (const type of Object.keys(DEFAULT_BLOCK)) add.append(el('option', { value: type, text: TYPE_LABEL[type] }));
    const addButton = el('button', { type: 'button', className: 'boceto-add', text: '+ Añadir bloque', disabled: sketch.blocks.length >= 20 }); addButton.dataset.bocetoAddButton = '';
    addButton.addEventListener('click', () => {
      const block = { ...JSON.parse(JSON.stringify(DEFAULT_BLOCK[add.value])), id: '' };
      const footerIndex = sketch!.blocks.findIndex(item => item.type === 'footer');
      sketch!.blocks.splice(footerIndex === -1 ? sketch!.blocks.length : footerIndex, 0, block);
      schedule(); draw();
    });
    root.append(el('div', { className: 'boceto-adder' }, [add, addButton]));
    if (opts.locked) root.querySelectorAll('input,select,textarea,button').forEach(node => ((node as HTMLInputElement).disabled = true));
    rootNode = root;
    host.replaceChildren(root);
  }

  const setByPath = (block: any, path: string, value: string) => {
    const parts = path.split('.');
    let node: any = block;
    for (let i = 0; i < parts.length - 1; i++) { node = node?.[/^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i]]; if (node == null) return; }
    const leaf = parts[parts.length - 1];
    const key = /^\d+$/.test(leaf) ? Number(leaf) : leaf;
    if (node == null || typeof node !== 'object') return;
    node[key] = value.slice(0, MAXLEN[String(leaf)] ?? (path.startsWith('paragraphs') ? 600 : 200));
  };
  return {
    /** The preview reported a click on a section: open its form in the panel. */
    remoteSelect(id: string) {
      if (!sketch) return;
      selected = id; draw();
      if (!/^[a-z0-9-]{1,40}$/.test(id)) return;
      host?.querySelector(`[data-boceto-block="${id}"]`)?.scrollIntoView?.({ block: 'nearest' });
    },
    /** The preview dropped a section at a new position (index over the rendered section order). */
    remoteReorder(id: string, index: number) {
      if (!sketch) return;
      const from = sketch.blocks.findIndex(block => block.id === id);
      if (from === -1) return;
      const [block] = sketch.blocks.splice(from, 1);
      sketch.blocks.splice(Math.max(0, Math.min(index, sketch.blocks.length)), 0, block);
      selected = id; schedule(); draw();
    },
    /** The preview edited a text in place. */
    remoteText(id: string, field: string, value: string) {
      if (!sketch || typeof field !== 'string' || !/^[a-z]+(\.\d+)?(\.[a-z]+)?$/.test(field)) return;
      const block = sketch.blocks.find(item => item.id === id);
      if (!block) return;
      setByPath(block, field, value);
      selected = id; schedule(); draw();
    },
    mount(target: HTMLElement, options: Mount) {
      host = target; opts = options; note = '';
      const born = options.version.snapshot.files.some(file => file.path === 'sketch.json');
      if (!born) { sketch = null; mountedStore = ''; host.replaceChildren(); return; }
      // A re-render of the Studio must not refetch or discard in-progress edits: re-attach the live panel.
      if (sketch && rootNode && mountedStore === options.storeId && (mountedRevision === options.version.revision || pending || timer)) { host.replaceChildren(rootNode); return; }
      const token = ++mountToken;
      void api.getSketch(options.storeId).then(result => {
        if (token !== mountToken) return;
        mountedStore = options.storeId; mountedRevision = result.revision;
        revision = result.revision; sketch = result.sketch as Sketch; photos = result.photos; fonts = result.fonts; lastSaved = JSON.stringify(sketch);
        if (!sketch) { host?.replaceChildren(); return; }
        draw();
      }).catch(() => { if (token === mountToken) { sketch = null; host?.replaceChildren(); } });
    },
  };
}
