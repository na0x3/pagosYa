# First-screen lab measurements

Measured September 20, 2026 with `node profile.mjs`: Chromium, 390 × 844, cold cache, 150ms latency, 200,000 download bytes/sec (1.6Mbps), 4× CPU slowdown. One navigation per family in each run; these are directional lab observations, not field Core Web Vitals or a repeated statistical benchmark.

| Example | Initial LCP | Optimized LCP | Initial bytes | Optimized bytes | Optimized CLS |
| --- | ---: | ---: | ---: | ---: | ---: |
| Café | 4.128s | 2.528s | 1,807,966 | 799,238 | 0.00095 |
| Beauty | 4.652s | 1.588s | 967,835 | 414,577 | 0.00118 |
| Home / cinematic | 6.568s | 2.292s | 1,192,875 | 670,561 | 0.00112 |

The changes combine image optimization, earlier hero/font discovery, high priority for eager shared-kit photographs, and Brotli transport for text/font resources. The initial example server served uncompressed responses. These numbers do not isolate any single change or predict deployed performance.

Image processing uses the existing Sharp dependency to emit WebP quality 80 at a maximum width of 1280px, preserving composition without upscaling. Original repository fixtures remain untouched. Font choices and the product/cart/checkout runtime stay the same; each page preloads only its two used fonts, and only the homepage preloads its hero.

Both runs had no horizontal overflow, missing visible images or browser errors. The optimized stores also pass the separate four-width purchase/browser verification. No AI generation calls, paid media, remote font requests or new dependencies were used.

The local build retains `dist/performance-baseline.json` and the current `dist/performance-report.json`. Re-running the profiler replaces the current report. Asset build and transport optimizations here apply to the runnable examples; `Picture` priority also ships in the shared storefront kit. Production hosting still needs its own deployed measurements.

## Motion upgrade measurement

After the entrance/menu/parallax changes, the same lab profile measured LCP of 2.556s (café), 1.636s (beauty), and 2.336s (cinematic), with CLS below 0.002 and no overflow, missing visible images or browser errors. These are single-run observations, not statistically significant comparisons. The pre-motion optimized report was retained in `tmp/yapi-motion-2026-09-20/performance-before-motion.json`; the new measurements are also preserved in `docs/research/yapi-motion-validation-2026-09-20.json`.
