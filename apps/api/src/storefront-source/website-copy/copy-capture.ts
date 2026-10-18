/// <reference lib="dom" />
/** The blueprint of a page to copy (spec 2026-10-18 website copy, decision 2): the guarded browser renders the whole page, scrolls
 *  it so lazy content loads, measures its sections at 1280 px and again at 390 px, and crops one screenshot per section. Only
 *  shapes, sizes and colours are read, never the page's words. */
import type { Page } from 'playwright';
import { withGuardedPage } from '../guarded-browser';
import { normalizeBlueprint, type WebsiteBlueprint } from './copy-blueprint';

const VIEW = { width: 1280, height: 900 };
const MAX_CROPS = 8;
const CROP_BYTES = 250_000;

/** Runs inside the page: the top-level blocks and their measures. Self-contained, because Playwright serialises it. */
function measurePage() {
  const vw = innerWidth, pageHeight = document.documentElement.scrollHeight;
  const hex = (value: string) => {
    const match = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value);
    if (!match || (match[4] !== undefined && Number(match[4]) < 0.5)) return null;
    return `#${[match[1], match[2], match[3]].map(part => Math.round(Number(part)).toString(16).padStart(2, '0')).join('')}`;
  };
  const shown = (element: Element) => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05; };
  const headerLike = (element: Element) => element.tagName === 'HEADER' || element.getAttribute('role') === 'banner' || /(^|[\s_-])header([\s_-]|$)/i.test(`${element.id} ${element.className}`);
  const footerLike = (element: Element) => element.tagName === 'FOOTER' || Boolean(element.querySelector('footer')) || /(^|[\s_-])footer([\s_-]|$)/i.test(`${element.id} ${element.className}`);
  // Headers are often 50–80 px: they count from 40 px.
  const big = (element: Element) => { const rect = element.getBoundingClientRect(); return shown(element) && rect.height >= (headerLike(element) ? 40 : 80) && rect.width >= vw * 0.7; };
  const kids = (element: Element) => Array.from(element.children).filter(child => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'TEMPLATE', 'IFRAME'].includes(child.tagName));
  const blocks: Element[] = [];
  const collect = (element: Element, depth: number) => {
    for (const child of kids(element)) {
      if (!big(child)) continue;
      const inner = kids(child).filter(big);
      // A wrapper around most of the page (or <main>) is opened up: its sections are the page's sections.
      if (depth < 5 && inner.length > 1 && (child.tagName === 'MAIN' || child.getBoundingClientRect().height > pageHeight * 0.5) && !['HEADER', 'FOOTER', 'NAV', 'SECTION'].includes(child.tagName)) collect(child, depth + 1);
      else blocks.push(child);
    }
  };
  collect(document.body, 0);
  // A fixed or sticky header sits outside the flow: it is still the page's header.
  if (!blocks.length || !headerLike(blocks[0])) {
    const header = Array.from(document.querySelectorAll('header, [role="banner"], [class*="header" i], [id*="header" i]')).find(element => { const box = element.getBoundingClientRect(); return shown(element) && box.top < 160 && box.height >= 40 && box.height < 220 && box.width >= vw * 0.7 && Boolean(element.querySelector('a')); });
    // Even inside the hero (an overlay header, Allbirds 2026-10-18).
    if (header && !blocks.includes(header)) blocks.unshift(header);
  }
  const background = (element: Element): string | null => {
    for (let node: Element | null = element; node && node !== document.documentElement; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage && style.backgroundImage !== 'none' && /url\(/.test(style.backgroundImage) && node === element) return 'image';
      const colour = hex(style.backgroundColor);
      if (colour) return colour;
    }
    return hex(getComputedStyle(document.body).backgroundColor) ?? '#ffffff';
  };
  const columnsOf = (element: Element) => {
    const width = element.getBoundingClientRect().width;
    let best = 1;
    const visit = (node: Element, depth: number) => {
      const rows = new Map<number, number>();
      for (const child of kids(node)) {
        const rect = child.getBoundingClientRect();
        if (!shown(child) || rect.width < width * 0.12 || rect.height < 40) continue;
        const row = Math.round(rect.top / 24);
        rows.set(row, (rows.get(row) ?? 0) + 1);
      }
      best = Math.max(best, ...rows.values());
      if (depth < 3) kids(node).forEach(child => visit(child, depth + 1));
    };
    visit(element, 0);
    return Math.min(best, 6);
  };
  const innerWidth_ = (element: Element) => {
    const width = element.getBoundingClientRect().width;
    const queue = kids(element);
    for (let seen = 0; queue.length && seen < 60; seen++) {
      const node = queue.shift()!; const box = node.getBoundingClientRect();
      if (shown(node) && box.width >= 300 && box.width < width * 0.98) return box.width;
      queue.push(...kids(node));
    }
    return width;
  };
  const kept = blocks.slice(0, 14);
  // One footer: the last block, or the one before it when the last is not one (a cookie bar after the footer).
  const footerAt = kept.length > 1 && footerLike(kept[kept.length - 1]) ? kept.length - 1 : kept.length > 2 && footerLike(kept[kept.length - 2]) ? kept.length - 2 : -1;
  const sections = kept.map((element, index) => {
    const rect = element.getBoundingClientRect();
    const images = Array.from(element.querySelectorAll('img, picture, video, svg image')).filter(image => { const box = image.getBoundingClientRect(); return shown(image) && box.width >= 80 && box.height >= 60; });
    const largest = images.map(image => image.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0];
    const bg = background(element);
    const placement = bg === 'image' ? 'background' : !largest ? 'none' : images.length >= 3 && images.every(image => Math.abs(image.getBoundingClientRect().width - largest.width) < largest.width * 0.2) ? 'grid'
      : largest.width > rect.width * 0.8 ? 'full' : largest.left + largest.width / 2 < rect.left + rect.width / 2 ? 'left' : 'right';
    const headings = Array.from(element.querySelectorAll('h1, h2, h3')).filter(shown).slice(0, 3).map(heading => {
      const style = getComputedStyle(heading); const text = (heading as HTMLElement).innerText || '';
      return { level: Number(heading.tagName[1]), size: parseFloat(style.fontSize), weight: Number(style.fontWeight) || 400, uppercase: style.textTransform === 'uppercase' || (text.length > 3 && text === text.toUpperCase()), font: style.fontFamily, words: text.split(/\s+/).filter(Boolean).length };
    });
    const buttons = Array.from(element.querySelectorAll('a, button')).filter(link => {
      const style = getComputedStyle(link);
      return shown(link) && (hex(style.backgroundColor) !== null || parseFloat(style.borderTopWidth) >= 1) && parseFloat(style.paddingLeft) >= 8;
    }).length;
    const tag = element.tagName;
    const role = (index === 0 && (headerLike(element) || tag === 'NAV' || (rect.height < 220 && element.querySelector('nav')))) ? 'header'
      : index === footerAt ? 'footer' : 'section';
    const firstHeading = element.querySelector('h1, h2, h3');
    return {
      role, top: Math.round(rect.top + scrollY), height: Math.round(rect.height), inner: Math.round(innerWidth_(element)), background: bg, columns: columnsOf(element), images: images.length, placement,
      headings, buttons: Math.min(buttons, 12), textChars: ((element as HTMLElement).innerText || '').length,
      align: firstHeading && getComputedStyle(firstHeading).textAlign === 'center' ? 'center' : 'left',
      carousel: Boolean(element.querySelector('[class*="swiper"], [class*="carousel"], [class*="slick"], [class*="slider"], [style*="scroll-snap"]')),
    };
  });
  const firstBody = sections.findIndex(section => section.role === 'section');
  if (firstBody >= 0) sections[firstBody].role = 'hero';
  const pageBackground = hex(getComputedStyle(document.body).backgroundColor) ?? '#ffffff';
  const light = (value: string) => parseInt(value.slice(1, 3), 16) + parseInt(value.slice(3, 5), 16) + parseInt(value.slice(5, 7), 16) > 720;
  // The accent is the first real button colour: not white, not the page's own background.
  const button = Array.from(document.querySelectorAll('a, button')).find(link => { const colour = shown(link) ? hex(getComputedStyle(link).backgroundColor) : null; return Boolean(colour && colour !== pageBackground && !light(colour)) && parseFloat(getComputedStyle(link).paddingLeft) >= 8; });
  const buttonStyle = button ? getComputedStyle(button) : null;
  const accent = buttonStyle ? hex(buttonStyle.backgroundColor) : null;
  const radius = buttonStyle ? parseFloat(buttonStyle.borderTopLeftRadius) || 0 : 0;
  const widths = sections.filter(section => section.role !== 'header').map(section => section.inner).filter(width => width < vw * 0.98);
  const heading = document.querySelector('h1, h2');
  return {
    sections,
    look: {
      background: hex(getComputedStyle(document.body).backgroundColor) ?? '#ffffff', text: hex(getComputedStyle(document.body).color), accent,
      surfaces: [...new Set(sections.map(section => section.background).filter(value => value && value !== 'image'))],
      headingFont: heading ? getComputedStyle(heading).fontFamily : '', bodyFont: getComputedStyle(document.body).fontFamily,
      radius, contentWidth: widths.length ? Math.max(...widths) : vw,
      button: !buttonStyle ? 'text' : radius >= 20 ? 'pill' : accent ? 'filled' : 'outline',
    },
  };
}

