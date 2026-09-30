/** A shopper's account in one store (spec 2026-09-30-store-customer-accounts-design), served by the checkout app so a
 * password or personal data never enters the sandboxed store, where authored code runs. Routes: /cuenta/<slug>[/<view>]. */
import { fetchStore } from "../api";
import { markPrivateStorePage } from "../store-seo";
import { app } from "../ui/app";
import { escapeHtml, formatAmount } from "../ui/html";
import { accountApi, AccountError, type CustomerAddress, type CustomerOrder, type CustomerProfile, type CustomerSubscription } from "./account-api";
import { clearSession, readSession, saveSession } from "./account-session";

export const ACCOUNT_VIEWS = ["ingresar", "registro", "recuperar", "restablecer", "verificar", "pedidos", "suscripciones", "direcciones", "perfil"] as const;
export type AccountView = (typeof ACCOUNT_VIEWS)[number];
const SIGNED_IN_VIEWS: readonly AccountView[] = ["pedidos", "suscripciones", "direcciones", "perfil"];
const NAV_LABEL: Record<string, string> = { pedidos: "Mis pedidos", suscripciones: "Suscripciones", direcciones: "Direcciones", perfil: "Mi perfil" };
const ORDER_STATUS: Record<string, string> = { AWAITING_PAYMENT: "Esperando pago", PAID: "Pagado", PREPARING: "Preparando", READY_FOR_PICKUP: "Listo para retirar", SHIPPED: "Enviado", DELIVERED: "Entregado", CANCELED: "Cancelado", REFUNDED: "Reembolsado" };
const SUBSCRIPTION_STATUS: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", CANCELED: "Cancelada" };
const CADENCE: Record<string, string> = { WEEKLY: "cada semana", BIWEEKLY: "cada dos semanas", MONTHLY: "cada mes" };

export function accountRoute(pathname: string): { slug: string; view: AccountView } | null {
  const match = /^\/cuenta\/([^/]+)(?:\/([a-z]+))?\/?$/.exec(pathname);
  if (!match) return null;
  let slug: string;
  try { slug = decodeURIComponent(match[1]); } catch { return null; }
  const view = (match[2] ?? "ingresar") as AccountView;
  return (ACCOUNT_VIEWS as readonly string[]).includes(view) ? { slug, view } : null;
}

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("es-BO", { day: "numeric", month: "long", year: "numeric" }) : "");
const path = (slug: string, view: AccountView) => `/cuenta/${encodeURIComponent(slug)}/${view}`;
const field = (label: string, name: string, type = "text", extra = "") => `<label>${label}<input name="${name}" type="${type}" ${extra}></label>`;

type Context = { slug: string; storeName: string; signedIn: boolean };

function shell(context: Context, inner: string): string {
  const nav = context.signedIn
    ? `<nav class="account__nav" aria-label="Mi cuenta">${SIGNED_IN_VIEWS.map(view => `<a href="${escapeHtml(path(context.slug, view))}">${NAV_LABEL[view]}</a>`).join("")}<button type="button" class="quiet" data-logout>Salir</button></nav>`
    : "";
  return `<main class="account subscription-manage"><header class="account__head"><a class="account__store" href="/s/${encodeURIComponent(context.slug)}">${escapeHtml(context.storeName)}</a>${nav}</header>${inner}<p data-status role="status"></p></main>`;
}

const loginHtml = (context: Context, note = "") => shell(context, `<h1>Ingresa a tu cuenta</h1>${note ? `<p>${escapeHtml(note)}</p>` : ""}
  <form data-form="login" class="card" novalidate>${field("Correo", "email", "email", 'autocomplete="email" required')}${field("Contraseña", "password", "password", 'autocomplete="current-password" required')}<button type="submit" class="primary">Ingresar</button></form>
  <p><a href="${escapeHtml(path(context.slug, "recuperar"))}">¿Olvidaste tu contraseña?</a> · <a href="${escapeHtml(path(context.slug, "registro"))}">Crear una cuenta</a></p>`);
const registerHtml = (context: Context) => shell(context, `<h1>Crea tu cuenta</h1>
  <form data-form="register" class="card" novalidate>${field("Nombre", "name", "text", 'autocomplete="name" maxlength="100" required')}${field("Correo", "email", "email", 'autocomplete="email" required')}${field("Contraseña (8 caracteres o más)", "password", "password", 'autocomplete="new-password" minlength="8" maxlength="128" required')}<button type="submit" class="primary">Crear cuenta</button></form>
  <p><a href="${escapeHtml(path(context.slug, "ingresar"))}">Ya tengo una cuenta</a></p>`);
