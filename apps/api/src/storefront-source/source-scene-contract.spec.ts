import { buildSourceVisualSystem, savedSourceVisualSystem, withSourceStyleTokens } from './source-visual-system';
import { normalizeSourceSceneContract, resolveSourceSceneContract, sceneContractPrompt, PRODUCT_SCENE_ASPECTS, SCENE_BACKDROP_MODES, SCENE_CAMERA_ELEVATIONS, SCENE_FILL_FRACTION, SCENE_FILL_STEPS, SCENE_LIGHT_DIRECTIONS, SCENE_SHADOWS, type SourceSceneContract } from './source-scene-contract';

const tokens = (background: string, accent = '#993322') => ({
  background: { authored: background, resolved: background, source: 'authored' as const, path: 'styles.css' },
  foreground: { authored: '#1a1a1a', resolved: '#1a1a1a', source: 'authored' as const, path: 'styles.css' },
  accent: { authored: accent, resolved: accent, source: 'authored' as const, path: 'styles.css' },
});

// docs/STOREFRONT_DESIGN_LEVEL_UP.md §5. The vocabulary and the fill band are the contract.
it('pins the documented scene vocabulary and keeps every fill step inside the band', () => {
  expect(SCENE_BACKDROP_MODES).toEqual(['paper', 'field']);
  expect(SCENE_LIGHT_DIRECTIONS).toEqual(['left-45', 'right-45', 'top-soft', 'window-left']);
  expect(SCENE_CAMERA_ELEVATIONS).toEqual(['eye-level', 'three-quarter', 'overhead']);
  expect(SCENE_SHADOWS).toEqual(['soft-contact', 'long-directional', 'none']);
  expect(PRODUCT_SCENE_ASPECTS).toEqual(['square', 'portrait', 'landscape']);
  expect(SCENE_FILL_FRACTION).toEqual({ min: 0.62, max: 0.72 });
  for (const step of SCENE_FILL_STEPS) {
    expect(step).toBeGreaterThanOrEqual(SCENE_FILL_FRACTION.min);
    expect(step).toBeLessThanOrEqual(SCENE_FILL_FRACTION.max);
    expect(Math.round(step * 100)).toBeCloseTo(step * 100, 6);
  }
});

it('resolves the backdrop from the store’s own paper and holds every value inside its band', () => {
  const contract = resolveSourceSceneContract(tokens('#F2EEE7'))!;
  expect(contract.backdropHex).toBe('#f2eee7');
  expect(contract.backdropMode).toBe('paper');
  expect(SCENE_LIGHT_DIRECTIONS).toContain(contract.lightDirection);
  expect(SCENE_CAMERA_ELEVATIONS).toContain(contract.cameraElevation);
  expect(SCENE_SHADOWS).toContain(contract.shadow);
  expect(contract.fillFraction).toBeGreaterThanOrEqual(SCENE_FILL_FRACTION.min);
  expect(contract.fillFraction).toBeLessThanOrEqual(SCENE_FILL_FRACTION.max);
  // A 45-degree key light throws a long shadow; anything softer lands as a contact shadow.
  expect(contract.shadow).toBe(contract.lightDirection.endsWith('-45') ? 'long-directional' : 'soft-contact');
  expect(resolveSourceSceneContract(tokens('#fff'))!.backdropHex).toBe('#ffffff');
});

it('is deterministic per store, distinguishes stores, and follows the product page style for aspect', () => {
  expect(resolveSourceSceneContract(tokens('#f2eee7'))).toEqual(resolveSourceSceneContract(tokens('#f2eee7')));
  const identities = ['#f2eee7', '#101014', '#e7f0ea', '#fff8e1', '#211f1c', '#cfd8dc'].map(paper => JSON.stringify(resolveSourceSceneContract(tokens(paper))));
  expect(new Set(identities).size).toBeGreaterThan(1);
  expect(resolveSourceSceneContract(tokens('#f2eee7'), 'editorial')!.aspect).toBe('portrait');
  expect(resolveSourceSceneContract(tokens('#f2eee7'), 'dense')!.aspect).toBe('square');
  expect(resolveSourceSceneContract(tokens('#f2eee7'))!.aspect).toBe('square');
});

it('declines to invent a backdrop when the store’s paper never resolved to a literal', () => {
  expect(resolveSourceSceneContract({})).toBeNull();
  expect(resolveSourceSceneContract({ background: { authored: 'var(--x)', resolved: null, source: 'unresolved', path: 'styles.css' } })).toBeNull();
  // A resolved surface is an acceptable second choice for the backdrop.
  expect(resolveSourceSceneContract({ surface: { authored: '#ede7dd', resolved: '#ede7dd', source: 'authored', path: 'styles.css' } })!.backdropHex).toBe('#ede7dd');
});

it('drops a persisted contract that drifted outside its documented vocabulary or band', () => {
  const valid = resolveSourceSceneContract(tokens('#f2eee7'))!;
  expect(normalizeSourceSceneContract(valid)).toEqual(valid);
  expect(normalizeSourceSceneContract({ ...valid, fillFraction: 0.5 })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, fillFraction: 0.9 })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, lightDirection: 'back-lit' })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, cameraElevation: 'drone' })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, backdropMode: 'gradient' })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, aspect: 'panorama' })).toBeNull();
  expect(normalizeSourceSceneContract({ ...valid, backdropHex: 'cream' })).toBeNull();
  expect(normalizeSourceSceneContract(null)).toBeNull();
});

it('emits the contract clause with the documented wording and a whole-percent fill', () => {
  const contract: SourceSceneContract = { backdropHex: '#f2eee7', backdropMode: 'paper', lightDirection: 'window-left', cameraElevation: 'three-quarter', fillFraction: 0.68, aspect: 'portrait', shadow: 'soft-contact' };
  expect(sceneContractPrompt(contract)).toBe('Seamless backdrop in exactly #f2eee7. Key light window-left. Camera three-quarter. The product occupies 68% of the frame height, centred, with even margin. soft-contact shadow. Every photograph for this store uses these same values so the catalogue reads as one shoot.');
});

it('resolves the contract beside the tokens, persists it and returns it unchanged on the next save', () => {
  const css = [{ path: 'styles.css', content: ':root{--store-background:#f2eee7;--store-foreground:#1a1a1a;--store-accent:#993322}' }];
  const first = withSourceStyleTokens(buildSourceVisualSystem('subtle'), css);
  expect(first.scene?.backdropHex).toBe('#f2eee7');
  // A round trip through visual-system.json keeps the shoot byte for byte.
  const reread = savedSourceVisualSystem([{ path: 'visual-system.json', content: JSON.stringify(first, null, 2) }])!;
  expect(reread.scene).toEqual(first.scene);
  expect(withSourceStyleTokens(reread, css).scene).toEqual(first.scene);
  // A local edit that repaints the paper keeps the shoot the catalog was already photographed against.
  const repainted = [{ path: 'styles.css', content: ':root{--store-background:#101014;--store-foreground:#f4f4f4;--store-accent:#c8a45c}' }];
  expect(withSourceStyleTokens(buildSourceVisualSystem('subtle'), repainted, first.scene).scene).toEqual(first.scene);
  // An authorized redesign passes no previous scene, so the new identity resolves a new shoot.
  expect(withSourceStyleTokens(buildSourceVisualSystem('subtle'), repainted).scene?.backdropHex).toBe('#101014');
});
