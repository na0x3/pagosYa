/// <reference lib="dom" />
/**
 * The store controls guard (spec 2026-10-14, part 5): a saved candidate's header controls in a real browser at 1440 and 390.
 * Every control must be visible where the header shows it, at least 44×44, uncovered, inside the page width; the menu keeps
 * its Escape and focus behaviour; every icon paints; words read at 4.5:1 and icons and borders at 3:1 against the measured
 * background. A failing icon costs only its slot (the caller puts the library icon there); anything else drops the record.
 * Never calls a model and never writes.
 */
import type { Page } from 'playwright';
import { HEADER_CHECK_WIDTHS, measureHeaderCovers } from './design-engine/header-clickable';
import { currentSourceRuntime } from './source-runtime';
import { withVisualSandbox } from './source-visual-capture';
import { sourceVisualState } from './source-visual-state';
import { ICON_SLOTS, type IconSlot } from './store-controls';
import type { SourceProjectSnapshot } from './source-project';

export const CONTROLS_GUARD_TIMEOUT_MS = 30_000;
export const MIN_WORD_CONTRAST = 4.5;
export const MIN_ICON_CONTRAST = 3;
/** Painted pixels an icon needs on a 48×48 raster of its 24×24 box (about 1%): less is no icon a shopper can read. */
export const MIN_ICON_PIXELS = 24;
export type ControlCheck = 'visible' | 'size' | 'covered' | 'overflow' | 'menu' | 'icon' | 'contrast';
export type ControlFailure = { width: number; slot: string; check: ControlCheck; detail: string };
export type ControlReading = { slot: string; label: string; visible: boolean; width: number; height: number; iconPixels: number | null; iconBox: number | null; wordRatio: number | null; iconRatio: number | null; borderRatio: number | null };

/** Runs in the page (serialised by page.evaluate): every control the platform header draws for the record, measured. */
export function readControlsInPage(): { overflow: boolean; controls: ControlReading[] } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const paint = canvas.getContext('2d', { willReadFrequently: true })!;
  // Any CSS colour (rgb, oklch, color()) drawn onto a 1×1 canvas reads back as sRGB channels.
  const rgba = (color: string): number[] => {
    paint.clearRect(0, 0, 1, 1); paint.fillStyle = '#000'; paint.fillStyle = color; paint.fillRect(0, 0, 1, 1);
    const d = paint.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const pageColour = [document.body, document.documentElement].map(el => rgba(getComputedStyle(el).backgroundColor)).find(c => c[3] >= 0.99) ?? [255, 255, 255, 1];
  const background = (start: Element | null): number[] => { for (let node = start; node; node = node.parentElement) { const c = rgba(getComputedStyle(node).backgroundColor); if (c[3] >= 0.99) return c; } return pageColour; };
  const luminance = (c: number[]) => [c[0], c[1], c[2]].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a: number[], b: number[]) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const over = (top: number[], base: number[]) => [0, 1, 2].map(i => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
  const shown = (el: Element) => (el as any).checkVisibility({ opacityProperty: true, visibilityProperty: true }) && el.getBoundingClientRect().width > 2;
  const header = document.querySelector('header[data-pagosya-header]');
  const controls: ControlReading[] = [];
  for (const el of Array.from(header?.querySelectorAll('[data-ctl]') ?? [])) {
    const box = el.getBoundingClientRect();
    const face = el.querySelector('.ctl-face') ?? el;
    const faceBg = background(face);
    const word = Array.from(face.querySelectorAll('.ctl-word')).find(shown);
    const icon = face.querySelector('.ctl-icon');
    const path = icon?.querySelector('path');
    let iconPixels: number | null = null;
    if (path && icon && shown(icon)) {
      const art = document.createElement('canvas');
      art.width = art.height = 48;
      const pen = art.getContext('2d', { willReadFrequently: true })!;
      pen.scale(2, 2);
      pen.fill(new Path2D(path.getAttribute('d') ?? ''), 'evenodd');
      const data = pen.getImageData(0, 0, 48, 48).data;
      iconPixels = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 128) iconPixels++;
    }
    const style = getComputedStyle(face);
    const bordered = parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== 'none';
    // The same label measureHeaderCovers gives the control, so its covers can be told apart from the page's own.
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('[data-cart-count]').forEach(count => count.remove());
    controls.push({
      slot: el.getAttribute('data-ctl') ?? '',
      label: (el.getAttribute('aria-label') || clone.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      visible: shown(el), width: box.width, height: box.height, iconPixels,
      iconBox: icon && shown(icon) ? Math.min(icon.getBoundingClientRect().width, icon.getBoundingClientRect().height) : null,
      wordRatio: word ? ratio(over(rgba(getComputedStyle(word).color), faceBg), faceBg) : null,
      iconRatio: icon && shown(icon) ? ratio(over(rgba(getComputedStyle(icon).color), faceBg), faceBg) : null,
      borderRatio: bordered ? ratio(over(rgba(style.borderTopColor), background(el.parentElement)), background(el.parentElement)) : null,
    });
  }
  return { overflow: document.documentElement.scrollWidth > innerWidth + 1, controls };
}

