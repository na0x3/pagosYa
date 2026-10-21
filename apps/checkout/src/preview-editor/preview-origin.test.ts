import { describe, expect, it } from 'vitest';
import { parsePreviewParentOrigins, previewParentAllowed } from './preview-origin';

describe('who may drive the store preview', () => {
  it('only the merchant dashboard and Studio origins it was configured with', () => {
    const allowed = parsePreviewParentOrigins('https://panel.pagosya.bo, https://studio.pagosya.bo/');
    expect(allowed).toEqual(['https://panel.pagosya.bo', 'https://studio.pagosya.bo']);
    expect(previewParentAllowed('https://panel.pagosya.bo', allowed)).toBe(true);
    expect(previewParentAllowed('https://evil.example', allowed)).toBe(false);
    expect(previewParentAllowed('null', allowed)).toBe(false);
  });
  it('defaults to the local dashboard and Studio in development', () => {
    expect(parsePreviewParentOrigins(undefined)).toEqual(['http://localhost:4323', 'http://127.0.0.1:4323', 'http://localhost:5173']);
  });
});

describe('the bridge', () => {
  it('ignores messages from any other origin', async () => {
    const { readFileSync } = await import('node:fs');
    const bridge = readFileSync(`${process.cwd()}/src/preview-editor/bridge.ts`, 'utf8');
    expect(bridge).toMatch(/if \(event\.source !== window\.parent \|\| !previewParentAllowed\(event\.origin, PREVIEW_PARENT_ORIGINS\) \|\| !state\.activePreviewStore\) return;/);
  });
});
