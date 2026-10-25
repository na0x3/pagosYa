// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sourcePreviewDocument } from './source-preview';

// Owner, 2026-10-22: «la lupa del header nunca sirve». The header's magnifier opens buscar.html, but its search form never
// searched: the preview's CSP says form-action 'none' (published stores share it) and only link clicks became navigation.
const snapshot = { schemaVersion: 1, brief: {} as any, files: [
  { path: 'index.html', content: '<html><body><form class="pagosya-search" role="search" method="get" action="buscar.html"><input type="search" name="q"><button type="submit">Buscar</button></form><form id="other" method="post" action="buscar.html"><button>x</button></form><form id="outside" method="get" action="https://evil.test/"><input name="q"><button>x</button></form></body></html>' },
  { path: 'buscar.html', content: '<html><body></body></html>' },
] };

function runPreview(hosted: boolean) {
  const html = sourcePreviewDocument(snapshot as any, 'index.html', { paymentForm: true, hosted });
  const doc = new DOMParser().parseFromString(html, 'text/html');
  // A document of its own per case, so one run's listeners never answer for the next.
  const page = document.implementation.createHTMLDocument('preview');
  page.body.innerHTML = doc.body.innerHTML;
  const runtime = [...doc.querySelectorAll('script')].map(s => s.textContent || '').find(text => text.includes("'pagosya:source-navigate'"))!;
  const sent: any[] = [];
  const parentStub = { postMessage: (data: unknown) => sent.push(data) };
  // The runtime talks to `parent`; here the test is its parent.
  new Function('parent', 'document', runtime.replace(/^[\s\S]*?\nwindow\.PAGOSYA_PREVIEW=true;/, 'window.PAGOSYA_PREVIEW=true;'))(parentStub, page);
  return { sent, page };
}

describe('search forms in the preview and the published store', () => {
  for (const hosted of [false, true]) it(`a GET search to a store page navigates with its query (${hosted ? 'published' : 'editor'})`, () => {
    const { sent, page } = runPreview(hosted);
    const form = page.querySelector<HTMLFormElement>('form.pagosya-search')!;
    form.querySelector('input')!.value = 'vestido de novia';
    const submit = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    expect(sent.at(-1)).toMatchObject({ type: 'pagosya:source-navigate', page: 'buscar.html', query: '?q=vestido+de+novia' });
  });

  it('leaves POST forms and outside actions alone', () => {
    const { sent, page } = runPreview(false);
    for (const id of ['other', 'outside']) page.getElementById(id)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    expect(sent.filter(m => m?.type === 'pagosya:source-navigate')).toEqual([]);
  });
});