function menuStateInPage() {
  const menu = document.querySelector('header[data-pagosya-header] [data-pagosya-header-menu]') as HTMLElement | null;
  return { open: Boolean(menu && !menu.hidden), focusInside: Boolean(document.activeElement?.closest('[data-pagosya-header-menu]')), focusOnToggle: Boolean(document.activeElement?.matches('[data-pagosya-header-toggle]')), overflow: document.documentElement.style.overflow };
}

/** Every check on one loaded page at one width. */
export async function inspectControlsPage(page: Page, width: number): Promise<ControlFailure[]> {
  const failures: ControlFailure[] = [];
  const add = (slot: string, check: ControlCheck, detail: string) => { failures.push({ width, slot, check, detail }); };
  const reading = await page.evaluate(readControlsInPage);
  if (reading.overflow) add('page', 'overflow', 'the page scrolls sideways');
  // The cart (a shop's) is on every bar; on a phone every shape opens through its menu button.
  const required = new Set(['cart', ...(width <= 860 ? ['menu'] : [])]);
  for (const control of reading.controls) {
    if (!control.visible) { if (required.has(control.slot)) add(control.slot, 'visible', 'not visible'); continue; }
    if (control.width < 43.5 || control.height < 43.5) add(control.slot, 'size', `${Math.round(control.width)}x${Math.round(control.height)}px, needs 44x44`);
    if (control.iconPixels !== null && (control.iconPixels < MIN_ICON_PIXELS || (control.iconBox ?? 0) < 12)) add(control.slot, 'icon', `the icon paints ${control.iconPixels} pixels`);
    if (control.wordRatio !== null && control.wordRatio < MIN_WORD_CONTRAST) add(control.slot, 'contrast', `word ${control.wordRatio.toFixed(2)}:1, needs ${MIN_WORD_CONTRAST}:1`);
    if (control.iconRatio !== null && control.iconRatio < MIN_ICON_CONTRAST) add(control.slot, 'contrast', `icon ${control.iconRatio.toFixed(2)}:1, needs ${MIN_ICON_CONTRAST}:1`);
    if (control.borderRatio !== null && control.borderRatio < MIN_ICON_CONTRAST) add(control.slot, 'contrast', `border ${control.borderRatio.toFixed(2)}:1, needs ${MIN_ICON_CONTRAST}:1`);
  }
  const labels = new Map(reading.controls.filter(control => control.visible).map(control => [control.label, control.slot]));
  for (const cover of await measureHeaderCovers(page, { maxPositions: 2 })) {
    const slot = labels.get(cover.control);
    if (slot) add(slot, 'covered', `covered by ${cover.cover}`);
  }
  const toggle = page.locator('header[data-pagosya-header] [data-pagosya-header-toggle]').first();
  if (await toggle.isVisible().catch(() => false)) {
    const before = await page.evaluate(menuStateInPage);
    try {
      await toggle.click({ timeout: 3000 });
      const opened = await page.evaluate(menuStateInPage);
      await page.keyboard.press('Escape');
      const closed = await page.evaluate(menuStateInPage);
      if (!opened.open || !opened.focusInside) add('menu', 'menu', 'the menu did not open with the focus inside');
      if (closed.open || !closed.focusOnToggle || closed.overflow !== before.overflow) add('menu', 'menu', 'Escape did not close the menu and give the focus back');
    } catch { add('menu', 'menu', 'the menu button could not be pressed'); }
  }
  return failures;
}

/** The outcome: icon failures name their slots (each once) and keep the record; any other failure drops it. */
export function judgeControls(failures: ControlFailure[]): { drop: boolean; iconSlots: IconSlot[]; reasons: string[] } {
  const iconSlots = [...new Set(failures.filter(failure => failure.check === 'icon').map(failure => failure.slot))]
    .filter((slot): slot is IconSlot => (ICON_SLOTS as readonly string[]).includes(slot));
  return { drop: failures.some(failure => failure.check !== 'icon'), iconSlots, reasons: failures.map(failure => `${failure.width}px ${failure.slot}: ${failure.check} (${failure.detail})`) };
}

/** index.html of a saved candidate in its own offline sandbox, at desktop and phone widths (captureHeaderCovers' pattern). */
export async function guardControlsOnSnapshot(snapshot: SourceProjectSnapshot, options: { signal?: AbortSignal } = {}): Promise<ControlFailure[]> {
  const runtime = await currentSourceRuntime(snapshot);
  const failures: ControlFailure[] = [];
  await withVisualSandbox(runtime, sourceVisualState(runtime, 'index.html', undefined, true).query, options.signal, false, async context => {
    for (const width of HEADER_CHECK_WIDTHS) {
      options.signal?.throwIfAborted();
      const page = await context.newPage();
      page.on('dialog', dialog => { void dialog.dismiss(); });
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      page.setDefaultTimeout(7000);
      try {
        await page.goto('https://preview.invalid/index.html', { waitUntil: 'load', timeout: 12_000 });
        await page.evaluate(async () => { await document.fonts.ready; });
        await page.waitForTimeout(300);
        failures.push(...await inspectControlsPage(page, width));
      } finally { await page.close(); }
    }
  }, 'no-preference');
  return failures;
}
