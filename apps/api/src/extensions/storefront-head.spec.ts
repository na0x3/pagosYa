import { extensionsHead, verificationHead } from './storefront-head';

const install = (extensionId: string, settings: Record<string, unknown>, enabled = true) => ({ extensionId, enabled, settings });
const all = [install('google-analytics', { id: 'G-ABC1234567' }), install('google-tag-manager', { id: 'GTM-ABCD123' }), install('meta-pixel', { id: '123456789012345' }), install('tiktok-pixel', { id: 'CJKLMNOP1234' })];

// Runs the gate against a fake window and document: tag() calls are recorded, consent granted or not.
function run(head: string, consent: boolean) {
  const scripts: string[] = [];
  const w: any = { PAGOSYA_PRIVACY: { analyticsAllowed: () => consent }, addEventListener: () => {} };
  const d: any = { createElement: () => ({}), head: { appendChild: (element: any) => scripts.push(element.src) }, documentElement: null };
  const body = head.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the test runs the exact script the storefront serves
  new Function('window', 'document', body)(w, d);
  return { w, scripts };
}

describe('storefront head from extensions', () => {
  it('injects nothing without an enabled, configured script extension', () => {
    expect(extensionsHead('cafe', [])).toBe('');
    expect(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' }, false)])).toBe('');
    expect(extensionsHead('cafe', [install('meta-pixel', {})])).toBe('');
    expect(extensionsHead('cafe', [install('google-search-console', { token: 'A'.repeat(30) })])).toBe('');
  });

  it('is one removable marked script that waits for consent', () => {
    const head = extensionsHead('cafe', all);
    expect(head.match(/<script\b/g)).toHaveLength(1);
    expect(head).toContain('data-pagosya-analytics="gate"');
    expect(head).toContain('PAGOSYA_ANALYTICS_AVAILABLE');
    expect(head.replace(/<script\b[^>]*\bdata-pagosya-analytics=[^>]*>[^]*?<\/script>/gi, '')).toBe('');
    expect(run(head, false).scripts).toEqual([]);
  });

  // Review focus 5: a migrated store loads the same providers it loaded before.
  it('loads the same provider scripts the four migrated IDs loaded before', () => {
    const { scripts, w } = run(extensionsHead('cafe', all), true);
    expect(scripts).toEqual(['https://www.googletagmanager.com/gtag/js?id=G-ABC1234567', 'https://www.googletagmanager.com/gtm.js?id=GTM-ABCD123', 'https://connect.facebook.net/en_US/fbevents.js', 'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=CJKLMNOP1234&lib=ttq']);
    expect(w.fbq.queue.slice(0, 2).map((args: IArguments) => [...args])).toEqual([['init', '123456789012345'], ['track', 'PageView']]);
    expect(w.PAGOSYA_ANALYTICS_AVAILABLE).toBe(true);
  });

  // Review focus 1: every pixel reports a sale once, however often the success screen renders.
  it('reports a purchase to every loaded pixel once per order', () => {
    const { w } = run(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' }), install('pinterest-tag', { id: '2612345678901' })]), true);
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 12.5, currency: 'BOB' });
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 12.5, currency: 'BOB' });
    expect(w.fbq.queue.filter((args: IArguments) => args[1] === 'Purchase')).toHaveLength(1);
    expect(w.pintrk.queue.filter((args: unknown[]) => args[1] === 'checkout')).toHaveLength(1);
  });

  it('reports nothing before consent', () => {
    const { w } = run(extensionsHead('cafe', [install('meta-pixel', { id: '123456789012345' })]), false);
    w.PAGOSYA_TRACK('purchase', { orderId: 'o1', value: 1, currency: 'BOB' });
    expect(w.fbq).toBeUndefined();
  });

  it('never embeds a value that fails its pattern, and embeds the slug as inert JSON', () => {
    const head = extensionsHead('</script><b>', [install('meta-pixel', { id: '1234</script>' }), install('hotjar', { id: '1234567' })]);
    expect(head).not.toContain('1234</script>');
    expect(head).not.toContain('</script><b>');
    expect(head).toContain('"1234567"');
  });

  it('renders verification tags outside the gate, escaped and pattern-checked', () => {
    expect(verificationHead([install('google-search-console', { token: 'AbCdEfGhIjKlMnOpQrSt_-123' }), install('bing-webmaster', { token: 'nope' })]))
      .toBe('<meta name="google-site-verification" content="AbCdEfGhIjKlMnOpQrSt_-123">');
  });
});
