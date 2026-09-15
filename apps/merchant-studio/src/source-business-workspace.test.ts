// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), retention: vi.fn(), source: vi.fn(), connections: vi.fn(), createConnection: vi.fn(), mappings: vi.fn(), saveMapping: vi.fn(), deleteMapping: vi.fn(), checks: vi.fn(), start: vi.fn(), finish: vi.fn() }));
vi.mock('./api', () => ({ SESSION_STORAGE_KEY: 'test-session', API_BASE_URL: 'http://localhost:3001/v1', MerchantStudioApi: class {
        businessWorkspace = mocks.workspace;
        retention = mocks.retention;
        sourceState = mocks.source;
        integrationConnections = mocks.connections;
        createIntegrationConnection = mocks.createConnection;
        integrationMappings = mocks.mappings;
        saveIntegrationMapping = mocks.saveMapping;
        deleteIntegrationMapping = mocks.deleteMapping;
        startSourceTest = mocks.start;
        finishSourceTest = mocks.finish;
        sourceVersion = vi.fn().mockResolvedValue({ snapshot: { files: [] } });
    } }));
vi.mock('./source-checks', () => ({ checkSourceWebsite: mocks.checks, sourceChecksBlockPublishing: (checks: any[]) => checks.some(row => row.status === 'failed') }));
vi.mock('./commerce-platform', () => ({ openCommercePlatform: vi.fn() }));
vi.mock('./commerce-content', () => ({ openCommerceContent: vi.fn() }));
vi.mock('./shipping-settings', () => ({ openShippingSettings: vi.fn() }));
vi.mock('./brand-profile', () => ({ openBrandProfile: vi.fn() }));
import { mountBusinessWorkspace } from './source-business-workspace';
const source = () => ({ revision: 2, versions: [{ revision: 2, label: 'Alternativa' }, { revision: 1, label: 'Original' }], publication: { revision: 1, version: 3, active: true } });
let app: HTMLDivElement;
const input = (selector: string, value: string) => { const field = app.querySelector<HTMLInputElement>(selector)!; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); };
const submit = (selector: string) => app.querySelector(selector)!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
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
    it('sends Comeback navigation to its specific marketing tab', async () => {
        const send = vi.spyOn(window.parent, 'postMessage');
        await mount('library=integrations');
        click('[data-open-integration=comeback]');
        expect(send).toHaveBeenCalledWith({ type: 'pagosya:workspace', view: 'marketing', tab: 'program', storeId: 'store-a' }, location.origin);
    });
    it('shows native and provider logos without marking external services configured', async () => {
        await mount('library=integrations');
        const own = app.querySelector('[data-open-integration=comeback]')!.closest('article')!;
        expect(own.querySelector('img')!.getAttribute('src')).toContain('logo-mark.png');
        expect(own.querySelector('img')!.alt).toBe('PagosYa');
        const tiktok = app.querySelector('[data-open-integration=tiktok-ads]')!.closest('article')!;
        expect(tiktok.querySelector('img')!.getAttribute('src')).toContain('integrations/tiktok.svg');
        expect(tiktok.querySelector('.business-badge')!.textContent).toBe('Externa');
        input('[name=name]', 'Mi inventario');
        click('[data-open-integration=tiktok-ads]');
        expect(app.querySelector('.integration-detail')!.textContent).toContain('Sin conectar a esta tienda');
        expect(app.querySelector('.integration-detail a')!.getAttribute('href')).toBe('https://ads.tiktok.com/');
        expect((app.querySelector('[name=name]') as HTMLInputElement).value).toBe('Mi inventario');
        const only = app.querySelector<HTMLInputElement>('[data-only-connected]')!;
        only.checked = true; only.dispatchEvent(new Event('change'));
        expect(app.querySelector('[data-open-integration=tiktok-ads]')).toBeNull();
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
