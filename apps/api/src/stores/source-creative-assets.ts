import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';

export type CreativeAsset = { id: string; path: string; thumbnail: string; family: string; description: string; tags: string[]; license: string; source: string; bytes: number; sha256: string };
const root = join(__dirname, 'source-kit/creative-assets');
export function creativeAssetCatalog(): CreativeAsset[] {
  return JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')).assets;
}
const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const synonyms: Record<string, string> = { cafe: 'coffee', cafeteria: 'coffee', pan: 'bread', panaderia: 'bakery', pasteleria: 'pastry', fresa: 'strawberry', frutilla: 'strawberry', limon: 'lemon', palta: 'avocado', aguacate: 'avocado', flores: 'flower', girasol: 'sunflower', plantas: 'plant', perro: 'dog', mascotas: 'pet', mariposa: 'butterfly', fuego: 'fire', parrilla: 'grill', corazon: 'heart', fiesta: 'party', cohete: 'rocket', estrellas: 'sparkles' };

/** Retrieve by subject/style without choosing a visual identity for the model. */
export function searchCreativeAssets(query: string, limit = 12): CreativeAsset[] {
  const words = normalize(query).match(/[a-z0-9]+/g) || [];
  const terms = new Set(words.flatMap(word => [word, synonyms[word]].filter(Boolean)));
  return creativeAssetCatalog().map(asset => {
    const vocabulary = new Set(normalize(`${asset.id} ${asset.family} ${asset.description} ${asset.tags.join(' ')}`).match(/[a-z0-9]+/g));
    return { asset, score: [...terms].reduce((score, term) => score + (vocabulary.has(term) ? 1 : 0), 0) };
  }).filter(result => result.score > 0).sort((a, b) => b.score - a.score || a.asset.id.localeCompare(b.asset.id)).slice(0, Math.max(0, Math.min(limit, 32))).map(result => result.asset);
}

export function creativeAssetFile(asset: CreativeAsset): SourceProjectFileDto {
  const bytes = readFileSync(join(root, asset.path.slice('assets/creative/'.length)));
  return { path: asset.path, content: bytes.toString(asset.path.endsWith('.svg') ? 'utf8' : 'base64'), encoding: asset.path.endsWith('.svg') ? 'utf8' : 'base64' };
}

export function withCreativeAssets(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  const source = files.filter(file => /\.(html|css|tsx|jsx|js)$/.test(file.path) && !file.path.startsWith('_compiled/')).map(file => file.content).join('\n');
  const result = [...files];
  const selected = creativeAssetCatalog().filter(asset => source.includes(asset.path) || result.some(file => file.path === asset.path));
  for (const asset of selected) if (!result.some(file => file.path === asset.path)) result.push(creativeAssetFile(asset));
  if (selected.length) {
    const licensePath = 'assets/creative/LICENSE-fluent.txt';
    if (!result.some(file => file.path === licensePath)) result.push({ path: licensePath, content: readFileSync(join(root, 'LICENSE-fluent.txt'), 'utf8') });
    const manifest = 'assets/creative/catalog.json';
    return [...result.filter(file => file.path !== manifest), { path: manifest, content: JSON.stringify({ version: 1, assets: selected }, null, 2) + '\n' }];
  }
  return result;
}
