// node v2-references.cjs [--force] [host …] — the V2 study library's pictures and measurements (owner 2026-11-14: «make it learn from
// all types of ecommerce sites» → «do it»). Each reference store is visited once: its home top to bottom (desktop screens + phone),
// a catalogue page, a product page and the cart (Shopify stores: a product is added through /cart/add.js first), desktop and phone.
// Every page is also measured in the browser (fonts, colours, header, section list, grid columns, buy button above the fold) — the
// study route reads both to write the store's recipe card. Output: examples/v2-proto/references/<host>/*.jpg + facts.json, and
// index.json (pages found, shots, blocked). Stores already captured are skipped unless --force. Three stores at a time.
const fs = require('node:fs');
const path = require('node:path');
const { API_DIR, ROOT } = require('./common.cjs');
const { chromium } = require(path.join(API_DIR, 'node_modules/playwright'));
const { V2_REFERENCES } = require(path.join(API_DIR, 'dist/src/storefront-source/v2/v2-references.js'));

const OUT = path.join(ROOT, 'examples', 'v2-proto', 'references');
const args = process.argv.slice(2);
const force = args.includes('--force');
const asked = args.filter(arg => !arg.startsWith('--'));
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ACCEPT = /^(accept( all)?( cookies)?|allow( all)?( cookies)?|agree|i agree|ok|got it|aceptar( todo)?|entendido|continue|no,? thanks|close|dismiss|×|✕)$/i;
const BLOCKED = /just a moment|access denied|attention required|are you a robot|forbidden|pardon our interruption|request unsuccessful|captcha/i;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function dismiss(page) {
  for (const button of await page.locator('button, a[role=button], [aria-label="Close"], [aria-label="close"]').all().catch(() => [])) {
    const text = ((await button.textContent().catch(() => '')) || (await button.getAttribute('aria-label').catch(() => '')) || '').trim();
    if (ACCEPT.test(text) && await button.isVisible().catch(() => false)) { await button.click({ timeout: 1200 }).catch(() => {}); await page.waitForTimeout(300); }
  }
  await page.keyboard.press('Escape').catch(() => {});
}

