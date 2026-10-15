// apps/api/scripts/store-voice-check.ts
/**
 * Store voice (spec 2026-10-14), live-check criteria 1–6 on saved stores. READ-ONLY on the database: it reads each store's latest
 * revision, its onboarding record, its chat messages and its products. It never writes to the database and never calls a model.
 * With --out <dir> (outside the repository) it writes before-after.html: the --before stores' text beside the new stores' text,
 * in the order given, and each new store's voice sheet.
 *   npx ts-node --transpile-only scripts/store-voice-check.ts [--out /private/tmp/store-voice-check] [--before sgcbdd0w,wu5f1a4n,2cchr29v] <slug> [<slug> ...]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { checkCopy, copyFindingCounts, storePrices, visibleSentences, type CopyFinding } from '../src/storefront-source/copy-check';
import { detectKind } from '../src/storefront-source/design-engine/playbook';
import { authoredPages, foldText, merchantSpecificCount, merchantTextOf, pendingAssumptions, readOnboardingMaterial, readVoice, type StoreVoice } from '../src/storefront-source/store-voice';
import type { SourceProjectSnapshot } from '../src/storefront-source/source-project';

const repository = resolve(__dirname, '..', '..', '..');
type StoreText = { slug: string; name: string; revision: number | null; pages: Array<{ path: string; sentences: string[] }>; voice?: StoreVoice; findings: CopyFinding[]; answers: number };

async function readStore(prisma: PrismaClient, slug: string): Promise<StoreText | { slug: string; error: string }> {
  const store = await prisma.store.findFirst({ where: { slug }, select: { id: true, name: true, onboarding: true } });
  if (!store) return { slug, error: 'no store' };
  const latest = await prisma.storeSourceVersion.findFirst({ where: { storeId: store.id }, orderBy: { revision: 'desc' }, select: { revision: true, snapshot: true } });
  const snapshot = latest?.snapshot as unknown as SourceProjectSnapshot | undefined;
  const files = snapshot?.files ?? [];
  const onboarding = readOnboardingMaterial(store.onboarding);
  const thread = await prisma.storeAgentThread.findUnique({ where: { storeId: store.id }, select: { id: true } });
  const said = thread ? await prisma.storeAgentMessage.findMany({ where: { threadId: thread.id, channel: 'source', role: 'USER' }, orderBy: { createdAt: 'desc' }, take: 40, select: { content: true } }) : [];
  const links = await prisma.paymentLink.findMany({ where: { storeId: store.id }, select: { name: true, description: true, amount: true, variants: true, extras: true } });
  const voice = readVoice(files);
  const brief = JSON.stringify(snapshot?.brief ?? {});
  const kind = detectKind(`${onboarding.what ?? ''}\n${brief}`);
  const findings = files.length ? checkCopy({
    files, voice, kind,
    merchantText: merchantTextOf(said.map(message => message.content).join('\n').slice(0, 2_000), onboarding),
    sources: [brief, ...links.flatMap(link => [link.name, link.description ?? ''])],
    prices: storePrices(links), siblings: [],
  }) : [];
  return {
    slug, name: store.name, revision: latest?.revision ?? null, voice, findings, answers: onboarding.answers.length,
    pages: authoredPages(files).map(file => ({ path: file.path, sentences: visibleSentences(file.content) })),
  };
}

const esc = (value: string) => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[char]);
const column = (store: StoreText | undefined) => !store ? '<td></td>' : `<td><h2>${esc(store.name)} (${esc(store.slug)}, r${store.revision ?? '-'})</h2>${store.pages.map(page => `<h3>${esc(page.path)}</h3><ul>${page.sentences.map(sentence => `<li>${esc(sentence)}</li>`).join('')}</ul>`).join('')}${store.voice ? `<h3>voice.json</h3><pre>${esc(JSON.stringify(store.voice, null, 2))}</pre>` : ''}</td>`;

async function main() {
  const args = process.argv.slice(2);
  const take = (flag: string) => { const at = args.indexOf(flag); return at < 0 ? undefined : args.splice(at, 2)[1]; };
  const out = take('--out');
  const before = (take('--before') ?? '').split(',').map(slug => slug.trim()).filter(Boolean);
  const slugs = args;
  if (!slugs.length) throw new Error('usage: store-voice-check.ts [--out <dir outside the repo>] [--before <slug,slug>] <slug> [...]');
  const outDir = out ? resolve(out) : undefined;
  if (outDir?.startsWith(repository)) throw new Error('--out must point outside the repository');
  const prisma = new PrismaClient();
  let after: Array<StoreText | { slug: string; error: string }> = [], old: Array<StoreText | { slug: string; error: string }> = [];
  try {
    after = await Promise.all(slugs.map(slug => readStore(prisma, slug)));
    old = await Promise.all(before.map(slug => readStore(prisma, slug)));
  } finally { await prisma.$disconnect(); }
  const ok = (row: StoreText | { error: string }): row is StoreText => !('error' in row);
  const row = (store: StoreText | { slug: string; error: string }) => {
    if (!ok(store)) return { slug: store.slug, error: store.error };
    const counts = copyFindingCounts(store.findings);
    return {
      slug: store.slug, revision: store.revision, sheet: store.voice ? 'yes' : 'none', answers: store.answers,
      merchantSpecifics: merchantSpecificCount(store.voice), pending: pendingAssumptions(store.voice).length, ...counts,
    };
  };
  if (old.length) { console.log('BEFORE'); console.table(old.map(row)); }
  console.log(old.length ? 'AFTER' : 'STORES');
  console.table(after.map(row));
  for (const store of after.filter(ok)) for (const finding of store.findings.filter(item => item.kind !== 'repeat')) console.log(`${store.slug} ${finding.kind} ${finding.page}: «${finding.line}» — ${finding.problem}`);
  // Criterion 3: no sentence repeated across the new stores (short labels such as «Inicio» are not sentences: 5 words or more).
  const seen = new Map<string, string>();
  let repeats = 0;
  for (const store of after.filter(ok)) {
    for (const sentence of new Set(store.pages.flatMap(page => page.sentences).filter(sentence => sentence.split(/\s+/).length >= 5))) {
      const key = foldText(sentence);
      const first = seen.get(key);
      if (first && first !== store.slug) { repeats += 1; console.log(`REPEATED: «${sentence}» in ${first} and ${store.slug}`); }
      else seen.set(key, store.slug);
    }
  }
  console.log(repeats ? `Cross-store repeats: ${repeats}` : 'Cross-store repeats: none');
  // Criterion 5: at least 3 merchant specifics wherever onboarding answers were given.
  for (const store of after.filter(ok)) if (store.answers && merchantSpecificCount(store.voice) < 3) console.log(`FEW SPECIFICS: ${store.slug} has ${merchantSpecificCount(store.voice)} merchant specifics after ${store.answers} answers`);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const rows = Array.from({ length: Math.max(old.length, after.length) }, (_, index) => `<tr>${column(old.filter(ok)[index])}${column(after.filter(ok)[index])}</tr>`).join('');
    writeFileSync(join(outDir, 'before-after.html'), `<!doctype html><html lang="es"><meta charset="utf-8"><title>Store voice: before and after</title><style>body{font:15px/1.5 system-ui;margin:24px}table{border-collapse:collapse;width:100%}td{vertical-align:top;width:50%;border:1px solid #ddd;padding:12px}pre{white-space:pre-wrap;font-size:12px}</style><table><tr><th>Antes (2026-10-14)</th><th>Después</th></tr>${rows}</table></html>`);
    console.log(`Before and after: ${join(outDir, 'before-after.html')}`);
  }
}

main().catch(error => { console.error(error); process.exit(1); });
