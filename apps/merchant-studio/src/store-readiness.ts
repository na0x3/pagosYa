import { escapeHtml as escape } from './studio-ui';
import './store-readiness.css';
export type ReadinessInput = {
  catalog: Record<string, any> | null; branded: boolean; checked: boolean; checking: boolean;
  published: boolean; canPublish: boolean; locked: boolean;
};
export function readinessSteps(input: ReadinessInput) {
  const items = Array.isArray(input.catalog?.items) ? input.catalog.items : [];
  const digital = items.length > 0 && items.every((item: any) => item.fulfillmentType === 'DIGITAL');
  const locations = Array.isArray(input.catalog?.locations) ? input.catalog.locations : [];
  const fulfillment = digital || locations.some((location: any) => location.pickupEnabled || location.deliveryEnabled) || input.catalog?.shippingEnabled;
  return [
    { id: 'products', title: 'Productos', done: items.some((item: any) => item.stock !== 0 && item.purchaseLimit !== 0), detail: `${items.length} productos en el catálogo. Revisa precio, fotos y disponibilidad.`, action: 'Revisar productos' },
    { id: 'brand', title: 'Identidad', done: input.branded, detail: 'Aplica los colores, tipografía y contenido de tu marca.', action: 'Revisar identidad' },
    { id: 'shipping', title: 'Entrega y recojo', done: Boolean(fulfillment), detail: digital ? 'El catálogo contiene únicamente productos digitales.' : 'Define dónde entregas y dónde pueden recoger el pedido.', action: 'Configurar entrega' },
    { id: 'payments', title: 'Pagos', done: false, deferred: true, detail: 'Integración pendiente. Puedes preparar y probar el sitio sin hacer cobros. Publicar un diseño no confirma que puedas recibir pagos.', action: '' },
    { id: 'test', title: 'Compra de prueba', done: input.checked, detail: input.checking ? 'Comprobando el recorrido en móvil y escritorio…' : 'Pedido → entrega o recojo → dirección → formulario. No crea pedidos ni prueba un cobro real.', action: input.checking ? 'Comprobando…' : 'Probar recorrido' },
    { id: 'publish', title: 'Publicar', done: input.published, detail: 'Revisa la tienda y publica cuando el recorrido esté comprobado.', action: input.published ? 'Publicado' : 'Publicar diseño' },
  ];
}
export function renderStoreReadiness(input: ReadinessInput) {
  const steps = readinessSteps(input);
  return `<details class="store-readiness"><summary>Prepara tu primera venta · ${steps.filter(step => step.done).length} de 6 pasos</summary><p>Avanza en este orden. Puedes volver a cualquier paso; los pagos siguen pendientes.</p><ol>${steps.map(step => `<li data-readiness-step="${step.id}"><div><strong>${escape(step.title)} <span>${step.deferred ? 'Pendiente para el lanzamiento' : step.done ? 'Revisado' : 'Por revisar'}</span></strong><p>${escape(step.detail)}</p></div>${step.action ? `<button type="button" class="text-button" data-readiness-action="${step.id}" ${input.locked || step.id === 'test' && input.checking || step.id === 'publish' && (!input.canPublish || input.published) ? 'disabled' : ''}>${escape(step.action)}</button>` : ''}</li>`).join('')}</ol></details>`;
}
