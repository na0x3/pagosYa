// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

// A <video> that lists its files as <source> children has no src of its own. An empty path resolves to the page
// itself, so the video was given the page's HTML as its src and never played the MP4 inside it.
describe('preview video sources', () => {
  it('leaves a <video> without src to its <source> children', () => {
    const snapshot = { schemaVersion: 1, brief: {} as any, files: [
      { path: 'index.html', content: '<html><body><video autoplay muted loop playsinline poster="assets/poster.jpg"><source src="assets/clip.mp4" type="video/mp4"><source src="/v1/uploads/x.mp4" type="video/mp4"><img src="assets/poster.jpg" alt=""></video><img alt="sin foto"></body></html>' },
      { path: 'assets/clip.mp4', encoding: 'base64' as const, content: 'AAAAIGZ0eXA=' },
      { path: 'assets/poster.jpg', encoding: 'base64' as const, content: '/9j/' },
    ] };
    const doc = new DOMParser().parseFromString(sourcePreviewDocument(snapshot as any, 'index.html'), 'text/html');
    const video = doc.querySelector('video')!;
    expect(video.hasAttribute('src')).toBe(false);
    expect(video.querySelector('source')!.getAttribute('src')).toBe('data:video/mp4;base64,AAAAIGZ0eXA=');
    expect(video.getAttribute('poster')).toBe('data:image/jpeg;base64,/9j/');
    expect(doc.querySelector('img[alt="sin foto"]')!.hasAttribute('src')).toBe(false);
    expect(doc.documentElement.outerHTML).not.toContain('data:text/html');
  });
});
