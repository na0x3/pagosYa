import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { families, dist } from './build.mjs';
import { createGalleryServer } from './server.mjs';

// A reproducible first-screen lab baseline, separate from design preference.
const require = createRequire(new URL('../../apps/api/package.json', import.meta.url));
const { chromium } = require('playwright');
const server = createGalleryServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true });
const profile = { viewport: { width: 390, height: 844 }, latencyMs: 150, downloadBytesPerSecond: 200_000, uploadBytesPerSecond: 93_750, cpuSlowdown: 4, cache: 'disabled', reducedMotion: 'no-preference' };
const report = { measuredAt: new Date().toISOString(), profile, limitations: ['One cold navigation per owned example; not field data or a before/after comparison.', 'Optimized local server uses Brotli for JS, CSS, HTML and fonts; the preserved baseline used uncompressed responses. Attribution includes transport, asset optimization and preload changes. Metrics cover the first screen through initial media/font readiness, not a whole shopping session.', 'Thresholds require calibration against production hosting and human review; this report does not enable automatic rollout.'], results: [] };
try {
  for (const family of families) {
    const context = await browser.newContext({ viewport: profile.viewport, reducedMotion: profile.reducedMotion });
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.setCacheDisabled', { cacheDisabled: true });
    await session.send('Network.emulateNetworkConditions', { offline: false, latency: profile.latencyMs, downloadThroughput: profile.downloadBytesPerSecond, uploadThroughput: profile.uploadBytesPerSecond });
    await session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      window.__designMetrics = { cls: 0, lcpMs: null };
      new PerformanceObserver(list => list.getEntries().forEach(entry => { if (!entry.hadRecentInput) window.__designMetrics.cls += entry.value; })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(list => { const entries = list.getEntries(); window.__designMetrics.lcpMs = entries.at(-1)?.startTime ?? null; }).observe({ type: 'largest-contentful-paint', buffered: true });
    });
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}/${family}/`, { waitUntil: 'load', timeout: 60_000 });
      await page.locator('[data-product-add]').first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].filter(image => image.getBoundingClientRect().top < innerHeight).map(image => image.decode().catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const metrics = await page.evaluate(() => {
        const resources = performance.getEntriesByType('resource');
        const navigation = performance.getEntriesByType('navigation')[0];
        return { ...window.__designMetrics, fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, observedAtMs: performance.now(), encodedBytes: resources.reduce((sum, resource) => sum + resource.encodedBodySize, navigation?.encodedBodySize || 0), requests: resources.length + 1, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, missingVisibleImages: [...document.images].filter(image => { const bounds = image.getBoundingClientRect(); return bounds.top < innerHeight && bounds.bottom > 0 && bounds.width > 0 && !image.naturalWidth; }).length };
      });
      report.results.push({ family, ...metrics, errors });
    } catch (error) { report.results.push({ family, failure: error.message, errors }); }
    finally { await context.close(); }
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
await writeFile(join(dist, 'performance-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
if (report.results.some(result => result.failure || result.errors.length || result.horizontalOverflow || result.missingVisibleImages)) process.exitCode = 1;
