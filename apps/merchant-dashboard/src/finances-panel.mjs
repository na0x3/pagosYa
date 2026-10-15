import { escapeHtml as esc } from "./html.mjs";
import { nextLevelSentence, nextPayoutLabel, releaseDateLabel, settlementPolicySentence } from "./settlement.mjs";

/**
 * Finanzas: balances, settlement, international payments, payouts and the finance charts (moved from dashboard.js
 * 2026-10-15, no behaviour change). create…() only looks things up. init() is empty: this screen attaches nothing at
 * load; it stays so every panel has the same shape.
 *
 * deps:
 *   api(path, options)             authenticated dashboard API call
 *   money(cents), moneyNumber(n)   format amounts, honouring the hide-money toggle
 *   renderOverview()               redraws Resumen once finances change
 *   storeId()                      the active store id, read at use time
 *   stores()                       the merchant's stores, read at use time
 *   setSettlement(schedule), setPayouts(payouts), setTotalFinances(finances), setFinances(finances)
 *                                  store the latest values in dashboard.js, which also reads them
 */
export function createFinancesPanel(deps) {
  const { api, money, moneyNumber, renderOverview } = deps;
  // One row per currency in the "Tu cuenta" list on Resumen. available/pending/reserve
  // come from the settlement split; older responses only carry payableBalance.
  function renderBalanceCards(balances) {
    document.getElementById("balanceCards").innerHTML = balances
      .map((entry) => {
        const currency = esc(entry.currency);
        const held = [
          entry.pending ? `En espera ${money(entry.pending, currency)}` : "",
          entry.reserve ? `Reserva ${money(entry.reserve, currency)}` : "",
        ].filter(Boolean).join(" · ");
        return `<div class="overview-balance" data-currency="${currency}">
          <dt>Saldo por desembolsar (${currency})</dt>
          <dd>${money(entry.available ?? entry.payableBalance, currency)}</dd>
          ${held ? `<p class="balance-held">${held}</p>` : ""}
          <p>${esc(nextPayoutLabel(entry.nextPayoutAt) || "Se transfiere a tu cuenta bancaria en el próximo desembolso.")}</p>
        </div>`;
      })
      .join("");
  }

  function renderSettlementPanel(schedule) {
    deps.setSettlement(schedule);
    const panel = document.getElementById("settlementPanel");
    panel.hidden = !schedule?.policy;
    if (panel.hidden) return;
    document.getElementById("settlementPolicy").textContent = settlementPolicySentence(schedule.policy);
    document.getElementById("settlementReleases").innerHTML = (schedule.releases || [])
      .map((r) => {
        const currency = esc(r.currency);
        const parts = [
          r.toAvailable ? `${money(r.toAvailable, currency)} pasan a disponible` : "",
          r.fromReserve ? `${money(r.fromReserve, currency)} vuelven de la reserva` : "",
        ].filter(Boolean).join(" · ");
        return `<li><strong>${esc(releaseDateLabel(r.date))}</strong> ${parts}</li>`;
      })
      .join("") || `<li class="muted">No tienes dinero en espera.</li>`;
    document.getElementById("settlementNextLevel").textContent = nextLevelSentence(schedule.nextLevel);
  }

  function renderInternationalCard(intl) {
    if (!intl) return "";
    const fee = `${(intl.feeBps / 100).toFixed(1).replace(".", ",")}%`;
    const states = {
      OFF: `<p>Recibe pagos de compradores fuera de Bolivia con tarjeta y métodos locales. Se cobra en USD con una comisión de ${fee}.</p>
            <button type="button" class="primary" data-intl-request ${intl.settlementMode !== "AGGREGATOR" ? "disabled" : ""}>Solicitar activación</button>
            ${intl.settlementMode !== "AGGREGATOR" ? '<p class="hint">Disponible solo cuando pagosYa liquida tus cobros.</p>' : ""}`,
      REQUESTED: `<p><strong>Solicitud en revisión.</strong> Te avisaremos cuando esté activo. Comisión: ${fee}.</p>`,
      ENABLED: `<p><strong>Activo.</strong> Comisión internacional: ${fee}.</p>`,
      REJECTED: `<p><strong>No aprobado.</strong> ${esc(intl.note || "")}</p><button type="button" data-intl-request>Volver a solicitar</button>`,
    };
    const usdHint = intl.status !== "OFF" && !intl.usdPayoutAccountOnFile
      ? '<p class="hint">Agrega una cuenta en USD en tus datos de verificación para recibir desembolsos en dólares.</p>'
      : "";
    return `<section class="panel" role="region" aria-label="Pagos internacionales"><h3>Pagos internacionales</h3>${states[intl.status] ?? ""}${usdHint}</section>`;
  }

  function renderPayoutRows(payouts) {
    deps.setPayouts(payouts);
    document.getElementById("downloadPayoutsPdf").disabled = payouts.length === 0;
    document.getElementById("payoutRows").innerHTML = payouts
      .map(
        (p) => `<tr>
          <td><code>${esc(p.id)}</code></td>
          <td>${money(p.amount)}</td>
          <td>${esc(maskBankAccount(p.bankAccount))}</td>
          <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
          <td>${p.paidOutAt ? esc(new Date(p.paidOutAt).toLocaleString()) : "—"}</td>
        </tr>`,
      )
      .join("") || `<tr><td colspan="5" class="muted">Todavía no hay desembolsos.</td></tr>`;
  }

  const PAYMENT_METHOD_META = {
    CARD: { label: "Tarjeta", color: "#818cf8" },
    QR: { label: "Código QR", color: "#34d399" },
    BANK_TRANSFER: { label: "Transferencia", color: "#ffbd59" },
    TIGO_MONEY: { label: "Tigo Money", color: "#c084fc" },
    UNSPECIFIED: { label: "Sin método", color: "#737373" },
  };

  function renderFinanceDonut(segments) {
    const donut = document.getElementById("financeDonut");
    const legend = document.getElementById("financeLegend");
    const total = segments.reduce((sum, segment) => sum + segment.amount, 0);
    document.getElementById("financeDonutTotal").textContent = moneyNumber(total);
    if (total <= 0) {
      donut.style.background = "conic-gradient(var(--pg-border) 0 100%)";
      donut.setAttribute("aria-label", "Todavía no hay ingresos para graficar");
      legend.innerHTML = `<div class="finance-legend-empty">El gráfico aparecerá cuando recibas tu primer pago.</div>`;
      return;
    }

    let offset = 0;
    const gradientStops = [];
    const accessibleParts = [];
    legend.innerHTML = segments
      .filter((segment) => segment.amount > 0)
      .map((segment) => {
        const meta = PAYMENT_METHOD_META[segment.paymentMethodType] || { label: segment.paymentMethodType, color: "#f87171" };
        const start = offset;
        offset += (segment.amount / total) * 100;
        gradientStops.push(`${meta.color} ${start.toFixed(2)}% ${offset.toFixed(2)}%`);
        const percent = Math.round((segment.amount / total) * 100);
        accessibleParts.push(`${meta.label}: ${percent}%`);
        return `<div class="finance-legend-row">
          <span class="finance-legend-swatch" style="--legend-color:${meta.color}"></span>
          <span>${esc(meta.label)} · ${percent}%</span>
          <strong>${money(segment.amount)}</strong>
        </div>`;
      })
      .join("");
    donut.style.background = `conic-gradient(${gradientStops.join(",")})`;
    donut.setAttribute("aria-label", `Ingresos por medio de pago. ${accessibleParts.join(". ")}. Total ${money(total)}.`);
  }

  function renderTotalFinances(finances) {
    deps.setTotalFinances(finances);
    document.getElementById("financeAllRevenueValue").textContent = money(finances.totalRevenue);
    document.getElementById("financeAllPaymentCount").textContent = String(finances.paymentCount ?? 0);
    document.getElementById("financeDirectRevenueValue").textContent = money(finances.unattributedRevenue ?? 0);
    const directCount = finances.unattributedPaymentCount ?? 0;
    document.getElementById("financeDirectPaymentCount").textContent =
      directCount === 1 ? "1 pago sin tienda asignada" : `${directCount} pagos sin tienda asignada`;
  }

  function renderFinanceForecast(finances) {
    const projection = finances.monthlyProjection || {};
    const monthToDate = Number(projection.monthToDateRevenue) || 0;
    const projected = Number(projection.projectedRevenue) || 0;
    const elapsedDays = Number(projection.elapsedDays) || 0;
    const daysInMonth = Number(projection.daysInMonth) || 0;
    document.getElementById("financeProjectedRevenue").textContent = money(projected);
    document.getElementById("financeMonthToDateRevenue").textContent = `Acumulado: ${money(monthToDate)}`;
    document.getElementById("financeProjectionDays").textContent = elapsedDays && daysInMonth
      ? `Día ${elapsedDays} de ${daysInMonth}`
      : "Mes sin actividad";
    const progress = projected > 0 ? Math.max(0, Math.min(100, Math.round((monthToDate / projected) * 100))) : 0;
    document.getElementById("financeProjectionProgress").style.width = `${progress}%`;
    const track = document.getElementById("financeProjectionTrack");
    track.setAttribute("aria-valuenow", String(progress));
    track.setAttribute("aria-valuetext", `${progress}% del ingreso mensual proyectado`);
  }

  function renderSalesByWeekday(finances) {
    const rows = Array.isArray(finances.salesByWeekday) ? finances.salesByWeekday : [];
    const maximum = Math.max(...rows.map((row) => Number(row.paymentCount) || 0), 1);
    const best = finances.bestSalesDay;
    const bars = document.getElementById("financeWeekdayBars");
    document.getElementById("financeBestDay").textContent = best
      ? `${best.name} · ${best.paymentCount} ${best.paymentCount === 1 ? "venta" : "ventas"}`
      : "Todavía sin ventas";
    bars.innerHTML = rows.map((row) => {
      const count = Number(row.paymentCount) || 0;
      const height = count ? Math.max(14, Math.round((count / maximum) * 100)) : 6;
      const isBest = best?.weekday === row.weekday && count > 0;
      return `<div class="finance-weekday${isBest ? " is-best" : ""}" title="${esc(row.name)}: ${count} ${count === 1 ? "venta" : "ventas"}, ${esc(money(row.amount || 0))}">
        <div class="finance-weekday-column" style="--day-height:${height}%"></div>
        <strong>${esc(String(row.name || "").slice(0, 3))}</strong>
        <span>${count}</span>
      </div>`;
    }).join("");
    const description = rows.some((row) => row.paymentCount > 0)
      ? rows.map((row) => `${row.name}: ${row.paymentCount} ventas`).join(". ")
      : "Todavía no hay ventas para comparar por día";
    bars.setAttribute("aria-label", description);
  }

  function renderFinances(finances) {
    deps.setFinances(finances);
    renderOverview();
    const selectedStore = deps.stores().find((store) => store.id === deps.storeId());
    const storeName = finances.scope?.storeName || selectedStore?.name;
    const isStoreScope = finances.scope?.type === "STORE" && !!storeName;
    document.getElementById("financeScopeHeading").textContent = isStoreScope ? `Finanzas de ${storeName}` : "Finanzas de todo el negocio";
    document.getElementById("financeScopeLabel").textContent = isStoreScope ? storeName : "Toda la cuenta";
    document.getElementById("financeScopeDescription").textContent = isStoreScope
      ? "Las ventas, el inventario y las visitas corresponden únicamente a esta tienda."
      : "No hay una tienda seleccionada; se muestra el resumen completo del negocio.";
    document.getElementById("financeRevenueCaption").textContent = isStoreScope
      ? `Pagos exitosos de ${storeName}`
      : "Pagos exitosos de todo el negocio";
    document.getElementById("financeRevenueValue").textContent = money(finances.totalRevenue);
    document.getElementById("financeInventoryValue").textContent = money(finances.inventoryValue);
    document.getElementById("financeViewsValue").textContent = String(finances.totalStoreViews);
    document.getElementById("downloadFinancePdf").disabled = !(finances.paymentCount > 0);
    renderFinanceDonut(finances.revenueByPaymentMethod || []);
    renderFinanceForecast(finances);
    renderSalesByWeekday(finances);
    const topProductsEmptyEl = document.getElementById("topProductsEmpty");
    const topProductsTableEl = document.getElementById("topProductsTable");
    const productBarsEl = document.getElementById("financeProductBars");
    if (finances.topProducts.length === 0) {
      topProductsTableEl.style.display = "none";
      topProductsEmptyEl.style.display = "block";
      productBarsEl.innerHTML = "";
      return;
    }
    topProductsEmptyEl.style.display = "none";
    topProductsTableEl.style.display = "table";
    const maximumProductRevenue = Math.max(...finances.topProducts.map((product) => Number(product.revenue) || 0), 1);
    const productBarColors = ["#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#a78bfa"];
    productBarsEl.innerHTML = finances.topProducts.slice(0, 5).map((product, index) => {
      const percent = Math.max(18, Math.round(((Number(product.revenue) || 0) / maximumProductRevenue) * 100));
      return `<div class="finance-product-bar" style="--bar-height:${percent}%;--bar-color:${productBarColors[index % productBarColors.length]}" title="${esc(product.name)}: ${esc(money(product.revenue))}"><span>${esc(product.name)}</span></div>`;
    }).join("");
    document.getElementById("topProductsRows").innerHTML = finances.topProducts
      .map(
        (product, index) => `<tr>
          <td>${index + 1}</td>
          <td>${esc(product.name)}</td>
          <td>${product.quantity}</td>
          <td>${money(product.revenue)}</td>
        </tr>`,
      )
      .join("");
  }

  function refreshFinancesInBackground() {
    const storeId = deps.storeId();
    Promise.all([
      api("/merchants/finances"),
      storeId ? api(`/merchants/finances?storeId=${encodeURIComponent(storeId)}`) : api("/merchants/finances"),
    ]).then(([totalFinances, scopedFinances]) => {
      if (storeId !== deps.storeId()) return;
      renderTotalFinances(totalFinances);
      renderFinances(scopedFinances);
    }).catch(() => {
      // The product mutation already succeeded. Keep the last summary instead
      // of turning a non-critical refresh into a blocking error.
    });
  }

  // Shows only the last 4 digits — a payout row has no reason to repeat the
  // full account number on every line.
  function maskBankAccount(s) {
    const str = String(s ?? "");
    const digits = str.replace(/\D/g, "");
    if (digits.length <= 4) return str;
    return str.slice(0, -4).replace(/[0-9]/g, "•") + str.slice(-4);
  }

  function init() {

  }

  return { init, renderBalanceCards, renderSettlementPanel, renderInternationalCard, renderPayoutRows, renderTotalFinances, renderFinances, refreshFinancesInBackground };
}
