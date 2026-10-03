import { ApiError } from './api';
import type { MerchantStudioApi, SourceVersion } from './api';
import './source-boceto.css';
import { prepareSourceImage } from './source-images';
import { sketchApplyMove, sketchCanMove, sketchCanRemove, sketchFindNode, sketchGroup, sketchNodeTree, sketchRemoveNode, SKETCH_TWO_COLUMN, type SketchNode } from '@pagosya/shared-types';

/** Boceto: a Figma-style inspector for sketch-born stores. Text is edited directly on the canvas
 * (double-click); this panel holds only properties — page styles, block looks, order and media.
 * Every change applies LIVE in the preview via `apply` and saves silently in the background. */

type SketchStyle = { radius: string; buttons: string; cards: string; header: string; footer: string };
type Sketch = { palette: Record<'paper' | 'ink' | 'accent' | 'deep' | 'pop', string>; fonts: { display: string; text: string }; scale: string; style?: SketchStyle; account?: any; blocks: any[] };
type BlockApply = { layout?: Record<string, Record<string, string>>; bg?: string; ink?: string; size?: string; variant?: string; align?: string; flip?: boolean; form?: string; photos?: Record<string, string>; cardRatio?: string; cardDesc?: string; cardAdd?: string };
type SelectionPayload = { id: string; path: string; label: string; movable: boolean; movableChildren: string[] };
type ApplyPayload = { vars?: Record<string, string>; style?: Partial<SketchStyle>; blocks?: Record<string, BlockApply>; selection?: SelectionPayload };
/** `reload` re-renders the preview from a saved revision: needed after structural edits (add/remove/reorder). */
type Mount = { storeId: string; version: SourceVersion; locked: boolean; saved: (revision: number) => Promise<void>; close?: () => void; apply?: (payload: ApplyPayload) => void; reload?: (revision: number) => void };

const STYLE_CONTROLS: Array<{ key: keyof SketchStyle; label: string; values: string[]; names: string[] }> = [
  { key: 'radius', label: 'Esquinas', values: ['round', 'soft', 'square'], names: ['Redondas', 'Suaves', 'Rectas'] },
  { key: 'buttons', label: 'Botones', values: ['pill', 'square', 'outline'], names: ['Píldora', 'Rectos', 'Contorno'] },
  { key: 'cards', label: 'Tarjetas', values: ['bleed', 'inset', 'outline'], names: ['Foto llena', 'Con margen', 'Contorno'] },
  { key: 'header', label: 'Cabecera', values: ['left', 'center'], names: ['Logo izq.', 'Logo centro'] },
  { key: 'footer', label: 'Pie', values: ['columns', 'center'], names: ['Columnas', 'Centrado'] },
];
const DEFAULT_STYLE: SketchStyle = { radius: 'round', buttons: 'pill', cards: 'bleed', header: 'left', footer: 'columns' };
const PHOTO_BLOCKS = ['hero', 'split', 'story', 'newsletter'];

