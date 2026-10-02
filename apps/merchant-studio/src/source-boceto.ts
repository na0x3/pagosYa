import { ApiError } from './api';
import type { MerchantStudioApi, SourceVersion } from './api';
import './source-boceto.css';

/** Boceto: a Figma-style inspector for sketch-born stores. Text is edited directly on the canvas
 * (double-click); this panel holds only properties — page styles, block looks, order and media.
 * Every change applies LIVE in the preview via `apply` and saves silently in the background. */

type Sketch = { palette: Record<'paper' | 'ink' | 'accent' | 'deep' | 'pop', string>; fonts: { display: string; text: string }; scale: string; blocks: any[] };
type ApplyPayload = { vars?: Record<string, string>; blocks?: Record<string, { bg?: string; ink?: string; size?: string; variant?: string; photo?: string }> };
type Mount = { storeId: string; version: SourceVersion; locked: boolean; saved: (revision: number) => Promise<void>; close?: () => void; apply?: (payload: ApplyPayload) => void };

const BG_ROLES = ['paper', 'ink', 'accent', 'deep', 'pop'] as const;
const ROLE_LABEL: Record<string, string> = { paper: 'Papel', ink: 'Tinta', accent: 'Acento', deep: 'Profundo', pop: 'Vivo' };
const SIZES = ['s', 'm', 'l', 'xl'];
const TYPE_LABEL: Record<string, string> = { announce: 'Aviso', split: 'Panel doble', steps: 'Pasos', hero: 'Portada', marquee: 'Marquesina', catalog: 'Catálogo', story: 'Historia', reviews: 'Reseñas', faq: 'Preguntas', banner: 'Banner', gallery: 'Galería', newsletter: 'Boletín', footer: 'Pie de página' };
const DEFAULT_BLOCK: Record<string, object> = {
  announce: { type: 'announce', left: 'Hecho fresco cada semana', right: 'Envíos a todo el país', bg: 'pop', size: 's' },
  split: { type: 'split', headline: 'Mezcla y combina', body: 'Arma tu caja a tu manera.', cta: 'Armar mi caja', href: 'checkout.html', pills: ['6 unidades', '12 unidades'], bg: 'accent', size: 'l' },
  hero: { type: 'hero', variant: 'photo-right', headline: 'Un título con carácter', sub: '', cta: 'Ver productos', badge: '', note: '', sticker: '', bg: 'paper', size: 'l' },
  steps: { type: 'steps', title: 'Así de simple', items: [{ icon: 'sparkles', title: 'Elige', text: 'Lo que más te guste.' }, { icon: 'package', title: 'Preparamos', text: 'Con calma y cuidado.' }, { icon: 'smile', title: 'Disfruta', text: 'Directo a tu puerta.' }], bg: 'paper', size: 'm' },
  marquee: { type: 'marquee', text: 'Hecho con calma · Hecho aquí', bg: 'pop', size: 's' },
  catalog: { type: 'catalog', kicker: '', title: 'Nuestros productos', bg: 'paper', size: 'm' },
  story: { type: 'story', title: 'Nuestra historia', paragraphs: ['Cuenta aquí tu proceso.'], bg: 'accent', size: 'l' },
  reviews: { type: 'reviews', title: 'Clientes felices', quotes: [{ text: 'Me encantó.', name: 'Cliente' }], bg: 'paper', size: 'm' },
  faq: { type: 'faq', title: 'Preguntas', items: [{ q: '¿Hacen envíos?', a: 'Sí.' }], bg: 'paper', size: 'm' },
  banner: { type: 'banner', headline: 'Haz espacio para algo bueno', cta: 'Comprar', href: 'checkout.html', bg: 'pop', size: 'xl' },
  gallery: { type: 'gallery', title: 'Galería', photos: [], bg: 'paper', size: 'm' },
  newsletter: { type: 'newsletter', title: 'Novedades', note: '', cta: 'Suscribirme', bg: 'deep', size: 'm' },
};
const MAXLEN: Record<string, number> = { headline: 120, title: 120, badge: 60, cta: 60, note: 120, sticker: 40, left: 200, right: 200, text: 200, kicker: 80, sub: 200, tagline: 200, body: 600, href: 200, q: 200, a: 600, name: 60 };

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
const contrast = (a: string, b: string) => { const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y); return (high + 0.05) / (low + 0.05); };
const inkFor = (bg: string, preferred: string) => contrast(bg, preferred) >= 4.5 ? preferred : contrast(bg, '#111111') >= contrast(bg, '#ffffff') ? '#111111' : '#ffffff';

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
  /** Push the current look into the live preview — no reload, no save needed. */
  const applyLive = () => {
    if (!opts?.apply || !sketch) return;
    const vars: Record<string, string> = {
      '--skb-paper': sketch.palette.paper,
      '--skb-page-ink': inkFor(sketch.palette.paper, sketch.palette.ink),
    };
    const blocks: NonNullable<ApplyPayload['blocks']> = {};
    for (const block of sketch.blocks) {
      const bg = sketch.palette[block.bg as keyof Sketch['palette']] || sketch.palette.paper;
      blocks[block.id] = { bg, ink: inkFor(bg, sketch.palette.ink), size: block.size, ...(block.type === 'hero' ? { variant: block.variant } : {}), ...(block.photo ? { photo: block.photo } : {}) };
    }
    opts.apply({ vars, blocks });
  };
  const schedule = () => { editSeq++; applyLive(); if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 1200); };

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
        sketch = result.sketch as Sketch; lastSaved = JSON.stringify(sketch); note = ''; pending = false; draw();
      } else {
        lastSaved = payload; pending = false; status('Guardando…'); schedule();
      }
      try { await opts.saved(revision); } catch { /* resync is best-effort */ }
      return;
    } catch (error) {
      pending = false;
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

  function blockProps(block: any) {
    const children: HTMLElement[] = [];
    children.push(row('Fondo', segment(block.bg, BG_ROLES as unknown as string[], BG_ROLES.map(role => ROLE_LABEL[role]), next => { block.bg = next; schedule(); draw(); })));
    children.push(row('Tamaño', segment(block.size, SIZES, ['S', 'M', 'L', 'XL'], next => { block.size = next; schedule(); draw(); })));
    if (block.type === 'hero') children.push(row('Composición', select(block.variant, ['photo-right', 'full-bleed', 'stacked'], ['Foto derecha', 'Completa', 'Apilada'], next => { block.variant = next; schedule(); })));
    if (block.type === 'footer') children.push(row('Nombre gigante', segment(block.wordmark, ['giant', 'plain'], ['Sí', 'No'], next => { block.wordmark = next; schedule(); draw(); })));
    if (block.type === 'hero' || block.type === 'story' || block.type === 'split') {
      const photoSelect = el('select', { className: 'bct-select' });
      photoSelect.append(el('option', { value: '', text: 'Sin foto', selected: !block.photo }));
      for (const path of photos) photoSelect.append(el('option', { value: path, text: path.replace(/^assets\//, '').slice(0, 24), selected: block.photo === path }));
      photoSelect.addEventListener('change', () => { if (photoSelect.value) block.photo = photoSelect.value; else delete block.photo; schedule(); });
      children.push(row('Foto', photoSelect));
    }
    if (block.type === 'gallery') {
      const wrap = el('div', { className: 'bct-gallery' });
      for (const path of photos) {
        const box = el('input', { type: 'checkbox', checked: (block.photos || []).includes(path) });
        box.addEventListener('change', () => { block.photos = box.checked ? [...(block.photos || []), path] : (block.photos || []).filter((p: string) => p !== path); schedule(); });
        wrap.append(el('label', { className: 'bct-check', text: path.replace(/^assets\//, '').slice(0, 22) }, [box]));
      }
      children.push(row('Fotos', wrap));
    }
    if (block.type === 'steps') {
      const ICONS = ['sparkles', 'cookie', 'package', 'smile', 'heart', 'star', 'truck', 'gift', 'coffee', 'leaf', 'flame', 'clock', 'map-pin', 'shield-check', 'chef-hat', 'croissant', 'cake', 'ice-cream-cone', 'shopping-bag', 'hand-heart'];
      (block.items || []).forEach((item: any, index: number) => {
        children.push(row(`Ícono ${index + 1}`, select(ICONS.includes(item.icon) ? item.icon : 'sparkles', ICONS, undefined, next => { item.icon = next; schedule(); })));
      });
    }
    children.push(el('p', { className: 'bct-hint', text: 'El texto se edita tocándolo dos veces en la página.' }));
    return section(TYPE_LABEL[block.type] || block.type, children);
  }

  function draw() {
    if (!host || !opts) return;
    if (!sketch) { host.replaceChildren(); return; }
    const root = el('aside', { className: 'bct-panel' });
    const close = el('button', { type: 'button', className: 'bct-close', text: '✕', title: 'Cerrar' });
    close.addEventListener('click', () => opts?.close?.());
    statusNode = el('span', { className: 'bct-status', text: pending ? 'Guardando…' : note || 'Se guarda solo' });
    root.append(el('header', { className: 'bct-head' }, [el('h2', { text: 'Boceto' }), statusNode, close]));

    const page = section('Página', []);
    page.append(row('Escala', segment(sketch.scale, SIZES, ['S', 'M', 'L', 'XL'], next => { sketch!.scale = next; schedule(); draw(); })));
    page.append(row('Títulos', select(sketch.fonts.display, fonts, undefined, next => { sketch!.fonts.display = next; schedule(); })));
    page.append(row('Texto', select(sketch.fonts.text, fonts, undefined, next => { sketch!.fonts.text = next; schedule(); })));
    for (const role of BG_ROLES) page.append(colorRow(ROLE_LABEL[role], sketch.palette[role], next => { sketch!.palette[role] = next; schedule(); draw(); }));
    root.append(page);

    const list = el('div', { className: 'bct-blocks' });
    sketch.blocks.forEach((block, index) => {
      const bg = sketch!.palette[block.bg as keyof Sketch['palette']] || '#ffffff';
      const item = el('div', { className: `bct-block${selected === block.id ? ' is-selected' : ''}` });
      item.dataset.bocetoBlock = block.id;
      const head = el('div', { className: 'bct-block__head' });
      const swatch = el('span', { className: 'bct-block__swatch' });
      swatch.style.background = bg;
      head.append(swatch);
      head.append(el('span', { className: 'bct-block__name', text: `${TYPE_LABEL[block.type] || block.type}` }));
      head.append(el('span', { className: 'bct-block__peek', text: String(block.headline || block.title || block.text || block.tagline || '').slice(0, 18) }));
      const tools = el('div', { className: 'bct-block__tools' });
      const move = (delta: number) => { const target = index + delta; if (target < 0 || target >= sketch!.blocks.length) return; sketch!.blocks.splice(target, 0, sketch!.blocks.splice(index, 1)[0]); schedule(); draw(); };
      const up = el('button', { type: 'button', text: '↑', title: 'Subir' }); up.dataset.bocetoMoveUp = ''; up.addEventListener('click', event => { event.stopPropagation(); move(-1); });
      const down = el('button', { type: 'button', text: '↓', title: 'Bajar' }); down.dataset.bocetoMoveDown = ''; down.addEventListener('click', event => { event.stopPropagation(); move(1); });
      const dup = el('button', { type: 'button', text: '⧉', title: 'Duplicar' }); dup.dataset.bocetoDuplicate = ''; dup.addEventListener('click', event => { event.stopPropagation(); let copy = `${block.id}-copia`; let n = 2; while (sketch!.blocks.some(other => other.id === copy)) copy = `${block.id}-copia-${n++}`; sketch!.blocks.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(block)), id: copy.slice(0, 32) }); schedule(); draw(); });
      const kill = el('button', { type: 'button', text: '✕', title: 'Eliminar' }); kill.dataset.bocetoDelete = ''; kill.addEventListener('click', event => { event.stopPropagation(); sketch!.blocks.splice(index, 1); schedule(); draw(); });
      tools.append(up, down, dup, kill);
      head.append(tools);
      item.append(head);
      item.addEventListener('click', event => { if ((event.target as HTMLElement).closest('.bct-block__tools, .bct-props')) return; selected = selected === block.id ? '' : block.id; draw(); });
      if (selected === block.id) item.append(el('div', { className: 'bct-props' }, [blockProps(block)]));
      list.append(item);
    });
    root.append(section('Bloques', [list]));

    const add = el('select', { className: 'bct-select' }); add.dataset.bocetoAdd = '';
    for (const type of Object.keys(DEFAULT_BLOCK)) add.append(el('option', { value: type, text: TYPE_LABEL[type] }));
    const addButton = el('button', { type: 'button', className: 'bct-add', text: '+ Añadir', disabled: sketch.blocks.length >= 20 }); addButton.dataset.bocetoAddButton = '';
    addButton.addEventListener('click', () => {
      const block = { ...JSON.parse(JSON.stringify(DEFAULT_BLOCK[add.value])), id: '' };
      const footerIndex = sketch!.blocks.findIndex(item => item.type === 'footer');
      sketch!.blocks.splice(footerIndex === -1 ? sketch!.blocks.length : footerIndex, 0, block);
      schedule(); draw();
    });
    root.append(el('div', { className: 'bct-adder' }, [add, addButton]));
    if (opts.locked) root.querySelectorAll('input,select,button:not(.bct-close)').forEach(node => ((node as HTMLInputElement).disabled = true));
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
    remoteSelect(id: string) {
      if (!sketch) return;
      selected = id; draw();
      if (!/^[a-z0-9-]{1,40}$/.test(id)) return;
      host?.querySelector(`[data-boceto-block="${id}"]`)?.scrollIntoView?.({ block: 'nearest' });
    },
    remoteReorder(id: string, index: number) {
      if (!sketch) return;
      const from = sketch.blocks.findIndex(block => block.id === id);
      if (from === -1) return;
      const [block] = sketch.blocks.splice(from, 1);
      sketch.blocks.splice(Math.max(0, Math.min(index, sketch.blocks.length)), 0, block);
      selected = id; schedule(); draw();
    },
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
