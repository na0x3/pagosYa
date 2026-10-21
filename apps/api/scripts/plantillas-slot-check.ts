/**
 * Spec 2026-10-20 Plantillas fill §3 verification: the slot converter changes where a template's words come from,
 * never what a shopper sees. Renders each template's demo home and product page and saves body.innerHTML.
 *   npx ts-node --transpile-only scripts/plantillas-slot-check.ts capture <dir> [ids…]
 *   npx ts-node --transpile-only scripts/plantillas-slot-check.ts compare <before> <after>
 * TEMPLATES_PKG=<dir> renders another copy of the package (e.g. `git archive HEAD` of the unconverted templates).
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as installed from '@pagosya/store-templates';
import { templateDemoRevision } from '../src/storefront-source/source-templates';
import { currentSourceRuntime } from '../src/storefront-source/source-runtime';
import { withVisualSandbox } from '../src/storefront-source/source-visual-capture';
import { sourceVisualState } from '../src/storefront-source/source-visual-state';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listTemplates, templateSourceFiles } = (process.env.TEMPLATES_PKG ? require(process.env.TEMPLATES_PKG) : installed) as typeof installed;

async function capture(dir: string, ids: string[]) {
  mkdirSync(dir, { recursive: true });
  const manifests = listTemplates().filter(m => m.id !== 'esencial' && (!ids.length || ids.includes(m.id)));
  for (const manifest of manifests) {
    const revision = await templateDemoRevision(manifest, templateSourceFiles(manifest.id) as any);
    const runtime = await currentSourceRuntime({ schemaVersion: 1, brief: revision.brief, files: revision.files } as any);
    for (const page of ['index.html', 'product.html']) {
      const html = await withVisualSandbox(runtime as any, sourceVisualState(runtime as any, page, undefined, true).query, undefined, true, async context => {
        const tab = await context.newPage(); await tab.setViewportSize({ width: 1280, height: 900 });
        await tab.goto(`https://preview.invalid/${page}`, { waitUntil: 'load', timeout: 15000 });
        await tab.waitForTimeout(800);
        return tab.evaluate(() => document.body.innerHTML);
      });
      writeFileSync(join(dir, `${manifest.id}.${page}`), html);
    }
    console.log('captured', manifest.id);
  }
}

function compare(before: string, after: string) {
  let same = 0; const differ: string[] = [];
  for (const name of readdirSync(before)) {
    const a = readFileSync(join(before, name), 'utf8'), b = readFileSync(join(after, name), 'utf8');
    if (a === b) same++; else { let i = 0; while (a[i] === b[i]) i++; differ.push(`${name} at ${i}: «${a.slice(Math.max(0, i - 40), i + 60)}» ≠ «${b.slice(Math.max(0, i - 40), i + 60)}»`); }
  }
  console.log(`same ${same}, differ ${differ.length}`); for (const line of differ) console.log('DIFF', line);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'capture') void capture(rest[0], rest.slice(1)).then(() => process.exit(0));
else if (mode === 'compare') compare(rest[0], rest[1]);