const PALETTE_ROLES = ['paper', 'ink', 'accent', 'deep', 'pop'] as const;
const BG_ROLES = ['paper', 'ink', 'accent', 'deep', 'pop', 'tint-accent', 'tint-deep', 'tint-pop'] as const;
const ROLE_LABEL: Record<string, string> = { paper: 'Papel', ink: 'Tinta', accent: 'Acento', deep: 'Profundo', pop: 'Vivo', 'tint-accent': 'Pastel acento', 'tint-deep': 'Pastel profundo', 'tint-pop': 'Pastel vivo' };
const SIZES = ['s', 'm', 'l', 'xl'];
const TYPE_LABEL: Record<string, string> = { announce: 'Aviso', split: 'Panel doble', steps: 'Pasos', hero: 'Portada', marquee: 'Marquesina', catalog: 'Catálogo', collections: 'Colecciones', story: 'Historia', reviews: 'Reseñas', faq: 'Preguntas', banner: 'Banner', gallery: 'Galería', newsletter: 'Boletín', footer: 'Pie de página', account: 'Cuenta · ingreso y registro' };
const MARQUEE_GLYPHS = ['·', '✦', '•', '◆', '★'];
/** Item lists the inspector can grow and shrink; text itself is edited on the canvas. */
const LISTS: Record<string, Array<{ key: string; label: string; max: number; make: () => any; peek: (item: any) => string }>> = {
  account: [{ key: 'perks', label: 'beneficio', max: 4, make: () => ({ icon: 'sparkles', text: 'Un beneficio de tener cuenta' }), peek: item => item.text }],
  reviews: [{ key: 'quotes', label: 'reseña', max: 6, make: () => ({ text: 'Escribe aquí lo que dijo tu cliente.', name: 'Cliente', place: '' }), peek: item => item.text }],
  faq: [{ key: 'items', label: 'pregunta', max: 6, make: () => ({ q: '¿Nueva pregunta?', a: 'Tu respuesta.' }), peek: item => item.q }],
  steps: [{ key: 'items', label: 'paso', max: 4, make: () => ({ icon: 'sparkles', title: 'Nuevo paso', text: 'Cuéntalo en una línea.' }), peek: item => item.title }],
  collections: [{ key: 'items', label: 'categoría', max: 4, make: () => ({ title: 'Nueva categoría', text: 'Una línea que la describa.' }), peek: item => item.title }],
  story: [{ key: 'paragraphs', label: 'párrafo', max: 6, make: () => 'Un párrafo más de tu historia.', peek: item => item }],
  split: [
    { key: 'boxes', label: 'cajita', max: 3, make: () => ({ title: 'Título', text: 'Una línea' }), peek: item => item.title },
    { key: 'stats', label: 'cifra', max: 4, make: () => ({ value: '24h', label: 'de preparación' }), peek: item => `${item.value} ${item.label}` },
    { key: 'pills', label: 'etiqueta', max: 6, make: () => 'Nueva etiqueta', peek: item => item },
  ],
};
const DEFAULT_BLOCK: Record<string, object> = {
  announce: { type: 'announce', left: 'Hecho fresco cada semana', right: 'Envíos a todo el país', bg: 'pop', size: 's' },
  split: { type: 'split', headline: 'Mezcla y combina', body: 'Arma tu caja a tu manera.', cta: 'Armar mi caja', cta2: '', href: 'checkout.html', pills: ['6 unidades', '12 unidades'], stats: [], sticker: '', bg: 'accent', size: 'l' },
  hero: { type: 'hero', variant: 'photo-right', headline: 'Un título con carácter', sub: '', cta: 'Ver productos', cta2: '', trust: '', badge: '', note: '', sticker: '', bg: 'paper', size: 'l' },
  steps: { type: 'steps', title: 'Así de simple', items: [{ icon: 'sparkles', title: 'Elige', text: 'Lo que más te guste.' }, { icon: 'package', title: 'Preparamos', text: 'Con calma y cuidado.' }, { icon: 'smile', title: 'Disfruta', text: 'Directo a tu puerta.' }], bg: 'paper', size: 'm' },
  marquee: { type: 'marquee', text: 'Hecho con calma · Hecho aquí', glyph: '✦', bg: 'pop', size: 's' },
  catalog: { type: 'catalog', kicker: '', title: 'Nuestros productos', seeAll: '', badges: [], stripLeft: '', stripRight: '', bg: 'paper', size: 'm' },
  collections: { type: 'collections', title: 'Un antojo para cada día', items: [{ title: 'Clásicos', text: 'Los de siempre.' }, { title: 'Nuevos', text: 'Los recién llegados.' }, { title: 'Favoritos', text: 'Los más pedidos.' }], bg: 'paper', size: 'm' },
  story: { type: 'story', title: 'Nuestra historia', paragraphs: ['Cuenta aquí tu proceso.'], bg: 'accent', size: 'l' },
  reviews: { type: 'reviews', title: 'Clientes felices', ratingValue: '', ratingSource: '', handle: '', quotes: [{ text: 'Me encantó.', name: 'Cliente' }], photos: [], bg: 'tint-accent', size: 'm' },
  faq: { type: 'faq', title: 'Preguntas', items: [{ q: '¿Hacen envíos?', a: 'Sí.' }], bg: 'paper', size: 'm' },
  banner: { type: 'banner', headline: 'Haz espacio para algo bueno', cta: 'Comprar', href: 'checkout.html', sticker: '', bg: 'pop', size: 'xl' },
  gallery: { type: 'gallery', title: 'Galería', photos: [], bg: 'paper', size: 'm' },
  newsletter: { type: 'newsletter', variant: 'center', title: 'Novedades', note: '', cta: 'Suscribirme', bg: 'deep', size: 'm' },
};
const MAXLEN: Record<string, number> = { headline: 120, title: 120, badge: 60, cta: 60, cta2: 60, trust: 120, note: 160, sticker: 40, caption: 80, tag: 60, place: 40, left: 200, right: 200, text: 200, kicker: 80, sub: 200, tagline: 200, body: 600, href: 200, q: 200, a: 600, name: 60, seeAll: 60, stripLeft: 200, stripRight: 200, ratingValue: 10, ratingSource: 60, handle: 40, value: 20, label: 40 };

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => { const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (high + 0.05) / (low + 0.05); };
const inkFor = (bg: string, preferred: string) => contrast(bg, preferred) >= 4.5 ? preferred : contrast(bg, '#111111') >= contrast(bg, '#ffffff') ? '#111111' : '#ffffff';
/** Same tint derivation as the API: 16% of a palette role mixed into paper. */
const mixHex = (a: string, b: string, weight: number) => {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const channel = (shift: number) => Math.round(((na >> shift) & 255) * weight + ((nb >> shift) & 255) * (1 - weight));
  return '#' + [16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('');
};
const resolveBg = (palette: Sketch['palette'], bg: string) =>
  bg === 'tint-accent' || bg === 'tint-deep' || bg === 'tint-pop' ? mixHex(palette[bg.slice(5) as 'accent' | 'deep' | 'pop'], palette.paper, 0.16) : (palette[bg as keyof Sketch['palette']] || palette.paper);

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
  let selected = '', selectedPath = '', timer: ReturnType<typeof setTimeout> | null = null, pending = false, note = '';
  let editSeq = 0, lastSaved = '', statusNode: HTMLElement | null = null, rootNode: HTMLElement | null = null, mountToken = 0;
  let mountedStore = '', mountedRevision = -1;
  const expanded = new Set<string>();
  // Structural edits (items or blocks added, removed, reordered from the panel) cannot apply live: the next
  // save reloads the preview. Photo swaps apply live as inline data, only for the slots that changed.
  let structural = false;
  const changedPhotos = new Map<string, Set<string>>();
  let picker: { kind: 'photo'; blockId: string; slot: string } | { kind: 'icon'; blockId: string; path: string; query: string; results: Array<{ name: string; svg: string }> | null } | null = null;

  // Photos uploaded during this session show from local data until the next preview reload brings their files.
  const localPhotos = new Map<string, string>();
  let uploading = false;
  const status = (text: string) => { if (statusNode) statusNode.textContent = text; };
  /** A snapshot photo as something the sandboxed preview and the picker thumbnails can show. */
  const photoSrc = (path: string) => {
    if (localPhotos.has(path)) return localPhotos.get(path)!;
    const file = opts?.version.snapshot.files.find(item => item.path === path);
    if (!file) return '';
    if (file.encoding === 'url') return file.content;
    if (file.encoding !== 'base64') return '';
    const ext = (path.split('.').pop() || '').toLowerCase();
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${file.content}`;
  };
  /** Page blocks plus the account page, which edits like a block (id 'account') but lives on its own pages. */
  const allBlocks = (): any[] => (sketch ? [...sketch.blocks, ...(sketch.account ? [sketch.account] : [])] : []);
  const getPath = (block: any, path: string) => path.split('.').reduce((node: any, part) => (node == null ? undefined : node[/^\d+$/.test(part) ? Number(part) : part]), block);
  /** Push the current look into the live preview — no reload, no save needed. */
  const applyLive = () => {
    if (!opts?.apply || !sketch) return;
    const vars: Record<string, string> = {
      '--skb-paper': sketch.palette.paper,
      '--skb-page-ink': inkFor(sketch.palette.paper, sketch.palette.ink),
      '--skb-accent': sketch.palette.accent,
      '--skb-accent-ink': inkFor(sketch.palette.accent, sketch.palette.ink),
      '--skb-deep': sketch.palette.deep,
      '--skb-pop': sketch.palette.pop,
      '--skb-pop-ink': inkFor(sketch.palette.pop, sketch.palette.ink),
      '--skb-tint-1': mixHex(sketch.palette.accent, sketch.palette.paper, 0.16),
      '--skb-tint-2': mixHex(sketch.palette.deep, sketch.palette.paper, 0.16),
      '--skb-tint-3': mixHex(sketch.palette.pop, sketch.palette.paper, 0.16),
    };
    const blocks: NonNullable<ApplyPayload['blocks']> = {};
    const RATIO: Record<string, string> = { '4-3': '4 / 3', '1-1': '1 / 1', '3-4': '3 / 4' };
    for (const block of allBlocks()) {
      const bg = resolveBg(sketch.palette, block.bg);
      const slots = changedPhotos.get(block.id);
      const photoMap = slots ? Object.fromEntries([...slots].map(slot => [slot, photoSrc(String(getPath(block, slot) || ''))]).filter(([, src]) => src.startsWith('data:image/'))) : undefined;
      blocks[block.id] = { bg, ink: inkFor(bg, sketch.palette.ink), size: block.size, align: block.align === 'center' || block.align === 'end' ? block.align : 'start', flip: block.flip === true, ...(block.type === 'hero' ? { variant: block.variant } : {}), ...(block.type === 'newsletter' ? { form: block.form || 'pill' } : {}), ...(photoMap ? { photos: photoMap } : {}), ...(block.type === 'account' ? {} : { layout: block.layout || {} }), ...(block.type === 'catalog' ? { cardRatio: RATIO[block.cardRatio] || '4 / 3', cardDesc: block.cardDesc === false ? 'off' : 'on', cardAdd: block.cardAdd === false ? 'off' : 'on' } : {}) };
    }
    changedPhotos.clear();
    opts.apply({ vars, style: { ...DEFAULT_STYLE, ...(sketch.style || {}) }, blocks });
  };
  const selectedBlock = (): any => (selected ? allBlocks().find(block => block.id === selected) : undefined);
  function selectionPayload(): SelectionPayload {
    const block = selectedBlock();
    if (!block) return { id: '', path: '', label: '', movable: false, movableChildren: [] };
    const tree = sketchNodeTree(block);
    const node = selectedPath ? sketchFindNode(tree, selectedPath) : undefined;
    const children = node ? node.children : selectedPath ? [] : tree;
    return { id: block.id, path: node ? selectedPath : '', label: node?.label ?? (TYPE_LABEL[block.type] || block.type),
      movable: node ? sketchCanMove(block, selectedPath) : false, movableChildren: children.filter(child => sketchCanMove(block, child.path)).map(child => child.key) };
  }
  const syncSelection = () => { try { opts?.apply?.({ selection: selectionPayload() }); } catch { /* frame gone */ } };
  /** Point the selection at a path inside a block, falling back to the nearest node that still exists. */
  function focusNode(id: string, path: string) {
    const block = allBlocks().find(item => item.id === id);
    if (!block) { selected = ''; selectedPath = ''; return; }
    const tree = sketchNodeTree(block);
    let next = path;
    while (next && !sketchFindNode(tree, next)) next = next.split('/').slice(0, -1).join('/');
    selected = id; selectedPath = next; expanded.add(id);
  }
  function moveSelection(delta: -1 | 1) {
    if (!sketch || !selected) return;
    if (!selectedPath) {
      const index = sketch.blocks.findIndex(block => block.id === selected);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= sketch.blocks.length) return;
      sketch.blocks.splice(target, 0, sketch.blocks.splice(index, 1)[0]);
      scheduleStructural(); draw(); return;
    }
    const block = selectedBlock();
    if (!block || !sketchCanMove(block, selectedPath)) return;
    const parts = selectedPath.split('/'); const key = parts.pop()!; const parentPath = parts.join('/');
    const tree = sketchNodeTree(block);
    const siblings = (parentPath ? sketchFindNode(tree, parentPath)?.children ?? [] : tree).filter(node => sketchCanMove(block, node.path)).map(node => node.key);
    const index = siblings.indexOf(key), target = index + delta;
    if (index === -1 || target < 0 || target >= siblings.length) return;
    const order = [...siblings]; order.splice(target, 0, order.splice(index, 1)[0]);
    if (!sketchApplyMove(block, parentPath, order)) return;
    if (/^\d+$/.test(key)) selectedPath = [...parts, String(target)].join('/');
    scheduleStructural(); draw();
  }
  function removeSelection() {
    if (!selected) return;
    if (!selectedPath) { deleteBlock(selected); return; }
    const block = selectedBlock();
    if (!block || !sketchRemoveNode(block, selectedPath)) return;
    focusNode(selected, selectedPath.split('/').slice(0, -1).join('/'));
    scheduleStructural(); draw();
  }
  const schedule = () => { editSeq++; applyLive(); if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 1200); };
  const scheduleStructural = () => { structural = true; schedule(); };

  async function save() {
    if (!opts || !sketch || pending) return;
    const payload = JSON.stringify(sketch);
    if (payload === lastSaved) return;
    const seqAtSave = editSeq;
    const reloadAfter = structural;
    structural = false;
    pending = true; status('Guardando…');
    try {
      const result = await api.putSketch(opts.storeId, { revision, sketch });
      revision = result.revision; mountedRevision = result.revision;
      const caughtUp = editSeq === seqAtSave;
      if (caughtUp) {
        sketch = result.sketch as Sketch; lastSaved = JSON.stringify(sketch); note = ''; pending = false; draw();
      } else {
        lastSaved = payload; pending = false; status('Guardando…');
        if (reloadAfter) structural = true;
        schedule();
      }
      try { await opts.saved(revision); } catch { /* resync is best-effort */ }
      if (reloadAfter && caughtUp) opts.reload?.(revision);
      return;
    } catch (error) {
      pending = false;
      if (reloadAfter) structural = true;
      if (error instanceof ApiError && error.status === 409) {
        try { const fresh = await api.getSketch(opts.storeId); revision = fresh.revision; sketch = fresh.sketch as Sketch; lastSaved = JSON.stringify(sketch); note = 'El boceto cambió en otra pestaña; se recargó.'; } catch { note = 'Se conservó la versión anterior.'; }
        draw();
      } else {
        status('Reintentando…');
        if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 2500);
      }
    }
  }

  /** A Figma-style labeled row: name on the left, control on the right. */
  const row = (label: string, control: HTMLElement) => el('div', { className: 'bct-row' }, [el('span', { className: 'bct-row__label', text: label }), control]);
  const section = (title: string, children: HTMLElement[]) => el('div', { className: 'bct-section' }, [el('h3', { className: 'bct-section__title', text: title }), ...children]);

  function select(value: string, values: readonly string[], names: string[] | undefined, onChange: (next: string) => void) {
    const control = el('select', { className: 'bct-select' });
    values.forEach((item, index) => control.append(el('option', { value: item, text: names?.[index] ?? item, selected: item === value })));
    control.addEventListener('change', () => onChange(control.value));
    return control;
  }
  function segment(value: string, values: readonly string[], names: string[], onChange: (next: string) => void) {
    const wrap = el('div', { className: 'bct-segment' });
    values.forEach((item, index) => {
      const button = el('button', { type: 'button', className: `bct-segment__option${item === value ? ' is-on' : ''}`, text: names[index] });
      button.addEventListener('click', () => onChange(item));
      wrap.append(button);
    });
    return wrap;
  }
  function colorRow(label: string, value: string, onChange: (next: string) => void) {
    const input = el('input', { type: 'color', value, className: 'bct-color' });
    input.addEventListener('input', () => onChange(input.value));
    return row(label, el('div', { className: 'bct-color__wrap' }, [input, el('span', { className: 'bct-color__hex', text: value })]));
  }
  /** Figma-style fill picker: the background roles as color swatches, not words. */
  function bgSwatches(value: string, onChange: (next: string) => void) {
    const wrap = el('div', { className: 'bct-swatches' });
    for (const role of BG_ROLES) {
      const button = el('button', { type: 'button', className: `bct-swatch${role === value ? ' is-on' : ''}`, title: ROLE_LABEL[role] });
      button.style.background = sketch ? resolveBg(sketch.palette, role) : '#ffffff';
      button.addEventListener('click', () => onChange(role));
      wrap.append(button);
    }
    return wrap;
  }

  function blockProps(block: any) {
    const children: HTMLElement[] = [];
    children.push(row('Fondo', bgSwatches(block.bg, next => { block.bg = next; schedule(); draw(); })));
    if (block.type !== 'account') children.push(row('Tamaño', segment(block.size, SIZES, ['S', 'M', 'L', 'XL'], next => { block.size = next; schedule(); draw(); })));
    if (block.type === 'catalog') {
      children.push(row('Foto', segment(['4-3', '1-1', '3-4'].includes(block.cardRatio) ? block.cardRatio : '4-3', ['4-3', '1-1', '3-4'], ['4:3', '1:1', '3:4'], next => { block.cardRatio = next; schedule(); })));
      children.push(row('Descripción', segment(block.cardDesc === false ? 'off' : 'on', ['on', 'off'], ['Sí', 'No'], next => { block.cardDesc = next === 'on'; schedule(); })));
      children.push(row('Botón añadir', segment(block.cardAdd === false ? 'off' : 'on', ['on', 'off'], ['Sí', 'No'], next => { block.cardAdd = next === 'on'; schedule(); })));
    }
    if (block.type === 'hero') children.push(row('Composición', select(block.variant, ['photo-right', 'full-bleed', 'stacked'], ['Foto derecha', 'Completa', 'Apilada'], next => { block.variant = next; schedule(); })));
    // Symmetry: copy alignment for every content block, and which side the photo sits on.
    if (block.type === 'footer') children.push(row('Alineación', segment(block.align === 'center' || block.align === 'end' ? block.align : 'start', ['start', 'center', 'end'], ['Izq.', 'Centro', 'Der.'], next => { if (next === 'start') delete block.align; else block.align = next; schedule(); draw(); })));
    if (PHOTO_BLOCKS.includes(block.type)) children.push(row('Foto al lado', segment(block.flip ? 'left' : 'right', ['left', 'right'], ['Izquierdo', 'Derecho'], next => { if (next === 'left') block.flip = true; else delete block.flip; schedule(); draw(); })));
    if ((block.type === 'hero' || block.type === 'split') && block.cta2) {
      const swap = el('button', { type: 'button', className: 'bct-chip', text: '⇄ Intercambiar botones' });
      swap.addEventListener('click', () => { if (block.swap) delete block.swap; else block.swap = true; scheduleStructural(); draw(); });
      children.push(row('Botones', swap));
    }
    if ((block.type === 'hero' || block.type === 'split' || block.type === 'banner') && block.stickerPos) {
      const reset = el('button', { type: 'button', className: 'bct-chip', text: 'Reiniciar posición' });
      reset.addEventListener('click', () => { delete block.stickerPos; scheduleStructural(); draw(); });
      children.push(row('Sticker', reset));
    }
    if (block.type === 'marquee') children.push(row('Separador', segment(MARQUEE_GLYPHS.includes(block.glyph) ? block.glyph : '·', MARQUEE_GLYPHS, MARQUEE_GLYPHS, next => { block.glyph = next; scheduleStructural(); draw(); })));
    if (block.type === 'newsletter') {
      children.push(row('Composición', segment(block.variant === 'split' ? 'split' : 'center', ['center', 'split'], ['Centrada', 'Con foto'], next => { block.variant = next; scheduleStructural(); draw(); })));
      children.push(row('Formulario', segment(['pill', 'stacked', 'underline', 'card'].includes(block.form) ? block.form : 'pill', ['pill', 'stacked', 'underline', 'card'], ['Píldora', 'Apilado', 'Línea', 'Tarjeta'], next => { block.form = next; schedule(); draw(); })));
    }
    if (block.type === 'footer') children.push(row('Nombre gigante', segment(block.wordmark, ['giant', 'plain'], ['Sí', 'No'], next => { block.wordmark = next; scheduleStructural(); draw(); })));
    if (block.type === 'account') {
      children.push(row('Diseño', segment(block.layout === 'center' ? 'center' : 'split', ['split', 'center'], ['Foto + formulario', 'Centrado'], next => { block.layout = next; scheduleStructural(); draw(); })));
      children.push(row('Foto', photoButton(block, 'photo')));
      (block.perks || []).forEach((perk: any, index: number) => children.push(row(`Ícono ${index + 1}`, iconButton(block, `perks.${index}.icon`, perk.icon))));
      children.push(el('p', { className: 'bct-hint', text: 'El formulario de ingreso lo pone pagosYa de forma segura: tú diseñas todo lo que lo rodea. Mira esta página en la pestaña Cuenta.' }));
    }
    if (PHOTO_BLOCKS.includes(block.type)) children.push(row('Foto', photoButton(block, 'photo')));
    if (block.type === 'collections') (block.items || []).forEach((item: any, index: number) => children.push(row(`Foto ${index + 1}`, photoButton(block, `items.${index}.photo`))));
    if (block.type === 'gallery' || block.type === 'reviews') children.push(row(block.type === 'gallery' ? 'Fotos' : 'Fotos clientes', photoToggles(block)));
    if (block.type === 'steps') (block.items || []).forEach((item: any, index: number) => children.push(row(`Ícono ${index + 1}`, iconButton(block, `items.${index}.icon`, item.icon))));
    if (block.type === 'split') (block.boxes || []).forEach((box: any, index: number) => children.push(row(`Ícono caja ${index + 1}`, iconButton(block, `boxes.${index}.icon`, box.icon))));
    for (const spec of LISTS[block.type] || []) children.push(listEditor(block, spec));
    if (block.type !== 'account') {
      const remove = el('button', { type: 'button', className: 'bct-remove', text: 'Eliminar bloque' });
      remove.dataset.bocetoRemoveSelected = '';
      remove.addEventListener('click', () => deleteBlock(block.id));
      children.push(remove);
    }
    children.push(el('p', { className: 'bct-hint', text: 'Haz clic otra vez dentro del bloque para elegir una parte (columna, botones, foto…). Toca dos veces un texto para editarlo. Supr elimina lo seleccionado.' }));
    return section(TYPE_LABEL[block.type] || block.type, children);
  }

  /** Inspector for a group or element inside a block, Figma-style: the controls of what is selected. */
  function nodeProps(block: any, path: string) {
    const node = sketchFindNode(sketchNodeTree(block), path);
    const key = path.split('/').pop()!;
    const kind = /^\d+$/.test(key) ? undefined : sketchGroup(block.type, key)?.kind;
    const children: HTMLElement[] = [];
    const current = (field: string): string => block.layout?.[key]?.[field] ?? '';
    const setLayout = (field: string, value: string) => {
      const all = { ...(block.layout || {}) }; const entry = { ...(all[key] || {}) };
      if (value) entry[field] = value; else delete entry[field];
      if (Object.keys(entry).length) all[key] = entry; else delete all[key];
      if (Object.keys(all).length) block.layout = all; else delete block.layout;
      schedule(); draw();
    };
    const gapRow = () => row('Espacio', segment(current('gap'), ['', 's', 'm', 'l'], ['Auto', 'S', 'M', 'L'], next => setLayout('gap', next)));
    const blockAlign = (values: string[], names: string[]) => row('Alineación', segment(block.align === 'center' || block.align === 'end' ? block.align : 'start', values, names, next => { if (next === 'start') delete block.align; else block.align = next; schedule(); draw(); }));
    const layoutAllowed = block.type !== 'account';
    if (kind === 'column') {
      if (key === 'copy') children.push(blockAlign(['start', 'center', 'end'], ['Izq.', 'Centro', 'Der.']));
      if (layoutAllowed) children.push(gapRow());
      if (layoutAllowed && key === 'copy' && SKETCH_TWO_COLUMN.includes(block.type)) children.push(row('Vertical', segment(current('valign'), ['', 'start', 'center', 'end'], ['Auto', 'Arriba', 'Centro', 'Abajo'], next => setLayout('valign', next))));
    } else if (kind === 'row' && layoutAllowed) {
      children.push(row('Dirección', segment(current('dir'), ['', 'column'], ['Horizontal', 'Vertical'], next => setLayout('dir', next))));
      children.push(gapRow());
      children.push(row('Alineación', segment(current('align'), ['', 'center', 'end'], ['Inicio', 'Centro', 'Final'], next => setLayout('align', next))));
    } else if (kind === 'head') {
      children.push(blockAlign(['start', 'center'], ['Izq.', 'Centro']));
    } else if (kind === 'items' && layoutAllowed) {
      children.push(gapRow());
    } else if (kind === 'media') {
      children.push(row('Foto al lado', segment(block.flip ? 'left' : 'right', ['left', 'right'], ['Izquierdo', 'Derecho'], next => { if (next === 'left') block.flip = true; else delete block.flip; schedule(); draw(); })));
      children.push(row('Foto', photoButton(block, 'photo')));
    } else if (!kind) {
      children.push(el('p', { className: 'bct-hint', text: 'Toca dos veces este texto en el lienzo para editarlo.' }));
    }
    if (sketchCanRemove(block, path)) {
      const remove = el('button', { type: 'button', className: 'bct-remove', text: `Quitar ${String(node?.label ?? '').toLowerCase()}` });
      remove.dataset.bocetoRemoveNode = '';
      remove.addEventListener('click', () => removeSelection());
      children.push(remove);
    }
    if (sketchCanMove(block, path)) children.push(el('p', { className: 'bct-hint', text: 'Arrástralo en el lienzo o usa ⌥↑ / ⌥↓ para moverlo.' }));
    return section(node?.label ?? key, children);
  }

  /** A photo slot as a thumbnail button that opens the picker. */
  function photoButton(block: any, slot: string) {
    const current = String(getPath(block, slot) || '');
    const button = el('button', { type: 'button', className: 'bct-photo-slot', title: 'Cambiar foto' });
    const src = current ? photoSrc(current) : '';
    if (src) button.append(el('img', { src, alt: '' })); else button.append(el('span', { text: 'Sin foto' }));
    button.append(el('span', { className: 'bct-photo-slot__label', text: 'Cambiar' }));
    button.addEventListener('click', () => { picker = { kind: 'photo', blockId: block.id, slot }; draw(); });
    return button;
  }
  /** Gallery / customer photos: tap thumbnails to include or drop them, in order. */
  function photoToggles(block: any) {
    const wrap = el('div', { className: 'bct-thumbs' });
    const limit = block.type === 'gallery' ? 6 : 4;
    for (const path of photos) {
      const on = (block.photos || []).includes(path);
      const button = el('button', { type: 'button', className: `bct-thumb${on ? ' is-on' : ''}`, title: on ? 'Quitar' : 'Añadir' });
      const src = photoSrc(path);
      if (src) button.append(el('img', { src, alt: '' }));
      button.disabled = !on && (block.photos || []).length >= limit;
      button.addEventListener('click', () => { block.photos = on ? block.photos.filter((p: string) => p !== path) : [...(block.photos || []), path]; scheduleStructural(); draw(); });
      wrap.append(button);
    }
    return wrap;
  }
  function iconButton(block: any, path: string, name: string) {
    const button = el('button', { type: 'button', className: 'bct-chip', text: name ? `◇ ${name}` : '+ Ícono' });
    button.addEventListener('click', () => { picker = { kind: 'icon', blockId: block.id, path, query: '', results: null }; draw(); void searchIcons(''); });
    return button;
  }
  /** Add / remove items of a block list (reviews, questions, steps…); the wording is edited on the canvas. */
  function listEditor(block: any, spec: { key: string; label: string; max: number; make: () => any; peek: (item: any) => string }) {
    const items: any[] = Array.isArray(block[spec.key]) ? block[spec.key] : (block[spec.key] = []);
    const wrap = el('div', { className: 'bct-list' }, [el('p', { className: 'bct-list__title', text: `${spec.label[0].toUpperCase()}${spec.label.slice(1)}s · ${items.length}/${spec.max}` })]);
    items.forEach((item, index) => {
      const kill = el('button', { type: 'button', className: 'bct-list__kill', text: '✕', title: `Quitar ${spec.label}` });
      kill.addEventListener('click', () => { items.splice(index, 1); scheduleStructural(); draw(); });
      wrap.append(el('div', { className: 'bct-list__row' }, [el('span', { className: 'bct-list__peek', text: String(spec.peek(item) || '').slice(0, 42) }), kill]));
    });
    const add = el('button', { type: 'button', className: 'bct-chip', text: `+ Añadir ${spec.label}`, disabled: items.length >= spec.max });
    add.addEventListener('click', () => { items.push(spec.make()); scheduleStructural(); draw(); });
    wrap.append(add);
    return wrap;
  }
  async function searchIcons(query: string) {
    if (!opts || picker?.kind !== 'icon') return;
    const asked = picker;
    try {
      const results = await api.sketchIcons(opts.storeId, query);
      if (picker !== asked) return;
      asked.results = results.filter(icon => /^<svg[\s>]/.test(icon.svg) && !/<script|\son\w+=/i.test(icon.svg));
    } catch { if (picker === asked) asked.results = []; }
    draw();
  }
  /** The open picker (photo or icon), drawn at the top of the inspector. */
  function pickerPanel(block: any) {
    if (!picker) return null;
    const close = el('button', { type: 'button', className: 'bct-back', text: '← Volver' });
    close.addEventListener('click', () => { picker = null; draw(); });
    if (picker.kind === 'photo') {
      const slot = picker.slot;
      const grid = el('div', { className: 'bct-thumbs bct-thumbs--big' });
      for (const path of photos) {
        const button = el('button', { type: 'button', className: `bct-thumb${getPath(block, slot) === path ? ' is-on' : ''}` });
        const src = photoSrc(path);
        if (src) button.append(el('img', { src, alt: '' }));
        button.addEventListener('click', () => {
          setByPath(block, slot, path);
          if (!changedPhotos.has(block.id)) changedPhotos.set(block.id, new Set());
          changedPhotos.get(block.id)!.add(slot);
          picker = null; schedule(); draw();
        });
        grid.append(button);
      }
      const children: HTMLElement[] = [close, el('h3', { className: 'bct-section__title', text: 'Elige una foto' }), grid];
      if (slot === 'photo') {
        const none = el('button', { type: 'button', className: 'bct-chip', text: 'Sin foto' });
        none.addEventListener('click', () => { delete block.photo; picker = null; scheduleStructural(); draw(); });
        children.push(none);
      }
      const file = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true });
      file.addEventListener('change', () => { const picked = file.files?.[0]; if (picked) void uploadPhoto(picked, block.id, slot); });
      const upload = el('button', { type: 'button', className: 'bct-add bct-upload', text: uploading ? 'Subiendo…' : '⬆ Subir foto nueva', disabled: uploading });
      upload.dataset.bocetoUpload = '';
      upload.addEventListener('click', () => file.click());
      children.splice(2, 0, upload, file);
      if (!photos.length) children.push(el('p', { className: 'bct-hint', text: 'Todavía no hay fotos: sube la primera con el botón de arriba.' }));
      return el('div', { className: 'bct-section' }, children);
    }
    const iconPath = picker.path;
    const input = el('input', { type: 'search', className: 'bct-select', placeholder: 'Buscar ícono (ej. gift, truck, heart)…', value: picker.query });
    let debounce: ReturnType<typeof setTimeout> | undefined;
    input.addEventListener('input', () => { if (picker?.kind !== 'icon') return; picker.query = input.value; clearTimeout(debounce); debounce = setTimeout(() => void searchIcons(input.value), 220); });
    const grid = el('div', { className: 'bct-icons' });
    if (picker.results === null) grid.append(el('p', { className: 'bct-hint', text: 'Buscando…' }));
    else if (!picker.results.length) grid.append(el('p', { className: 'bct-hint', text: 'Sin resultados. Prueba en inglés: gift, star, leaf…' }));
    else for (const icon of picker.results) {
      const button = el('button', { type: 'button', className: `bct-icon${getPath(block, iconPath) === icon.name ? ' is-on' : ''}`, title: icon.name });
      button.innerHTML = icon.svg;
      button.addEventListener('click', () => { setByPath(block, iconPath, icon.name); picker = null; scheduleStructural(); draw(); });
      grid.append(button);
    }
    const children: HTMLElement[] = [close, el('h3', { className: 'bct-section__title', text: 'Íconos · más de 1.500' }), input, grid];
    if (iconPath.startsWith('boxes.') && getPath(block, iconPath)) {
      const none = el('button', { type: 'button', className: 'bct-chip', text: 'Sin ícono' });
      none.addEventListener('click', () => { const box = getPath(block, iconPath.replace(/\.icon$/, '')); if (box) delete box.icon; picker = null; scheduleStructural(); draw(); });
      children.push(none);
    }
    const panel = el('div', { className: 'bct-section' }, children);
    queueMicrotask(() => {
      if (!input.isConnected || document.activeElement === input) return;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
    });
    return panel;
  }

  /** Finish any queued or running save so the next server write starts from the latest revision. */
  async function flushSave() {
    if (timer) { clearTimeout(timer); timer = null; }
    for (let i = 0; i < 60 && pending; i++) await new Promise(resolve => setTimeout(resolve, 150));
    await save();
  }
  /** "Subir foto": optimize, upload, add to the store, then drop it into the slot the picker was opened for. */
  async function uploadPhoto(file: File, blockId: string, slot: string) {
    if (!opts || !sketch || uploading) return;
    uploading = true; note = ''; draw();
    try {
      const prepared = await prepareSourceImage(file);
      await flushSave();
      const { url } = await api.upload(prepared);
      const result = await api.addSketchPhoto(opts.storeId, { revision, url });
      revision = result.revision; mountedRevision = result.revision; photos = result.photos;
      localPhotos.set(result.path, await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(prepared); }));
      try { await opts.saved(revision); } catch { /* resync is best-effort */ }
      const block = allBlocks().find(item => item.id === blockId);
      if (block) {
        setByPath(block, slot, result.path);
        if (!changedPhotos.has(blockId)) changedPhotos.set(blockId, new Set());
        changedPhotos.get(blockId)!.add(slot);
        picker = null; schedule();
      }
    } catch (error) {
      note = error instanceof Error ? error.message : 'No se pudo subir la foto.';
    } finally { uploading = false; draw(); }
  }

  /** Remove a block (galleries included); the repair on save restores anything structural. */
  function deleteBlock(id: string) {
    if (!sketch) return;
    const index = sketch.blocks.findIndex(block => block.id === id);
    if (index === -1) return;
    sketch.blocks.splice(index, 1);
    if (selected === id) { selected = ''; selectedPath = ''; picker = null; }
    scheduleStructural(); draw();
  }

  /** The block's parts as an indented, clickable list (Figma layers). */
  function nodeList(block: any, nodes: SketchNode[], depth: number): HTMLElement {
    const list = el('div', { className: 'bct-tree' });
    for (const node of nodes) {
      const item = el('button', { type: 'button', className: `bct-node${selected === block.id && selectedPath === node.path ? ' is-selected' : ''}`, text: node.label });
      item.style.paddingLeft = `${10 + depth * 14}px`;
      item.dataset.bocetoNode = node.path;
      item.addEventListener('click', event => { event.stopPropagation(); selected = block.id; selectedPath = node.path; picker = null; draw(); });
      list.append(item);
      if (node.children.length) list.append(nodeList(block, node.children, depth + 1));
    }
    return list;
  }
  function treeToggle(block: any) {
    const toggle = el('button', { type: 'button', className: 'bct-block__toggle', text: expanded.has(block.id) ? '▾' : '▸', title: 'Ver partes' });
    toggle.dataset.bocetoToggle = block.id;
    toggle.disabled = !sketchNodeTree(block).length;
    toggle.addEventListener('click', event => { event.stopPropagation(); if (expanded.has(block.id)) expanded.delete(block.id); else expanded.add(block.id); draw(); });
    return toggle;
  }
  /** Select a whole block from Capas (a second click on the same block clears it). */
  const pickBlock = (id: string) => { const same = selected === id && !selectedPath; selected = same ? '' : id; selectedPath = ''; if (!same) expanded.add(id); picker = null; draw(); };

  function draw() {
    if (!host || !opts) return;
    if (!sketch) { host.replaceChildren(); return; }
    // Figma-equal structure: layers on the left, a selection-driven inspector on the right.
    const layers = el('aside', { className: 'bct-layers' });
    layers.append(el('header', { className: 'bct-layers__head' }, [el('h2', { text: 'Capas' }), el('span', { className: 'bct-layers__count', text: `${sketch.blocks.length} bloques` })]));
    const list = el('div', { className: 'bct-blocks' });
    sketch.blocks.forEach((block, index) => {
      const bg = resolveBg(sketch!.palette, block.bg);
      const item = el('div', { className: `bct-block${selected === block.id && !selectedPath ? ' is-selected' : ''}` });
      item.dataset.bocetoBlock = block.id;
      const head = el('div', { className: 'bct-block__head' });
      head.append(treeToggle(block));
      const swatch = el('span', { className: 'bct-block__swatch' });
      swatch.style.background = bg;
      head.append(swatch);
      head.append(el('span', { className: 'bct-block__name', text: `${TYPE_LABEL[block.type] || block.type}` }));
      head.append(el('span', { className: 'bct-block__peek', text: String(block.headline || block.title || block.text || block.tagline || '').slice(0, 18) }));
      const tools = el('div', { className: 'bct-block__tools' });
      const move = (delta: number) => { const target = index + delta; if (target < 0 || target >= sketch!.blocks.length) return; sketch!.blocks.splice(target, 0, sketch!.blocks.splice(index, 1)[0]); scheduleStructural(); draw(); };
      const up = el('button', { type: 'button', text: '↑', title: 'Subir' }); up.dataset.bocetoMoveUp = ''; up.addEventListener('click', event => { event.stopPropagation(); move(-1); });
      const down = el('button', { type: 'button', text: '↓', title: 'Bajar' }); down.dataset.bocetoMoveDown = ''; down.addEventListener('click', event => { event.stopPropagation(); move(1); });
      const dup = el('button', { type: 'button', text: '⧉', title: 'Duplicar' }); dup.dataset.bocetoDuplicate = ''; dup.addEventListener('click', event => { event.stopPropagation(); let copy = `${block.id}-copia`; let n = 2; while (sketch!.blocks.some(other => other.id === copy)) copy = `${block.id}-copia-${n++}`; sketch!.blocks.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(block)), id: copy.slice(0, 32) }); scheduleStructural(); draw(); });
      const kill = el('button', { type: 'button', text: '✕', title: 'Eliminar' }); kill.dataset.bocetoDelete = ''; kill.addEventListener('click', event => { event.stopPropagation(); deleteBlock(block.id); });
      tools.append(up, down, dup, kill);
      head.append(tools);
      item.append(head);
      if (expanded.has(block.id)) item.append(nodeList(block, sketchNodeTree(block), 1));
      item.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.bct-block__tools, .bct-tree, .bct-block__toggle')) return; pickBlock(block.id); });
      list.append(item);
    });
    layers.append(list);
    if (sketch.account) {
      const entry = el('div', { className: `bct-block bct-block--page${selected === 'account' && !selectedPath ? ' is-selected' : ''}` });
      entry.dataset.bocetoBlock = 'account';
      const swatch = el('span', { className: 'bct-block__swatch' });
      swatch.style.background = resolveBg(sketch.palette, sketch.account.bg);
      entry.append(el('div', { className: 'bct-block__head' }, [treeToggle(sketch.account), swatch, el('span', { className: 'bct-block__name', text: 'Cuenta' }), el('span', { className: 'bct-block__peek', text: 'Ingreso y registro' })]));
      if (expanded.has('account')) entry.append(nodeList(sketch.account, sketchNodeTree(sketch.account), 1));
      entry.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.bct-tree, .bct-block__toggle')) return; pickBlock('account'); });
      layers.append(el('p', { className: 'bct-layers__group', text: 'Otras páginas' }), entry);
    }

    const add = el('select', { className: 'bct-select' }); add.dataset.bocetoAdd = '';
    for (const type of Object.keys(DEFAULT_BLOCK)) add.append(el('option', { value: type, text: TYPE_LABEL[type] }));
    const addButton = el('button', { type: 'button', className: 'bct-add', text: '+ Añadir', disabled: sketch.blocks.length >= 20 }); addButton.dataset.bocetoAddButton = '';
    addButton.addEventListener('click', () => {
      const block = { ...JSON.parse(JSON.stringify(DEFAULT_BLOCK[add.value])), id: '' };
      const footerIndex = sketch!.blocks.findIndex(item => item.type === 'footer');
      sketch!.blocks.splice(footerIndex === -1 ? sketch!.blocks.length : footerIndex, 0, block);
      scheduleStructural(); draw();
    });
    layers.append(el('div', { className: 'bct-adder' }, [add, addButton]));

    const root = el('aside', { className: 'bct-panel' });
    const close = el('button', { type: 'button', className: 'bct-close', text: '✕', title: 'Cerrar' });
    close.addEventListener('click', () => opts?.close?.());
    statusNode = el('span', { className: 'bct-status', text: pending ? 'Guardando…' : note || 'Se guarda solo' });
    root.append(el('header', { className: 'bct-head' }, [el('h2', { text: 'Diseño' }), statusNode, close]));

    const current = selectedBlock();
    const openPicker = current && picker && picker.blockId === current.id ? pickerPanel(current) : null;
    if (openPicker) {
      root.append(el('div', { className: 'bct-props' }, [openPicker]));
    } else if (current) {
      // Selection-driven, like Figma: the inspector shows what is selected on the canvas, one level up at a time.
      const upPath = selectedPath.split('/').slice(0, -1).join('/');
      const upNode = upPath ? sketchFindNode(sketchNodeTree(current), upPath) : undefined;
      const back = el('button', { type: 'button', className: 'bct-back', text: selectedPath ? `← ${upNode?.label ?? (TYPE_LABEL[current.type] || current.type)}` : '← Página' });
      back.addEventListener('click', () => { if (selectedPath) selectedPath = upPath; else selected = ''; picker = null; draw(); });
      root.append(el('div', { className: 'bct-props' }, [back, selectedPath ? nodeProps(current, selectedPath) : blockProps(current)]));
    } else {
      const page = section('Página', []);
      const style = { ...DEFAULT_STYLE, ...(sketch.style || {}) };
      for (const control of STYLE_CONTROLS) page.append(row(control.label, segment(style[control.key], control.values, control.names, next => { sketch!.style = { ...style, [control.key]: next }; schedule(); draw(); })));
      page.append(row('Escala', segment(sketch.scale, SIZES, ['S', 'M', 'L', 'XL'], next => { sketch!.scale = next; schedule(); draw(); })));
      page.append(row('Títulos', select(sketch.fonts.display, fonts, undefined, next => { sketch!.fonts.display = next; schedule(); })));
      page.append(row('Texto', select(sketch.fonts.text, fonts, undefined, next => { sketch!.fonts.text = next; schedule(); })));
      for (const role of PALETTE_ROLES) page.append(colorRow(ROLE_LABEL[role], sketch.palette[role], next => { sketch!.palette[role] = next; schedule(); draw(); }));
      page.append(el('p', { className: 'bct-hint', text: 'Selecciona un bloque en el lienzo o en Capas para ver sus propiedades.' }));
      root.append(page);
    }

    const wrap = el('div', { className: 'bct-shell' }, [layers, root]);
    if (opts.locked) wrap.querySelectorAll('input,select,button:not(.bct-close)').forEach(node => ((node as HTMLInputElement).disabled = true));
    rootNode = wrap;
    host.replaceChildren(wrap);
    syncSelection();
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

  // ⌥↑ / ⌥↓ move the selection (block or node); Supr/Backspace removes it (Figma-style), unless typing.
  document.addEventListener('keydown', event => {
    if (!sketch || !selected || !opts || opts.locked || !host?.isConnected) return;
    const active = document.activeElement as HTMLElement | null;
    if (active && (active.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName))) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.metaKey && !event.ctrlKey) { event.preventDefault(); removeSelection(); return; }
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    moveSelection(event.key === 'ArrowUp' ? -1 : 1);
  });

  return {
    /** "Cambiar foto" on the canvas: select that block and open the photo picker on that slot. */
    remotePhoto(id: string, slot: string) {
      if (!sketch || !/^(photo|items\.\d+\.photo|photos\.\d+)$/.test(slot)) return;
      const block = allBlocks().find(item => item.id === id);
      if (!block) return;
      if (selected !== id) selectedPath = ''; selected = id; picker = { kind: 'photo', blockId: id, slot };
      draw();
    },
    remoteSelect(id: string, path = '') {
      if (!sketch) return;
      const before = `${selected}|${selectedPath}`;
      focusNode(id, path);
      if (`${selected}|${selectedPath}` !== before) picker = null;
      draw();
      if (!/^[a-z0-9-]{1,40}$/.test(selected)) return;
      host?.querySelector(`[data-boceto-block="${selected}"]`)?.scrollIntoView?.({ block: 'nearest' });
    },
    /** A node dragged among its siblings on the canvas; `order` is the siblings' keys as the canvas now shows them. */
    remoteNodeMove(id: string, path: string, order: string[]) {
      if (!sketch || opts?.locked || !path || order.length > 12) return;
      const block = allBlocks().find(item => item.id === id);
      if (!block || !sketchCanMove(block, path)) return;
      const parts = path.split('/'); const key = parts.pop()!;
      const result = sketchApplyMove(block, parts.join('/'), order);
      if (!result) return;
      focusNode(id, /^\d+$/.test(key) ? [...parts, String(order.indexOf(key))].join('/') : path);
      if (result === 'reload') scheduleStructural(); else schedule();
      draw();
    },
    remoteKey(key: 'up' | 'down' | 'delete') {
      if (!sketch || !selected || opts?.locked) return;
      if (key === 'delete') removeSelection(); else moveSelection(key === 'up' ? -1 : 1);
    },
    /** After the preview reloads: push the live look and the selection again. */
    resync() { applyLive(); syncSelection(); },
    remoteReorder(id: string, index: number) {
      if (!sketch) return;
      const from = sketch.blocks.findIndex(block => block.id === id);
      if (from === -1) return;
      const [block] = sketch.blocks.splice(from, 1);
      sketch.blocks.splice(Math.max(0, Math.min(index, sketch.blocks.length)), 0, block);
      if (selected !== id) selectedPath = ''; selected = id; schedule(); draw();
    },
    remoteText(id: string, field: string, value: string) {
      if (!sketch || typeof field !== 'string' || !/^[a-zA-Z]+(\.\d+)?(\.[a-zA-Z]+)?$/.test(field)) return;
      const block = allBlocks().find(item => item.id === id);
      if (!block) return;
      setByPath(block, field, value);
      if (selected !== id) selectedPath = ''; selected = id; schedule(); draw();
    },
    /** A sticker drag: percentages inside its positioning box, clamped like the API repair. */
    remoteElMove(id: string, elKey: string, x: number, y: number) {
      if (!sketch || elKey !== 'sticker' || !Number.isFinite(x) || !Number.isFinite(y)) return;
      const block = allBlocks().find(item => item.id === id);
      if (!block || !['hero', 'split', 'banner'].includes(block.type)) return;
      block.stickerPos = { x: Math.min(100, Math.max(0, Math.round(x * 10) / 10)), y: Math.min(100, Math.max(0, Math.round(y * 10) / 10)) };
      if (selected !== id) selectedPath = ''; selected = id; schedule(); draw();
    },
    mount(target: HTMLElement, options: Mount) {
      host = target; opts = options; note = '';
      const born = options.version.snapshot.files.some(file => file.path === 'sketch.json');
      if (!born) { sketch = null; mountedStore = ''; host.replaceChildren(); return; }
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
