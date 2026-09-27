// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ExtensionView } from './api';
import { extensionBadges, extensionCard, extensionDetail, guideCard, readExtensionForm } from './extensions-panel';

const view = (over: Partial<ExtensionView> = {}): ExtensionView => ({ kind: 'extension', id: 'meta-pixel', name: 'Meta Pixel', category: 'ads', categoryLabel: 'Publicidad', tier: 'free', logo: 'meta', summary: 'Mide tus anuncios.', description: 'Tu pixel <b>registra</b> compras.', docsUrl: 'https://example.com/doc', fields: [{ key: 'id', label: 'ID del pixel', type: 'text', help: null, where: 'Events Manager.', placeholder: '123456789012345', required: true, pattern: '^[0-9]{8,20}$', options: [] }], secrets: [], installed: false, enabled: false, configured: false, settings: {}, lastError: null, lastErrorAt: null, capabilities: ['script'], feed: null, ...over });
const toggle = { key: 'on', label: 'Activo', type: 'toggle' as const, help: null, where: null, placeholder: null, required: false, pattern: null, options: [] };
const token = { key: 'token', label: 'Token', help: null, configured: true };

describe('extensions panel', () => {
  it('labels level, state and errors', () => {
    expect(extensionBadges(view())).toEqual([{ label: 'Gratis', tone: 'plain' }]);
    expect(extensionBadges(view({ tier: 'pro', installed: true, enabled: true, configured: true }))).toEqual([{ label: 'Pro · gratis por ahora', tone: 'pro' }, { label: 'Configurada', tone: 'ready' }]);
    expect(extensionBadges(view({ installed: true, enabled: false, configured: true }))).toContainEqual({ label: 'Pausada', tone: 'plain' });
    expect(extensionBadges(view({ installed: true, enabled: true, configured: true, lastError: 'Meta rechazó tu token' }))).toContainEqual({ label: 'Con error', tone: 'error' });
  });

  it('escapes every string that comes from the API', () => {
    const html = extensionDetail(view({ settings: { id: '"><img src=x>' } }), '/studio/');
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('Tu pixel &lt;b&gt;registra&lt;/b&gt; compras.');
  });

  it('builds the form from the manifest fields, and never shows a stored secret', () => {
    const html = extensionDetail(view({ secrets: [token], fields: [...view().fields, toggle] }), '/studio/');
    expect(html).toContain('name="setting:id"');
    expect(html).toContain('pattern="^[0-9]{8,20}$"');
    expect(html).toContain('type="checkbox" name="setting:on"');
    expect(html).toContain('name="secret:token"');
    expect(html).toContain('Configurado ✓');
    expect(html).not.toMatch(/name="secret:token"[^>]*value="/);
  });

  it('shows the feed address, its steps, and what it leaves out', () => {
    const html = extensionDetail(view({ id: 'google-shopping', capabilities: ['feed'], fields: [], installed: true, enabled: true, configured: true, feed: { url: 'https://api/x.xml', platform: 'google', steps: ['Paso uno'], skipped: { noPhoto: 2, noPrice: 0 } } }), '/studio/');
    expect(html).toContain('https://api/x.xml');
    expect(html).toContain('Paso uno');
    expect(html).toContain('2 productos sin foto no aparecen');
  });

  it('reads the form into settings and secrets; an empty secret is sent empty so the API keeps the stored one', () => {
    const current = view({ secrets: [token], fields: [...view().fields, toggle] });
    document.body.innerHTML = extensionDetail(current, '/studio/');
    const form = document.querySelector('form')!;
    (form.elements.namedItem('setting:id') as HTMLInputElement).value = ' 123456789 ';
    (form.elements.namedItem('setting:on') as HTMLInputElement).checked = true;
    expect(readExtensionForm(form, current)).toEqual({ settings: { id: '123456789', on: true }, secrets: { token: '' } });
  });

  it('cards: extensions open their detail, guides link out', () => {
    expect(extensionCard(view(), '/studio/')).toContain('data-open-extension="meta-pixel"');
    expect(guideCard({ kind: 'guide', id: 'instagram-ads', name: 'Instagram Ads', category: 'ads', categoryLabel: 'Publicidad', logo: 'instagram', summary: 'Promociona.', url: 'https://adsmanager.facebook.com/', guide: 'https://g' }, '/studio/')).toContain('href="https://adsmanager.facebook.com/"');
  });
});
