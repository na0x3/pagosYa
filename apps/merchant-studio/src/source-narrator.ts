import { narrationFromMessage, narrationFromProgress, narrationFromReply, stoppedNarration, typingPlan, type Narration } from './source-narration';
import type { BuildProgress } from './source-build-progress';
import { renderFaceMark } from './source-face';
import './source-narrator.css';

/**
 * YAPI's glass window over the live preview (spec 2026-10-21 Part C): it writes, word by word, the merchant's request,
 * YAPI's plan, the step it is on and its summary, then shrinks to a pill. It lives on document.body so the Studio's
 * re-renders never touch it. Screen readers get each finished sentence once through a separate live region.
 */
export type Narrator = { open(request: string): void; show(narration: Narration): void; close(): void; element: HTMLElement };

const PILL_AFTER_MS = 2600;

export function mountNarrator(doc: Document, opts: { reducedMotion?: () => boolean } = {}): Narrator {
  const reduced = opts.reducedMotion ?? (() => doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const element = doc.createElement('aside');
  element.className = 'yapi-narrator';
  element.setAttribute('aria-label', 'YAPI');
  element.hidden = true;
  element.innerHTML = `<header class="yapi-narrator__head"><span class="yapi-narrator__mark" aria-hidden="true">${renderFaceMark()}</span><strong>YAPI</strong><button type="button" class="yapi-narrator__close" data-narrator-close aria-label="Cerrar">×</button></header><p class="yapi-narrator__request" data-narrator-request></p><div class="yapi-narrator__text" data-narrator-text></div><p class="yapi-narrator__live" data-narrator-live aria-live="polite"></p>`;
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'yapi-narrator-pill';
  pill.dataset.narratorPill = '';
  pill.hidden = true;
  pill.textContent = 'YAPI · Resumen';
  doc.body.append(element, pill);
  const requestEl = element.querySelector<HTMLElement>('[data-narrator-request]')!;
  const textEl = element.querySelector<HTMLElement>('[data-narrator-text]')!;
  const liveEl = element.querySelector<HTMLElement>('[data-narrator-live]')!;

  let shown: string[] = [];
  let queue: string[] = [];
  let timers: number[] = [];
  let current: { p: HTMLElement; line: string } | null = null;
  let pillTimer = 0;
  let phase: Narration['phase'] = 'work';
  const win = doc.defaultView!;

  const clearTimers = () => { timers.forEach(t => win.clearTimeout(t)); timers = []; };
  const announce = (line: string) => { liveEl.textContent = line; };
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
      textEl.lastElementChild?.remove();
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
  }
  function close() { element.hidden = true; win.clearTimeout(pillTimer); }
  /** One way out for the close button and Escape: a finished summary stays reachable through the pill. */
  const dismiss = () => { close(); if (phase === 'done') pill.hidden = false; };

  textEl.addEventListener('click', finishCurrent);
  element.querySelector('[data-narrator-close]')!.addEventListener('click', dismiss);
  pill.addEventListener('click', () => { pill.hidden = true; element.hidden = false; });
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