const forgotHtml = (context: Context) => shell(context, `<h1>Recupera tu contraseña</h1><p>Escribe tu correo y te enviamos un enlace para elegir una contraseña nueva.</p>
  <form data-form="forgot" class="card" novalidate>${field("Correo", "email", "email", 'autocomplete="email" required')}<button type="submit" class="primary">Enviar enlace</button></form>
  <p><a href="${escapeHtml(path(context.slug, "ingresar"))}">Volver a ingresar</a></p>`);
const resetHtml = (context: Context) => shell(context, `<h1>Elige una contraseña nueva</h1>
  <form data-form="reset" class="card" novalidate>${field("Contraseña nueva", "password", "password", 'autocomplete="new-password" minlength="8" maxlength="128" required')}${field("Repite la contraseña", "confirm", "password", 'autocomplete="new-password" required')}<button type="submit" class="primary">Guardar contraseña</button></form>`);
const invalidLinkHtml = (context: Context) => shell(context, `<h1>Enlace no válido</h1><p role="alert">Este enlace no es válido o ya expiró.</p><p><a href="${escapeHtml(path(context.slug, "recuperar"))}">Pedir un enlace nuevo</a></p>`);

function orderItems(items: unknown): string {
  if (!Array.isArray(items)) return "";
  return items.slice(0, 20).map(item => `${escapeHtml(String((item as any)?.name ?? "Producto"))} × ${escapeHtml(String(Number((item as any)?.quantity) || 1))}`).join(", ");
}
const ordersHtml = (context: Context, orders: CustomerOrder[]) => shell(context, `<h1>Mis pedidos</h1>${orders.length
  ? `<ul class="account__list">${orders.map(order => `<li class="card"><strong>Pedido #${escapeHtml(order.id.slice(-6).toUpperCase())}</strong> · ${escapeHtml(day(order.createdAt))} · <span class="badge">${escapeHtml(ORDER_STATUS[order.status] ?? order.status)}</span><p>${orderItems(order.items)}</p><p><strong>${escapeHtml(formatAmount(order.amount, order.currency))}</strong></p></li>`).join("")}</ul>`
  : "<p>Aún no tienes pedidos en esta tienda.</p>"}`);
const subscriptionsHtml = (context: Context, rows: CustomerSubscription[]) => shell(context, `<h1>Mis suscripciones</h1>${rows.length
  ? `<ul class="account__list">${rows.map(row => `<li class="card"><strong>${escapeHtml(row.itemName ?? "Suscripción")}</strong> · <span class="badge">${escapeHtml(SUBSCRIPTION_STATUS[row.status] ?? row.status)}</span><p>${escapeHtml(CADENCE[row.cadence ?? ""] ?? "")}${row.nextBillingAt && row.status === "ACTIVE" ? ` · próxima entrega ${escapeHtml(day(row.nextBillingAt))}` : ""}</p></li>`).join("")}</ul><p class="faint">Para pausar, saltar o cancelar usa el enlace del último correo de tu suscripción.</p>`
  : "<p>Aún no tienes suscripciones en esta tienda.</p>"}`);
const profileHtml = (context: Context, me: CustomerProfile) => shell(context, `<h1>Mi perfil</h1>
  <form data-form="profile" class="card" novalidate><p>${escapeHtml(me.email)}</p>${field("Nombre", "name", "text", `maxlength="100" value="${escapeHtml(me.name)}" required`)}${field("Teléfono (con código de país)", "phone", "tel", `autocomplete="tel" value="${escapeHtml(me.phone ?? "")}"`)}<button type="submit" class="primary">Guardar</button></form>
  <section class="card"><h2>Tus datos</h2><p>Descarga todo lo que guardamos sobre ti en esta tienda.</p><button type="button" data-export>Descargar mis datos</button></section>
  <section class="card"><h2>Eliminar mi cuenta</h2><p>Borramos tu nombre, teléfono y direcciones, y cerramos tus sesiones. Tu historial de pedidos queda con la tienda.</p>
  <form data-form="delete" novalidate>${field("Tu contraseña", "password", "password", 'autocomplete="current-password" required')}<button type="submit" class="quiet">Eliminar mi cuenta</button></form></section>`);
