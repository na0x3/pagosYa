/** The store runtime ↔ trusted parent account bridge (spec 2026-10-08-store-built-in-account-pages-design). */
export const ACCOUNT_ACTIONS = ['state', 'login', 'register', 'verify', 'forgot', 'reset', 'me', 'update-me', 'orders', 'subscriptions', 'addresses', 'export', 'delete', 'logout'] as const;
export type AccountAction = (typeof ACCOUNT_ACTIONS)[number];
export type AccountGateView = 'login' | 'register' | 'forgot-password' | 'reset-password' | 'orders' | 'addresses' | 'profile' | 'subscriptions';
export const ACCOUNT_VIEW_PAGES: Record<AccountGateView, string> = {
  login: 'acceso-ingresar.html', register: 'acceso-registro.html', 'forgot-password': 'acceso-olvide-mi-contrasena.html',
  'reset-password': 'acceso-restablecer-contrasena.html', orders: 'cuenta-pedidos.html', addresses: 'cuenta-direcciones.html',
  profile: 'cuenta-perfil.html', subscriptions: 'cuenta-suscripciones.html',
};
/** The field of each action that carries a password, for the password guard. */
export const ACCOUNT_PASSWORD_FIELDS: Partial<Record<AccountAction, string>> = { login: 'password', register: 'password', reset: 'password', delete: 'password' };
const FIELDS: Record<AccountAction, readonly string[]> = {
  state: [], login: ['email', 'password'], register: ['name', 'email', 'password'], verify: [], forgot: ['email'], reset: ['password'],
  me: [], 'update-me': ['name', 'phone'], orders: [], subscriptions: [], addresses: [], export: [], delete: ['password'], logout: [],
};
const ADDRESS_FIELDS = ['id', 'label', 'recipient', 'phone', 'department', 'city', 'street', 'references'] as const;
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value.trim() : null;

/** Only the fields an action may carry, as strings; null for an unknown action or a malformed field. */
export function accountActionBody(action: AccountAction, body: unknown): Record<string, unknown> | null {
  if (!(ACCOUNT_ACTIONS as readonly string[]).includes(action)) return null;
  const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  for (const field of FIELDS[action]) {
    if (input[field] === undefined) continue;
    const value = text(input[field], field === 'password' ? 128 : 200);
    if (value === null) return null;
    // A password is passed as typed: trimming would change it.
    out[field] = field === 'password' ? input[field] : value;
  }
  if (action === 'addresses') {
    const list = Array.isArray(input.addresses) ? input.addresses.slice(0, 10) : [];
    out.addresses = list.map(address => Object.fromEntries(ADDRESS_FIELDS.flatMap(key => { const value = text((address as Record<string, unknown>)?.[key], 200); return value === null ? [] : [[key, value]]; })));
  }
  return out;
}
