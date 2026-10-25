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
export type Narrator = {
  open(request: string): void; show(narration: Narration): void; close(): void;
  /** Store news (owner 2026-10-22): one short line, typed, then the window hides by itself. False while YAPI is busy in it. */
  notice(title: string, line: string): boolean;
  /** YAPI in design mode: sit just above the pill (null: back to its own place). */
  anchor(rect: { left: number; top: number; width: number; height?: number } | null): void;
  /** The star turns while YAPI changes something. */
  spinning(state: 'spin' | 'pulse' | 'idle'): void;
  element: HTMLElement;
};
export type NarratorSize = 'small' | 'normal' | 'large';

const PILL_AFTER_MS = 2600;
const NOTICE_HIDE_MS = 10_000;
const LOGO_EVERY_LINES = 5;
const SIZES: readonly NarratorSize[] = ['small', 'normal', 'large'];
const STORAGE_KEY = 'pagosya_yapi_window';
const EDGE = 8;
const DRAG_SLOP = 4;
/** x/y place the window; px/py the «YAPI · Resumen» pill, which the merchant moves on its own (owner 2026-10-22). */
type Saved = { size?: NarratorSize; x?: number; y?: number; px?: number; py?: number };

export function mountNarrator(doc: Document, opts: { reducedMotion?: () => boolean; onNoticeDismissed?: () => void } = {}): Narrator {
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

  /** Keeps the header (or the whole pill) on screen so it can always be grabbed again. */
  function clampTo(node: HTMLElement, x: number, y: number, fallbackWidth: number, keep: number) {
    const width = node.offsetWidth || fallbackWidth;
    const left = Math.round(Math.min(Math.max(EDGE, x), Math.max(EDGE, win.innerWidth - width - EDGE)));
    const top = Math.round(Math.min(Math.max(EDGE, y), Math.max(EDGE, win.innerHeight - keep)));
    Object.assign(node.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto' });
    return { left, top };
  }
  function place(x: number, y: number) {
    const { left, top } = clampTo(element, x, y, 320, 56);
    return { x: left, y: top };
  }
  function placePill(x: number, y: number) {
    const { left, top } = clampTo(pill, x, y, 150, 52);
    return { px: left, py: top };
  }
  function toCorner() {
    for (const side of ['left', 'top', 'right', 'bottom']) element.style.removeProperty(side);
    delete saved.x; delete saved.y; remember({});
  }
  function pillToCorner() {
    for (const side of ['left', 'top', 'right', 'bottom']) pill.style.removeProperty(side);
    delete saved.px; delete saved.py; remember({});
  }
  // YAPI in design mode (spec 2026-10-22 v2 §3): anchored, the window is the bubble just above the pill and follows it.
  let anchored: { left: number; top: number; width: number; height?: number } | null = null;
  /** Held by its bottom edge so new lines grow it upward; below the block when there is no room above (review 2026-10-22). */
  function placeAnchored() {
    if (!anchored) return;
    element.style.width = `${Math.min(anchored.width, 440)}px`;
    Object.assign(element.style, { left: `${anchored.left}px`, right: 'auto' });
    if (anchored.top < 160) Object.assign(element.style, { top: `${anchored.top + (anchored.height ?? 64) + 12}px`, bottom: 'auto' });
    else Object.assign(element.style, { top: 'auto', bottom: `${win.innerHeight - anchored.top + 12}px` });
  }
  const placeSaved = () => { if (anchored) placeAnchored(); else if (saved.x !== undefined && saved.y !== undefined) place(saved.x, saved.y); };
  const placeSavedPill = () => { if (saved.px !== undefined && saved.py !== undefined) placePill(saved.px, saved.py); };
  const showPill = () => { if (anchored) return; pill.hidden = false; placeSavedPill(); };
  function anchor(rect: { left: number; top: number; width: number; height?: number } | null) {
    anchored = rect;
    element.classList.toggle('yapi-narrator--bubble', Boolean(rect));
    if (rect) { pill.hidden = true; placeAnchored(); } else { element.style.width = ''; placeSaved(); }
  }
  function spinning(state: 'spin' | 'pulse' | 'idle') {
    const mark = element.querySelector('[data-narrator-logo]');
    mark?.classList.toggle('is-spin', state === 'spin');
    mark?.classList.toggle('is-pulse', state === 'pulse');
  }

  let drag: { id: number; dx: number; dy: number; at?: { x: number; y: number } } | null = null;
  head.addEventListener('pointerdown', event => {
    if (anchored) return;
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
  // The pill moves the same way (owner 2026-10-22: it sat in the middle of the screen); a press that never moves opens it.
  let pillDrag: { id: number; dx: number; dy: number; x0: number; y0: number; moved: boolean; at?: { px: number; py: number } } | null = null;
  let pillDragged = false;
  pill.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const box = pill.getBoundingClientRect();
    pillDrag = { id: event.pointerId, dx: event.clientX - box.left, dy: event.clientY - box.top, x0: event.clientX, y0: event.clientY, moved: false };
    pill.setPointerCapture?.(event.pointerId);
  });
  pill.addEventListener('pointermove', event => {
    if (pillDrag?.id !== event.pointerId) return;
    if (!pillDrag.moved && Math.hypot(event.clientX - pillDrag.x0, event.clientY - pillDrag.y0) < DRAG_SLOP) return;
    if (!pillDrag.moved) { pillDrag.moved = true; pill.classList.add('is-dragging'); }
    pillDrag.at = placePill(event.clientX - pillDrag.dx, event.clientY - pillDrag.dy);
  });
  const endPillDrag = (event: PointerEvent) => {
    if (pillDrag?.id !== event.pointerId) return;
    const { moved, at } = pillDrag;
    pillDrag = null;
    pill.classList.remove('is-dragging');
    pillDragged = moved;
    if (at) remember(at);
  };
  pill.addEventListener('pointerup', endPillDrag);
  pill.addEventListener('pointercancel', endPillDrag);
  pill.addEventListener('dblclick', () => pillToCorner());
  win.addEventListener('resize', () => { placeSaved(); placeSavedPill(); });
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
  // A news line borrows the window: what it showed before (a finished summary) comes back when the news leaves.
  let notice: { request: string; nodes: Node[]; shown: string[]; phase: Narration['phase']; pill: boolean; hidden: boolean } | null = null;
  let noticeTimer = 0;

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
    if (notice) { win.clearTimeout(noticeTimer); noticeTimer = win.setTimeout(() => endNotice(), NOTICE_HIDE_MS); return; }
    if (phase !== 'done') return;
    win.clearTimeout(pillTimer);
    pillTimer = win.setTimeout(() => { element.hidden = true; showPill(); }, PILL_AFTER_MS);
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
    if (notice) endNotice();
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

  /** The news leaves: the window goes back to what it held, hidden again unless it was open before. */
  function endNotice(restore = true) {
    if (!notice) return;
    const was = notice; notice = null;
    win.clearTimeout(noticeTimer);
    clearTimers(); current = null; queue = [];
    if (!restore) return;
    requestEl.textContent = was.request;
    textEl.replaceChildren(...was.nodes);
    shown = was.shown; phase = was.phase;
    element.classList.remove('is-notice');
    element.hidden = was.hidden;
    if (was.pill) showPill();
  }
  function showNotice(title: string, line: string) {
    // Never over YAPI at work or a summary the merchant is reading; a news line already showing gives way to the next.
    if (notice) endNotice();
    if (!element.hidden || queue.length || current) return false;
    notice = { request: requestEl.textContent || '', nodes: [...textEl.childNodes], shown, phase, pill: !pill.hidden, hidden: element.hidden };
    win.clearTimeout(pillTimer);
    pill.hidden = true;
    shown = []; textEl.replaceChildren(); liveEl.textContent = '';
    requestEl.textContent = title;
    element.classList.add('is-notice');
    element.hidden = false;
    placeSaved();
    spin(headLogo);
    queue = [line];
    next();
    return true;
  }

  function open(request: string) {
    endNotice(false); element.classList.remove('is-notice');
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
  const dismiss = () => {
    if (notice) { endNotice(); element.hidden = true; opts.onNoticeDismissed?.(); return; }
    close(); if (phase === 'done') showPill();
  };

  textEl.addEventListener('click', finishCurrent);
  element.querySelector('[data-narrator-close]')!.addEventListener('click', dismiss);
  pill.addEventListener('click', () => {
    if (pillDragged) { pillDragged = false; return; }
    if (notice) endNotice();
    pill.hidden = true; element.hidden = false; placeSaved();
  });
  doc.addEventListener('keydown', event => {
    // Escape belongs to an open dialog first.
    if (event.key !== 'Escape' || element.hidden || event.defaultPrevented || doc.querySelector('dialog[open], [aria-modal="true"]')) return;
    dismiss();
  });

  return { open, show, close, notice: showNotice, element, anchor, spinning };
}

/** Connects the window to the Studio's build lifecycle; a poll that says nothing new types nothing. */
export function narratorBridge(narrator: Pick<Narrator, 'open' | 'show'>, plain = false) {
  let last = '';
  let active = false;
  const show = (n: Narration) => { const key = JSON.stringify(n); if (key === last) return; last = key; narrator.show(n); };
  return {
    /** The merchant's words only: the Studio's own instructions («Navegación elegida: …») stay out of the window. */
    submitted(text: string) { last = ''; active = true; narrator.open(text.split(/\n\s*\nNavegación elegida:/)[0].trim()); },
    progress(progress: BuildProgress | null) { if (active) show(narrationFromProgress(progress, plain)); },
    completed(reply: string | { content?: unknown; metadata?: Record<string, unknown> | null }) { active = false; show(typeof reply === 'string' ? narrationFromReply(reply) : narrationFromMessage(reply)); },
    /** Only a build this window is following can stop; a later failure (an «Alternativa») never replaces the summary. */
    interrupted(reason?: string) { if (!active) return; active = false; show(stoppedNarration(reason)); },
  };
}