const addressesHtml = (context: Context, list: CustomerAddress[]) => shell(context, `<h1>Mis direcciones</h1>${list.length
  ? `<ul class="account__list">${list.map(address => `<li class="card"><strong>${escapeHtml(address.label)}</strong><p>${escapeHtml(address.recipient)} · ${escapeHtml(address.phone)}<br>${escapeHtml(address.street)}, ${escapeHtml(address.city)}, ${escapeHtml(address.department)}${address.references ? `<br>${escapeHtml(address.references)}` : ""}</p><button type="button" class="quiet" data-remove-address="${escapeHtml(address.id)}">Quitar</button></li>`).join("")}</ul>`
  : "<p>Aún no guardaste direcciones.</p>"}
  ${list.length >= 10 ? "<p>Llegaste al máximo de 10 direcciones.</p>" : `<form data-form="address" class="card" novalidate><h2>Agregar una dirección</h2>${field("Nombre de la dirección (Casa, Oficina…)", "label", "text", 'maxlength="40" required')}${field("Quién recibe", "recipient", "text", 'maxlength="100" required')}${field("Teléfono", "phone", "tel", 'maxlength="30" required')}${field("Departamento", "department", "text", 'maxlength="60" required')}${field("Ciudad", "city", "text", 'maxlength="60" required')}${field("Calle y número", "street", "text", 'maxlength="200" required')}${field("Referencias", "references", "text", 'maxlength="300"')}<button type="submit" class="primary">Guardar dirección</button></form>`}`);

let state = { slug: "", view: "ingresar" as AccountView, storeName: "", addresses: [] as CustomerAddress[], resetToken: "" };
const bound = new WeakSet<HTMLElement>();

/** Takes a one-time token out of the address bar before anything else can read it from the URL. */
function takeToken(): string {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  if (params.has("token")) { params.delete("token"); const rest = params.toString(); window.history.replaceState({}, "", `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`); }
  return token;
}

function say(text: string, error = false) {
  const line = app.querySelector<HTMLElement>("[data-status]");
  if (!line) return;
  line.textContent = text;
  line.setAttribute("role", error ? "alert" : "status");
}
const messageOf = (error: unknown) => (error instanceof Error ? error.message : "No pudimos completar la operación.");

async function go(view: AccountView) {
  window.history.pushState({}, "", path(state.slug, view));
  await show(view);
}

async function show(view: AccountView): Promise<void> {
  state.view = view;
  const slug = state.slug;
  const token = readSession(slug);
  const context: Context = { slug, storeName: state.storeName, signedIn: Boolean(token) };
  document.title = `Mi cuenta — ${state.storeName}`;
  if (view === "ingresar") { if (token) { await go("pedidos"); return; } app.innerHTML = loginHtml(context); return; }
  if (view === "registro") { app.innerHTML = registerHtml(context); return; }
  if (view === "recuperar") { app.innerHTML = forgotHtml(context); return; }
  if (view === "restablecer") { state.resetToken = takeToken() || state.resetToken; app.innerHTML = state.resetToken ? resetHtml(context) : invalidLinkHtml(context); return; }
  if (view === "verificar") {
    const link = takeToken();
    app.innerHTML = shell(context, "<h1>Confirmando tu correo…</h1>");
    if (!link) { app.innerHTML = invalidLinkHtml(context); return; }
    try { await accountApi.verifyEmail(slug, link); app.innerHTML = shell(context, `<h1>Correo confirmado</h1><p>Correo confirmado. Ya puedes ingresar.</p><p><a class="primary" href="${escapeHtml(path(slug, "ingresar"))}">Ingresar</a></p>`); }
    catch (error) { app.innerHTML = shell(context, `<h1>No pudimos confirmar tu correo</h1><p role="alert">${escapeHtml(messageOf(error))}</p><p><a href="${escapeHtml(path(slug, "registro"))}">Crear la cuenta de nuevo</a></p>`); }
    return;
  }
  if (!token) { app.innerHTML = loginHtml(context, "Ingresa para ver tu cuenta."); return; }
  app.innerHTML = shell(context, "<p role=\"status\">Cargando…</p>");
  try {
    if (view === "pedidos") app.innerHTML = ordersHtml(context, await accountApi.orders(slug, token));
    else if (view === "suscripciones") app.innerHTML = subscriptionsHtml(context, await accountApi.subscriptions(slug, token));
    else if (view === "direcciones") { const me = await accountApi.me(slug, token); state.addresses = me.addresses; app.innerHTML = addressesHtml(context, me.addresses); }
    else app.innerHTML = profileHtml(context, await accountApi.me(slug, token));
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) { clearSession(slug); app.innerHTML = loginHtml({ ...context, signedIn: false }, "Tu sesión terminó. Ingresa de nuevo."); return; }
    app.innerHTML = shell(context, `<p role="alert">${escapeHtml(messageOf(error))}</p><button type="button" data-retry>Reintentar</button>`);
  }
}