/** Scrolls to the bottom in steps so lazy sections and images load, then back to the top. */
async function scrollThrough(page: Page) {
  for (let step = 0; step < 24; step++) {
    const done = await page.evaluate(() => { window.scrollBy(0, innerHeight * 0.8); return innerHeight + scrollY >= document.documentElement.scrollHeight - 4; });
    await page.waitForTimeout(250);
    if (done) break;
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
}

export type BlueprintResult = { ok: true; blueprint: WebsiteBlueprint } | { ok: false; reason: 'blocked' | 'unavailable' | 'empty' };

export async function captureWebsiteBlueprint(url: string): Promise<BlueprintResult> {
  const result = await withGuardedPage(url, { ...VIEW, timeMs: 75_000, requests: 400, bytes: 24_000_000 }, async ({ page, status, refused }): Promise<BlueprintResult> => {
    if (refused || status >= 400) return { ok: false, reason: 'blocked' };
    await page.waitForTimeout(2_500);
    await scrollThrough(page);
    const desktop = await page.evaluate(measurePage);
    const crops: Array<{ index: number; image: string }> = [];
    for (const [index, section] of desktop.sections.entries()) {
      if (crops.length >= MAX_CROPS) break;
      // After the header's own picture, fixed and sticky bars are hidden so they never cover a section (Allbirds 2026-10-18).
      // Only thin bars near the top: a tall sticky block can hold the page's content (Allbirds 2026-10-18, a blank crop).
      if (index === 1) await page.evaluate(() => { for (const element of Array.from(document.querySelectorAll('body *'))) { const position = getComputedStyle(element).position; const box = element.getBoundingClientRect(); if ((position === 'fixed' || position === 'sticky') && box.height < 200 && box.top < 200) (element as HTMLElement).style.setProperty('visibility', 'hidden', 'important'); } });
      try {
        await page.evaluate(top => window.scrollTo(0, top), section.top);
        await page.waitForTimeout(300);
        const offset = await page.evaluate(top => top - scrollY, section.top);
        const image = await page.screenshot({ type: 'jpeg', quality: 45, clip: { x: 0, y: Math.max(0, offset), width: VIEW.width, height: Math.min(section.height, VIEW.height - Math.max(0, offset)) }, timeout: 5_000 });
        if (image.length <= CROP_BYTES) crops.push({ index, image: `data:image/jpeg;base64,${image.toString('base64')}` });
      } catch { /* A section without its picture keeps its measures. */ }
    }
    // The phone pass: the same sections at 390 px, matched by order when the count agrees.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1_000);
    const phone = await page.evaluate(measurePage).catch(() => null);
    const sections = desktop.sections.map((section, index) => ({ ...section, mobileColumns: phone && phone.sections.length === desktop.sections.length ? phone.sections[index].columns : null }));
    const blueprint = normalizeBlueprint({ ...desktop, sections }, page.url(), crops);
    return blueprint ? { ok: true, blueprint } : { ok: false, reason: 'empty' };
  });
  return result ?? { ok: false, reason: 'unavailable' };
}
