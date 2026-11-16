// node v2-compare.cjs <out-dir> key:storeId[:templateRev] … — the V2 prototype next to the template version of the same stores
// (docs/superpowers/specs/2026-11-14-v2-prototype-design.md): screenshots through the 4330 viewer (home desktop top / whole, home
// phone whole, product page desktop / phone), Mirror Water as the premium reference, and structural distance with the same
// layoutSignature the service uses — V2 vs its template, V2 vs V2, and every pair of the round's template homes as the baseline.
const fs = require('node:fs');
const path = require('node:path');
const { API_DIR, prisma } = require('./common.cjs');
const { chromium } = require(path.join(API_DIR, 'node_modules/playwright'));
const { layoutSignature, signatureDistance } = require(path.join(API_DIR, 'dist/src/storefront-source/v2/v2-signature.js'));
const { readConfigData } = require(path.join(API_DIR, 'dist/src/storefront-source/v2/v2-context.js'));

const [out, ...jobs] = process.argv.slice(2);
if (!out || !jobs.length) { console.error('usage: node v2-compare.cjs <out-dir> key:storeId[:templateRev] …'); process.exit(1); }
const VIEWER = process.env.VIEWER || 'localhost:4330';
const REFERENCE = process.env.REFERENCE || 'https://mirrorwater.earth';
const BASELINE = (process.env.BASELINE || '').split(',').filter(Boolean); // key:storeId:rev of other template homes

async function settle(page) {
  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < total; y += 600) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(90); }
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(900);
}
async function shoot(browser, url, file, { width, height, scale, full }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => page.waitForTimeout(4000));
    await settle(page);
    await page.screenshot({ path: file, type: 'jpeg', quality: 72, fullPage: full });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    return { file: path.basename(file), overflow };
  } catch (error) { return { file: null, error: String(error.message).slice(0, 120) }; } finally { await context.close(); }
}
async function signature(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try { await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => {}); await settle(page); return await page.evaluate(layoutSignature); }
  catch { return []; } finally { await context.close(); }
}
const VIEWS = { 'home-desktop': { width: 1280, height: 900, scale: 0.75, full: false }, 'home-desktop-full': { width: 1280, height: 900, scale: 0.4, full: true },
  'home-phone-full': { width: 390, height: 844, scale: 1, full: true }, 'product-desktop': { width: 1280, height: 900, scale: 0.75, full: true }, 'product-phone': { width: 390, height: 844, scale: 1, full: true } };

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const db = prisma();
  const browser = await chromium.launch();
  const stores = [];
  for (const job of jobs) {
    const [key, storeId, rev] = job.split(':');
    const versions = await db.storeSourceVersion.findMany({ where: { storeId }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
    const v2 = [...versions].reverse().find(v => v.label === 'Diseño V2 (prototipo)');
    const template = rev ? Number(rev) : versions.filter(v => v !== v2 && !/V2/.test(v.label)).at(-1)?.revision;
    const snapshot = (await db.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision: v2?.revision ?? template } }, select: { snapshot: true } })).snapshot;
    const productId = readConfigData(snapshot.files).data?.items?.[0]?.id;
    const entry = { key, storeId, template, v2: v2?.revision ?? null, productId, shots: {}, signatures: {} };
    for (const [arm, revision] of [['template', template], ['v2', v2?.revision]]) {
      if (revision === undefined || revision === null) continue;
      const host = `http://r${revision}-${storeId}.${VIEWER}`;
      entry.shots[arm] = {};
      for (const [view, size] of Object.entries(VIEWS)) {
        const url = view.startsWith('product') ? `${host}/product.html?id=${productId}` : `${host}/`;
        entry.shots[arm][view] = await shoot(browser, url, path.join(out, `${key}-${arm}-${view}.jpg`), size);
      }
      entry.signatures[arm] = await signature(browser, `${host}/`);
      console.log(key, arm, 'rev', revision, 'sections', entry.signatures[arm].length);
    }
    entry.distanceV2Template = entry.signatures.v2 && entry.signatures.template ? signatureDistance(entry.signatures.v2, entry.signatures.template) : null;
    stores.push(entry);
  }
  const reference = {};
  for (const view of ['home-desktop', 'home-desktop-full', 'home-phone-full']) reference[view] = await shoot(browser, REFERENCE, path.join(out, `reference-${view}.jpg`), VIEWS[view]);
  const baseline = [];
  for (const job of BASELINE) { const [key, storeId, revision] = job.split(':'); baseline.push({ key, signature: await signature(browser, `http://r${revision}-${storeId}.${VIEWER}/`) }); }
  await browser.close();
  const pairs = (list, label) => { const outPairs = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) outPairs.push({ a: list[i].key, b: list[j].key, distance: signatureDistance(list[i].signature, list[j].signature), label }); return outPairs; };
  const v2Pairs = pairs(stores.filter(s => s.signatures.v2).map(s => ({ key: s.key, signature: s.signatures.v2 })), 'v2');
  const templatePairs = pairs([...stores.filter(s => s.signatures.template).map(s => ({ key: s.key, signature: s.signatures.template })), ...baseline], 'template');
  const result = { at: new Date().toISOString(), reference: { url: REFERENCE, shots: reference }, stores, v2Pairs, templatePairs,
    summary: { v2VsTemplate: stores.map(s => `${s.key}: ${s.distanceV2Template}`), v2Apart: v2Pairs.map(p => `${p.a}/${p.b}: ${p.distance}`),
      templateApart: { min: Math.min(...templatePairs.map(p => p.distance)), max: Math.max(...templatePairs.map(p => p.distance)), mean: Number((templatePairs.reduce((s, p) => s + p.distance, 0) / Math.max(1, templatePairs.length)).toFixed(3)) } } };
  fs.writeFileSync(path.join(out, 'compare.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.summary, null, 2));
  await db.$disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
