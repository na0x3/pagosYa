import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

/**
 * The kit's browser runtimes ship as-is into every store (no transpile, no polyfill), so a built-in newer than the kit's
 * floor throws on an older browser. Object.hasOwn in commerce.js's motion lookup broke every pointer add there: the
 * handler aborted before it updated the product status. ES2022+ built-ins stay out; ui.tsx is compiled for syntax only.
 */
const RUNTIMES = ['chat.js', 'commerce.js', 'motion.js', 'privacy.js', 'retention.js', 'video.js', 'ui.tsx'];
const BEYOND_FLOOR: Array<[string, RegExp]> = [
  ['Object.hasOwn', /\bObject\.hasOwn\s*\(/],
  ['Array/String .at()', /\.at\s*\(/],
  ['structuredClone', /\bstructuredClone\s*\(/],
  ['Array.prototype.findLast', /\.findLast(Index)?\s*\(/],
  ['change-by-copy arrays', /\.(toSorted|toReversed|toSpliced)\s*\(/],
  ['Object.groupBy', /\b(Object|Map)\.groupBy\s*\(/],
  // Missing on iOS Safari ≤ 15 and Chrome < 103: calling it throws. Use an AbortController and a timer instead.
  ['AbortSignal.timeout / .any', /\bAbortSignal\.(timeout|any)\s*\(/],
];

describe('kit runtimes stay within the browser floor', () => {
  it.each(RUNTIMES)('%s uses no ES2022+ built-in', (file) => {
    const lines = readFileSync(kitPath(file), 'utf8').split('\n');
    const found = lines.flatMap((line, index) => BEYOND_FLOOR.filter(([, pattern]) => pattern.test(line)).map(([name]) => `${file}:${index + 1} ${name}`));
    expect(found).toEqual([]);
  });
});
