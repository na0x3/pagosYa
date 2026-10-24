/** Spec 2026-10-24 §1 Harvesting: keep a store's authored source, swap known brand text, and list everything that still
 *  names the store or points at its own uploads. Pure: apps/api/scripts/harvest-starter.ts does the IO. */
const KEEP = path => (path.startsWith('components/') && path.endsWith('.tsx')) || path === 'styles/globals.css';
const ASSET = /(?:\bassets\/(?!fonts\/)[\w./-]+|\/v1\/uploads\/[\w.-]+)/g;
const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function harvestFiles({ files, brand, replacements }) {
  const words = [...new Set(brand.map(word => String(word).trim()).filter(word => word.length >= 3))];
  // Whole words only: a short product name must not flag every word it happens to sit inside.
  const brandRe = words.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu') : null;
  const kept = files.filter(file => KEEP(file.path)).map(file => ({ path: file.path, content: Object.entries(replacements).reduce((text, [from, to]) => text.split(from).join(to), file.content) }));
  const findings = [];
  for (const file of kept) file.content.split('\n').forEach((line, index) => {
    for (const match of brandRe ? line.matchAll(brandRe) : []) findings.push({ path: file.path, line: index + 1, kind: 'brand', text: match[0] });
    for (const match of line.matchAll(ASSET)) findings.push({ path: file.path, line: index + 1, kind: 'asset', text: match[0] });
  });
  return { files: kept.sort((a, b) => a.path.localeCompare(b.path)), findings };
}