async function onSubmit(event: Event) {
  const form = (event.target as HTMLElement).closest<HTMLFormElement>("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const name = form.dataset.form;
  const value = (key: string) => (form.elements.namedItem(key) as HTMLInputElement | null)?.value ?? "";
  const slug = state.slug, token = readSession(slug);
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  say("");
  try {
    if (name === "reset" && value("password") !== value("confirm")) { say("Las contraseñas no coinciden.", true); return; }
    if (name === "delete" && !value("password")) { say("Escribe tu contraseña para eliminar la cuenta.", true); return; }
    if (button) button.disabled = true;
    if (name === "login") {
      const session = await accountApi.login(slug, { email: value("email"), password: value("password") });
      saveSession(slug, session);
      await go("pedidos");
    } else if (name === "register") {
      const answer = await accountApi.register(slug, { name: value("name"), email: value("email"), password: value("password") });
      form.reset(); say(answer.message);
    } else if (name === "forgot") {
      const answer = await accountApi.forgotPassword(slug, value("email"));
      say(answer.message);
    } else if (name === "reset") {
      await accountApi.resetPassword(slug, { token: state.resetToken, password: value("password") });
      state.resetToken = ""; clearSession(slug);
      app.innerHTML = shell({ slug, storeName: state.storeName, signedIn: false }, `<h1>Listo</h1><p>Listo: ya tienes tu contraseña nueva. Ingresa con ella.</p><p><a class="primary" href="${escapeHtml(path(slug, "ingresar"))}">Ingresar</a></p>`);
    } else if (token && name === "profile") {
      await accountApi.updateProfile(slug, token, { name: value("name"), phone: value("phone") });
      say("Guardado.");
    } else if (token && name === "address") {
      const address = Object.fromEntries(["label", "recipient", "phone", "department", "city", "street", "references"].map(key => [key, value(key)]));
      state.addresses = await accountApi.replaceAddresses(slug, token, [...state.addresses, address]);
      await show("direcciones");
    } else if (token && name === "delete") {
      await accountApi.deleteAccount(slug, token, value("password"));
      clearSession(slug);
      app.innerHTML = loginHtml({ slug, storeName: state.storeName, signedIn: false }, "Tu cuenta fue eliminada.");
    }
  } catch (error) {
    if (error instanceof AccountError && error.status === 401 && token && name !== "delete") { clearSession(slug); await show(state.view); return; }
    say(messageOf(error), true);
  } finally { if (button && button.isConnected) button.disabled = false; }
}

async function onClick(event: Event) {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-logout], [data-remove-address], [data-export], [data-retry]");
  if (!target) return;
  const slug = state.slug, token = readSession(slug);
  if (target.hasAttribute("data-retry")) { await show(state.view); return; }
  if (target.hasAttribute("data-logout")) {
    if (token) await accountApi.logout(slug, token).catch(() => undefined);
    clearSession(slug);
    await show("ingresar");
    return;
  }
  if (!token) return;
  try {
    if (target.hasAttribute("data-remove-address")) {
      state.addresses = await accountApi.replaceAddresses(slug, token, state.addresses.filter(address => address.id !== target.dataset.removeAddress));
      await show("direcciones");
    } else if (target.hasAttribute("data-export")) {
      const data = await accountApi.exportData(slug, token);
      const link = document.createElement("a");
      link.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      link.download = `mis-datos-${slug}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    }
  } catch (error) { say(messageOf(error), true); }
}

export async function renderAccount(slug: string, view: AccountView): Promise<void> {
  document.body.classList.remove("store-page", "product-detail-page", "payment-page", "payment-success-page", "debt-collection-page", "subscription-manage-page");
  document.body.classList.add("account-page");
  markPrivateStorePage();
  const store = await fetchStore(slug).catch(() => null);
  state = { ...state, slug, storeName: store?.storeName || slug, addresses: [], resetToken: slug === state.slug ? state.resetToken : "" };
  if (!bound.has(app)) { bound.add(app); app.addEventListener("submit", onSubmit); app.addEventListener("click", onClick); }
  await show(view);
}
