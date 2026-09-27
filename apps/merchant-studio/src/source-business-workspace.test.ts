// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), retention: vi.fn(), source: vi.fn(), connections: vi.fn(), createConnection: vi.fn(), mappings: vi.fn(), saveMapping: vi.fn(), deleteMapping: vi.fn(), checks: vi.fn(), start: vi.fn(), finish: vi.fn(), openArrangement: vi.fn(), openRecommendations: vi.fn(), domainShop: vi.fn(), openDomain: vi.fn(), extensions: vi.fn(), saveExtension: vi.fn(), toggleExtension: vi.fn(), removeExtension: vi.fn() }));
vi.mock('./api', () => ({ SESSION_STORAGE_KEY: 'test-session', API_BASE_URL: 'http://localhost:3001/v1', MerchantStudioApi: class {
        businessWorkspace = mocks.workspace;
        retention = mocks.retention;
        sourceState = mocks.source;
        domainShop = mocks.domainShop;
        integrationConnections = mocks.connections;
        createIntegrationConnection = mocks.createConnection;
        integrationMappings = mocks.mappings;
        saveIntegrationMapping = mocks.saveMapping;
        deleteIntegrationMapping = mocks.deleteMapping;
        startSourceTest = mocks.start;
        finishSourceTest = mocks.finish;
        extensions = mocks.extensions;
        saveExtension = mocks.saveExtension;
        toggleExtension = mocks.toggleExtension;
        removeExtension = mocks.removeExtension;
        sourceVersion = vi.fn().mockResolvedValue({ snapshot: { files: [] } });
    } }));
