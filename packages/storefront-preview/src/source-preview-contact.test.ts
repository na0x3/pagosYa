// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { receivePreviewContact, sourcePreviewDocument } from './source-preview';

// Owner, 2026-10-15 (Raíz Viva): «whatsapp button is not working» in the editor preview. The editor removed every outside
// href, so the store's own WhatsApp, phone and email links were dead; the published store opens them.
const snapshot = { schemaVersion: 1, brief: {} as any, files: [
  { path: 'index.html', content: '<html><body><a href="https://wa.me/59170012345">WhatsApp</a><a href="tel:+59170012345">Llamar</a><a href="mailto:hola@raiz.bo">Correo</a><a href="https://evil.test/x">Otro</a></body></html>' },
] };

describe('contact links in the editor preview', () => {
  it('keeps WhatsApp, phone and email links and still drops other outside links', () => {
    const doc = new DOMParser().parseFromString(sourcePreviewDocument(snapshot as any, 'index.html', { paymentForm: true }), 'text/html');
    const hrefs = [...doc.querySelectorAll('a')].map(a => a.getAttribute('href'));
    expect(hrefs).toEqual(['https://wa.me/59170012345', 'tel:+59170012345', 'mailto:hola@raiz.bo', null]);
    expect(doc.documentElement.innerHTML).toContain("'pagosya:source-contact'");
  });

  it('accepts a contact link only from the preview frame and only for WhatsApp, phone or email', () => {
    const frame = document.createElement('iframe'); document.body.append(frame);
    const from = (data: unknown, source: unknown = frame.contentWindow, origin = 'null') => ({ data, source, origin }) as MessageEvent;
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'https://wa.me/59170012345?text=Hola' }), frame)).toBe('https://wa.me/59170012345?text=Hola');
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'https://api.whatsapp.com/send?phone=591' }), frame)).toBe('https://api.whatsapp.com/send?phone=591');
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'tel:+59170012345' }), frame)).toBe('tel:+59170012345');
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'mailto:hola@raiz.bo' }), frame)).toBe('mailto:hola@raiz.bo');
    for (const url of ['https://evil.test/', 'javascript:alert(1)', 'https://wa.me.evil.test/1', 'http://wa.me/1', 42])
      expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url }), frame)).toBeNull();
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'tel:1' }, window), frame)).toBeNull();
    expect(receivePreviewContact(from({ type: 'pagosya:source-contact', url: 'tel:1' }, frame.contentWindow, 'https://x.test'), frame)).toBeNull();
  });
});
