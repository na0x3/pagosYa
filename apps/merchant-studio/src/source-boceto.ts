import type { MerchantStudioApi, SourceVersion } from './api';
import './source-boceto.css';

/** Boceto: hand-editing panel for sketch-born stores (sketch-first sub-project 3).
 * Every merchant string reaches the DOM through value/textContent only — never markup. */

type Sketch = { palette: Record<'paper' | 'ink' | 'accent' | 'deep' | 'pop', string>; fonts: { display: string; text: string }; scale: string; blocks: any[] };
type Mount = { storeId: string; version: SourceVersion; locked: boolean; saved: (revision: number) => Promise<void> };

const BG_ROLES = ['paper', 'ink', 'accent', 'deep', 'pop'] as const;
const SIZES = ['s', 'm', 'l', 'xl'];
const TYPE_LABEL: Record<string, string> = { hero: 'Portada', marquee: 'Marquesina', catalog: 'Catálogo', story: 'Historia', reviews: 'Reseñas', faq: 'Preguntas', banner: 'Banner', gallery: 'Galería', newsletter: 'Boletín', footer: 'Pie de página' };
const TEXT_FIELDS: Record<string, Array<[string, string]>> = {
  hero: [['headline', 'Título'], ['sub', 'Subtítulo'], ['cta', 'Botón']],
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
  hero: { type: 'hero', variant: 'photo-right', headline: 'Un título con carácter', sub: '', cta: 'Ver productos', bg: 'paper', size: 'l' },
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

  const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void save(), 400); };
  async function save() {
    if (!opts || !sketch || pending) return;
    pending = true; draw();
    try {
      const result = await api.putSketch(opts.storeId, { revision, sketch });
      revision = result.revision; sketch = result.sketch as Sketch; note = '';
      await opts.saved(revision);
    } catch {
      // Total loop: reload the server's truth; the previous revision is intact.
      try { const fresh = await api.getSketch(opts.storeId); revision = fresh.revision; sketch = fresh.sketch as Sketch; note = 'Se conservó la versión anterior.'; } catch { note = 'Se conservó la versión anterior.'; }
    }
    pending = false; draw();
  }

  function field(block: any, key: string, label: string) {
    const input = el('input', { value: String(block[key] ?? ''), className: 'boceto-input' });
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
    if (block.type === 'story') form.append(photoPick(block, 'photo'));
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
    root.append(el('header', { className: 'boceto-head' }, [
      el('h2', { text: 'Boceto' }),
      el('p', { text: pending ? 'Guardando…' : note || '100% editable · se guarda solo' }),
    ]));
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
      const dup = el('button', { type: 'button', text: '⧉', title: 'Duplicar' }); dup.dataset.bocetoDuplicate = ''; dup.addEventListener('click', () => { sketch!.blocks.splice(index + 1, 0, { ...JSON.parse(JSON.stringify(block)), id: '' }); schedule(); draw(); });
      const kill = el('button', { type: 'button', text: '✕', title: 'Eliminar' }); kill.dataset.bocetoDelete = ''; kill.addEventListener('click', () => { sketch!.blocks.splice(index, 1); schedule(); draw(); });
      tools.append(up, down, dup, kill);
      row.append(title, tools);
      if (selected === block.id) row.append(blockForm(block));
      list.append(row);
    });
    root.append(list);
    const add = el('select', { className: 'boceto-select' }); add.dataset.bocetoAdd = '';
    for (const type of Object.keys(DEFAULT_BLOCK)) add.append(el('option', { value: type, text: TYPE_LABEL[type] }));
    const addButton = el('button', { type: 'button', className: 'boceto-add', text: '+ Añadir bloque' }); addButton.dataset.bocetoAddButton = '';
    addButton.addEventListener('click', () => {
      const block = { ...JSON.parse(JSON.stringify(DEFAULT_BLOCK[add.value])), id: '' };
      const footerIndex = sketch!.blocks.findIndex(item => item.type === 'footer');
      sketch!.blocks.splice(footerIndex === -1 ? sketch!.blocks.length : footerIndex, 0, block);
      schedule(); draw();
    });
    root.append(el('div', { className: 'boceto-adder' }, [add, addButton]));
    if (opts.locked) root.querySelectorAll('input,select,textarea,button').forEach(node => ((node as HTMLInputElement).disabled = true));
    host.replaceChildren(root);
  }

  return {
    mount(target: HTMLElement, options: Mount) {
      host = target; opts = options; note = '';
      const born = options.version.snapshot.files.some(file => file.path === 'sketch.json');
      if (!born) { sketch = null; host.replaceChildren(); return; }
      void api.getSketch(options.storeId).then(result => {
        revision = result.revision; sketch = result.sketch as Sketch; photos = result.photos; fonts = result.fonts;
        if (!sketch) { host?.replaceChildren(); return; }
        draw();
      }).catch(() => { sketch = null; host?.replaceChildren(); });
    },
  };
}
