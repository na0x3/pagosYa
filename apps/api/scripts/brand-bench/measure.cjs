// node measure.cjs <round> [keys…]: what one round of the brand bench produced, the same way every round —
// · reliability and time: drive.jsonl (minutes, job status, error) per store;
// · the fill review: the reply's `fillReview` (blocking rule findings at 1280 / 390 px before and after, changes, rounds, cost, ms);
// · variety: each home's template and section sequence, and how much any two stores' homes share (Jaccard of section types);
// · screenshots of the filled home and the reviewed one (desktop top, desktop whole, phone whole) through the 4330 viewer.
// Writes examples/brand-bench/<round>/results.json and shots/.
const fs = require('node:fs');
const path = require('node:path');
const { API_DIR, KEYS, NAMES, ROOT, prisma, roundDir } = require('./common.cjs');
const { chromium } = require(path.join(API_DIR, 'node_modules/playwright'));

const [round, ...asked] = process.argv.slice(2);
if (!round) { console.error('usage: node measure.cjs <round> [keys…]'); process.exit(1); }
const VIEWER = process.env.VIEWER || 'localhost:4330';
const FILLED = 'Portada de YAPI', REVIEWED = 'Portada revisada por YAPI';

const dataLine = (content, name) => { const match = content.match(new RegExp(`^export const ${name}(?:: [^=]+)? = (.*?)(?: as const)?;$`, 'm')); try { return match ? JSON.parse(match[1]) : undefined; } catch { return undefined; } };
const homeOf = snapshot => {
  const content = (snapshot?.files ?? []).find(file => file.path === 'components/store-data.tsx')?.content ?? '';
  const layout = dataLine(content, 'layout') ?? [];
  return { theme: String(dataLine(content, 'variants')?.theme ?? 'none'), types: layout.map(block => block.type), looks: layout.map(block => block.look ?? '') };
};
const jaccard = (a, b) => { const x = new Set(a), y = new Set(b); const both = [...x].filter(type => y.has(type)).length; return x.size + y.size ? both / (x.size + y.size - both) : 0; };
const median = list => { const sorted = list.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; };

