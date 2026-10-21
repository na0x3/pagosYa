import { narrationFromMessage, narrationFromProgress, narrationFromReply, stoppedNarration, typingPlan, type Narration } from './source-narration';
import type { BuildProgress } from './source-build-progress';
import './source-narrator.css';

/**
 * YAPI's glass window over the live preview (spec 2026-10-21 Part C): it writes, word by word, the merchant's request,
 * YAPI's plan, the step it is on and its summary, then shrinks to a pill. It lives on document.body so the Studio's
 * re-renders never touch it. Screen readers get each finished sentence once through a separate live region.
 * Owner 2026-10-21: the merchant can drag it by its header, make it smaller or bigger, and close it with one click; the
 * pagosYa star sits in its header, spins now and then, and comes back after every five lines YAPI writes.
 */
export type Narrator = { open(request: string): void; show(narration: Narration): void; close(): void; element: HTMLElement };
export type NarratorSize = 'small' | 'normal' | 'large';

const PILL_AFTER_MS = 2600;
const LOGO_EVERY_LINES = 5;
const SIZES: readonly NarratorSize[] = ['small', 'normal', 'large'];
const STORAGE_KEY = 'pagosya_yapi_window';
const EDGE = 8;
type Saved = { size?: NarratorSize; x?: number; y?: number };

