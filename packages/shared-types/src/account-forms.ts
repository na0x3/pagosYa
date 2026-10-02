/** Trusted account form markup shared with the offline, non-submitting agent preview. */
export type AccountFormContext = { slug: string; storeName: string; signedIn: boolean; preview?: boolean };
type Context = AccountFormContext;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]!));
const path = (slug: string, view: string) => `/cuenta/${encodeURIComponent(slug)}/${view}`;
const field = (label: string, name: string, type = 'text', extra = '') => `<label>${label}<span class="account__input"><input aria-label="${escapeHtml(label)}" id="account-${name}" name="${name}" type="${type}" ${extra}>${type === 'password' ? `<button class="account__reveal" type="button" data-password="${name}" aria-controls="account-${name}" aria-pressed="false" aria-label="Mostrar ${label.toLowerCase()}">Mostrar</button>` : ''}</span></label>`;
const shell = (context: Context, inner: string) => `<main class="account subscription-manage">${context.preview ? '<aside class="account__preview" role="note">Vista previa · No se crean cuentas ni se envían datos.</aside>' : ''}<header class="account__head"><a class="account__store" href="/s/${encodeURIComponent(context.slug)}">${escapeHtml(context.storeName)}</a></header>${inner}<p data-status role="status" aria-live="polite"></p></main>`;
export const loginHtml = (context: Context, note = "") => shell(context, `<h1>Ingresa a tu cuenta</h1>${note ? `<p>${escapeHtml(note)}</p>` : ""}
  <form data-form="login" class="card" novalidate>${field("Correo", "email", "email", 'autocomplete="email" required')}${field("Contraseña", "password", "password", 'autocomplete="current-password" required')}<button type="submit" class="primary">Ingresar</button></form>
  <p><a href="${escapeHtml(path(context.slug, "recuperar"))}">¿Olvidaste tu contraseña?</a> · <a href="${escapeHtml(path(context.slug, "registro"))}">Crear una cuenta</a></p>`);
export const registerHtml = (context: Context) => shell(context, `<h1>Crea tu cuenta</h1>
  <form data-form="register" class="card" novalidate>${field("Nombre", "name", "text", 'autocomplete="name" maxlength="100" required')}${field("Correo", "email", "email", 'autocomplete="email" required')}${field("Contraseña (8 caracteres o más)", "password", "password", 'autocomplete="new-password" minlength="8" maxlength="128" required')}<button type="submit" class="primary">Crear cuenta</button></form>
  <p><a href="${escapeHtml(path(context.slug, "ingresar"))}">Ya tengo una cuenta</a></p>`);
export const forgotHtml = (context: Context) => shell(context, `<h1>Recupera tu contraseña</h1><p>Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.</p>
  <form data-form="forgot" class="card" novalidate>${field("Correo", "email", "email", 'autocomplete="email" required')}<button type="submit" class="primary">Enviar enlace</button></form>
  <p><a href="${escapeHtml(path(context.slug, "ingresar"))}">Volver a ingresar</a></p>`);
export const resetHtml = (context: Context) => shell(context, `<h1>Elige una contraseña nueva</h1>
  <form data-form="reset" class="card" novalidate>${field("Contraseña nueva", "password", "password", 'autocomplete="new-password" minlength="8" maxlength="128" required')}${field("Repite la contraseña", "confirm", "password", 'autocomplete="new-password" required')}<button type="submit" class="primary">Guardar contraseña</button></form>`);

