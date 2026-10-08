/**
 * One Sep-5 authored generation, with or without the motion choreography, measured.
 *
 * The benchmark of 2026-10-06 found the authored path emitted one @keyframes rule and two
 * IntersectionObservers across nine stores, because the pinned prompt's only word on movement is
 * "avoid unnecessary motion". `sourceMotionPlan({ react: false })` is now passed into that prompt;
 * this runs the real service (no HTTP, no credentials, no merchant store touched) and counts what
 * comes back, so the change is measured rather than assumed.
 *
 * Run: node --env-file=.env -r ts-node/register sep5-motion-check.ts [--no-motion]
 * The baseline it compares against is bench/analysis.json (mode "sep5").
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve, dirname, extname } from 'node:path';
import { SourceGenerationService } from './src/storefront-source/source-generation.service';
import { sourceProjectSnapshot } from './src/storefront-source/source-project';

const WITH_MOTION = !process.argv.includes('--no-motion');
const OUT = process.env.OUT_DIR || `/Users/saramia/pagosYa-sep5-output/motion-check/${WITH_MOTION ? 'motion' : 'baseline'}`;
const MODEL = process.env.OPENAI_DESIGN_MODEL || 'gpt-5.6-sol';

async function main() {
  // The pilates brief from bench/folders.mjs: the one store the engine failed on twice and Sep-5 generated.
  const business = {
    name: 'Estudio Eje',
    businessType: 'Estudio de pilates reformer: clases en grupos de seis, packs de sesiones y clase privada',
    audience: 'Personas que quieren moverse con guía cercana y horarios fijos durante la semana',
    primaryAction: 'Reservar tu primera clase',
    visualDirection: 'Calmo y corporal, con aire y respiración en el espaciado. Nada de gimnasio ni promesas de resultados.',
    instruction: 'Hazme el estudio de pilates, calmo y corporal, con aire en el diseño. Los horarios y el compromiso semanal importan más que la foto bonita; que se vea el calendario. No uses un hero centrado con un botón debajo.',
    products: ['Clase suelta', 'Pack de 8 sesiones', 'Pack de 12 sesiones', 'Clase privada'],
  };

  const assetPaths = ['../../examples/independent-cafe/assets/breakfast.webp'];
  const media = await Promise.all(assetPaths.map(async (path, index) => ({
    path,
    url: '/v1/uploads/00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0') + extname(path),
    bytes: await readFile(resolve(path)),
  })));

  const versions: any[] = [], runs: any[] = [];
  const store = {
    contactEmail: 'hola@example.com', contactFormEnabled: false, storeName: business.name,
    tagline: 'Pilates reformer en grupos reducidos', checkoutMode: 'payment', categories: [], locations: [],
    items: business.products.map((name, index) => ({ id: `p${index}`, name, description: name, amount: 9000 + index * 12000, currency: 'BOB', stock: 10, imageUrls: [], variants: [], extras: [] })),
  };
  const prisma: any = {
    mediaAsset: { findMany: async () => media.map(asset => ({ url: asset.url })) },
    store: { findFirst: async () => ({ slug: 'motion-check' }) },
    storeSourceGeneration: {
      create: async ({ data }: any) => { const run = { ...data, id: `run-${runs.length}` }; runs.push(run); return run; },
      updateMany: async ({ where, data }: any) => { if (where.id) Object.assign(runs.find(run => run.id === where.id) ?? {}, data); return { count: 1 }; },
    },
  };
  const projects: any = {
    current: async () => ({ revision: versions.length, slug: 'motion-check' }),
    version: async (_m: string, _s: string, revision: number) => versions[revision - 1],
    save: async (_m: string, _s: string, input: any, generation: any) => {
      const snapshot = sourceProjectSnapshot(input);
      const version = { revision: versions.length + 1, label: input.label, snapshot }; versions.push(version);
      await prisma.storeSourceGeneration.updateMany({ where: { id: generation.id }, data: generation.data });
      return version;
    },
  };
  const config: any = { get: (name: string) => ({
    'app.openAi.apiKey': process.env.OPENAI_API_KEY, 'app.openAi.enabled': true,
    'app.deepSeek.apiKey': '', 'app.deepSeek.enabled': false,
    'app.environment': 'test', 'app.checkoutOrigin': 'http://localhost:5175', 'app.port': 3001,
    'app.sourceFramework': 'next',
    // The authored path, in both runs. --no-motion drops only the choreography paragraph, so the
    // two generations differ by that alone.
    'app.sep5Author': true,
  } as any)[name] };

  const service = new SourceGenerationService(prisma, { getStorePublic: async () => structuredClone(store) } as any, projects,
    { getBuffer: async (filename: string) => media.find(asset => asset.url.endsWith('/' + filename))?.bytes,
      contentTypeFor: (filename: string) => filename.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' } as any, config);

  const brief = { sitePurpose: 'shop' as const, businessType: business.businessType, audience: business.audience, primaryAction: business.primaryAction, visualDirection: business.visualDirection };
  // sourceMotionPlan reads the task after this marker, exactly as a real request carries it.
  const instruction = `${WITH_MOTION ? '' : 'Sin animaciones. '}Pedido actual del comercio: ${business.instruction}`;

  console.log(`[motion-check] ${WITH_MOTION ? 'WITH' : 'WITHOUT'} choreography · model ${MODEL} · authored path`);
  const started = Date.now();
  await service.generate('motion-check', 'motion-check',
    { revision: 0, brief, instruction, assetUrls: media.map(asset => asset.url), model: MODEL as any, maxCredits: 400 } as any,
    undefined, media.map(asset => ({ url: asset.url, role: 'product' as const, description: 'Imagen de prueba del estudio' })), undefined,
    { onAttempts: (attempts: any) => console.log('[motion-check] attempts', JSON.stringify(attempts.map((a: any) => ({ phase: a.phase, status: a.status, ms: a.durationMs, reason: a.failureReason })))) } as any);
  console.log(`[motion-check] done in ${Math.round((Date.now() - started) / 1000)}s`);

  const files = versions.at(-1)?.snapshot?.files ?? [];
  for (const file of files) {
    const dest = join(OUT, file.path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content);
  }

  // The same crude counters bench/analyze.mjs uses, so this is comparable to the measured baseline.
  const count = (test: RegExp) => files.filter((file: any) => file.encoding !== 'base64' && !/^(?:config|commerce)\.js$/.test(file.path))
    .reduce((total: number, file: any) => total + (file.content.match(test)?.length ?? 0), 0);
  const report = {
    mode: WITH_MOTION ? 'sep5+motion' : 'sep5-no-motion',
    files: files.length,
    keyframes: count(/@keyframes/g),
    observers: count(/IntersectionObserver/g),
    transitions: count(/transition\s*:/g),
    transforms: count(/transform\s*:/g),
    willChange: count(/will-change/g),
    scrollListeners: count(/addEventListener\(\s*['"]scroll/g),
    requestAnimationFrame: count(/requestAnimationFrame/g),
    parallaxNamed: count(/parallax/gi),
    prefersReducedMotion: count(/prefers-reduced-motion/g),
    sticky: count(/position\s*:\s*sticky/g),
  };
  console.log(JSON.stringify(report, null, 2));
  await writeFile(join(OUT, 'motion-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`[motion-check] project and report written to ${OUT}`);
}

main().catch(error => { console.error('[motion-check] FAILED', error?.message || error); process.exit(1); });
