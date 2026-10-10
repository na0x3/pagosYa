// Adds one OFL family from google/fonts with its licence and provenance. Usage: add-font.mjs <id> <ofl-dir> <ttf-file>
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [id, dir, ttf] = process.argv.slice(2);
if (!id || !dir || !ttf) throw new Error('usage: add-font.mjs <id> <ofl-dir> <ttf-file>');
const fonts = join(dirname(fileURLToPath(import.meta.url)), '..', 'kit', 'fonts');
const raw = name => `https://raw.githubusercontent.com/google/fonts/main/ofl/${dir}/${encodeURIComponent(name)}`;
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const fetchBytes = async url => { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status} ${url}`); return Buffer.from(await response.arrayBuffer()); };

const font = await fetchBytes(raw(ttf));
if (font.readUInt32BE(0) !== 0x00010000) throw new Error(`${ttf} is not TrueType`);
if (font.length > 600_000) throw new Error(`${ttf} is ${font.length} bytes, over 600 KB`);
const licence = await fetchBytes(raw('OFL.txt'));
if (!licence.toString('utf8').toUpperCase().includes('SIL OPEN FONT LICENSE')) throw new Error(`${dir}/OFL.txt is not the OFL`);

const provenancePath = join(fonts, 'provenance.json');
const provenance = JSON.parse(await readFile(provenancePath, 'utf8')).filter(entry => ![`${id}.ttf`, `${id}-OFL.txt`].includes(entry.file));
for (const [file, bytes, source] of [[`${id}.ttf`, font, raw(ttf)], [`${id}-OFL.txt`, licence, raw('OFL.txt')]]) {
  await writeFile(join(fonts, file), bytes);
  provenance.push({ file, source, gitBlob: gitBlob(bytes), sha256: createHash('sha256').update(bytes).digest('hex') });
}
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
console.log(`${id}: ${font.length} bytes`);