export const accountFormStyles = `
.account-embedded{margin:0;padding:0;background:var(--account-background,#faf9f6);color:var(--account-foreground,#171717);font-family:var(--account-body-font,system-ui,sans-serif)}
.account-page.account-embedded #app{width:100%;max-width:none;margin:0;padding:0;min-height:0;background:transparent;border:0;border-radius:0;box-shadow:none}
.account-page.account-embedded .account{box-sizing:border-box;max-width:460px;min-height:0;margin:0 auto;padding:12px 12px 24px;background:transparent;color:inherit;border:0;border-radius:0;box-shadow:none}
.account-page.account-embedded .account__store{display:none}
.account-page.account-embedded .account__head:has(.account__nav){margin-bottom:24px}
.account-page.account-embedded .account h1{font-family:var(--account-heading-font,inherit);font-weight:400;font-size:clamp(30px,5vw,42px);line-height:1.15;text-align:center;margin:0 0 28px;color:inherit}
.account-page.account-embedded .account .card{display:grid;gap:20px;padding:0;margin:0;border:0;box-shadow:none;border-radius:0;background:transparent;color:inherit}
.account-page.account-embedded .account label{display:grid;gap:8px;font:inherit;font-size:14px;font-weight:600;color:inherit}
.account-page.account-embedded .account input{box-sizing:border-box;width:100%;min-height:48px;padding:12px;border:1px solid currentColor;border-radius:var(--account-radius,4px);font:inherit;font-size:16px;color:inherit;background:transparent}
.account-page.account-embedded .account .primary{display:flex;align-items:center;justify-content:center;min-height:48px;padding:12px 20px;border:1px solid transparent;border-radius:var(--account-radius,4px);background:var(--account-accent,#171717);color:var(--account-accent-foreground,#fff);font:inherit;font-weight:700;cursor:pointer}
.account-page.account-embedded .account p{line-height:1.6;font-size:14px;margin:20px 0 0;text-align:center;color:inherit}
.account-page.account-embedded .account a{color:inherit;text-decoration:underline;text-underline-offset:3px}
.account-page.account-embedded .account :focus-visible{outline:3px solid var(--account-accent,#171717);outline-offset:3px}

.account__preview{padding:10px 14px;margin:0 0 24px;border:1px dashed currentColor;border-radius:8px;font-size:12px;line-height:1.5;text-align:center;opacity:.8}
.account__input{position:relative;display:block}.account__input:has(.account__reveal) input{padding-right:84px!important}
.account__reveal{position:absolute;right:6px;top:50%;transform:translateY(-50%);min-height:40px;padding:6px 10px;font:inherit;font-size:12px;border:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer}
.account__reveal:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
.account [aria-busy=true]{opacity:.7}.account button:disabled{cursor:wait}.account [data-status]:empty{display:none}
.account__nav{display:flex;flex-wrap:wrap;gap:12px}.account input:focus-visible{outline-offset:3px}
`;

/** Explicit signed-in demo states. No session or customer record is read to produce them. */
export function accountPreviewHtml(context: AccountFormContext, view: string): string {
  context = { ...context, preview: true };
  if (view === 'ingresar') return loginHtml(context);
  if (view === 'registro') return registerHtml(context);
  if (view === 'recuperar') return forgotHtml(context);
  if (view === 'restablecer') return resetHtml(context);
  const labels: Record<string,string> = { pedidos:'Mis pedidos', suscripciones:'Mis suscripciones', direcciones:'Mis direcciones', perfil:'Mi perfil' };
  const nav = `<nav class="account__nav" aria-label="Mi cuenta">${Object.entries(labels).map(([key,label])=>`<a href="${escapeHtml(path(context.slug,key))}"${key===view?' aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  let inner = '';
  if (view === 'perfil') inner = `<form class="card" data-form="profile" novalidate><p>cliente@example.invalid · Datos de ejemplo</p>${field('Nombre','name','text','value="Cliente de ejemplo" required')}${field('Teléfono (con código de país)','phone','tel','autocomplete="tel"')}<button type="submit" class="primary">Guardar</button></form>`;
  else if (view === 'direcciones') inner = `<p>Aún no guardaste direcciones.</p><form class="card" data-form="address" novalidate><h2>Agregar una dirección</h2>${[['Nombre de la dirección','label'],['Quién recibe','recipient'],['Teléfono','phone'],['Departamento','department'],['Ciudad','city'],['Calle y número','street'],['Referencias','references']].map(([label,name])=>field(label,name,name==='phone'?'tel':'text',name==='references'?'':'required')).join('')}<button type="submit" class="primary">Guardar dirección</button></form>`;
  else inner = `<p>${view==='suscripciones'?'Aún no tienes suscripciones en esta tienda.':'Aún no tienes pedidos en esta tienda.'}</p>`;
  return shell(context, `${nav}<h1>${labels[view] || 'Mi cuenta'}</h1>${inner}`);
}