// Runs in the page: what a designer would measure with devtools open.
function measure(kind) {
  const vw = innerWidth, vh = innerHeight;
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const font = el => { if (!el) return null; const s = getComputedStyle(el); return { family: s.fontFamily.split(',')[0].replace(/["']/g, '').trim(), size: s.fontSize, weight: s.fontWeight, case: s.textTransform, tracking: s.letterSpacing, text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60) }; };
  const first = sel => [...document.querySelectorAll(sel)].find(visible);
  const bg = el => { for (let node = el; node; node = node.parentElement) { const c = getComputedStyle(node).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c; } return 'rgb(255, 255, 255)'; };
  // The header: the first banner-like element of a header's height (some themes wrap the whole page in <header>).
  const header = [...document.querySelectorAll('header, [role=banner], #shopify-section-header, .header, [class*=header]')].find(el => visible(el) && el.getBoundingClientRect().top < 200 && el.getBoundingClientRect().height >= 30 && el.getBoundingClientRect().height <= 400);
  const headerBox = header?.getBoundingClientRect();
  const headerLinks = header ? [...header.querySelectorAll('a, button')].filter(visible).map(el => (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean).slice(0, 16) : [];
  const logo = header && [...header.querySelectorAll('a img, a svg, a[href="/"]')].find(visible);
  const logoBox = logo?.getBoundingClientRect();
  const out = {
    kind, url: location.href, title: document.title.slice(0, 120), width: vw, pageHeight: document.documentElement.scrollHeight,
    fonts: { h1: font(first('h1')), h2: font(first('h2')), body: font(first('main p, p')), button: font(first('main button, button[type=submit], .btn, .button')), nav: font(header && [...header.querySelectorAll('a')].find(visible)) },
    page: bg(document.body),
    header: header ? { height: Math.round(headerBox.height), position: getComputedStyle(header).position, bg: bg(header), links: headerLinks,
      logo: logoBox ? (logoBox.left + logoBox.width / 2 < vw * 0.38 ? 'left' : logoBox.left + logoBox.width / 2 > vw * 0.62 ? 'right' : 'centre') : 'unknown',
      bar: !!first('[class*=announcement], [id*=announcement], [class*=promo-bar], [class*=marquee]') } : null,
    marquee: !!document.querySelector('marquee, [class*=marquee], [class*=ticker]'), videos: [...document.querySelectorAll('video')].filter(visible).length,
  };
  // The page as stacked blocks: walk down from <main> (or body), opening wrappers that hold a single big child.
  const root = document.querySelector('main') || document.body;
  let blocks = [...root.children];
  for (let i = 0; i < 4 && blocks.length < 3; i++) blocks = blocks.flatMap(el => [...el.children]);
  blocks = blocks.filter(el => visible(el) && el.getBoundingClientRect().height > 100 && !/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName));
  const scrollY = window.scrollY;
  out.sections = blocks.slice(0, 30).map(el => {
    const r = el.getBoundingClientRect(); const imgs = [...el.querySelectorAll('img, picture, video')].filter(visible);
    const heading = [...el.querySelectorAll('h1, h2, h3')].find(visible);
    const tops = new Map(); for (const card of [...el.querySelectorAll('a')].filter(a => visible(a) && a.querySelector('img'))) { const top = Math.round(card.getBoundingClientRect().top / 10); tops.set(top, (tops.get(top) || 0) + 1); }
    return { y: Math.round(r.top + scrollY), h: Math.round(r.height), bg: bg(el), images: imgs.length, video: !!el.querySelector('video'), heading: heading ? font(heading) : null,
      words: (el.innerText || '').split(/\s+/).filter(Boolean).length, perRow: Math.max(0, ...tops.values()), fullBleed: r.width >= vw - 4 };
  });
  if (kind === 'catalog' || kind === 'home') {
    // A product card: the nearest box around a photo that also shows a price, narrower than half the page.
    const cards = [...new Set([...document.querySelectorAll('main img, main picture')].filter(el => visible(el) && el.getBoundingClientRect().width > 100).map(el => {
      for (let node = el.parentElement, i = 0; node && i < 7; node = node.parentElement, i++) {
        if (node.getBoundingClientRect().width > vw * 0.5) return null;
        if (/[$€£]\s?\d|\d\s?(USD|EUR|Bs)/.test(node.innerText || '')) return node;
      }
      return null;
    }).filter(Boolean))].filter((node, _, all) => !all.some(other => other !== node && node.contains(other)));
    const rows = new Map(); for (const card of cards) { const t = Math.round(card.getBoundingClientRect().top / 10); rows.set(t, (rows.get(t) || 0) + 1); }
    const img = cards[0]?.querySelector('img')?.getBoundingClientRect();
    out.grid = { cards: cards.length, columns: Math.max(0, ...rows.values()), photoRatio: img ? Number((img.width / Math.max(1, img.height)).toFixed(2)) : null,
      filters: !!document.querySelector('[class*=filter], [id*=filter], [aria-label*=ilter]') };
  }
  if (kind === 'product') {
    const buy = [...document.querySelectorAll('button, input[type=submit]')].find(el => visible(el) && /add to (cart|bag)|añadir|agregar|buy|comprar|add to basket/i.test(el.textContent || el.value || ''));
    const b = buy?.getBoundingClientRect();
    out.buy = { found: !!buy, text: buy ? (buy.textContent || buy.value || '').trim().slice(0, 40) : null, aboveFold: b ? b.top < vh : null, top: b ? Math.round(b.top) : null, x: b ? Math.round(b.left) : null, width: b ? Math.round(b.width) : null, bg: buy ? getComputedStyle(buy).backgroundColor : null };
    out.price = font([...document.querySelectorAll('[class*=price]')].find(visible));
    out.galleryImages = [...document.querySelectorAll('main img')].filter(el => visible(el) && el.getBoundingClientRect().width > 120).length;
    out.swatches = document.querySelectorAll('[class*=swatch], input[type=radio]').length; out.selects = document.querySelectorAll('select').length;
    out.accordions = document.querySelectorAll('details, [aria-expanded]').length;
  }
  return out;
}

async function shoot(context, url, dir, name, screens, facts, kind) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForTimeout(3500); await dismiss(page);
    const title = await page.title().catch(() => '');
    if (BLOCKED.test(title) || BLOCKED.test((await page.locator('body').innerText().catch(() => '')).slice(0, 400))) { await page.close(); return { blocked: title || 'blocked' }; }
    const height = (await page.viewportSize()).height;
    const shots = [];
    // Some pages scroll inside a box instead of the window (omsom.com): scroll whichever is the page's real scroller.
    const scroll = top => page.evaluate(y => {
      const doc = document.scrollingElement || document.documentElement;
      const box = doc.scrollHeight > innerHeight + 20 ? doc : [...document.querySelectorAll('body *')].filter(el => /auto|scroll/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 20)
        .sort((a, b) => b.clientHeight - a.clientHeight)[0] || doc;
      box.scrollTop = y;
      return box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
    }, top);
    for (let i = 0; i < screens; i++) {
      const end = await scroll(i * height); await page.waitForTimeout(i ? 1100 : 300);
      if (i === 1) await dismiss(page);
      const file = `${name}-${i + 1}.jpg`;
      await page.screenshot({ path: path.join(dir, file), type: 'jpeg', quality: 62 });
      shots.push(file);
      if (end) break;
    }
    // Measured from the top, after the lazy parts loaded on the way down.
    await scroll(0); await page.waitForTimeout(400);
    facts[name] = await page.evaluate(measure, kind).catch(error => ({ error: String(error.message).slice(0, 120) }));
    return { shots, page };
  } catch (error) { await page.close().catch(() => {}); return { error: String(error.message).slice(0, 120) }; }
}

/** The catalogue, a product and its variant from Shopify's public JSON, when the store runs on Shopify. */
async function findPages(context, host) {
  const found = { catalog: null, product: null, variant: null, shopify: false };
  try {
    const res = await context.request.get(`https://${host}/products.json?limit=30`, { timeout: 15_000 });
    const products = res.ok() ? (await res.json()).products ?? [] : [];
    const product = products.find(p => p.images?.length && p.variants?.some(v => v.available)) ?? products.find(p => p.images?.length);
    if (product) {
      found.shopify = true; found.product = `https://${host}/products/${product.handle}`;
      found.variant = (product.variants.find(v => v.available) ?? product.variants[0])?.id ?? null;
      found.catalog = `https://${host}/collections/all`;
    }
  } catch {}
  return found;
}

/** Otherwise the first product and catalogue links on the home page. */
async function linksFrom(page, host) {
  return page.evaluate(h => {
    const links = [...document.querySelectorAll('a[href]')].map(a => a.href).filter(href => { try { const u = new URL(href); return u.hostname.replace(/^www\./, '').endsWith(h.replace(/^www\./, '')) && !u.hash; } catch { return false; } });
    return {
      product: links.find(href => /\/products?\/[^/?#]+|\/p\/[^/?#]+|\/item\/|\/shop\/[^/]+\/[^/?#]+$/.test(new URL(href).pathname)) ?? null,
      catalog: links.find(href => /\/collections\/[^/?#]+|\/shop\/?$|\/shop-all|\/category\/|\/c\/|\/all$/.test(new URL(href).pathname)) ?? null,
    };
  }, host).catch(() => ({ product: null, catalog: null }));
}

async function capture(browser, ref) {
  const dir = path.join(OUT, ref.host);
  fs.mkdirSync(dir, { recursive: true });
  const facts = {}; const entry = { host: ref.host, shots: {}, pages: {}, at: new Date().toISOString() };
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: UA, locale: 'en-US' });
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: PHONE_UA, locale: 'en-US', deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  try {
    const home = await shoot(desktop, `https://${ref.host}/`, dir, 'home-d', 6, facts, 'home');
    if (home.blocked || home.error) { entry.blocked = home.blocked ?? null; entry.error = home.error ?? null; return entry; }
    entry.shots.home = home.shots;
    const pages = await findPages(desktop, ref.host);
    const links = await linksFrom(home.page, ref.host);
    await home.page.close();
    entry.pages = { catalog: pages.catalog ?? links.catalog, product: pages.product ?? links.product, shopify: pages.shopify };
    const homePhone = await shoot(phone, `https://${ref.host}/`, dir, 'home-p', 3, facts, 'home'); await homePhone.page?.close();
    entry.shots.homePhone = homePhone.shots ?? [];
    if (entry.pages.catalog) {
      const catalog = await shoot(desktop, entry.pages.catalog, dir, 'catalog-d', 2, facts, 'catalog'); await catalog.page?.close();
      const catalogPhone = await shoot(phone, entry.pages.catalog, dir, 'catalog-p', 1, facts, 'catalog'); await catalogPhone.page?.close();
      entry.shots.catalog = [...(catalog.shots ?? []), ...(catalogPhone.shots ?? [])];
    }
    if (entry.pages.product) {
      const product = await shoot(desktop, entry.pages.product, dir, 'product-d', 3, facts, 'product');
      const productPhone = await shoot(phone, entry.pages.product, dir, 'product-p', 2, facts, 'product'); await productPhone.page?.close();
      entry.shots.product = [...(product.shots ?? []), ...(productPhone.shots ?? [])];
      // The cart with one thing in it: Shopify's own add endpoint, else the page's add button (a drawer it opens is the cart shown).
      if (product.page) {
        try {
          await product.page.evaluate(() => window.scrollTo(0, 0));
          if (pages.variant) await product.page.evaluate(id => fetch('/cart/add.js', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id, quantity: 1 }] }) }), pages.variant);
          else {
            await product.page.locator('button:visible', { hasText: /add to (cart|bag)|add to basket|añadir|agregar/i }).first().click({ timeout: 4000 });
            await product.page.waitForTimeout(2500);
            await product.page.screenshot({ path: path.join(dir, 'cart-drawer.jpg'), type: 'jpeg', quality: 62 });
            entry.shots.cart = ['cart-drawer.jpg'];
          }
        } catch {}
        await product.page.close();
        if (pages.variant) {
          const cart = await shoot(desktop, `https://${ref.host}/cart`, dir, 'cart-d', 1, facts, 'cart'); await cart.page?.close();
          entry.shots.cart = cart.shots ?? [];
        }
      }
    }
  } finally {
    await desktop.close(); await phone.close();
    fs.writeFileSync(path.join(dir, 'facts.json'), JSON.stringify(facts, null, 2) + '\n');
  }
  return entry;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const indexFile = path.join(OUT, 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : {};
  // The flat files of the first library (one desktop + phone screen per store) give way to a folder per store.
  for (const [host, entry] of Object.entries(index)) if (!entry.shots) delete index[host];
  const todo = V2_REFERENCES.filter(ref => (!asked.length || asked.includes(ref.host)) && (force || !index[ref.host]?.shots?.home?.length));
  console.log(`${todo.length} stores to capture`);
  const browser = await chromium.launch();
  let next = 0;
  await Promise.all([0, 1, 2].map(async () => {
    while (next < todo.length) {
      const ref = todo[next++];
      const started = Date.now();
      const entry = await capture(browser, ref).catch(error => ({ host: ref.host, error: String(error.message).slice(0, 160), at: new Date().toISOString() }));
      index[ref.host] = entry;
      fs.writeFileSync(indexFile, JSON.stringify(index, null, 2) + '\n');
      const count = Object.values(entry.shots ?? {}).flat().length;
      console.log(new Date().toTimeString().slice(0, 8), ref.host, entry.blocked ? `BLOCKED ${entry.blocked}` : entry.error ? `ERROR ${entry.error}` : `${count} shots`,
        entry.pages?.shopify ? 'shopify' : '', entry.pages?.product ? '' : 'no product page', `${Math.round((Date.now() - started) / 1000)}s`);
      await sleep(200);
    }
  }));
  await browser.close();
})().catch(error => { console.error(error.message); process.exit(1); });
