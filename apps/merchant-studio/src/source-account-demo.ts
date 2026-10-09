import { mountSourceAccountBridge, type AccountBridgeHandler } from '@pagosya/storefront-preview';

/** Studio and full-window preview (spec 2026-10-08-store-built-in-account-pages): the account pages behave like a store's,
 * with a demo shopper and two demo orders, and nothing is created or sent. */
let signedIn = false;
const DEMO_NAME = 'Cliente de prueba';
const NOTHING_SENT = 'Vista previa · No se crean cuentas';
const DEMO_ORDERS = [
  { id: 'demo-1', status: 'DELIVERED', amount: 8500, currency: 'BOB', createdAt: '2026-09-28T15:00:00Z', items: [{ name: 'Producto de muestra', quantity: 1 }] },
  { id: 'demo-2', status: 'PAID', amount: 15900, currency: 'BOB', createdAt: '2026-10-05T18:30:00Z', items: [{ name: 'Otro producto', quantity: 2 }] },
];

export const demoAccountHandler: AccountBridgeHandler = async (action, body) => {
  switch (action) {
    case 'state': return { ok: true, body: signedIn ? { signedIn: true, name: DEMO_NAME } : { signedIn: false } };
    case 'login': signedIn = true; return { ok: true, body: { signedIn: true, name: DEMO_NAME } };
    case 'logout': case 'delete': signedIn = false; return { ok: true, body: { signedIn: false } };
    case 'orders': return { ok: true, body: DEMO_ORDERS };
    case 'subscriptions': return { ok: true, body: [] };
    case 'me': return { ok: true, body: { name: DEMO_NAME, email: 'cliente@ejemplo.bo', phone: '', addresses: [] } };
    case 'addresses': case 'update-me': return { ok: true, body: { ...body, message: 'Vista previa · No se guardan cambios' } };
    default: return { ok: true, body: { message: NOTHING_SENT } };
  }
};

export const mountSourceAccountDemo = (frame: HTMLIFrameElement) => mountSourceAccountBridge(frame, demoAccountHandler);
