import { escapeHtml as esc } from "./html.mjs";

/**
 * The dashboard's seven sections (spec 2026-10-21 Part A). A section is one sidebar link; its tabs are the pills under
 * the page title. A tab is a dashboard view, or a Correos y marketing tab on the `marketing` view. Full-nav-only
 * sections and tabs show only when the dashboard runs with DASHBOARD_FULL_NAV=1 (`<html data-full-nav>`).
 */
export const NAV_SECTIONS = [
  { id: "inicio", label: "Inicio", description: "Tus ventas y lo que sigue, de un vistazo.",
    tabs: [{ view: "overview", label: "Resumen" }, { view: "growth", label: "Crecimiento" }] },
  { id: "tienda", label: "Tienda", description: "Diseña con YAPI y cuida tu catálogo.",
    tabs: [{ view: "products", label: "Productos" }, { view: "workspace", label: "Diseño" }, { view: "media", label: "Medios" }, { view: "templates", label: "Plantillas" }, { view: "stores", label: "Tus tiendas" }] },
  { id: "pedidos", label: "Pedidos", description: "Lo que te compraron y lo que te escribieron.",
    tabs: [{ view: "payments", label: "Pedidos" }, { view: "inbox", label: "Mensajes" }] },
  { id: "cobrar", label: "Cobrar", description: "Un QR o un link para cobrar al instante.",
    tabs: [{ view: "charge-links", label: "Cobrar" }] },
  { id: "dinero", label: "Dinero", description: "Tu saldo, tus finanzas y cuándo te llega el dinero.",
    tabs: [{ view: "payouts", label: "Dinero" }] },
  { id: "clientes", label: "Clientes", description: "Correos, promociones y quienes vuelven a comprar.",
    tabs: [
      { view: "marketing", marketingTab: "emails", label: "Correos" },
      { view: "marketing", marketingTab: "campaigns", label: "Campañas" },
      { view: "marketing", marketingTab: "program", label: "Comeback" },
      { view: "marketing", marketingTab: "promotions", label: "Códigos" },
      { view: "marketing", marketingTab: "customers", label: "Tus clientes" },
      { view: "abandoned-carts", label: "Carritos" },
      { view: "subscriptions", label: "Suscripciones" },
      { view: "assistant", label: "Asistente" },
      { view: "marketing", marketingTab: "logs", label: "Registros", fullNavOnly: true },
    ] },
  { id: "ajustes", label: "Ajustes", description: "Tu tienda, tu cuenta y tus conexiones.", alsoViews: ["account"],
    tabs: [
      { view: "store-settings", label: "Tu tienda" },
      { view: "compliance", label: "Cuenta y facturación" },
      { view: "marketing", marketingTab: "staff", label: "Equipo" },
      { view: "marketing", marketingTab: "domain", label: "Remitente" },
      { view: "connect-ai", label: "Conecta tu IA" },
      { view: "integrations", label: "Integraciones" },
      { view: "experiments", label: "Pruebas A/B" },
    ] },
  { id: "documentos", label: "Documentos", description: "Cobros, propuestas y contratos.", fullNavOnly: true,
    tabs: [{ view: "cobros", label: "Cobros" }, { view: "proposals", label: "Propuestas" }, { view: "contracts", label: "Contratos" }] },
];

export const KNOWN_VIEWS = new Set(NAV_SECTIONS.flatMap(s => [...s.tabs.map(t => t.view), ...(s.alsoViews || [])]));
const HIDDEN_VIEWS = new Set(NAV_SECTIONS.filter(s => s.fullNavOnly).flatMap(s => s.tabs.map(t => t.view)));
const CLIENTES = NAV_SECTIONS.find(s => s.id === "clientes");

export const tabKey = (tab) => tab.marketingTab ? `${tab.view}:${tab.marketingTab}` : tab.view;

export function sectionOf(view, marketingTab) {
  for (const section of NAV_SECTIONS) {
    const tab = section.tabs.find(t => t.view === view && (view !== "marketing" || t.marketingTab === marketingTab));
    if (tab) return { section, tab };
  }
  if (view === "marketing") return { section: CLIENTES, tab: CLIENTES.tabs[0] };
  const owner = NAV_SECTIONS.find(s => s.alsoViews?.includes(view));
  if (owner) return { section: owner, tab: null };
  return { section: NAV_SECTIONS[0], tab: NAV_SECTIONS[0].tabs[0] };
}

/** The tab a section's sidebar link opens: its first one. */
export function sectionEntry(id) {
  return NAV_SECTIONS.find(s => s.id === id)?.tabs[0] ?? null;
}

export function resolveView(view, fullNav) {
  if (!KNOWN_VIEWS.has(view)) return "overview";
  return HIDDEN_VIEWS.has(view) && !fullNav ? "overview" : view;
}

export function visibleTabs(section, { fullNav, hiddenViews = new Set() }) {
  return section.tabs.filter(t => (fullNav || !t.fullNavOnly) && !hiddenViews.has(t.view));
}

export function renderSectionTabs(section, activeTab, options) {
  const tabs = visibleTabs(section, options);
  if (tabs.length < 2) return "";
  const activeKey = activeTab ? tabKey(activeTab) : "";
  return tabs.map(t => `<button type="button" class="section-tab" data-section-view="${esc(t.view)}"${t.marketingTab ? ` data-section-marketing-tab="${esc(t.marketingTab)}"` : ""}${tabKey(t) === activeKey ? ' aria-current="page"' : ""}>${esc(t.label)}</button>`).join("");
}

export function fullNavOn(doc = globalThis.document) {
  return Boolean(doc?.documentElement?.hasAttribute("data-full-nav"));
}