async function shoot(browser, dir, name, storeId, revision) {
  const url = `http://r${revision}-${storeId}.${VIEWER}/`;
  const out = {};
  for (const [view, width, height, scale, full] of [['desktop', 1280, 900, 0.75, false], ['desktop-full', 1280, 900, 0.4, true], ['phone-full', 390, 844, 1, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 });
      const total = await page.evaluate(() => document.documentElement.scrollHeight);
      for (let y = 0; y < total; y += 600) { await page.evaluate(top => window.scrollTo(0, top), y); await page.waitForTimeout(80); }
      await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(800);
      const file = path.join(dir, `${name}-${view}.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 70, fullPage: full });
      out[view] = path.relative(path.dirname(dir), file);
    } catch (error) { out[view] = `failed: ${String(error.message).slice(0, 80)}`; }
    await context.close();
  }
  return out;
}

(async () => {
  const db = prisma();
  const dir = roundDir(round); const shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const drives = new Map();
  if (fs.existsSync(path.join(dir, 'drive.jsonl'))) for (const line of fs.readFileSync(path.join(dir, 'drive.jsonl'), 'utf8').split('\n').filter(Boolean)) { const row = JSON.parse(line); drives.set(row.key, row); }
  const browser = await chromium.launch();
  const stores = [];
  for (const key of asked.length ? asked : KEYS) {
    const file = path.join(ROOT, 'examples', `cmp-${round}-${key}`, 'demo.json');
    if (!fs.existsSync(file)) { stores.push({ key, missing: true }); continue; }
    const { storeId } = JSON.parse(fs.readFileSync(file, 'utf8'));
    const versions = await db.storeSourceVersion.findMany({ where: { storeId }, orderBy: { revision: 'asc' }, select: { revision: true, label: true } });
    const filled = versions.find(v => v.label === FILLED), reviewed = versions.find(v => v.label === REVIEWED);
    const messages = await db.storeAgentMessage.findMany({ where: { thread: { storeId }, role: 'ASSISTANT' }, orderBy: { createdAt: 'desc' }, select: { metadata: true }, take: 20 });
    const fillReview = messages.map(m => m.metadata?.fillReview).find(Boolean) ?? null;
    const snapshot = async revision => (await db.storeSourceVersion.findUnique({ where: { storeId_revision: { storeId, revision } }, select: { snapshot: true } }))?.snapshot;
    const before = filled ? homeOf(await snapshot(filled.revision)) : null;
    const after = reviewed ? homeOf(await snapshot(reviewed.revision)) : before;
    const template = (versions.find(v => /^Plantilla: /.test(v.label))?.label ?? '').replace('Plantilla: ', '') || before?.theme || '';
    const images = {
      ...(filled ? { filled: await shoot(browser, shots, `${key}-r${filled.revision}`, storeId, filled.revision) } : {}),
      ...(reviewed ? { reviewed: await shoot(browser, shots, `${key}-r${reviewed.revision}`, storeId, reviewed.revision) } : {}),
    };
    const drive = drives.get(key) ?? null;
    stores.push({ key, name: NAMES[key], storeId, template, versions: versions.map(v => `${v.revision}:${v.label}`), drive, fillReview, filledRevision: filled?.revision ?? null,
      reviewedRevision: reviewed?.revision ?? null, home: after, homeBefore: before, images });
    console.log(key, template, drive ? `${drive.minutes} min ${drive.status}` : 'no drive', fillReview ? `${fillReview.outcome} d${fillReview.before.desktop}→${fillReview.after.desktop} p${fillReview.before.phone}→${fillReview.after.phone} ${(fillReview.ms / 60e3).toFixed(1)} min` : 'no review');
  }
  await browser.close();
  const homes = stores.filter(s => s.home?.types?.length);
  const pairs = [];
  for (let i = 0; i < homes.length; i++) for (let j = i + 1; j < homes.length; j++) pairs.push({ a: homes[i].key, b: homes[j].key, sameTemplate: homes[i].template === homes[j].template,
    shared: Number(jaccard(homes[i].home.types, homes[j].home.types).toFixed(2)), sameOrder: homes[i].home.types.join() === homes[j].home.types.join() });
  const rows = stores.filter(s => s.fillReview);
  const sum = (list, pick) => list.reduce((total, row) => total + pick(row), 0);
  const total = side => s => s.fillReview[side].desktop + s.fillReview[side].phone;
  const summary = {
    built: stores.filter(s => s.drive?.status === 'COMPLETED' && s.filledRevision !== null).length, of: stores.length,
    failed: stores.filter(s => !s.drive || s.drive.status !== 'COMPLETED' || s.filledRevision === null).map(s => `${s.key}: ${s.drive?.status ?? 'not driven'} ${s.drive?.error ?? ''}`.trim()),
    medianMinutes: median(stores.map(s => s.drive?.minutes)),
    review: rows.length ? {
      stores: rows.length, changed: rows.filter(s => s.reviewedRevision !== null).length, outcomes: rows.map(s => `${s.key}: ${s.fillReview.outcome}`),
      blockingBefore: { desktop: sum(rows, s => s.fillReview.before.desktop), phone: sum(rows, s => s.fillReview.before.phone) },
      blockingAfter: { desktop: sum(rows, s => s.fillReview.after.desktop), phone: sum(rows, s => s.fillReview.after.phone) },
      down: rows.filter(s => total('after')(s) < total('before')(s)).length, up: rows.filter(s => total('after')(s) > total('before')(s)).length,
      medianReviewMinutes: Number((median(rows.map(s => s.fillReview.ms / 60e3)) ?? 0).toFixed(1)),
      usd: Number(sum(rows, s => s.fillReview.usd).toFixed(2)),
    } : null,
    variety: { pairs: pairs.length, meanShared: pairs.length ? Number((sum(pairs, p => p.shared) / pairs.length).toFixed(2)) : null, mostAlike: [...pairs].sort((a, b) => b.shared - a.shared).slice(0, 3),
      sameOrder: pairs.filter(p => p.sameOrder).length, templates: [...new Set(stores.map(s => s.template).filter(Boolean))] },
  };
  fs.writeFileSync(path.join(dir, 'results.json'), JSON.stringify({ round, at: new Date().toISOString(), summary, stores, pairs }, null, 2) + '\n');
  console.log(JSON.stringify(summary, null, 2));
  await db.$disconnect();
})().catch(error => { console.error(error.message); process.exit(1); });
