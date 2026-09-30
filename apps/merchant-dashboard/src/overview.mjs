// Resumen: the greeting, the row of key figures and the setup checklist.
// Pure functions over the balance/finance/KYC responses; dashboard.js only
// places the returned markup.
import { escapeHtml as esc } from "./html.mjs";

const KYC_LABELS = {
  APPROVED: "Aprobado",
  PENDING_REVIEW: "En revisión",
  REJECTED: "Rechazado",
  NOT_SUBMITTED: "Pendiente de envío",
  NOT_CONFIGURED: "Sin configurar",
  CONFIGURED: "Configurado",
};

export function kycStatusLabel(status) {
  return KYC_LABELS[status] || status;
}

// Merchants read the day in Bolivian time wherever their browser is.
export function greetingFor(date, name) {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/La_Paz" }).format(date));
  const greeting = hour >= 5 && hour < 12 ? "Buenos días" : hour >= 12 && hour < 19 ? "Buenas tardes" : "Buenas noches";
  const trimmed = String(name || "").trim();
  return trimmed ? `${greeting}, ${trimmed}` : greeting;
}

// The balance lives in the "Tu cuenta" card beside the checklist, not here.
export function overviewKpis({ finances, money }) {
  const monthToDate = Number(finances?.monthlyProjection?.monthToDateRevenue) || 0;
  return [
    { label: "Ventas este mes", value: money(monthToDate), hint: "Pagos exitosos desde el día 1" },
    { label: "Ventas totales", value: money(Number(finances?.totalRevenue) || 0), hint: "Desde que empezaste" },
    { label: "Pagos exitosos", value: String(Number(finances?.paymentCount) || 0), hint: "Desde que empezaste" },
    { label: "Visitas a la tienda", value: String(Number(finances?.totalStoreViews) || 0), hint: "Sin contar tus vistas" },
  ];
}

export function renderOverviewKpis(kpis) {
  return kpis.map((kpi) => `<div class="overview-kpi">
    <dt>${esc(kpi.label)}</dt>
    <dd>${esc(kpi.value)}</dd>
    ${kpi.hint ? `<p>${esc(kpi.hint)}</p>` : ""}
  </div>`).join("");
}

export function setupSteps({ kycStatus, invoicingConfigured, storePublished, paymentCount, paymentStore }) {
  const steps = [];
  if (paymentStore) {
    steps.push({ id: "kyc", label: "Verifica tu negocio", done: kycStatus === "APPROVED", view: "compliance" });
    steps.push({ id: "invoicing", label: "Configura la facturación (SIN)", done: !!invoicingConfigured, view: "compliance" });
  }
  steps.push({ id: "publish", label: "Publica tu tienda", done: !!storePublished, view: "workspace" });
  steps.push({ id: "first-payment", label: "Recibe tu primer pago", done: Number(paymentCount) > 0, view: "charge-links" });
  return steps;
}

export function renderSetupSteps(steps) {
  const done = steps.filter((step) => step.done).length;
  if (done === steps.length) return "";
  const percent = Math.round((done / steps.length) * 100);
  const check = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>`;
  const arrow = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
  return `<div class="overview-setup-head">
      <h2 id="overviewSetupTitle">Primeros pasos</h2>
      <span>${done} de ${steps.length}</span>
    </div>
    <div class="overview-setup-track" role="progressbar" aria-labelledby="overviewSetupTitle" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>
    <ol class="overview-setup-list">
      ${steps.map((step) => step.done
        ? `<li class="is-done"><span class="overview-setup-mark">${check}</span><span>${esc(step.label)}</span></li>`
        : `<li><a href="#dashboard-${esc(step.view)}" data-dashboard-view="${esc(step.view)}"><span class="overview-setup-mark"></span><span>${esc(step.label)}</span>${arrow}</a></li>`).join("")}
    </ol>`;
}