export function mountNarrator(doc: Document, opts: { reducedMotion?: () => boolean } = {}): Narrator {
  const win = doc.defaultView!;
  const reduced = opts.reducedMotion ?? (() => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const logo = `${import.meta.env?.BASE_URL ?? '/'}logo-mark.png`;
  const element = doc.createElement('aside');
  element.className = 'yapi-narrator';
  element.setAttribute('aria-label', 'YAPI');
  element.hidden = true;
  element.innerHTML = `<header class="yapi-narrator__head" data-narrator-drag title="Arrastra para moverla · doble clic para volver a la esquina"><img class="yapi-narrator__logo" data-narrator-logo src="${logo}" alt="" width="28" height="28" draggable="false"><strong>YAPI</strong><span class="yapi-narrator__tools"><button type="button" data-narrator-shrink aria-label="Achicar la ventana" title="Achicar">−</button><button type="button" data-narrator-grow aria-label="Agrandar la ventana" title="Agrandar">+</button><button type="button" class="yapi-narrator__close" data-narrator-close aria-label="Cerrar" title="Cerrar">×</button></span></header><p class="yapi-narrator__request" data-narrator-request></p><div class="yapi-narrator__text" data-narrator-text></div><p class="yapi-narrator__live" data-narrator-live aria-live="polite"></p>`;
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'yapi-narrator-pill';
  pill.dataset.narratorPill = '';
  pill.hidden = true;
  pill.innerHTML = `<img src="${logo}" alt="" width="20" height="20" draggable="false">YAPI · Resumen`;
  doc.body.append(element, pill);
  const head = element.querySelector<HTMLElement>('[data-narrator-drag]')!;
  const headLogo = element.querySelector<HTMLElement>('[data-narrator-logo]')!;
  const shrinkButton = element.querySelector<HTMLButtonElement>('[data-narrator-shrink]')!;
  const growButton = element.querySelector<HTMLButtonElement>('[data-narrator-grow]')!;
  const requestEl = element.querySelector<HTMLElement>('[data-narrator-request]')!;
  const textEl = element.querySelector<HTMLElement>('[data-narrator-text]')!;
  const liveEl = element.querySelector<HTMLElement>('[data-narrator-live]')!;

  // Where the merchant left the window and how big: a per-browser convenience, so storage may be missing or blocked.
  const read = (): Saved => { try { return JSON.parse(win.localStorage.getItem(STORAGE_KEY) || '{}') as Saved; } catch { return {}; } };
  const saved = read();
  const remember = (patch: Saved) => { Object.assign(saved, patch); try { win.localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* storage blocked */ } };

  function setSize(size: NarratorSize) {
    element.dataset.size = size;
    shrinkButton.disabled = size === SIZES[0];
    growButton.disabled = size === SIZES[SIZES.length - 1];
  }
  const step = (by: 1 | -1) => {
    const size = SIZES[Math.min(SIZES.length - 1, Math.max(0, SIZES.indexOf((element.dataset.size as NarratorSize) || 'normal') + by))];
    setSize(size); remember({ size });
    if (saved.x !== undefined && saved.y !== undefined) place(saved.x, saved.y);
  };
  setSize(SIZES.includes(saved.size as NarratorSize) ? saved.size! : 'normal');

  /** Keeps the header on screen so the window can always be grabbed again. */
  function place(x: number, y: number) {
    const width = element.offsetWidth || 320;
    const left = Math.round(Math.min(Math.max(EDGE, x), Math.max(EDGE, win.innerWidth - width - EDGE)));
    const top = Math.round(Math.min(Math.max(EDGE, y), Math.max(EDGE, win.innerHeight - 56)));
    for (const node of [element, pill]) Object.assign(node.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    return { x: left, y: top };
  }
  function toCorner() {
    for (const node of [element, pill]) for (const side of ['left', 'top', 'right', 'bottom']) node.style.removeProperty(side);
    delete saved.x; delete saved.y; remember({});
  }
  const placeSaved = () => { if (saved.x !== undefined && saved.y !== undefined) place(saved.x, saved.y); };

  let drag: { id: number; dx: number; dy: number; at?: { x: number; y: number } } | null = null;
  head.addEventListener('pointerdown', event => {
    if (event.button !== 0 || (event.target as Element).closest('button')) return;
    const box = element.getBoundingClientRect();
    drag = { id: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top };
    head.setPointerCapture?.(event.pointerId);
    element.classList.add('is-dragging');
    event.preventDefault();
  });
  head.addEventListener('pointermove', event => { if (drag?.id === event.pointerId) drag.at = place(event.clientX - drag.dx, event.clientY - drag.dy); });
  const endDrag = (event: PointerEvent) => {
    if (drag?.id !== event.pointerId) return;
    const at = drag.at;
    drag = null;
    element.classList.remove('is-dragging');
    if (at) remember(at);
  };
  head.addEventListener('pointerup', endDrag);
  head.addEventListener('pointercancel', endDrag);
  head.addEventListener('dblclick', event => { if (!(event.target as Element).closest('button')) toCorner(); });
  win.addEventListener('resize', placeSaved);
  shrinkButton.addEventListener('click', () => step(-1));
  growButton.addEventListener('click', () => step(1));

  /** One spin of a star, now and then; the CSS also spins the header star every few seconds. */
  const spin = (node: HTMLElement) => {
    if (reduced()) return;
    node.classList.remove('is-spinning');
    void node.offsetWidth;
    node.classList.add('is-spinning');
  };
  headLogo.addEventListener('animationend', () => headLogo.classList.remove('is-spinning'));
  function logoBreak() {
    const mark = doc.createElement('div');
    mark.className = 'yapi-narrator__divider';
    mark.dataset.narratorDivider = '';
    mark.setAttribute('aria-hidden', 'true');
    mark.innerHTML = `<img src="${logo}" alt="" width="22" height="22" draggable="false">`;
    textEl.append(mark);
    spin(mark.querySelector('img')!);
    spin(headLogo);
  }

  let shown: string[] = [];
  let queue: string[] = [];
  let timers: number[] = [];
  let current: { p: HTMLElement; line: string } | null = null;
  let pillTimer = 0;
  let phase: Narration['phase'] = 'work';

  const clearTimers = () => { timers.forEach(t => win.clearTimeout(t)); timers = []; };
  const announce = (line: string) => { liveEl.textContent = line; };
  const lines = () => textEl.querySelectorAll('p');
  const finishCurrent = () => {
    if (!current) return;
    clearTimers();
    current.p.textContent = current.line;
    announce(current.line);
    current = null;
    next();
  };
  const settled = () => {
    if (phase !== 'done') return;
    win.clearTimeout(pillTimer);
    pillTimer = win.setTimeout(() => { element.hidden = true; pill.hidden = false; }, PILL_AFTER_MS);
  };
  const follow = () => { element.scrollTop = element.scrollHeight; };
  function next() {
    const line = queue.shift();
    if (line === undefined) { settled(); return; }
    // Every five lines YAPI writes, its star comes back before the next one.
    const written = lines().length;
    if (written && written % LOGO_EVERY_LINES === 0 && !textEl.lastElementChild?.hasAttribute('data-narrator-divider')) logoBreak();
    const p = doc.createElement('p');
    textEl.append(p);
    follow();
    // Reduced motion, or nothing to type (an empty reply): the line appears at once, so the window always settles.
    if (reduced() || !line.trim()) { p.textContent = line; announce(line); next(); return; }
    current = { p, line };
    const words = typingPlan(line);
    words.forEach(({ word, at }, i) => {
      timers.push(win.setTimeout(() => {
        const span = doc.createElement('span');
        span.className = 'yapi-narrator__word';
        span.textContent = (i ? ' ' : '') + word;
        p.append(span);
        follow();
        if (i === words.length - 1) { timers = []; current = null; announce(line); timers.push(win.setTimeout(next, 220)); }
      }, at));
    });
  }

  function show(narration: Narration) {
    phase = narration.phase;
    win.clearTimeout(pillTimer);
    // A new stage changes only the last line («Ahora: …»): retype that line, never the whole plan above it.
    const replacesLast = shown.length > 0 && shown.length === narration.lines.length && shown.slice(0, -1).every((line, i) => narration.lines[i] === line) && shown.at(-1) !== narration.lines.at(-1);
    if (replacesLast) {
      const last = narration.lines.at(-1)!;
      shown = [...narration.lines];
      if (queue.length) { queue[queue.length - 1] = last; return; }
      clearTimers(); current = null;
      [...lines()].at(-1)?.remove();
      queue = [last];
      next();
      return;
    }
    const grows = shown.length <= narration.lines.length && shown.every((line, i) => narration.lines[i] === line);
    if (!grows) { clearTimers(); current = null; queue = []; textEl.replaceChildren(); shown = []; }
    const fresh = narration.lines.slice(shown.length);
    shown = [...narration.lines];
    queue.push(...fresh);
    if (!current && !timers.length) next();
    else if (!fresh.length) settled();
  }

  function open(request: string) {
    clearTimers(); current = null; queue = []; shown = []; phase = 'work';
    win.clearTimeout(pillTimer);
    textEl.replaceChildren(); liveEl.textContent = '';
    requestEl.textContent = `«${request.trim()}»`;
    pill.hidden = true;
    element.hidden = false;
    placeSaved();
    spin(headLogo);
  }
  function close() { element.hidden = true; win.clearTimeout(pillTimer); }
  /** One way out for the close button and Escape: a finished summary stays reachable through the pill. */
  const dismiss = () => { close(); if (phase === 'done') pill.hidden = false; };

  textEl.addEventListener('click', finishCurrent);
  element.querySelector('[data-narrator-close]')!.addEventListener('click', dismiss);
  pill.addEventListener('click', () => { pill.hidden = true; element.hidden = false; placeSaved(); });
  doc.addEventListener('keydown', event => {
    // Escape belongs to an open dialog first.
    if (event.key !== 'Escape' || element.hidden || event.defaultPrevented || doc.querySelector('dialog[open], [aria-modal="true"]')) return;
    dismiss();
  });

  return { open, show, close, element };
}

/** Connects the window to the Studio's build lifecycle; a poll that says nothing new types nothing. */
export function narratorBridge(narrator: Pick<Narrator, 'open' | 'show'>) {
  let last = '';
  let active = false;
  const show = (n: Narration) => { const key = JSON.stringify(n); if (key === last) return; last = key; narrator.show(n); };
  return {
    /** The merchant's words only: the Studio's own instructions («Navegación elegida: …») stay out of the window. */
    submitted(text: string) { last = ''; active = true; narrator.open(text.split(/\n\s*\nNavegación elegida:/)[0].trim()); },
    progress(progress: BuildProgress | null) { if (active) show(narrationFromProgress(progress)); },
    completed(reply: string | { content?: unknown; metadata?: Record<string, unknown> | null }) { active = false; show(typeof reply === 'string' ? narrationFromReply(reply) : narrationFromMessage(reply)); },
    /** Only a build this window is following can stop; a later failure (an «Alternativa») never replaces the summary. */
    interrupted(reason?: string) { if (!active) return; active = false; show(stoppedNarration(reason)); },
  };
}