vi.mock('./source-checks', () => ({ checkSourceWebsite: mocks.checks, sourceChecksBlockPublishing: (checks: any[]) => checks.some(row => row.status === 'failed') }));
vi.mock('./commerce-platform', () => ({ openCommercePlatform: vi.fn() }));
vi.mock('./commerce-content', () => ({ openCommerceContent: vi.fn() }));
vi.mock('./shipping-settings', () => ({ openShippingSettings: vi.fn() }));
vi.mock('./domain-shop', () => ({ openDomainShop: mocks.openDomain }));
vi.mock('./brand-profile', () => ({ openBrandProfile: vi.fn() }));
vi.mock('./catalog-arrangement', () => ({ openCatalogArrangement: mocks.openArrangement }));
vi.mock('./recommendations', () => ({ openRecommendations: mocks.openRecommendations }));
import { mountBusinessWorkspace } from './source-business-workspace';
const source = () => ({ revision: 2, versions: [{ revision: 2, label: 'Alternativa' }, { revision: 1, label: 'Original' }], publication: { revision: 1, version: 3, active: true } });
let app: HTMLDivElement;
const input = (selector: string, value: string) => { const field = app.querySelector<HTMLInputElement>(selector)!; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); };
const submit = (selector: string) => app.querySelector(selector)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
const tiktokPixel = (over: Record<string, unknown> = {}) => ({ kind: 'extension', id: 'tiktok-pixel', name: 'TikTok Pixel', category: 'ads', categoryLabel: 'Publicidad', tier: 'free', logo: 'tiktok', summary: 'Mide tus anuncios de TikTok.', description: 'Registra visitas y compras.', docsUrl: null, fields: [{ key: 'id', label: 'ID del pixel', type: 'text', help: null, where: null, placeholder: 'CJKLMNOP1234', required: true, pattern: '^[A-Z0-9]{10,30}$', options: [] }], secrets: [], installed: false, enabled: false, configured: false, settings: {}, lastError: null, lastErrorAt: null, capabilities: ['script'], feed: null, ...over });
const instagramAds = { kind: 'guide', id: 'instagram-ads', name: 'Instagram Ads', category: 'ads', categoryLabel: 'Publicidad', logo: 'instagram', summary: 'Promociona tu tienda.', url: 'https://adsmanager.facebook.com/', guide: 'https://g' };
const click = (selector: string) => (app.querySelector(selector) as HTMLButtonElement).click();
const mount = async (query: string) => { history.replaceState({}, '', `/?store=store-a&${query}`); await mountBusinessWorkspace(app); };
beforeEach(() => {
    vi.resetAllMocks();
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
        observe() { }
        disconnect() { }
    });
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    document.body.innerHTML = '<div id="app"></div>';
    app = document.querySelector('#app')!;
    mocks.retention.mockResolvedValue({ settings: { comebackEnabled: false }, emailConfigured: false });
    mocks.source.mockResolvedValue(source());
    mocks.connections.mockResolvedValue([]);
    mocks.domainShop.mockResolvedValue({ available: false, sandbox: true, tlds: ['com'], orders: [] });
    mocks.extensions.mockResolvedValue({ extensions: [tiktokPixel()], guides: [instagramAds] });
    mocks.workspace.mockResolvedValue({ storeName: 'Tienda A', revision: 2, emailConfigured: true, staff: { enabled: false, recipients: [] }, templates: [{ id: 'SHIPPED', name: 'Pedido enviado', group: 'transactional', trigger: 'Al enviar', supported: true, enabled: false, subject: 'En camino', body: 'Hola {{customer}}' }], logs: { items: [], nextBefore: null } });
});
describe('marketing workspaces', () => {
    it('keeps a failed template draft and blocks navigation during save', async () => {
        await mount('library=marketing&tab=templates');
        click('[data-template]');
        input('[name=subject]', 'Mi asunto editado');
        let reject!: (error: Error) => void;
        mocks.workspace.mockReturnValueOnce(new Promise((_, no) => { reject = no; }));
        submit('form');
        expect((window as any).pagosyaStudioCanLeave()).toBe(false);
        expect((app.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(true);
        reject(Error('Conflicto de revisión'));
        await vi.waitFor(() => expect(app.textContent).toContain('Conflicto de revisión'));
        expect((app.querySelector('[name=subject]') as HTMLInputElement).value).toBe('Mi asunto editado');
        expect((app.querySelector('[type=submit]') as HTMLButtonElement).disabled).toBe(false);
        expect(mocks.workspace).toHaveBeenLastCalledWith('store-a', '/templates/SHIPPED', 'PUT', expect.objectContaining({ subject: 'Mi asunto editado', revision: 2 }));
    });
    it('refreshes a conflicted revision without losing the draft before retry', async () => {
        await mount('library=marketing&tab=templates');
        click('[data-template]');
        input('[name=subject]', 'Mi cambio');
        mocks.workspace.mockRejectedValueOnce(Object.assign(Error('La configuración cambió.'), { status: 409 }));
        mocks.workspace.mockResolvedValueOnce({ revision: 3 });
        submit('form');
        await vi.waitFor(() => expect(app.textContent).toContain('conservamos tu borrador'));
        expect((app.querySelector('[name=subject]') as HTMLInputElement).value).toBe('Mi cambio');
        submit('form');
        await vi.waitFor(() => expect(mocks.workspace).toHaveBeenCalledWith('store-a', '/templates/SHIPPED', 'PUT', expect.objectContaining({ revision: 3, subject: 'Mi cambio' })));
    });
    it('preserves connection drafts through gallery filters and reports actual synchronization', async () => {
        mocks.connections.mockResolvedValue([{ id: 'old', name: 'Inventario anterior', kind: 'POS', lastSyncAt: null }]);
        await mount('library=integrations');
        input('[name=name]', 'Inventario nuevo');
        input('[data-search-integration]', 'comeback');
        expect((app.querySelector('[name=name]') as HTMLInputElement).value).toBe('Inventario nuevo');
        expect(app.querySelectorAll('.integration-card')).toHaveLength(1);
        expect(app.textContent).toContain('Pendiente de la primera sincronización');
        expect(app.querySelector('.connection-row .is-ready')).toBeNull();
    });
    it('links a SKU per combination, removes cleared links and shows the last sync report', async () => {
        mocks.connections.mockResolvedValue([{ id: 'conn', name: 'ERP', kind: 'CUSTOM_DATABASE', lastSyncAt: '2026-09-15T10:00:00Z', mappingCount: 1, lastRun: { status: 'SUCCEEDED', itemCount: 2, details: { skipped: [{ externalSku: 'NOPE', reason: 'SKU sin vincular a un producto en pagosYa' }] } } }]);
        mocks.mappings.mockResolvedValue({ products: [{ id: 'lamp', name: 'Lámpara', stock: 24, variants: [{ id: 'negro', name: 'Negro', stock: 12 }, { id: 'marfil', name: 'Marfil', stock: 12 }] }, { id: 'mug', name: 'Taza', stock: null, variants: [] }], mappings: [{ id: 'map1', paymentLinkId: 'mug', variantId: null, externalSku: 'MUG-1' }] });
        await mount('library=integrations');
        expect(app.textContent).toContain('Cómo se combinan los datos');
        expect(app.textContent).toContain('2 SKU actualizados · 1 sin aplicar');
        expect(app.querySelector('.integration-skipped')!.textContent).toContain('SKU sin vincular a un producto en pagosYa (1): NOPE');
        click('[data-link-connection=conn]');
        await vi.waitFor(() => expect(app.querySelectorAll('[data-sku-row]')).toHaveLength(3));
        expect(app.textContent).toContain('1 de 3 artículos vinculados');
        input('[data-sku-row="lamp:negro"]', 'LAMP-NEGRO');
        input('[data-sku-row="mug:"]', '');
        click('[data-save-links]');
        await vi.waitFor(() => expect(mocks.saveMapping).toHaveBeenCalledWith('store-a', 'conn', { paymentLinkId: 'lamp', variantId: 'negro', externalSku: 'LAMP-NEGRO' }));
        await vi.waitFor(() => expect(mocks.deleteMapping).toHaveBeenCalledWith('store-a', 'conn', 'map1'));
        await vi.waitFor(() => expect(app.textContent).toContain('Guardamos 1 vínculo y quitamos 1.'));
    });
    it('opens the catalog arrangement panel from the embedded integrations catalog, not just lists it', async () => {
        await mount('library=integrations');
        const card = app.querySelector('[data-open-integration=arrangement]')!.closest('article')!;
        expect(card.textContent).toContain('Cómo se ven tus productos');
        expect(mocks.openArrangement).not.toHaveBeenCalled();
        click('[data-open-integration=arrangement]');
        expect(mocks.openArrangement).toHaveBeenCalledWith(expect.anything(), 'store-a');
    });
    it('opens the recommendations panel from the embedded integrations catalog', async () => {
        await mount('library=integrations');
        const card = app.querySelector('[data-open-integration=recommendations]')!.closest('article')!;
        expect(card.textContent).toContain('Recomendaciones');
        click('[data-open-integration=recommendations]');
        expect(mocks.openRecommendations).toHaveBeenCalledWith(expect.anything(), 'store-a');
    });
    it('opens the domain shop from the embedded integrations catalog, not just lists it', async () => {
        await mount('library=integrations');
        const card = app.querySelector('[data-open-integration=domain]')!.closest('article')!;
        expect(card.textContent).toContain('Tu propio dominio');
        expect(mocks.openDomain).not.toHaveBeenCalled();
        click('[data-open-integration=domain]');
        expect(mocks.openDomain).toHaveBeenCalledWith(expect.anything(), 'store-a');
    });
    it('marks the domain tool configured only once a purchase is connected', async () => {
        await mount('library=integrations');
        expect(app.querySelector('[data-open-integration=domain]')!.closest('article')!.querySelector('.business-badge')!.textContent).toBe('Incluida');
        mocks.domainShop.mockResolvedValue({ available: true, sandbox: false, tlds: ['com'], orders: [{ status: 'ACTIVE' }] });
        await mount('library=integrations');
        expect(app.querySelector('[data-open-integration=domain]')!.closest('article')!.querySelector('.business-badge')!.textContent).toBe('Configurada');
    });
    it('keeps the integrations grid usable when the domain shop cannot be reached', async () => {
        mocks.domainShop.mockRejectedValue(Error('503'));
        await mount('library=integrations');
        expect(app.querySelector('[data-open-integration=domain]')).not.toBeNull();
        expect(app.querySelector('[data-open-integration=comeback]')).not.toBeNull();
    });
    it('sends Comeback navigation to its specific marketing tab', async () => {
        const send = vi.spyOn(window.parent, 'postMessage');
        await mount('library=integrations');
        click('[data-open-integration=comeback]');
        expect(send).toHaveBeenCalledWith({ type: 'pagosya:workspace', view: 'marketing', tab: 'program', storeId: 'store-a' }, location.origin);
    });
    it('lists extensions, pagosYa features and guides, with provider logos and honest states', async () => {
        await mount('library=integrations');
        const own = app.querySelector('[data-open-integration=comeback]')!.closest('article')!;
        expect(own.querySelector('img')!.getAttribute('src')).toContain('logo-mark.png');
        expect(own.querySelector('img')!.alt).toBe('PagosYa');
        const tiktok = app.querySelector('[data-open-extension=tiktok-pixel]')!.closest('article')!;
        expect(tiktok.querySelector('img')!.getAttribute('src')).toContain('integrations/tiktok.svg');
        expect(tiktok.textContent).not.toContain('Configurada');
        expect(app.querySelector('.is-guide a')!.getAttribute('href')).toBe('https://adsmanager.facebook.com/');
        expect([...app.querySelectorAll('.integration-section')].map(heading => heading.textContent)).toEqual(['Extensiones', 'Funciones de pagosYa', 'Guías']);
        input('[name=name]', 'Mi inventario');
        click('[data-open-extension=tiktok-pixel]');
        expect(app.querySelector<HTMLInputElement>('[name="setting:id"]')!.getAttribute('placeholder')).toBe('CJKLMNOP1234');
        expect((app.querySelector('[name=name]') as HTMLInputElement).value).toBe('Mi inventario');
        const only = app.querySelector<HTMLInputElement>('[data-only-connected]')!;
        only.checked = true; only.dispatchEvent(new Event('change'));
        expect(app.querySelector('[data-open-extension=tiktok-pixel]')).toBeNull();
        expect(app.querySelector('.is-guide')).toBeNull();
    });

    it('saves an extension from its manifest form and shows what the API stored, not what was typed', async () => {
        mocks.saveExtension.mockResolvedValue(tiktokPixel({ installed: true, enabled: true, configured: true, settings: { id: 'ZZZZYYYY9988' } }));
        await mount('library=integrations');
        click('[data-open-extension=tiktok-pixel]');
        input('[name="setting:id"]', 'zzzzyyyy9988');
        submit('[data-extension-form]');
        await vi.waitFor(() => expect(mocks.saveExtension).toHaveBeenCalledWith('store-a', 'tiktok-pixel', { settings: { id: 'zzzzyyyy9988' }, secrets: {} }));
        await vi.waitFor(() => expect(app.querySelector<HTMLInputElement>('[name="setting:id"]')!.value).toBe('ZZZZYYYY9988'));
        expect(app.querySelector('[data-open-extension=tiktok-pixel]')!.closest('article')!.textContent).toContain('Configurada');
    });

    it('pauses and removes an installed extension', async () => {
        mocks.extensions.mockResolvedValue({ extensions: [tiktokPixel({ installed: true, enabled: true, configured: true, settings: { id: 'CJKLMNOP1234' } })], guides: [] });
        mocks.toggleExtension.mockResolvedValue(tiktokPixel({ installed: true, enabled: false, configured: true, settings: { id: 'CJKLMNOP1234' } }));
        mocks.removeExtension.mockResolvedValue({ removed: true });
        await mount('library=integrations');
        click('[data-open-extension=tiktok-pixel]');
        click('[data-toggle-extension]');
        await vi.waitFor(() => expect(mocks.toggleExtension).toHaveBeenCalledWith('store-a', 'tiktok-pixel', false));
        await vi.waitFor(() => expect(app.querySelector('[data-toggle-extension]')!.textContent).toBe('Reanudar'));
        mocks.extensions.mockResolvedValue({ extensions: [tiktokPixel()], guides: [] });
        click('[data-remove-extension]');
        await vi.waitFor(() => expect(mocks.removeExtension).toHaveBeenCalledWith('store-a', 'tiktok-pixel'));
        await vi.waitFor(() => expect(app.querySelector('[data-status], [data-business-status]')!.textContent).toContain('Quitamos TikTok Pixel.'));
        expect(app.querySelector('.integration-detail')).toBeNull();
    });
    it('preserves YAPI instructions when a different saved design is selected', async () => {
        await mount('library=experiments');
        input('[name=instruction]', 'Conserva mi paleta y simplifica la portada');
        const select = app.querySelector<HTMLSelectElement>('[data-experiment-candidate]')!;
        select.value = '1';
        select.dispatchEvent(new Event('change'));
        expect((app.querySelector('[name=instruction]') as HTMLTextAreaElement).value).toBe('Conserva mi paleta y simplifica la portada');
        expect((app.querySelector('[data-start-experiment]') as HTMLButtonElement).disabled).toBe(true);
    });
    it('does not start a live experiment if storefront checks fail', async () => {
        mocks.checks.mockResolvedValue([{ status: 'failed' }]);
        await mount('library=experiments');
        click('[data-start-experiment]');
        await vi.waitFor(() => expect(app.textContent).toContain('comprobaciones pendientes'));
        expect(mocks.start).not.toHaveBeenCalled();
    });
    it('does not offer to apply a winner without sufficient sales evidence', async () => {
        mocks.source.mockResolvedValue({ ...source(), publication: { revision: 1, version: 3, active: true, experiment: { id: 'test-a', status: 'RUNNING', variants: [{ variant: 'A', revision: 1, visitors: 3, buyers: 1, conversionRate: 1 / 3, revenue: [] }, { variant: 'B', revision: 2, visitors: 4, buyers: 2, conversionRate: 0.5, revenue: [] }], evidence: { winner: null, reason: 'Todavía faltan compras.' } } } });
        await mount('library=experiments');
        expect((app.querySelector('[data-apply-winner]') as HTMLButtonElement).disabled).toBe(true);
        expect(app.textContent).toContain('Todavía faltan compras.');
        click('[data-apply-winner]');
        expect(mocks.finish).not.toHaveBeenCalled();
    });
});
