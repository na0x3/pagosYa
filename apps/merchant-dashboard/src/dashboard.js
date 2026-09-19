// Merchant dashboard behavior (moved verbatim from index.html). A classic script:
// it runs after src/store-editor/bootstrap.js resolves PagosYaStoreEditorReady.
  window.PagosYaStoreEditorReady.then((storeEditorStateModule) => {
  const DASHBOARD_THEME_KEY = "pagosya_dashboard_theme";
  const dashboardThemeButtons = [...document.querySelectorAll("[data-dashboard-theme-value]")];

  function setDashboardTheme(theme, remember = true) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.dashboardTheme = nextTheme;
    document.getElementById("dashboardThemeColor").content = nextTheme === "light" ? "#eee7dc" : "#0a0a0a";
    dashboardThemeButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.dashboardThemeValue === nextTheme));
    });
    document.getElementById("merchantStudioFrame")?.contentWindow?.postMessage({ type: "pagosya:workspace-theme", theme: nextTheme }, location.origin);
    if (remember) {
      try {
        localStorage.setItem(DASHBOARD_THEME_KEY, nextTheme);
      } catch {
        // The visual preference still applies for this visit when storage is unavailable.
      }
    }
  }

  dashboardThemeButtons.forEach((button) => {
    button.addEventListener("click", () => setDashboardTheme(button.dataset.dashboardThemeValue));
  });
  setDashboardTheme(document.documentElement.dataset.dashboardTheme, false);

  const ASSISTANT_POSITION_KEY = "pagosya_yapi_position";
  const ASSISTANT_HIDDEN_KEY = "pagosya_yapi_hidden";
  const ASSISTANT_FRAMES = {
    idle: "/assets/yapi-idle.png",
    fly: "/assets/yapi-fly.png",
    wave: "/assets/yapi-wave.png",
  };
  const assistantDockEl = document.getElementById("assistantDock");
  const assistantObjectEl = document.getElementById("assistantObject");
  const assistantObjectImageEl = document.getElementById("assistantObjectImage");
  const assistantHideEl = document.getElementById("assistantHide");
  const assistantRestoreEl = document.getElementById("assistantRestore");
  const assistantPanelEl = document.getElementById("assistantPanel");
  const assistantCloseEl = document.getElementById("assistantClose");
  const assistantAnswerEl = document.getElementById("assistantAnswer");
  const assistantQuestionEls = [...document.querySelectorAll("[data-assistant-question]")];
  const assistantTabs = [...document.querySelectorAll(".assistant-tab")];
  const assistantAlertsEl = document.getElementById("assistantAlerts");
  const assistantSetupPercentEl = document.getElementById("assistantSetupPercent");
  const assistantSetupSummaryEl = document.getElementById("assistantSetupSummary");
  const assistantSetupTrackEl = document.getElementById("assistantSetupTrack");
  const assistantSetupBarEl = document.getElementById("assistantSetupBar");
  const assistantSetupListEl = document.getElementById("assistantSetupList");
  const assistantGoalFormEl = document.getElementById("assistantGoalForm");
  const assistantGoalLabelEl = document.getElementById("assistantGoalLabel");
  const assistantGoalAmountEl = document.getElementById("assistantGoalAmount");
  const assistantGoalClearEl = document.getElementById("assistantGoalClear");
  const assistantGoalStatusEl = document.getElementById("assistantGoalStatus");
  const assistantGoalSummaryEl = document.getElementById("assistantGoalSummary");
  const assistantGoalPercentEl = document.getElementById("assistantGoalPercent");
  const assistantGoalTrackEl = document.getElementById("assistantGoalTrack");
  const assistantGoalBarEl = document.getElementById("assistantGoalBar");
  const assistantTabCountEl = document.getElementById("assistantTabCount");
  const assistantNotificationBadgeEl = document.getElementById("assistantNotificationBadge");
  const assistantNoteFormEl = document.getElementById("assistantNoteForm");
  const assistantNoteInputEl = document.getElementById("assistantNoteInput");
  const assistantNoteListEl = document.getElementById("assistantNoteList");
  const assistantChatFormEl = document.getElementById("assistantChatForm");
  const assistantChatInputEl = document.getElementById("assistantChatInput");
  const assistantChatLogEl = document.getElementById("assistantChatLog");
  const assistantSupportOpenEl = document.getElementById("assistantSupportOpen");
  const assistantSupportTabEl = document.getElementById("assistantSupportTab");
  const assistantSupportFormEl = document.getElementById("assistantSupportForm");
  const assistantSupportCategoryEl = document.getElementById("assistantSupportCategory");
  const assistantSupportSummaryEl = document.getElementById("assistantSupportSummary");
  const assistantSupportMessageEl = document.getElementById("assistantSupportMessage");
  const assistantSupportListEl = document.getElementById("assistantSupportList");
  const ASSISTANT_NOTES_KEY = "pagosya_yapi_notes";
  const ASSISTANT_CHAT_KEY = "pagosya_yapi_chat";
  let assistantStoreSnapshot = null;
  let assistantProductSnapshot = [];
  let assistantKycSnapshot = null;
  let assistantInvoicingSnapshot = null;
  let assistantFinancesSnapshot = null;
  let assistantComplianceReady = false;
  let assistantNotes = [];
  let assistantChat = [];
  let assistantSupportCases = [];
  let assistantAutoHiddenForAppearance = false;
  let assistantDragState = null;
  let suppressAssistantClick = false;
  let assistantWalkTimer = null;
  let assistantKeyboardWalkTimer = null;
  let assistantIdleTimer = null;
  let assistantWaveResetTimer = null;
  const assistantReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const assistantAnswers = {
    store: "Abre Mi tienda en el menú y crea tu tienda. Después podrás cargar productos, elegir la apariencia y publicar un enlace de pago para compartir.",
    payout: "Tus cobros disponibles aparecen en Resumen. Los comercios en modalidad AGGREGATOR reciben el saldo en el siguiente desembolso programado; revisa Desembolsos para ver el estado y la cuenta bancaria.",
    live: "Primero completa Cumplimiento y espera la aprobación de KYC. Las llaves live solo se solicitan desde el backend de tu integración: nunca pegues una llave secreta en este panel.",
    login: "Confirma tu correo antes de ingresar. Si olvidaste la contraseña, usa “¿Olvidaste tu contraseña?”; recibirás un enlace de recuperación que vence en una hora.",
  };

  function assistantEscape(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
  }

  function readAssistantStorage(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  function writeAssistantStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function activateAssistantTab(tabId, focus = false) {
    assistantTabs.forEach((tab) => {
      const active = tab.id === tabId;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      document.getElementById(tab.getAttribute("aria-controls")).hidden = !active;
      if (active && focus) tab.focus({ preventScroll: true });
    });
    requestAnimationFrame(positionAssistantPanel);
  }

  function assistantStoreImageCount(store, products) {
    if (!store) return 0;
    const urls = [store.logoUrl, store.bannerUrl, store.aboutImageUrl, store.promotionImageUrl];
    (store.heroSlides || []).forEach((slide) => urls.push(slide.imageUrl));
    (store.editorialGallery || []).forEach((image) => urls.push(image.imageUrl));
    products.forEach((product) => (product.imageUrls || []).forEach((url) => urls.push(url)));
    return new Set(urls.filter(Boolean)).size;
  }

  function assistantLowStockProducts(products) {
    return products.flatMap((product) => {
      const variants = (product.variants || []).filter((variant) => Number.isInteger(variant.stock) && variant.stock <= 5);
      if (variants.length) return variants.map((variant) => ({ name: `${product.name} · ${variant.name}`, stock: variant.stock }));
      return Number.isInteger(product.stock) && product.stock <= 5 ? [{ name: product.name, stock: product.stock }] : [];
    }).slice(0, 6);
  }

  function assistantInvoicingConfigured() {
    return Boolean(
      assistantInvoicingSnapshot?.nit &&
      assistantInvoicingSnapshot?.razonSocial &&
      assistantInvoicingSnapshot?.cuis,
    );
  }

  function assistantProductsWithFiscalMapping() {
    const activeProducts = assistantProductSnapshot.filter((product) => product.status === "ACTIVE");
    return activeProducts.filter((product) =>
      product.codigoProducto && product.actividadEconomica && product.codigoProductoSin && product.unidadMedida,
    ).length;
  }

  function assistantSetupSteps() {
    const activeProducts = assistantProductSnapshot.filter((product) => product.status === "ACTIVE");
    const mappedProducts = assistantProductsWithFiscalMapping();
    const imageCount = assistantStoreImageCount(assistantStoreSnapshot, assistantProductSnapshot);
    const paymentStore = (assistantStoreSnapshot?.checkoutMode || "payment") === "payment";
    const kycStatus = assistantKycSnapshot?.status || "NOT_SUBMITTED";
    const kycDescriptions = {
      APPROVED: "Identidad y datos del comercio verificados.",
      PENDING_REVIEW: "En revisión; Yapi actualizará este paso al aprobarse.",
      REJECTED: "Revisa la observación y vuelve a enviar tus datos.",
      NOT_SUBMITTED: "Envía razón social, NIT, representante, CI y cuenta bancaria.",
    };
    return [
      {
        title: "Crear una tienda",
        description: assistantStoreSnapshot ? assistantStoreSnapshot.name : "Crea el espacio donde publicarás tu catálogo.",
        complete: Boolean(assistantStoreSnapshot),
        view: "stores",
        action: "Crear",
      },
      ...(paymentStore ? [{
        title: "Completar verificación KYC",
        description: assistantComplianceReady ? (kycDescriptions[kycStatus] || `Estado actual: ${kycStatus}.`) : "Consultando el estado de tu verificación…",
        complete: assistantComplianceReady && kycStatus === "APPROVED",
        view: "compliance",
        action: kycStatus === "PENDING_REVIEW" ? "Ver estado" : "Completar",
      },
      {
        title: "Activar facturación digital",
        description: !assistantComplianceReady
          ? "Consultando tu perfil de facturación…"
          : assistantInvoicingConfigured()
            ? `CUIS activo${assistantInvoicingSnapshot?.sucursal !== undefined ? ` · sucursal ${assistantInvoicingSnapshot.sucursal}` : ""}.`
            : "Guarda NIT, razón social, sucursal y punto de venta para emitir tu CUIS.",
        complete: assistantComplianceReady && assistantInvoicingConfigured(),
        view: "compliance",
        action: "Configurar",
      }] : []),
      {
        title: "Publicar productos",
        description: activeProducts.length ? `${activeProducts.length} ${activeProducts.length === 1 ? "producto activo" : "productos activos"}.` : "Agrega al menos un producto activo al catálogo.",
        complete: activeProducts.length > 0,
        view: "products",
        action: "Agregar",
      },
      ...(paymentStore ? [{
        title: "Clasificar productos para factura",
        description: activeProducts.length ? `${mappedProducts} de ${activeProducts.length} con código, actividad, producto SIN y unidad.` : "Primero agrega un producto; luego completa su clasificación SIN.",
        complete: activeProducts.length > 0 && mappedProducts === activeProducts.length,
        view: "products",
        action: "Clasificar",
      }] : []),
      {
        title: "Añadir al menos 6 imágenes",
        description: `${imageCount} de 6 entre portada, historia y productos.`,
        complete: imageCount >= 6,
        view: "appearance",
        action: "Añadir",
      },
      {
        title: "Configurar un contacto de soporte",
        description: assistantStoreSnapshot?.contactPhone || assistantStoreSnapshot?.contactEmail
          ? assistantStoreSnapshot.contactPhone || assistantStoreSnapshot.contactEmail
          : "Añade WhatsApp o correo para que tus clientes puedan contactarte.",
        complete: Boolean(assistantStoreSnapshot?.contactPhone || assistantStoreSnapshot?.contactEmail),
        view: "appearance",
        action: "Configurar",
      },
    ];
  }

  function renderAssistantSetup() {
    const steps = assistantSetupSteps();
    const completed = steps.filter((step) => step.complete).length;
    const percent = Math.round((completed / steps.length) * 100);
    const paymentStore = (assistantStoreSnapshot?.checkoutMode || "payment") === "payment";
    assistantSetupPercentEl.textContent = `${percent}%`;
    assistantSetupSummaryEl.textContent = percent === 100
      ? paymentStore ? "Tu tienda tiene completa la base operativa y fiscal." : "Tu tienda está lista para recibir interesados sin pagos integrados."
      : `${completed} de ${steps.length} pasos completos. Continúa con el siguiente pendiente.`;
    assistantSetupTrackEl.setAttribute("aria-valuenow", String(percent));
    assistantSetupBarEl.style.setProperty("--assistant-progress", String(percent / 100));
    assistantSetupListEl.innerHTML = steps.map((step, index) => `
      <li class="assistant-setup-step ${step.complete ? "is-complete" : ""}">
        <span class="assistant-setup-icon" aria-hidden="true">${step.complete ? "✓" : index + 1}</span>
        <span class="assistant-setup-step-copy"><strong>${assistantEscape(step.title)}</strong><span>${assistantEscape(step.description)}</span></span>
        ${step.complete ? "" : `<button class="assistant-setup-action ghost" type="button" data-yapi-go="${assistantEscape(step.view)}">${assistantEscape(step.action)}</button>`}
      </li>`).join("");
  }

  function renderAssistantAlerts() {
    const lowStock = assistantLowStockProducts(assistantProductSnapshot);
    const imageCount = assistantStoreImageCount(assistantStoreSnapshot, assistantProductSnapshot);
    const kycStatus = assistantKycSnapshot?.status || "NOT_SUBMITTED";
    const paymentStore = (assistantStoreSnapshot?.checkoutMode || "payment") === "payment";
    const alerts = [];
    renderAssistantSetup();
    renderAssistantGoal();
    if (!assistantStoreSnapshot) {
      alerts.push(`<article class="assistant-alert"><strong>Crea o selecciona una tienda</strong>Yapi podrá revisar su catálogo, imágenes y datos de contacto.</article>`);
    }
    if (lowStock.length) {
      alerts.push(`<article class="assistant-alert warning"><strong>${lowStock.length} ${lowStock.length === 1 ? "producto necesita" : "productos necesitan"} stock</strong>${lowStock.map((item) => `${assistantEscape(item.name)}: ${item.stock === 0 ? "agotado" : `${item.stock} disponible${item.stock === 1 ? "" : "s"}`}`).join("<br>")}</article>`);
    }
    if (imageCount < 6) {
      alerts.push(`<article class="assistant-alert warning"><strong>Tu tienda necesita más imágenes</strong>Tiene ${imageCount} de las 6 imágenes recomendadas. Agrega fotos de productos, portada o historia para darle más contexto al cliente.</article>`);
    }
    if (paymentStore && assistantComplianceReady && kycStatus !== "APPROVED") {
      const kycCopy = kycStatus === "PENDING_REVIEW"
        ? "Tus datos están en revisión. No necesitas enviarlos de nuevo mientras esperas."
        : kycStatus === "REJECTED"
          ? "La verificación fue observada. Abre Cumplimiento, corrige los datos y vuelve a enviarlos."
          : "Abre Cumplimiento y envía los datos legales del comercio y su representante.";
      alerts.push(`<article class="assistant-alert warning"><strong>KYC ${kycStatus === "PENDING_REVIEW" ? "en revisión" : "necesita atención"}</strong>${kycCopy}</article>`);
    }
    if (paymentStore && assistantComplianceReady && !assistantInvoicingConfigured()) {
      alerts.push(`<article class="assistant-alert warning"><strong>Facturación digital pendiente</strong>Completa el perfil fiscal y guarda para emitir el CUIS. Después clasifica cada producto con los códigos SIN.</article>`);
    }
    if (!alerts.length) {
      alerts.push(`<article class="assistant-alert success"><strong>Todo se ve bien</strong>No hay alertas de stock, contenido visual ni cumplimiento.</article>`);
    }
    assistantAlertsEl.innerHTML = alerts.join("");
    // The badge stays focused on time-sensitive operational alerts. Setup
    // requirements remain visible in the checklist without turning into a
    // permanently noisy notification count.
    const warningCount = lowStock.length + (imageCount < 6 ? 1 : 0);
    [assistantTabCountEl, assistantNotificationBadgeEl].forEach((badge) => {
      badge.textContent = String(warningCount);
      badge.hidden = warningCount === 0;
    });
    assistantNotificationBadgeEl.setAttribute("aria-label", `${warningCount} ${warningCount === 1 ? "aviso" : "avisos"}`);
  }

  function renderAssistantGoal() {
    const target = Number(assistantStoreSnapshot?.salesGoalAmount || 0);
    const revenue = Number(assistantFinancesSnapshot?.totalRevenue || 0);
    const percent = target > 0 ? Math.min(100, Math.round((revenue / target) * 100)) : 0;
    assistantGoalPercentEl.textContent = target > 0 ? `${percent}%` : "Sin meta";
    assistantGoalSummaryEl.textContent = target > 0
      ? `${assistantStoreSnapshot.salesGoalLabel || "Meta de ventas"}: ${money(revenue)} de ${money(target)}.`
      : "Define un objetivo para esta tienda y Yapi seguirá el avance.";
    assistantGoalTrackEl.setAttribute("aria-valuenow", String(percent));
    assistantGoalBarEl.style.setProperty("--assistant-progress", String(percent / 100));
    assistantGoalLabelEl.value = assistantStoreSnapshot?.salesGoalLabel || "";
    assistantGoalAmountEl.value = target > 0 ? (target / 100).toFixed(2) : "";
    assistantGoalClearEl.hidden = target <= 0;
    [...assistantGoalFormEl.elements].forEach((control) => { control.disabled = !assistantStoreSnapshot; });
  }

  const assistantSupportCategoryLabels = {
    ACCOUNT_ACCESS: "Acceso a la cuenta",
    PAYMENTS: "Pagos o cobros",
    KYC: "Verificación KYC",
    PAYOUTS: "Desembolsos",
    STORES: "Tienda o catálogo",
    OTHER: "Otro",
  };

  function renderAssistantSupport() {
    const statusLabels = { PENDING: "Pendiente", SENT: "Enviado", REVIEWED: "Revisado", RESOLVED: "Resuelto" };
    const statusOrder = { PENDING: 0, SENT: 1, REVIEWED: 2, RESOLVED: 3 };
    const steps = ["Pendiente", "Enviado", "Revisado", "Resuelto"];
    assistantSupportListEl.innerHTML = assistantSupportCases.length
      ? assistantSupportCases.map((supportCase) => {
          const current = statusOrder[supportCase.status] ?? 0;
          const statusClass = supportCase.status === "RESOLVED" ? "is-resolved" : supportCase.status === "REVIEWED" ? "is-reviewed" : "";
          return `<article class="assistant-support-case">
            <div class="assistant-support-case-head"><strong>${assistantEscape(assistantSupportCategoryLabels[supportCase.category] || supportCase.category)}</strong><span class="assistant-support-status ${statusClass}">${assistantEscape(statusLabels[supportCase.status] || supportCase.status)}</span></div>
            <p>${assistantEscape(supportCase.summary)}</p>
            <div class="assistant-support-steps" aria-label="Estado de la solicitud">${steps.map((label, index) => `<span class="assistant-support-step ${index <= current ? "is-done" : ""} ${index === current ? "is-current" : ""}">${label}</span>`).join("")}</div>
            ${supportCase.resolution ? `<p class="assistant-support-resolution"><strong>Resolución:</strong> ${assistantEscape(supportCase.resolution)}</p>` : ""}
          </article>`;
        }).join("")
      : `<p class="assistant-view-copy">Todavía no enviaste solicitudes. Yapi mostrará aquí cada cambio de estado.</p>`;
    requestAnimationFrame(positionAssistantPanel);
  }

  async function refreshAssistantSupport() {
    if (!sessionToken) return;
    assistantSupportCases = await api("/dashboard/support_cases");
    renderAssistantSupport();
  }

  assistantSupportFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = assistantSupportFormEl.querySelector('button[type="submit"]');
    submit.disabled = true;
    assistantSupportMessageEl.textContent = "Enviando la solicitud…";
    try {
      await api("/dashboard/support_cases", {
        method: "POST",
        body: JSON.stringify({
          category: assistantSupportCategoryEl.value,
          summary: assistantSupportSummaryEl.value.trim(),
        }),
      });
      assistantSupportFormEl.reset();
      assistantSupportMessageEl.textContent = "Enviado. Yapi actualizará el estado cuando soporte lo revise.";
      await refreshAssistantSupport();
    } catch (error) {
      assistantSupportMessageEl.textContent = `No se pudo enviar: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });

  assistantSupportOpenEl.addEventListener("click", async () => {
    setAssistantOpen(true, false, false);
    activateAssistantTab(assistantSupportTabEl.id, true);
    assistantSupportMessageEl.textContent = "Pendiente: completa el detalle para enviarlo.";
    await refreshAssistantSupport().catch((error) => {
      assistantSupportMessageEl.textContent = `No se pudo consultar el estado: ${error.message}`;
    });
  });

  assistantSupportTabEl.addEventListener("click", () => {
    refreshAssistantSupport().catch((error) => {
      assistantSupportMessageEl.textContent = `No se pudo consultar el estado: ${error.message}`;
    });
  });

  window.setInterval(() => {
    if (sessionToken && !document.hidden) refreshAssistantSupport().catch(() => undefined);
  }, 30_000);

  // Keep XP current while the merchant leaves the dashboard open. A newly
  // completed sale can therefore unlock and announce its companion in-session.
  window.setInterval(() => {
    if (sessionToken && currentStoreId && !document.hidden) refreshFinancesInBackground();
  }, 60_000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && sessionToken) {
      refreshAssistantSupport().catch(() => undefined);
      if (currentStoreId) refreshFinancesInBackground();
    }
  });

  window.updateYapiContext = ({ store, products, kyc, invoicing, finances, complianceReady } = {}) => {
    if (store !== undefined) assistantStoreSnapshot = store;
    if (products !== undefined) assistantProductSnapshot = Array.isArray(products) ? products : [];
    if (kyc !== undefined) assistantKycSnapshot = kyc;
    if (invoicing !== undefined) assistantInvoicingSnapshot = invoicing;
    if (finances !== undefined) assistantFinancesSnapshot = finances;
    if (complianceReady !== undefined) assistantComplianceReady = Boolean(complianceReady);
    renderAssistantAlerts();
  };

  assistantGoalFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!assistantStoreSnapshot) return;
    const amount = Number(assistantGoalAmountEl.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      assistantGoalStatusEl.textContent = "Ingresa una meta mayor a Bs 0.";
      return;
    }
    const submit = assistantGoalFormEl.querySelector('button[type="submit"]');
    submit.disabled = true;
    assistantGoalStatusEl.textContent = "Guardando…";
    try {
      const updated = await api(`/stores/${assistantStoreSnapshot.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          salesGoalLabel: assistantGoalLabelEl.value.trim() || "Meta de ventas",
          salesGoalAmount: Math.round(amount * 100),
        }),
      });
      lastStores = lastStores.map((store) => store.id === updated.id ? updated : store);
      assistantStoreSnapshot = updated;
      renderAssistantGoal();
      assistantGoalStatusEl.textContent = "Meta guardada.";
    } catch (error) {
      assistantGoalStatusEl.textContent = `No se pudo guardar: ${error.message}`;
    } finally {
      submit.disabled = false;
    }
  });

  assistantGoalClearEl.addEventListener("click", async () => {
    if (!assistantStoreSnapshot) return;
    assistantGoalClearEl.disabled = true;
    assistantGoalStatusEl.textContent = "Quitando…";
    try {
      const updated = await api(`/stores/${assistantStoreSnapshot.id}`, {
        method: "PATCH",
        body: JSON.stringify({ salesGoalLabel: null, salesGoalAmount: null }),
      });
      lastStores = lastStores.map((store) => store.id === updated.id ? updated : store);
      assistantStoreSnapshot = updated;
      renderAssistantGoal();
      assistantGoalStatusEl.textContent = "Meta quitada.";
    } catch (error) {
      assistantGoalStatusEl.textContent = `No se pudo quitar: ${error.message}`;
    } finally {
      assistantGoalClearEl.disabled = false;
    }
  });

  assistantSetupListEl.addEventListener("click", (event) => {
    const action = event.target.closest("[data-yapi-go]");
    if (!action) return;
    const link = document.querySelector(`[data-dashboard-view="${action.dataset.yapiGo}"]`);
    link?.click();
    setAssistantOpen(false, false, false);
  });

  function renderAssistantNotes() {
    assistantNoteListEl.innerHTML = assistantNotes.length
      ? assistantNotes.map((note) => `<article class="assistant-note" data-note-id="${assistantEscape(note.id)}"><p>${assistantEscape(note.text)}</p><time datetime="${assistantEscape(note.createdAt)}">${new Date(note.createdAt).toLocaleDateString("es-BO", { day: "numeric", month: "short" })}</time><button class="ghost" type="button" aria-label="Eliminar nota">×</button></article>`).join("")
      : `<p class="assistant-view-copy">Todavía no guardaste notas.</p>`;
    assistantNoteListEl.querySelectorAll("[data-note-id] button").forEach((button) => button.addEventListener("click", () => {
      assistantNotes = assistantNotes.filter((note) => note.id !== button.closest("[data-note-id]").dataset.noteId);
      writeAssistantStorage(ASSISTANT_NOTES_KEY, assistantNotes);
      renderAssistantNotes();
    }));
  }

  function assistantAgentReply(message) {
    const text = message.toLocaleLowerCase("es");
    const kycStatus = assistantKycSnapshot?.status || "NOT_SUBMITTED";
    if (/meta|objetivo|ventas/.test(text)) {
      const target = Number(assistantStoreSnapshot?.salesGoalAmount || 0);
      if (!target) return "Todavía no definiste una meta. Abre la pestaña Meta, escribe el objetivo en bolivianos y guárdalo; seguiré el avance con las ventas de esta tienda.";
      const revenue = Number(assistantFinancesSnapshot?.totalRevenue || 0);
      const percent = Math.min(100, Math.round((revenue / target) * 100));
      return `${assistantStoreSnapshot.salesGoalLabel || "Tu meta"} está al ${percent}%: llevas ${money(revenue)} de ${money(target)}.`;
    }
    if (/kyc|verificaci[oó]n|identidad|nit|representante/.test(text)) {
      if ((assistantStoreSnapshot?.checkoutMode || "payment") !== "payment") return "Esta tienda no cobra con pagosYa, así que KYC, NIT y clasificación SIN están desactivados. Si cambias su modo a “Cobrar con pagosYa”, te llevaré a Cumplimiento para completar esos datos.";
      if (!assistantComplianceReady) return "Estoy consultando el estado de tu KYC. En Cumplimiento encontrarás los datos requeridos: razón social, NIT, representante legal, CI y cuenta bancaria para pagos.";
      if (kycStatus === "APPROVED") return "Tu KYC está aprobado. Ya completaste la verificación de identidad y datos legales del comercio.";
      if (kycStatus === "PENDING_REVIEW") return "Tu KYC fue enviado y está en revisión. No lo vuelvas a enviar mientras esperas; Yapi marcará el paso como completo cuando se apruebe.";
      if (kycStatus === "REJECTED") return "Tu KYC fue observado. Abre Cumplimiento, revisa la observación, corrige razón social, NIT, representante, CI o cuenta bancaria y vuelve a enviarlo.";
      return "Para completar KYC abre Cumplimiento y envía: razón social, NIT, nombre y CI del representante legal, y la cuenta bancaria para pagos. El paso se completa cuando el estado sea APROBADO.";
    }
    if (/factur|cuis|cufd|sin\b|fiscal/.test(text)) {
      if ((assistantStoreSnapshot?.checkoutMode || "payment") !== "payment") return "La facturación digital no se requiere para esta tienda porque termina pedidos fuera de pagosYa. Se habilitará cuando elijas “Cobrar con pagosYa”.";
      if (assistantInvoicingConfigured()) return "Tu perfil fiscal y CUIS están activos. El siguiente paso es abrir Productos y clasificar cada artículo con código propio, actividad económica, código de producto SIN y unidad de medida. El CUFD se genera o renueva al emitir facturas, por eso no lo cuento como requisito permanente.";
      return "Para activar facturación digital: 1) completa KYC, 2) abre Cumplimiento, 3) ingresa NIT, razón social, sucursal y punto de venta, 4) guarda para emitir el CUIS, y 5) clasifica cada producto con sus códigos SIN. El CUFD se administra al emitir facturas.";
    }
    if (/100|porcentaje|configuraci[oó]n|pasos|progreso/.test(text)) {
      const steps = assistantSetupSteps();
      const pending = steps.filter((step) => !step.complete);
      const percent = Math.round(((steps.length - pending.length) / steps.length) * 100);
      return pending.length
        ? `Tu configuración está al ${percent}%. El siguiente paso es “${pending[0].title}”: ${pending[0].description}`
        : "Tu configuración está al 100%: tienda, KYC, CUIS, catálogo, clasificación SIN, imágenes y contacto están listos.";
    }
    if (/stock|inventario|agotad/.test(text)) return "Abre Productos y edita el stock general o el de cada opción. En Avisos te mostraré cualquier cantidad entre 0 y 5.";
    if (/foto|imagen|galer/.test(text)) return "Cada producto admite hasta 10 fotos. La primera es la portada; usa las flechas del editor para cambiar el orden y los controles de enfoque para ajustar el recorte.";
    if (/tienda|diseño|apariencia/.test(text)) return "Una tienda clara suele tener al menos 6 imágenes, una portada reconocible, categorías simples y textos breves. Revisa Apariencia y la vista previa antes de guardar.";
    if (/pago|desembolso|saldo/.test(text)) return assistantAnswers.payout;
    if (/persona|humano|soporte|reclamo|disputa/.test(text)) return "Puedo dejar preparado el contexto para una persona. Usa “Reportar un problema” debajo de esta conversación; verás aquí cuándo fue enviado, revisado y resuelto.";
    return "Puedo ayudarte con KYC, facturación digital, progreso de configuración, stock, fotos, apariencia, pagos y uso del panel. Cuéntame qué estabas intentando hacer o qué mensaje apareció.";
  }

  function renderAssistantChat() {
    if (!assistantChat.length) assistantChat = [{ role: "yapi", text: "Hola. Puedo guiarte con KYC, facturación digital y los pasos para llevar tu tienda al 100%." }];
    assistantChatLogEl.innerHTML = assistantChat.map((message) => `<div class="assistant-chat-message ${message.role === "user" ? "user" : "yapi"}">${assistantEscape(message.text)}</div>`).join("");
    assistantChatLogEl.scrollTop = assistantChatLogEl.scrollHeight;
  }

  Object.values(ASSISTANT_FRAMES).flat().forEach((src) => {
    const image = new Image();
    image.src = src;
  });

  function setAssistantFrame(src) {
    if (assistantObjectImageEl.getAttribute("src") !== src) assistantObjectImageEl.setAttribute("src", src);
  }

  function cancelAssistantIdleGesture() {
    window.clearTimeout(assistantIdleTimer);
    window.clearTimeout(assistantWaveResetTimer);
    assistantIdleTimer = null;
    assistantWaveResetTimer = null;
    assistantDockEl.classList.remove("is-waving", "is-shaking");
    if (!assistantDragState && !assistantWalkTimer) setAssistantFrame(ASSISTANT_FRAMES.idle);
  }

  function scheduleAssistantIdleGesture() {
    cancelAssistantIdleGesture();
    if (assistantDockEl.hidden || document.hidden) return;
    if (assistantReducedMotion.matches) return;
    const delay = 7000;
    assistantIdleTimer = window.setTimeout(() => {
      if (assistantDragState || assistantDockEl.hidden || document.hidden) {
        scheduleAssistantIdleGesture();
        return;
      }
      assistantDockEl.classList.add("is-shaking");
      assistantWaveResetTimer = window.setTimeout(() => {
        assistantDockEl.classList.remove("is-shaking");
        scheduleAssistantIdleGesture();
      }, 260);
    }, delay);
  }

  function setAssistantFlightDirection(direction) {
    assistantDockEl.dataset.flightDirection = direction === "left" ? "left" : "right";
  }

  function startAssistantWalk(direction = assistantDockEl.dataset.flightDirection || "right") {
    cancelAssistantIdleGesture();
    setAssistantFlightDirection(direction);
    if (assistantWalkTimer) return;
    assistantWalkTimer = true;
    setAssistantFrame(ASSISTANT_FRAMES.fly);
  }

  function stopAssistantWalk() {
    assistantWalkTimer = null;
    setAssistantFrame(ASSISTANT_FRAMES.idle);
    scheduleAssistantIdleGesture();
  }

  function playAssistantWalkBurst(direction) {
    window.clearTimeout(assistantKeyboardWalkTimer);
    startAssistantWalk(direction);
    assistantDockEl.classList.add("is-dragging");
    assistantKeyboardWalkTimer = window.setTimeout(() => {
      assistantDockEl.classList.remove("is-dragging");
      stopAssistantWalk();
    }, 360);
  }

  function clampAssistantPosition(x, y) {
    const margin = window.innerWidth <= 640 ? 20 : 8;
    const width = assistantDockEl.offsetWidth || 116;
    const height = assistantDockEl.offsetHeight || 132;
    const minX = margin;
    const minY = window.scrollY + margin;
    const maxX = window.innerWidth - width - margin;
    const maxY = window.scrollY + window.innerHeight - height - margin;
    return {
      x: Math.min(Math.max(minX, x), Math.max(minX, maxX)),
      y: Math.min(Math.max(minY, y), Math.max(minY, maxY)),
    };
  }

  function applyAssistantPosition(x, y) {
    const next = clampAssistantPosition(x, y);
    assistantDockEl.style.left = `${next.x}px`;
    assistantDockEl.style.top = `${next.y}px`;
    return next;
  }

  function saveAssistantPosition() {
    const left = Number.parseFloat(assistantDockEl.style.left) || 0;
    const top = Number.parseFloat(assistantDockEl.style.top) || 0;
    try {
      localStorage.setItem(ASSISTANT_POSITION_KEY, JSON.stringify({
        x: left,
        y: top,
        absolute: true,
      }));
    } catch {
      // Dragging still works for the current visit when storage is unavailable.
    }
  }

  function restoreAssistantPosition() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(ASSISTANT_POSITION_KEY)); } catch { saved = null; }
    const width = assistantDockEl.offsetWidth || 116;
    const height = assistantDockEl.offsetHeight || 132;
    const fallback = { x: window.scrollX + window.innerWidth - width - 22, y: window.scrollY + 150 };
    if (!saved || !Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return applyAssistantPosition(fallback.x, fallback.y);
    if (saved.absolute) return applyAssistantPosition(saved.x, saved.y);
    return applyAssistantPosition(
      window.scrollX + 8 + saved.x * Math.max(1, window.innerWidth - width - 16),
      window.scrollY + 8 + saved.y * Math.max(1, window.innerHeight - height - 16),
    );
  }

  function positionAssistantPanel() {
    if (assistantPanelEl.hidden) return;
    const margin = 8;
    const gap = 10;
    const dock = assistantDockEl.getBoundingClientRect();
    const panel = assistantPanelEl.getBoundingClientRect();
    const left = window.innerWidth <= 640
      ? Math.max(margin, window.innerWidth - panel.width - margin) - dock.left
      : dock.left >= panel.width + gap + margin ? -panel.width - gap : dock.width + gap;
    const desiredViewportTop = Math.min(Math.max(margin, dock.top + dock.height / 2 - panel.height / 2), window.innerHeight - panel.height - margin);
    const top = desiredViewportTop - dock.top;
    assistantPanelEl.style.left = `${left}px`;
    assistantPanelEl.style.top = `${top}px`;
  }

  function setAssistantOpen(open, returnFocus = true, focusOnOpen = true) {
    cancelAssistantIdleGesture();
    assistantPanelEl.hidden = !open;
    assistantObjectEl.setAttribute("aria-expanded", String(open));
    if (open) {
      positionAssistantPanel();
      requestAnimationFrame(positionAssistantPanel);
      if (focusOnOpen) assistantCloseEl.focus();
    } else if (returnFocus && !assistantDockEl.hidden) {
      assistantObjectEl.focus({ preventScroll: true });
    }
    scheduleAssistantIdleGesture();
  }

  function setAssistantVisible(visible) {
    const preservedScroll = { x: window.scrollX, y: window.scrollY };
    cancelAssistantIdleGesture();
    if (!visible) stopAssistantWalk();
    if (!visible) setAssistantOpen(false, false);
    assistantDockEl.hidden = !visible;
    assistantRestoreEl.hidden = visible;
    try { localStorage.setItem(ASSISTANT_HIDDEN_KEY, String(!visible)); } catch {}
    if (visible) {
      applyAssistantPosition(window.scrollX + window.innerWidth - (assistantDockEl.offsetWidth || 116) - 22, window.scrollY + 150);
      saveAssistantPosition();
      setAssistantOpen(true, false);
      scheduleAssistantIdleGesture();
    } else {
      assistantRestoreEl.focus({ preventScroll: true });
      window.scrollTo(preservedScroll.x, preservedScroll.y);
      requestAnimationFrame(() => window.scrollTo(preservedScroll.x, preservedScroll.y));
    }
  }

  function syncAssistantWorkspaceVisibility(view) {
    if (view === "appearance" || view === "workspace") {
      if (assistantDockEl.hidden) return;
      setAssistantOpen(false, false, false);
      assistantDockEl.hidden = true;
      assistantRestoreEl.hidden = false;
      assistantAutoHiddenForAppearance = true;
      return;
    }
    if (!assistantAutoHiddenForAppearance) return;
    assistantAutoHiddenForAppearance = false;
    let explicitlyHidden = false;
    try { explicitlyHidden = localStorage.getItem(ASSISTANT_HIDDEN_KEY) === "true"; } catch {}
    assistantDockEl.hidden = explicitlyHidden;
    assistantRestoreEl.hidden = !explicitlyHidden;
    if (!explicitlyHidden) scheduleAssistantIdleGesture();
  }

  assistantObjectEl.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = assistantDockEl.getBoundingClientRect();
    assistantDragState = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, lastClientX: event.clientX, left: rect.left + window.scrollX, top: rect.top + window.scrollY, moved: false };
    assistantObjectEl.setPointerCapture(event.pointerId);
  });

  assistantObjectEl.addEventListener("pointermove", (event) => {
    if (!assistantDragState || assistantDragState.pointerId !== event.pointerId) return;
    const dx = event.clientX - assistantDragState.startX;
    const dy = event.clientY - assistantDragState.startY;
    if (!assistantDragState.moved && Math.hypot(dx, dy) < 4) return;
    const horizontalMotion = event.clientX - assistantDragState.lastClientX;
    const direction = horizontalMotion < 0 ? "left" : horizontalMotion > 0 ? "right" : assistantDockEl.dataset.flightDirection || "right";
    if (!assistantDragState.moved) startAssistantWalk(direction);
    else if (horizontalMotion) setAssistantFlightDirection(direction);
    assistantDragState.lastClientX = event.clientX;
    assistantDragState.moved = true;
    assistantDockEl.classList.add("is-dragging");
    applyAssistantPosition(assistantDragState.left + dx, assistantDragState.top + dy);
    positionAssistantPanel();
  });

  function finishAssistantDrag(event) {
    if (!assistantDragState || assistantDragState.pointerId !== event.pointerId) return;
    suppressAssistantClick = assistantDragState.moved;
    if (assistantDragState.moved) saveAssistantPosition();
    assistantDockEl.classList.remove("is-dragging");
    assistantDragState = null;
    stopAssistantWalk();
  }

  assistantObjectEl.addEventListener("pointerup", finishAssistantDrag);
  assistantObjectEl.addEventListener("pointercancel", finishAssistantDrag);
  assistantObjectEl.addEventListener("click", (event) => {
    if (suppressAssistantClick) {
      event.preventDefault();
      suppressAssistantClick = false;
      return;
    }
    setAssistantOpen(assistantPanelEl.hidden);
  });
  assistantObjectEl.addEventListener("keydown", (event) => {
    const movement = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
    if (!movement) return;
    event.preventDefault();
    const rect = assistantDockEl.getBoundingClientRect();
    applyAssistantPosition(rect.left + window.scrollX + movement[0], rect.top + window.scrollY + movement[1]);
    saveAssistantPosition();
    positionAssistantPanel();
    const direction = movement[0] < 0 ? "left" : movement[0] > 0 ? "right" : assistantDockEl.dataset.flightDirection || "right";
    playAssistantWalkBurst(direction);
  });

  assistantHideEl.addEventListener("click", () => setAssistantVisible(false));
  assistantRestoreEl.addEventListener("click", () => {
    assistantAutoHiddenForAppearance = false;
    setAssistantVisible(true);
  });
  assistantCloseEl.addEventListener("click", () => setAssistantOpen(false));
  assistantPanelEl.addEventListener("animationend", positionAssistantPanel);
  assistantQuestionEls.forEach((button) => {
    button.addEventListener("click", () => {
      assistantQuestionEls.forEach((question) => question.setAttribute("aria-pressed", "false"));
      button.setAttribute("aria-pressed", "true");
      assistantAnswerEl.textContent = assistantAnswers[button.dataset.assistantQuestion];
    });
  });
  assistantTabs.forEach((tab) => tab.addEventListener("click", () => activateAssistantTab(tab.id)));
  assistantNoteFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = assistantNoteInputEl.value.trim();
    if (!text) return;
    assistantNotes.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, createdAt: new Date().toISOString() });
    assistantNotes = assistantNotes.slice(0, 30);
    writeAssistantStorage(ASSISTANT_NOTES_KEY, assistantNotes);
    assistantNoteInputEl.value = "";
    renderAssistantNotes();
    assistantNoteInputEl.focus({ preventScroll: true });
  });
  assistantChatFormEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = assistantChatInputEl.value.trim();
    if (!text) return;
    assistantChat.push({ role: "user", text }, { role: "yapi", text: assistantAgentReply(text) });
    assistantChat = assistantChat.slice(-20);
    writeAssistantStorage(ASSISTANT_CHAT_KEY, assistantChat);
    if (!assistantSupportSummaryEl.value.trim()) assistantSupportSummaryEl.value = text;
    assistantChatInputEl.value = "";
    renderAssistantChat();
    assistantChatInputEl.focus({ preventScroll: true });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !assistantPanelEl.hidden) setAssistantOpen(false);
  });
  window.addEventListener("resize", () => {
    restoreAssistantPosition();
    positionAssistantPanel();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAssistantIdleGesture();
      if (assistantWalkTimer) stopAssistantWalk();
    } else {
      scheduleAssistantIdleGesture();
    }
  });
  assistantReducedMotion.addEventListener("change", () => {
    cancelAssistantIdleGesture();
    stopAssistantWalk();
  });

  let assistantStartsHidden = false;
  assistantNotes = readAssistantStorage(ASSISTANT_NOTES_KEY);
  assistantChat = readAssistantStorage(ASSISTANT_CHAT_KEY);
  renderAssistantNotes();
  renderAssistantChat();
  renderAssistantAlerts();
  activateAssistantTab("assistantAlertsTab");
  try { assistantStartsHidden = localStorage.getItem(ASSISTANT_HIDDEN_KEY) === "true"; } catch {}
  assistantDockEl.hidden = assistantStartsHidden;
  assistantRestoreEl.hidden = !assistantStartsHidden;
  restoreAssistantPosition();
  if (!assistantStartsHidden && window.innerWidth > 640) setAssistantOpen(true, false, false);
  else scheduleAssistantIdleGesture();

  const apiBaseEl = document.getElementById("apiBase");
  const emailEl = document.getElementById("email");
  const passwordEl = document.getElementById("password");
  const passwordVisibilityToggleEl = document.getElementById("passwordVisibilityToggle");
  const moneyVisibilityToggleEl = document.getElementById("moneyVisibilityToggle");
  const moneyVisibilityLabelEl = document.getElementById("moneyVisibilityLabel");
  const errorEl = document.getElementById("error");
  const infoEl = document.getElementById("info");
  const appEl = document.getElementById("app");
  const loginFormEl = document.getElementById("loginForm");
  const forgotFormEl = document.getElementById("forgotForm");
  const loggedInBarEl = document.getElementById("loggedInBar");
  const loggedInAsEl = document.getElementById("loggedInAs");
  const profileMenuEl = document.getElementById("profileMenu");
  const profileMenuTriggerEl = document.getElementById("profileMenuTrigger");
  const profileTriggerAvatarEl = document.getElementById("profileTriggerAvatar");
  const profileMenuAvatarEl = document.getElementById("profileMenuAvatar");
  const profileDisplayNameEl = document.getElementById("profileDisplayName");
  const profileSessionsEl = document.getElementById("profileSessions");
  const profileSessionCountEl = document.getElementById("profileSessionCount");
  const sessionProfileDialogEl = document.getElementById("sessionProfileDialog");
  const sessionProfileFormEl = document.getElementById("sessionProfileForm");
  const sessionProfileExistingEl = document.getElementById("sessionProfileExisting");
  const sessionProfileChoicesEl = document.getElementById("sessionProfileChoices");
  const sessionProfileNameEl = document.getElementById("sessionProfileName");
  const sessionProfileErrorEl = document.getElementById("sessionProfileError");
  const sessionProfileContinueEl = document.getElementById("sessionProfileContinue");

  const savedApiBase = sessionStorage.getItem("pagosya_merchant_api_base");
  apiBaseEl.value = savedApiBase === "http://localhost:3000/v1" ? "http://localhost:3001/v1" : savedApiBase || apiBaseEl.value;
  if (savedApiBase === "http://localhost:3000/v1") sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
  emailEl.value = sessionStorage.getItem("pagosya_merchant_email") || emailEl.value;
  let sessionToken = sessionStorage.getItem("pagosya_merchant_session") || "";
  const PROFILE_AVATAR_STORAGE_PREFIX = "pagosya_merchant_avatar:";
  let selectedProfileAvatar = 1;
  let currentProfileName = "";
  let selectedLoginAvatar = 1;
  let lastProfileSessionsPayload = null;
  let editingProfileSessionId = null;
  let pendingLoginSessionId = null;
  let resolveProfileSelection = null;

  function profileAvatarSvg(avatarId) {
    const normalized = Number(avatarId) >= 1 && Number(avatarId) <= 4 ? Number(avatarId) : 1;
    return `<img class="profile-avatar-image profile-avatar-image-${normalized}" src="/assets/profile-${normalized}.png" alt="">`;
  }

  function profileAvatarStorageKey() {
    return PROFILE_AVATAR_STORAGE_PREFIX + String(emailEl.value || "default").trim().toLocaleLowerCase("es");
  }

  function readProfileAvatar() {
    try {
      const stored = Number(localStorage.getItem(profileAvatarStorageKey()));
      return stored >= 1 && stored <= 4 ? stored : 1;
    } catch {
      return 1;
    }
  }

  function profileNameFromEmail(email) {
    const localPart = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
    if (!localPart) return "Mi perfil";
    return localPart.replace(/\b\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
  }

  function renderProfileAvatar() {
    const markup = profileAvatarSvg(selectedProfileAvatar);
    profileTriggerAvatarEl.innerHTML = markup;
    profileMenuAvatarEl.innerHTML = markup;
    document.querySelectorAll("[data-profile-avatar]").forEach((button) => {
      const avatarId = Number(button.dataset.profileAvatar);
      button.innerHTML = profileAvatarSvg(avatarId);
      button.setAttribute("aria-pressed", String(avatarId === selectedProfileAvatar));
    });
  }

  function setLoginAvatar(avatarId) {
    selectedLoginAvatar = avatarId >= 1 && avatarId <= 4 ? avatarId : 1;
    document.querySelectorAll("[data-login-avatar]").forEach((button) => {
      const optionId = Number(button.dataset.loginAvatar);
      button.innerHTML = profileAvatarSvg(optionId);
      button.setAttribute("aria-pressed", String(optionId === selectedLoginAvatar));
    });
  }

  function applyProfileIdentity() {
    const email = emailEl.value || "tu cuenta del panel";
    selectedProfileAvatar = readProfileAvatar();
    profileDisplayNameEl.textContent = currentProfileName || profileNameFromEmail(email);
    loggedInAsEl.textContent = email;
    profileMenuTriggerEl.setAttribute("aria-label", `Abrir perfil de ${email}`);
    renderProfileAvatar();
  }

  function applyCurrentSessionIdentity(session) {
    if (!session) return;
    selectedProfileAvatar = Number(session.profileAvatarId) || 1;
    currentProfileName = session.profileName || profileNameFromEmail(emailEl.value);
    profileDisplayNameEl.textContent = currentProfileName;
    try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
    renderProfileAvatar();
  }

  document.querySelectorAll("[data-profile-avatar]").forEach((button) => {
    button.addEventListener("click", async () => {
      const previousAvatar = selectedProfileAvatar;
      selectedProfileAvatar = Number(button.dataset.profileAvatar);
      try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
      renderProfileAvatar();
      const currentSession = lastProfileSessionsPayload?.sessions?.find((session) => session.current);
      if (!currentSession) return;
      try {
        await updateProfileSession(currentSession.id, currentSession.profileName, selectedProfileAvatar);
        await loadProfileSessions(false);
      } catch (error) {
        selectedProfileAvatar = previousAvatar;
        renderProfileAvatar();
        profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos guardar el avatar. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
      }
    });
  });
  document.querySelectorAll("[data-login-avatar]").forEach((button) => {
    button.addEventListener("click", () => setLoginAvatar(Number(button.dataset.loginAvatar)));
  });
  renderProfileAvatar();
  setLoginAvatar(1);

  function positionProfileMenu() {
    if (!profileMenuEl.matches(":popover-open")) return;
    const triggerRect = profileMenuTriggerEl.getBoundingClientRect();
    const gutter = 12;
    const width = Math.min(372, window.innerWidth - gutter * 2);
    const height = Math.min(profileMenuEl.scrollHeight, window.innerHeight - gutter * 2);
    profileMenuEl.style.left = `${Math.max(gutter, Math.min(triggerRect.right - width, window.innerWidth - width - gutter))}px`;
    profileMenuEl.style.top = `${Math.max(gutter, Math.min(triggerRect.bottom + 10, window.innerHeight - height - gutter))}px`;
  }

  function formatSessionDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function renderProfileSessions(payload) {
    const sessions = Array.isArray(payload?.sessions) ? payload.sessions : [];
    const limit = Number(payload?.limit) || 3;
    const active = Number.isFinite(Number(payload?.active)) ? Number(payload.active) : sessions.length;
    lastProfileSessionsPayload = { ...payload, limit, active, sessions };
    profileSessionCountEl.textContent = `${active} / ${limit}`;
    if (!sessions.length) {
      profileSessionsEl.innerHTML = '<p class="profile-session-state">No se encontraron sesiones activas.</p>';
      requestAnimationFrame(positionProfileMenu);
      return;
    }
    applyCurrentSessionIdentity(sessions.find((session) => session.current));
    profileSessionsEl.innerHTML = sessions.map((session) => `<div class="profile-session-row">
      <div class="profile-session-person">
        <span class="profile-session-avatar" aria-hidden="true">${profileAvatarSvg(session.profileAvatarId)}</span>
        <div class="profile-session-copy"><strong>${esc(session.profileName || "Sin nombre")}</strong><small>Inicio: ${esc(formatSessionDate(session.createdAt))}${session.isPrimary ? " · Principal" : ""}</small></div>
      </div>
      <div class="profile-session-actions">
        ${session.current ? '<span class="profile-session-current">Esta sesión</span>' : ""}
        ${(session.current || payload.canManageSessions) ? `<button class="profile-session-action" type="button" data-edit-session="${esc(session.id)}" aria-label="Cambiar nombre de ${esc(session.profileName || "esta sesión")}" title="Cambiar nombre y avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg></button>` : ""}
        ${!session.current && payload.canManageSessions ? `<button class="profile-session-action" type="button" data-revoke-session="${esc(session.id)}" aria-label="Cerrar la sesión de ${esc(session.profileName || "este perfil")}" title="Cerrar esta sesión"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
      </div>
      ${editingProfileSessionId === session.id ? `<form class="profile-session-edit-form" data-session-edit-form="${esc(session.id)}" data-avatar-id="${Number(session.profileAvatarId) || 1}">
        <label>Nombre del perfil<input name="profileName" value="${esc(session.profileName || "")}" maxlength="32" autocomplete="off" required></label>
        <div class="profile-session-edit-avatars" role="group" aria-label="Avatar del perfil">${[1, 2, 3, 4].map((avatarId) => `<button class="profile-session-edit-avatar" type="button" data-edit-avatar="${avatarId}" aria-label="Elegir avatar ${avatarId}" aria-pressed="${avatarId === Number(session.profileAvatarId)}">${profileAvatarSvg(avatarId)}</button>`).join("")}</div>
        <div class="profile-session-edit-actions"><button class="ghost" type="button" data-cancel-session-edit>Cancelar</button><button class="primary" type="submit">Guardar</button></div>
      </form>` : ""}
    </div>`).join("");
    requestAnimationFrame(positionProfileMenu);
  }

  async function loadProfileSessions(showLoading = true) {
    if (showLoading) {
      profileSessionCountEl.textContent = "— / 3";
      profileSessionsEl.innerHTML = '<p class="profile-session-state">Revisando sesiones…</p>';
    }
    try {
      const payload = await api("/dashboard/sessions");
      renderProfileSessions(payload);
      return payload;
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cargar las sesiones. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
      requestAnimationFrame(positionProfileMenu);
      throw error;
    }
  }

  function updateProfileSession(sessionId, profileName, profileAvatarId) {
    return api(`/dashboard/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ profileName, profileAvatarId }),
    });
  }

  function renderSessionProfileChoices(payload, currentSession) {
    const seen = new Set();
    const choices = (payload?.profiles?.length ? payload.profiles : payload?.sessions || []).filter((session) => {
      const name = String(session.profileName || "").trim();
      if (!name || name === "Seleccionar perfil") return false;
      const key = `${name.toLocaleLowerCase("es")}:${session.profileAvatarId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    sessionProfileExistingEl.hidden = choices.length === 0;
    sessionProfileChoicesEl.innerHTML = choices.map((session) => `<button class="session-profile-choice" type="button" data-profile-choice-name="${esc(session.profileName)}" data-profile-choice-avatar="${Number(session.profileAvatarId) || 1}" aria-pressed="false">
      <span class="session-profile-choice-avatar" aria-hidden="true">${profileAvatarSvg(session.profileAvatarId)}</span><span>${esc(session.profileName)}</span>
    </button>`).join("");

    const isUnassigned = !currentSession?.profileName || currentSession.profileName === "Seleccionar perfil";
    sessionProfileNameEl.value = isUnassigned ? "" : currentSession.isPrimary ? profileNameFromEmail(emailEl.value) : currentSession.profileName;
    setLoginAvatar(Number(currentSession?.profileAvatarId) || 1);
  }

  async function chooseProfileForNewLogin(loginResult) {
    let payload;
    try {
      payload = await api("/dashboard/sessions");
    } catch {
      payload = { sessions: loginResult.session ? [{ ...loginResult.session, current: true }] : [] };
    }
    const currentSession = payload.sessions?.find((session) => session.current) || loginResult.session;
    if (!currentSession?.id) return;
    pendingLoginSessionId = currentSession.id;
    renderSessionProfileChoices(payload, currentSession);
    sessionProfileErrorEl.hidden = true;
    sessionProfileErrorEl.textContent = "";
    sessionProfileDialogEl.showModal();
    window.setTimeout(() => sessionProfileNameEl.focus(), 0);
    await new Promise((resolve) => { resolveProfileSelection = resolve; });
  }

  sessionProfileChoicesEl.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-profile-choice-name]");
    if (!choice) return;
    sessionProfileChoicesEl.querySelectorAll("[data-profile-choice-name]").forEach((button) => button.setAttribute("aria-pressed", String(button === choice)));
    sessionProfileNameEl.value = choice.dataset.profileChoiceName;
    setLoginAvatar(Number(choice.dataset.profileChoiceAvatar));
  });
  sessionProfileNameEl.addEventListener("input", () => {
    sessionProfileChoicesEl.querySelectorAll("[data-profile-choice-name]").forEach((button) => button.setAttribute("aria-pressed", "false"));
  });
  sessionProfileDialogEl.addEventListener("cancel", (event) => event.preventDefault());
  sessionProfileFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const profileName = sessionProfileNameEl.value.trim().replace(/\s+/g, " ");
    if (!profileName || !pendingLoginSessionId) {
      sessionProfileErrorEl.textContent = "Escribe o elige un nombre para identificar esta sesión.";
      sessionProfileErrorEl.hidden = false;
      sessionProfileNameEl.focus();
      return;
    }
    setButtonBusy(sessionProfileContinueEl, true, "Guardando perfil…");
    sessionProfileErrorEl.hidden = true;
    try {
      await updateProfileSession(pendingLoginSessionId, profileName, selectedLoginAvatar);
      selectedProfileAvatar = selectedLoginAvatar;
      try { localStorage.setItem(profileAvatarStorageKey(), String(selectedProfileAvatar)); } catch {}
      currentProfileName = profileName;
      profileDisplayNameEl.textContent = currentProfileName;
      renderProfileAvatar();
      sessionProfileDialogEl.close();
      const resolve = resolveProfileSelection;
      resolveProfileSelection = null;
      pendingLoginSessionId = null;
      resolve?.();
    } catch (error) {
      sessionProfileErrorEl.textContent = `No pudimos guardar el perfil. ${error.message}`;
      sessionProfileErrorEl.hidden = false;
    } finally {
      setButtonBusy(sessionProfileContinueEl, false, "Entrar al panel");
    }
  });

  profileMenuEl.addEventListener("toggle", () => {
    const open = profileMenuEl.matches(":popover-open");
    profileMenuTriggerEl.setAttribute("aria-expanded", String(open));
    if (!open) return;
    positionProfileMenu();
    loadProfileSessions().catch(() => undefined);
  });
  window.addEventListener("resize", positionProfileMenu);
  window.addEventListener("scroll", positionProfileMenu, true);
  profileSessionsEl.addEventListener("click", async (event) => {
    if (event.target.closest("[data-retry-sessions]")) {
      loadProfileSessions().catch(() => undefined);
      return;
    }
    const editButton = event.target.closest("[data-edit-session]");
    if (editButton) {
      editingProfileSessionId = editButton.dataset.editSession;
      renderProfileSessions(lastProfileSessionsPayload);
      profileSessionsEl.querySelector(`[data-session-edit-form="${CSS.escape(editingProfileSessionId)}"] input`)?.focus();
      return;
    }
    if (event.target.closest("[data-cancel-session-edit]")) {
      editingProfileSessionId = null;
      renderProfileSessions(lastProfileSessionsPayload);
      return;
    }
    const avatarButton = event.target.closest("[data-edit-avatar]");
    if (avatarButton) {
      const form = avatarButton.closest("[data-session-edit-form]");
      form.dataset.avatarId = avatarButton.dataset.editAvatar;
      form.querySelectorAll("[data-edit-avatar]").forEach((button) => button.setAttribute("aria-pressed", String(button === avatarButton)));
      return;
    }
    const button = event.target.closest("[data-revoke-session]");
    if (!button) return;
    button.disabled = true;
    button.classList.add("is-loading");
    try {
      await api(`/dashboard/sessions/${encodeURIComponent(button.dataset.revokeSession)}`, { method: "DELETE" });
      await loadProfileSessions();
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cerrar esa sesión. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
    }
  });
  profileSessionsEl.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-session-edit-form]");
    if (!form) return;
    event.preventDefault();
    const submitButton = form.querySelector('button[type="submit"]');
    setButtonBusy(submitButton, true, "Guardando…");
    try {
      await updateProfileSession(form.dataset.sessionEditForm, form.elements.profileName.value, Number(form.dataset.avatarId));
      editingProfileSessionId = null;
      await loadProfileSessions(false);
    } catch (error) {
      profileSessionsEl.innerHTML = `<p class="profile-session-state">No pudimos cambiar ese perfil. ${esc(error.message)} <button class="ghost" type="button" data-retry-sessions>Reintentar</button></p>`;
    }
  });

  const checkoutOriginEl = document.getElementById("checkoutOrigin");
  const savedCheckoutOrigin = sessionStorage.getItem("pagosya_checkout_origin");
  checkoutOriginEl.value = savedCheckoutOrigin === "http://localhost:5174" ? "http://localhost:5175" : savedCheckoutOrigin || checkoutOriginEl.value;
  if (savedCheckoutOrigin === "http://localhost:5174") sessionStorage.setItem("pagosya_checkout_origin", checkoutOriginEl.value);
  let lastPaymentLinks = [];
  let pendingStoreLocations = [];
  let lastPromoCodes = [];
  const promoCodeFormEl = document.getElementById("promoCodeForm");
  const promoCodeTypeEl = document.getElementById("promoCodeType");
  const promoCodeValueEl = document.getElementById("promoCodeValue");
  const promoCodeValueLabelEl = document.getElementById("promoCodeValueLabel");
  const promoCodeStatusEl = document.getElementById("promoCodeStatus");
  const promoCodeListEl = document.getElementById("promoCodeList");
  const promoCodeCountEl = document.getElementById("promoCodeCount");
  const paymentLinkPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const paymentLinkPageSize = 10;
  const paymentLinkSearchEl = document.getElementById("paymentLinkSearch");
  const paymentLinkSearchClearEl = document.getElementById("paymentLinkSearchClear");
  const paymentLinkSearchSummaryEl = document.getElementById("paymentLinkSearchSummary");
  const bulkDiscountStudioEl = document.getElementById("bulkDiscountStudio");
  const bulkDiscountClearAllEl = document.getElementById("bulkDiscountClearAll");
  const bulkDiscountProductSearchEl = document.getElementById("bulkDiscountProductSearch");
  const bulkDiscountProductListEl = document.getElementById("bulkDiscountProductList");
  const bulkDiscountSelectionCountEl = document.getElementById("bulkDiscountSelectionCount");
  const bulkDiscountSelectAllEl = document.getElementById("bulkDiscountSelectAll");
  const bulkDiscountPercentEl = document.getElementById("bulkDiscountPercent");
  const bulkDiscountStartDateEl = document.getElementById("bulkDiscountStartDate");
  const bulkDiscountStartTimeEl = document.getElementById("bulkDiscountStartTime");
  const bulkDiscountEndDateEl = document.getElementById("bulkDiscountEndDate");
  const bulkDiscountEndTimeEl = document.getElementById("bulkDiscountEndTime");
  const bulkDiscountPreviewEl = document.getElementById("bulkDiscountPreview");
  const bulkDiscountSubmitEl = document.getElementById("bulkDiscountSubmit");
  const selectedBulkDiscountProductIds = new Set();
  let lastDebtCollectionLinks = [];
  const debtCollectionPageByStatus = new Map([["ACTIVE", 1], ["ARCHIVED", 1]]);
  const debtCollectionPageSize = 4;
  const expandedDebtCollectionIds = new Set();
  const debtPayerPageByCollectionId = new Map();
  const debtPayerPageSize = 10;
  let preparedDebtCsvRows = [];
  let debtCsvImportVersion = 0;
  let debtAppendTarget = null;
  let quickPaymentPollTimer = null;
  let quickPaymentPollGeneration = 0;
  let pendingCartRecommendationProductIds = [];
  let currentKyc = null;
  let currentInvoicingProfile = null;
  let lastPayments = [];
  let lastPayouts = [];
  let lastFinances = null;
  let lastTotalFinances = null;
  let lastPayableBalance = null;
  let lastBalances = null;
  const GAMIFICATION_XP_PER_SALE = 50;
  const GAMIFICATION_XP_PER_VISIT = 2;
  // Progression tuning lives here. Change xpRequired values without touching map rendering or animation code.
  const ADVENTURE_LEVELS = [
    { id: 1, name: "Perdiz", englishName: "Quail", xpRequired: 0, character: "Pipa", rarity: "Exploradora", asset: "/assets/profile-1.png", alt: "Una perdiz ilustrada", description: "Curiosa, veloz y siempre lista para dar el primer paso." },
    { id: 2, name: "Capibara", englishName: "Capybara", xpRequired: 100, character: "Capi", rarity: "Compañero", asset: "/assets/profile-2.png", alt: "Un capibara ilustrado", description: "Convierte el crecimiento constante en un paseo tranquilo." },
    { id: 3, name: "Oso hormiguero", englishName: "Anteater", xpRequired: 250, character: "Turi", rarity: "Rastreador", asset: "/assets/profile-3.png", alt: "Un oso hormiguero ilustrado", description: "Encuentra oportunidades donde otros solo ven camino." },
    { id: 4, name: "Suricata", englishName: "Meerkat", xpRequired: 450, character: "Suri", rarity: "Vigía", asset: "/assets/profile-4.png", alt: "Una suricata ilustrada", description: "Mira lejos y te recuerda cuál es la próxima meta." },
    { id: 5, name: "Loro vaquero", englishName: "Cowboy Parrot", xpRequired: 700, character: "Pico", rarity: "Raro", asset: "/assets/gamification-1.png", alt: "Un loro colorido con sombrero vaquero", description: "Cruza la selva con estilo y celebra cada avance." },
    { id: 6, name: "Guacamaya azul", englishName: "Blue Macaw", xpRequired: 1000, character: "Ala", rarity: "Épico", asset: "/assets/gamification-2.png", alt: "Una guacamaya azul volando", description: "Toma altura para mostrarte todo lo que ya construiste." },
    { id: 7, name: "Lechuza", englishName: "Owl", xpRequired: 1400, character: "Luma", rarity: "Épico", asset: "/assets/gamification-3.png", alt: "Una lechuza aventurera", description: "La constancia ilumina incluso los caminos más oscuros." },
    { id: 8, name: "Perezoso", englishName: "Sloth", xpRequired: 1900, character: "Moro", rarity: "Legendario", asset: "/assets/gamification-4.png", alt: "Un perezoso en la etapa final", description: "Crecer con paciencia también merece una gran celebración." },
  ];
  window.ADVENTURE_LEVELS = ADVENTURE_LEVELS;
  // World rewards use only signals the application already owns. Benefits that
  // require billing or promotion infrastructure are deliberately not implied.
  const ADVENTURE_REWARDS = [
    { id: "first-view", title: "Primera mirada", icon: "✦", requirement: { kind: "visits", threshold: 1 }, requirementCopy: "Recibe 1 visita", description: "Tu escaparate empezó a viajar: ganaste la insignia Mirada." },
    { id: "first-sale", title: "Primera venta", icon: "◆", requirement: { kind: "sales", threshold: 1 }, requirementCopy: "Completa 1 venta", description: "La primera compra exitosa enciende una celebración especial." },
    { id: "two-days", title: "2 días con estrella", icon: "2", requirement: { kind: "dailyLoginStars", threshold: 2 }, requirementCopy: "Vuelve 2 días", description: "Dos visitas diarias a tu panel desbloquean la insignia Ritmo." },
    { id: "discovered", title: "Tienda descubierta", icon: "◎", requirement: { kind: "visits", threshold: 100 }, requirementCopy: "Alcanza 100 visitas", description: "Tu tienda ya encontró una audiencia real." },
    { id: "seven-days", title: "Semana constante", icon: "7", requirement: { kind: "dailyLoginStars", threshold: 7 }, requirementCopy: "Suma 7 estrellas diarias", description: "Una semana de constancia deja una huella brillante en la ruta." },
    { id: "ten-sales", title: "Diez celebraciones", icon: "10", requirement: { kind: "sales", threshold: 10 }, requirementCopy: "Completa 10 ventas", description: "Diez pagos exitosos desbloquean el cofre de celebración." },
    { id: "unstoppable", title: "Tesoro imparable", icon: "★", requirement: { kind: "combined", sales: 25, visits: 500 }, requirementCopy: "25 ventas + 500 visitas", description: "La combinación final de ventas y audiencia revela el gran tesoro." },
  ];
  const ADVENTURE_WORLD_STAGES = [
    { type: "start", id: "start", title: "Tu tienda despega" },
    { type: "character", id: "character-1", levelIndex: 0 },
    { type: "reward", rewardIndex: 0 },
    { type: "character", id: "character-2", levelIndex: 1 },
    { type: "reward", rewardIndex: 1 },
    { type: "character", id: "character-3", levelIndex: 2 },
    { type: "reward", rewardIndex: 2 },
    { type: "character", id: "character-4", levelIndex: 3 },
    { type: "reward", rewardIndex: 3 },
    { type: "character", id: "character-5", levelIndex: 4 },
    { type: "reward", rewardIndex: 4 },
    { type: "character", id: "character-6", levelIndex: 5 },
    { type: "reward", rewardIndex: 5 },
    { type: "character", id: "character-7", levelIndex: 6 },
    { type: "reward", rewardIndex: 6 },
    { type: "character", id: "character-8", levelIndex: 7, special: true },
  ];
  const GAMIFICATION_RUNNERS = [
    { name: "Perdiz", asset: "/assets/profile-1.png", description: "Paso atento" },
    { name: "Capibara", asset: "/assets/profile-2.png", description: "Ritmo sereno" },
    { name: "Oso hormiguero", asset: "/assets/profile-3.png", description: "Ruta curiosa" },
    { name: "Suricata", asset: "/assets/profile-4.png", description: "Mirada alerta" },
  ];
  const GAMIFICATION_STARS = [
    { id: "first-view", title: "Primera mirada", description: "El enlace de tu tienda recibió su primera visita.", earned: ({ visits }) => visits >= 1, progress: ({ visits }) => `${Math.min(visits, 1)}/1 visita` },
    { id: "first-sale", title: "Primera venta", description: "Completaste tu primer pago exitoso.", earned: ({ sales }) => sales >= 1, progress: ({ sales }) => `${Math.min(sales, 1)}/1 venta` },
    { id: "hundred-views", title: "Tienda descubierta", description: "Alcanzaste 100 visitas a la tienda.", earned: ({ visits }) => visits >= 100, progress: ({ visits }) => `${Math.min(visits, 100)}/100 visitas` },
    { id: "ten-sales", title: "Diez celebraciones", description: "Acumulaste 10 pagos exitosos.", earned: ({ sales }) => sales >= 10, progress: ({ sales }) => `${Math.min(sales, 10)}/10 ventas` },
    { id: "unstoppable", title: "Negocio imparable", description: "Llegaste a 25 ventas y 500 visitas.", earned: ({ sales, visits }) => sales >= 25 && visits >= 500, progress: ({ sales, visits }) => `${Math.min(sales, 25)}/25 ventas · ${Math.min(visits, 500)}/500 visitas` },
  ];
  let gamificationToastTimer = null;
  let gamificationAnnouncementQueue = [];
  let activeGamificationAnnouncement = null;
  const progressCelebrationFetches = new Set();
  const queuedProgressLevels = new Set();
  let progressAcknowledgementChain = Promise.resolve();
  let birdUnlockQueue = [];
  let adventureRenderedXp = null;
  let adventureRenderedScope = null;
  let adventureMarkerAnimation = null;
  let adventureLevelUpTimer = null;
  let adventureXpToastTimer = null;
  let lastAdventureState = null;
  let lastAdventureCommerceState = null;
  let adventureInitialScrollScope = null;
  let dailyLoginReward = { awarded: false, totalStars: 0 };
  const MONEY_VISIBILITY_KEY = "pagosya_dashboard_hide_money";
  let monetaryValuesHidden = false;
  try {
    monetaryValuesHidden = localStorage.getItem(MONEY_VISIBILITY_KEY) === "true";
  } catch {
    // Keep the control usable for this visit if browser storage is unavailable.
  }
  let paymentStatusFilter = "active";
  let orderSearch = "";
  let paymentPage = 1;
  const PAYMENT_PAGE_SIZE = 20;
  let lastStores = [];
  let currentStoreDomains = [];
  let lastCategories = [];
  const openCategoryEditorIds = new Set();
  let draggedCategoryId = null;
  let categoryOrderSaveTimer = null;
  let categoryOrderSaveVersion = 0;
  let dashboardRefreshVersion = 0;
  let domainShop = null;
  let currentStoreId = sessionStorage.getItem("pagosya_current_store_id") || null;
  let debtLinkStatusTab = "ACTIVE";
  const DEFAULT_OPEN_SECTIONS = new Set(["storesSection", "paymentLinksSection"]);
  const dashboardSections = new Map();

  function setDashboardSectionExpanded(sectionId, expanded, remember = true) {
    const entry = dashboardSections.get(sectionId);
    if (!entry) return;
    entry.body.hidden = !expanded;
    entry.panel.classList.toggle("is-collapsed", !expanded);
    entry.toggle.setAttribute("aria-expanded", String(expanded));
    entry.toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${entry.title}`);
    entry.toggle.title = `${expanded ? "Ocultar" : "Mostrar"} ${entry.title}`;
    entry.toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
    if (remember) localStorage.setItem(`pagosya_dashboard_section_${sectionId}`, String(expanded));
  }

  function initDashboardSections() {
    document.querySelectorAll("section.block[id] > .panel").forEach((panel) => {
      const section = panel.parentElement;
      const head = panel.querySelector(":scope > .section-head");
      const title = head?.querySelector("h2")?.textContent?.trim();
      if (!head || !title) return;

      const body = document.createElement("div");
      body.className = "section-body";
      body.id = `${section.id}Body`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      panel.appendChild(body);
      panel.classList.add("collapsible-panel");

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "section-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.innerHTML = `<span>Ocultar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
      head.appendChild(toggle);
      dashboardSections.set(section.id, { body, panel, toggle, title });

      const saved = localStorage.getItem(`pagosya_dashboard_section_${section.id}`);
      const expanded = saved === null ? DEFAULT_OPEN_SECTIONS.has(section.id) : saved === "true";
      setDashboardSectionExpanded(section.id, expanded, false);
      toggle.addEventListener("click", () => setDashboardSectionExpanded(section.id, toggle.getAttribute("aria-expanded") !== "true"));
    });
  }

  const COLLAPSE_CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

  function savedExpandedState(key, fallback) {
    const saved = localStorage.getItem(key);
    return saved === null ? fallback : saved === "true";
  }

  function initInlineCollapsible(sectionId, headSelector, toggleId, storageKey, label, defaultExpanded) {
    const section = document.getElementById(sectionId);
    const head = section?.querySelector(headSelector);
    const toggle = document.getElementById(toggleId);
    if (!section || !head || !toggle) return;

    const body = document.createElement("div");
    body.className = "nested-section-body";
    body.id = `${sectionId}Body`;
    while (head.nextSibling) body.appendChild(head.nextSibling);
    section.appendChild(body);
    toggle.classList.add("inline-section-toggle");
    toggle.setAttribute("aria-controls", body.id);

    const setExpanded = (expanded, remember = true) => {
      body.hidden = !expanded;
      section.classList.toggle("is-collapsed", !expanded);
      toggle.setAttribute("aria-expanded", String(expanded));
      toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${label}`);
      toggle.innerHTML = `<span>${expanded ? "Ocultar" : "Mostrar"}</span>${COLLAPSE_CHEVRON}`;
      if (remember) localStorage.setItem(storageKey, String(expanded));
    };

    setExpanded(savedExpandedState(storageKey, defaultExpanded), false);
    toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
  }

  function initStoreEditorSections() {
    document.querySelectorAll(".store-editor-section").forEach((section, index) => {
      const head = section.querySelector(":scope > .editor-section-head");
      const title = head?.querySelector("h3")?.textContent?.trim();
      if (!head || !title) return;

      const body = document.createElement("div");
      body.className = "store-editor-section-body";
      body.id = `storeEditorSectionBody${index + 1}`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      section.appendChild(body);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost editor-section-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.innerHTML = `<span>Mostrar</span>${COLLAPSE_CHEVRON}`;
      head.appendChild(toggle);

      const storageKey = `pagosya_store_editor_section_${index + 1}`;
      const setExpanded = (expanded, remember = true) => {
        body.hidden = !expanded;
        section.classList.toggle("is-expanded", expanded);
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${title}`);
        toggle.title = `${expanded ? "Ocultar" : "Mostrar"} ${title}`;
        toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
        if (remember) localStorage.setItem(storageKey, String(expanded));
      };

      setExpanded(savedExpandedState(storageKey, index === 0), false);
      toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
    });
  }

  function initDashboardSidebarToggle() {
    const shell = document.querySelector(".dashboard-shell");
    const toggle = document.getElementById("dashboardSidebarToggle");
    if (!shell || !toggle) return;
    const storageKey = "pagosya_dashboard_sidebar_collapsed";
    document.querySelectorAll(".dashboard-nav-button").forEach((link) => {
      link.title = link.textContent.trim();
    });
    const setCollapsed = (collapsed, remember = true) => {
      shell.classList.toggle("is-sidebar-collapsed", collapsed);
      toggle.setAttribute("aria-expanded", String(!collapsed));
      toggle.setAttribute("aria-label", (collapsed ? "Expandir" : "Contraer") + " Gestión del comercio");
      toggle.title = collapsed ? "Expandir menú" : "Contraer menú";
      if (remember) localStorage.setItem(storageKey, String(collapsed));
    };
    setCollapsed(savedExpandedState(storageKey, false), false);
    toggle.addEventListener("click", () => setCollapsed(!shell.classList.contains("is-sidebar-collapsed")));
  }

  let storePreviewFullscreen = false;
  let storePreviewInitialOpenPending = true;
  function setStorePreviewFullscreen(fullscreen) {
    if (fullscreen && (!sessionToken || !document.body.classList.contains("is-logged-in") || !lastStores.some((store) => store.id === currentStoreId))) return;
    const toggle = document.getElementById("previewFullscreenToggle");
    const sidebar = document.querySelector(".dashboard-sidebar");
    const navHandle = document.getElementById("storeFullscreenNavHandle");
    const previewPanel = document.querySelector(".store-preview-panel");
    storePreviewFullscreen = Boolean(fullscreen);
    if (storePreviewFullscreen) storePreviewInitialOpenPending = false;
    if (storePreviewFullscreen && previewPanel?.parentElement !== document.body) document.body.appendChild(previewPanel);
    document.body.classList.toggle("store-preview-fullscreen", storePreviewFullscreen);
    sidebar?.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
    toggle?.setAttribute("aria-pressed", String(storePreviewFullscreen));
    toggle?.setAttribute("aria-label", storePreviewFullscreen ? "Salir de la pantalla completa de Tu tienda" : "Ver Tu tienda en pantalla completa");
    if (toggle) toggle.title = storePreviewFullscreen ? "Salir de pantalla completa" : "Ver Tu tienda en pantalla completa";
    navHandle?.setAttribute("aria-expanded", "false");
    if (storePreviewFullscreen) {
      const assistantToggle = document.getElementById("visualAssistantToggle");
      if (assistantToggle?.getAttribute("aria-expanded") !== "true") assistantToggle.click();
      setStorePreviewExpanded(true, { preservePosition: false });
      requestAnimationFrame(() => toggle?.focus({ preventScroll: true }));
    } else {
      placeStorePreviewForDashboardView(document.body.dataset.dashboardView || "appearance");
      requestAnimationFrame(() => toggle?.focus({ preventScroll: true }));
    }
  }

  function initStorePreviewFullscreen() {
    const toggle = document.getElementById("previewFullscreenToggle");
    const sidebar = document.querySelector(".dashboard-sidebar");
    const navHandle = document.getElementById("storeFullscreenNavHandle");
    const navBackdrop = document.getElementById("storeFullscreenNavBackdrop");
    if (!toggle || !sidebar || !navHandle || !navBackdrop) return;
    let closePeekTimer = 0;
    const revealNavigation = () => {
      window.clearTimeout(closePeekTimer);
      sidebar.classList.add("is-store-nav-peeking");
    };
    const scheduleNavigationClose = () => {
      window.clearTimeout(closePeekTimer);
      closePeekTimer = window.setTimeout(() => {
        if (!sidebar.matches(":hover") && !sidebar.contains(document.activeElement) && !sidebar.classList.contains("is-store-nav-pinned")) {
          sidebar.classList.remove("is-store-nav-peeking");
        }
      }, 100);
    };
    toggle.addEventListener("click", () => setStorePreviewFullscreen(!storePreviewFullscreen));
    navHandle.addEventListener("pointerenter", revealNavigation);
    navHandle.addEventListener("pointerleave", scheduleNavigationClose);
    sidebar.addEventListener("pointerenter", revealNavigation);
    sidebar.addEventListener("pointerleave", scheduleNavigationClose);
    navHandle.addEventListener("click", () => {
      const pinned = !sidebar.classList.contains("is-store-nav-pinned");
      sidebar.classList.toggle("is-store-nav-pinned", pinned);
      navHandle.setAttribute("aria-expanded", String(pinned));
      if (pinned) sidebar.querySelector(".dashboard-nav-button[aria-current='page']")?.focus({ preventScroll: true });
    });
    navBackdrop.addEventListener("click", () => {
      sidebar.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
      navHandle.setAttribute("aria-expanded", "false");
      navHandle.focus({ preventScroll: true });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (sidebar.classList.contains("is-store-nav-pinned")) {
        event.preventDefault();
        sidebar.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
        navHandle.setAttribute("aria-expanded", "false");
        navHandle.focus({ preventScroll: true });
        return;
      }
      if (!storePreviewFullscreen) return;
      event.preventDefault();
      setStorePreviewFullscreen(false);
    });
  }

  function initEditorSettingsGroups() {
    document.querySelectorAll(".editor-settings-group").forEach((group) => {
      const head = group.querySelector(":scope > .editor-settings-heading");
      const title = head?.querySelector("h4")?.textContent?.trim();
      if (!head || !title) return;

      const body = document.createElement("div");
      body.className = "editor-settings-group-body";
      body.id = `${group.getAttribute("aria-labelledby") || `editorSettingsGroup${Date.now()}`}Body`;
      while (head.nextSibling) body.appendChild(head.nextSibling);
      group.appendChild(body);

      const actions = document.createElement("div");
      actions.className = "editor-settings-actions";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "ghost settings-group-toggle";
      toggle.setAttribute("aria-controls", body.id);
      toggle.innerHTML = `<span>Mostrar</span>${COLLAPSE_CHEVRON}`;
      actions.appendChild(toggle);
      head.appendChild(actions);

      const storageKey = `pagosya_editor_settings_${group.getAttribute("aria-labelledby") || title}`;
      const setExpanded = (expanded, remember = true) => {
        body.hidden = !expanded;
        group.classList.toggle("is-collapsed", !expanded);
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} ${title}`);
        toggle.title = `${expanded ? "Ocultar" : "Mostrar"} ${title}`;
        toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
        if (remember) localStorage.setItem(storageKey, String(expanded));
      };

      setExpanded(savedExpandedState(storageKey, false), false);
      toggle.addEventListener("click", () => setExpanded(toggle.getAttribute("aria-expanded") !== "true"));
    });
  }

  initDashboardSections();
  const DASHBOARD_VIEW_KEY = "pagosya_dashboard_view";
  const DASHBOARD_VIEW_COPY = {
    overview: ["Resumen", "Tu operación, ventas y estado general en un solo lugar."],
    progress: ["Progreso", "Convierte la actividad real de tu tienda en niveles, estrellas y nuevos compañeros."],
    stores: ["Mi tienda", "Tus tiendas, sus diseños y sus catálogos. Todo desde un mismo perfil."],
    categories: ["Categorías", "Organiza el catálogo en el orden que verán tus clientes."],
    discounts: ["Correos y marketing", "Cuida a tus clientes y haz que vuelvan."],
    marketing: ["Correos y marketing", "Mensajes, Comeback y promociones para la tienda seleccionada."],
    experiments: ["Pruebas A/B", "Compara dos diseños y descubre cuál convierte más visitas en compras."],
    integrations: ["Integraciones", "Conecta las herramientas que tu tienda necesita."],
    products: ["Productos", "Tu catálogo y YAPI: añade productos paso a paso."],
    media: ["Medios", "Las imágenes, videos e iconos de la tienda seleccionada."],
    workspace: ["Mi tienda", "Diseña con YAPI y administra tu negocio desde aquí."],
    appearance: ["Apariencia", "Personaliza la identidad visual y revisa los cambios en vivo."],
    "charge-links": ["Link de cobro", "Genera un QR inmediato o un portal por carnet para la tienda seleccionada."],
    payments: ["Pagos", "Consulta el estado y el detalle de tus cobros recientes."],
    payouts: ["Desembolsos", "Revisa las transferencias programadas y completadas."],
    compliance: ["Cumplimiento y credenciales", "Completa KYC, facturación electrónica y credenciales de producción."],
  };

  let pendingStudioAction = null;
  function deliverStudioAction() {
    const frame = document.getElementById("merchantStudioFrame");
    if (pendingStudioAction?.storeId === currentStoreId && frame.dataset.ready === "true") frame.contentWindow?.postMessage({ type: "pagosya:studio-action", storeId: currentStoreId, ...pendingStudioAction }, location.origin);
  }
  document.getElementById("workspaceYapiForm").addEventListener("submit", event => {
    event.preventDefault();
    const field = document.getElementById("workspaceYapiDraft");
    if (!field.value.trim()) return;
    if (!currentStoreId) { document.getElementById("workspaceYapiStatus").textContent = "Selecciona o crea una tienda para conversar con YAPI."; return; }
    pendingStudioAction = { action: "compose", text: field.value.trim(), storeId: currentStoreId };
    history.pushState(null, "", "#dashboard-workspace"); setDashboardView("workspace"); deliverStudioAction();
  });
  function canLeaveMerchantStudio() {
    try { return ["merchantStudioFrame", "productGuideFrame", "storeMarketingFrame", "storeExperimentsFrame", "storeIntegrationsFrame"].every(id => document.getElementById(id).contentWindow?.pagosyaStudioCanLeave?.() ?? true); } catch { return false; }
  }
  document.getElementById("marketingTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-marketing-tab]"); if (!button) return;
    const frame = document.getElementById("storeMarketingFrame");
    if (frame.contentWindow?.pagosyaStudioCanLeave && !frame.contentWindow.pagosyaStudioCanLeave()) return;
    document.getElementById("marketingTabs").dataset.tab = button.dataset.marketingTab;
    document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab === button)));
    document.getElementById("marketingPromotions").hidden = button.dataset.marketingTab !== "promotions";
    frame.removeAttribute("src"); syncStoreResourceViews("marketing");
  });
  function syncStoreResourceViews(view) {
    for (const [kind, id] of [["media", "storeMediaFrame"], ["products", "productGuideFrame"], ["marketing", "storeMarketingFrame"], ["integrations", "storeIntegrationsFrame"], ["experiments", "storeExperimentsFrame"]]) {
      const frame = document.getElementById(id);
      if (frame.dataset.storeId && frame.dataset.storeId !== currentStoreId) { frame.removeAttribute("src"); delete frame.dataset.storeId; delete frame.dataset.ready; delete frame.dataset.pendingProduct; }
      if (view !== kind) continue;
      frame.hidden = !currentStoreId || !sessionToken || kind === "marketing" && document.getElementById("marketingTabs").dataset.tab === "promotions";
      const empty = document.querySelector(`[data-resource-empty="${kind}"]`); if (empty) empty.hidden = Boolean(currentStoreId && sessionToken);
      if (!frame.hidden && !frame.getAttribute("src")) {
        sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
        frame.dataset.storeId = currentStoreId;
        frame.src = `/studio/?embedded=1&${kind === "products" ? "productGuide=1" : `library=${kind}${kind === "marketing" ? `&tab=${document.getElementById("marketingTabs").dataset.tab}` : ""}`}&store=${encodeURIComponent(currentStoreId)}`;
      }
    }
  }
  document.getElementById("startProductGuide").addEventListener("click", () => {
    syncStoreResourceViews("products");
    document.getElementById("productGuideFrame").scrollIntoView({ block: "center", behavior: "smooth" });
    document.getElementById("productGuideFrame").contentWindow?.postMessage({type:"pagosya:product-guide-new"}, location.origin);
  });
  window.addEventListener("message", event => {
    if (event.origin !== location.origin) return;
    const frame = ["storeMediaFrame", "productGuideFrame", "storeMarketingFrame", "storeExperimentsFrame", "storeIntegrationsFrame"].map(id => document.getElementById(id)).find(frame => frame.contentWindow === event.source);
    if (!frame || frame.dataset.storeId !== currentStoreId || event.data?.storeId !== currentStoreId) return;
    if (event.data.type === "pagosya:workspace" && ["marketing", "integrations", "experiments", "workspace"].includes(event.data.view)) {
      if (!canLeaveMerchantStudio()) return;
      if (event.data.view === "marketing" && ["program", "templates"].includes(event.data.tab)) {
        document.getElementById("marketingTabs").dataset.tab = event.data.tab;
        document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.marketingTab === event.data.tab)));
        document.getElementById("marketingPromotions").hidden = true;
        document.getElementById("storeMarketingFrame").removeAttribute("src");
      }
      history.pushState(null, "", `#dashboard-${event.data.view}`); setDashboardView(event.data.view); return;
    }
    if (event.data.type === "pagosya:source-publication-changed") { void refresh(); return; }
    if (event.data.type === "pagosya:resource-height" && Number.isFinite(event.data.height)) frame.style.height = `${Math.min(4000, Math.max(340, event.data.height))}px`;
    if (event.data.type === "pagosya:product-guide-ready") {
      frame.dataset.ready = "true";
      if (frame.dataset.pendingProduct) { frame.contentWindow?.postMessage({type:"pagosya:product-guide-edit", storeId:currentStoreId, product:JSON.parse(frame.dataset.pendingProduct)}, location.origin); delete frame.dataset.pendingProduct; }
    }
    if (event.data.type === "pagosya:product-saved") {
      for (const id of ["storeMediaFrame"]) document.getElementById(id).removeAttribute("src");
      void refresh();
    }
  });
  function syncMerchantStoreWorkspace(view = document.body.dataset.dashboardView) {
    syncStoreResourceViews(view);
    const store = lastStores.find(candidate => candidate.id === currentStoreId);
    const views = ["workspace", "products", "categories", "charge-links", "payments", "compliance"];
    document.getElementById("merchantStoreTabs").hidden = !store || !views.includes(view);
    document.getElementById("merchantWorkspaceStoreName").textContent = store?.name || "Mi tienda";
    const frame = document.getElementById("merchantStudioFrame");
    if (!sessionToken || !store || frame.dataset.storeId && frame.dataset.storeId !== store.id) {
      frame.removeAttribute("src"); delete frame.dataset.storeId; delete frame.dataset.ready;
    }
    frame.hidden = !store;
    document.getElementById("merchantStudioEmpty").hidden = Boolean(store);
    if (view === "workspace" && sessionToken && store && !frame.getAttribute("src")) {
      sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value.replace(/\/$/, ""));
      frame.dataset.storeId = store.id;
      frame.src = `/studio/?source=1&embedded=1&store=${encodeURIComponent(store.id)}`;
    }
    if (view === "workspace" && frame.getAttribute("src")) frame.contentWindow?.postMessage({ type: "pagosya:catalog-refresh" }, location.origin);
  }
  window.addEventListener("message", event => {
    const frame = document.getElementById("merchantStudioFrame");
    if (event.origin !== location.origin || event.source !== frame.contentWindow) return;
    if (event.data?.type === "pagosya:source-publication-changed" && event.data.storeId === currentStoreId) {
      const store = lastStores.find(s => s.id === currentStoreId);
      if (store) {
        store.publishedSourceRevision = event.data.revision;
        if (typeof event.data.active === 'boolean') store.sourcePublicationPaused = !event.data.active;
        if (typeof event.data.contactFormEnabled === 'boolean') store.contactFormEnabled = event.data.contactFormEnabled;
      }
      syncStoreDraftUi(); return;
    }
    if (event.data?.type === "pagosya:studio-ready" && event.data.storeId === currentStoreId) { frame.dataset.ready = "true"; frame.contentWindow?.postMessage({ type: "pagosya:workspace-theme", theme: document.documentElement.dataset.dashboardTheme }, location.origin); deliverStudioAction(); return; }
    if (event.data?.type === "pagosya:studio-action-received" && event.data.storeId === currentStoreId) {
      if (pendingStudioAction?.action === "compose") document.getElementById("workspaceYapiDraft").value = "";
      pendingStudioAction = null; return;
    }
    if (event.data?.type === "pagosya:session-expired") { sessionToken = ""; showLoggedOut(); return; }
    if (event.data?.type === "pagosya:workspace" && ["stores", "products", "categories", "charge-links", "marketing", "integrations", "experiments"].includes(event.data.view)) {
      if (event.data.view === "marketing" && event.data.tab === "program") {
        document.getElementById("marketingTabs").dataset.tab = "program";
        document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed", String(tab.dataset.marketingTab === "program")));
        document.getElementById("marketingPromotions").hidden = true;
        document.getElementById("storeMarketingFrame").removeAttribute("src");
      }
      history.pushState(null, "", `#dashboard-${event.data.view}`);
      setDashboardView(event.data.view);
      document.getElementById("dashboardWorkspace").scrollIntoView({ block: "start" });
    }
  });

  function placeStorePreviewForDashboardView(view) {
    const previewPanel = document.querySelector(".store-preview-panel");
    // A selection inside the iframe calls setDashboardView("appearance").
    // Fullscreen owns the panel at the body level; moving it back into the
    // animated appearance page makes position:fixed relative to that page,
    // while the body remains scroll-locked. The result is a preview stranded
    // below the viewport with no way to scroll down to it.
    if (storePreviewFullscreen) {
      if (previewPanel && previewPanel.parentElement !== document.body) document.body.appendChild(previewPanel);
      return;
    }
    const destination = view === "products"
      ? document.getElementById("productPreviewMount")
      : view === "appearance"
        ? document.querySelector(".store-studio")
        : null;
    if (previewPanel && destination && previewPanel.parentElement !== destination) destination.appendChild(previewPanel);
  }

  function setDashboardView(view, { remember = true } = {}) {
    if (view === "content") view = "workspace";
    if (view === "discounts") { view = "marketing"; document.getElementById("marketingTabs").dataset.tab = "promotions"; document.getElementById("marketingPromotions").hidden = false; document.querySelectorAll("[data-marketing-tab]").forEach(tab => tab.setAttribute("aria-pressed",String(tab.dataset.marketingTab === "promotions"))); }
    const nextView = DASHBOARD_VIEW_COPY[view] ? view : "overview";
    if (nextView !== "appearance" && storePreviewFullscreen) setStorePreviewFullscreen(false);
    const viewChanged = document.body.dataset.dashboardView !== nextView;
    if (nextView !== "progress" && document.getElementById("adventureGuide")?.getAttribute("aria-expanded") === "true") {
      setAdventureGuideOpen(false);
    }
    if (viewChanged) {
      document.body.dataset.dashboardView = nextView;
      requestAnimationFrame(() => {
        if (document.body.dataset.dashboardView === nextView) syncAssistantWorkspaceVisibility(nextView);
      });
      document.querySelectorAll("[data-dashboard-page]").forEach((element) => {
        element.hidden = element.dataset.dashboardPage !== nextView;
        element.classList.remove("page-entering");
        if (!element.hidden) {
          requestAnimationFrame(() => element.classList.add("page-entering"));
        }
      });
    }
    document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
      if (button.dataset.dashboardView === nextView && !button.dataset.studioTool) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const [title, description] = DASHBOARD_VIEW_COPY[nextView];
    document.getElementById("workspaceTitle").textContent = title;
    document.getElementById("workspaceDescription").textContent = description;
    if (nextView === "workspace") window.scrollTo({ top: 0, behavior: "instant" });
    if (nextView === "appearance" && dashboardSections.get("storeSettingsSection")?.toggle.getAttribute("aria-expanded") !== "true") {
      setDashboardSectionExpanded("storeSettingsSection", true, false);
    }
    syncMerchantStoreWorkspace(nextView);
    placeStorePreviewForDashboardView(nextView);
    // Keep an explicitly opened settings pane open when its controls update
    // the selected canvas element. Only entering Appearance opens fullscreen.
    if (nextView === "appearance" && viewChanged && !storePreviewFullscreen) {
      requestAnimationFrame(() => {
        if (document.body.dataset.dashboardView === "appearance" && !storePreviewFullscreen) setStorePreviewFullscreen(true);
      });
    }
    if (nextView === "products" || nextView === "appearance") requestAnimationFrame(syncPreviewCanvasSize);
    if (remember) {
      try { localStorage.setItem(DASHBOARD_VIEW_KEY, nextView); } catch {}
    }
    if (nextView === "progress" && lastAdventureState) {
      requestAnimationFrame(() => renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState }));
    }
  }

  document.querySelectorAll("[data-dashboard-view]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      setAssistantOpen(false, false, false);
      history.pushState(null, "", button.href);
      pendingStudioAction = button.dataset.studioTool ? { action: button.dataset.studioTool, storeId: currentStoreId } : pendingStudioAction;
      setDashboardView(button.dataset.dashboardView);
      if (button.dataset.studioTool) {
        document.querySelectorAll('#dashboardNav [data-dashboard-view="workspace"]').forEach(link => link.removeAttribute("aria-current"));
        button.setAttribute("aria-current", "page"); deliverStudioAction();
      }
      document.querySelector(".dashboard-sidebar")?.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
      const menuHandle = document.getElementById("storeFullscreenNavHandle");
      menuHandle?.setAttribute("aria-expanded", "false");
      requestAnimationFrame(() => {
        document.querySelector(".dashboard-sidebar")?.classList.remove("is-store-nav-pinned", "is-store-nav-peeking");
        menuHandle?.focus({ preventScroll: true });
      });
      button.scrollIntoView({ block: "nearest", inline: "center" });
      document.querySelector(".workspace-header")?.scrollIntoView({ block: "start" });
    });
  });
  let initialDashboardView = "overview";
  const viewFromHash = location.hash.startsWith("#dashboard-") ? location.hash.slice(11) : "";
  try { initialDashboardView = viewFromHash || localStorage.getItem(DASHBOARD_VIEW_KEY) || "overview"; } catch { initialDashboardView = viewFromHash || "overview"; }
  setDashboardView(initialDashboardView, { remember: false });
  window.addEventListener("popstate", () => setDashboardView(location.hash.slice(11), { remember: false }));
  document.getElementById("gamificationCompanions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-companion-select]");
    if (!button || button.disabled || !lastFinances) return;
    try { localStorage.setItem(gamificationCompanionKey(), button.dataset.companionSelect); } catch {}
    renderGamification(lastFinances, { announce: false });
  });
  document.getElementById("gamificationRunnerPicker")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-runner-select]");
    if (!button || !lastFinances) return;
    try { localStorage.setItem(gamificationRunnerKey(), button.dataset.runnerSelect); } catch {}
    renderAdventureRunner();
  });
  document.getElementById("adventureLevelNodes")?.addEventListener("click", (event) => {
    const node = event.target.closest("[data-adventure-level-index]");
    if (!node || node.disabled) return;
    renderAdventureLevelDetail(ADVENTURE_LEVELS[Number(node.dataset.adventureLevelIndex)]);
  });
  document.getElementById("adventureGuide")?.addEventListener("click", () => {
    playAdventureTouchSound("open");
    setAdventureGuideOpen(true);
  });
  document.getElementById("adventureGuideClose")?.addEventListener("click", () => {
    playAdventureTouchSound("close");
    setAdventureGuideOpen(false, { restoreFocus: true });
  });
  document.getElementById("animalAdventure")?.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (document.getElementById("adventureGuideBubble").hidden) return;
    playAdventureTouchSound("close");
    setAdventureGuideOpen(false, { restoreFocus: true });
  });
  document.getElementById("adventureDebugControls")?.addEventListener("click", (event) => {
    if (!lastFinances) return;
    const addButton = event.target.closest("[data-adventure-xp]");
    const resetButton = event.target.closest("[data-adventure-reset]");
    if (!addButton && !resetButton) return;
    const actualXP = gamificationState(lastFinances).xp;
    if (resetButton) {
      try { localStorage.removeItem(adventureDebugXpKey()); } catch {}
      renderAnimalAdventure(actualXP, { animate: true });
      return;
    }
    const previousXP = resolvedAdventureXp(actualXP);
    const gainedXP = Math.max(0, Number(addButton.dataset.adventureXp) || 0);
    const nextXP = previousXP + gainedXP;
    try { localStorage.setItem(adventureDebugXpKey(), String(nextXP)); } catch {}
    renderAnimalAdventure(nextXP, { animate: true, delta: gainedXP });
  });
  let adventureResizeTimer = null;
  window.addEventListener("resize", () => {
    window.cancelAnimationFrame(adventureResizeTimer);
    adventureResizeTimer = window.requestAnimationFrame(() => {
      if (lastAdventureState && document.getElementById("animalAdventure")?.offsetParent) {
        renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState });
      }
    });
  });
  document.getElementById("gamificationToastClose")?.addEventListener("click", () => hideGamificationToast());
  initDashboardSidebarToggle();
  initStorePreviewFullscreen();
  // The AI studio belongs to the storefront workspace itself. Keep one DOM
  // instance (and therefore one set of form state/listeners) while placing it
  // beside the live preview instead of rendering a second composer above it.
  const integratedVisualAssistantEl = document.getElementById("visualOnboarding");
  const integratedPreviewPanelEl = document.querySelector(".store-preview-panel");
  const integratedPreviewToolsEl = document.getElementById("previewEditorTools");
  if (integratedVisualAssistantEl && integratedPreviewPanelEl && integratedPreviewToolsEl) {
    integratedPreviewPanelEl.insertBefore(integratedVisualAssistantEl, integratedPreviewToolsEl);
  }
  initInlineCollapsible("visualOnboarding", ".visual-onboarding-head", "visualAssistantToggle", "pagosya_visual_assistant_expanded_v2", "asistente de IA", true);
  initInlineCollapsible("customDomainStudio", ".custom-domain-head", "customDomainToggle", "pagosya_custom_domain_expanded", "dominio propio", false);
  const inventoryToggle = document.createElement("button");
  inventoryToggle.type = "button";
  inventoryToggle.id = "inventoryImporterToggle";
  inventoryToggle.className = "ghost inline-section-toggle";
  document.querySelector(".inventory-import-head")?.appendChild(inventoryToggle);
  initInlineCollapsible("inventoryImporter", ".inventory-import-head", "inventoryImporterToggle", "pagosya_inventory_importer_expanded", "importador de inventario", false);
  initStoreEditorSections();
  initEditorSettingsGroups();
  checkoutOriginEl.addEventListener("change", () => {
    sessionStorage.setItem("pagosya_checkout_origin", checkoutOriginEl.value);
    renderCurrentStoreBanner();
    if (lastStores) renderStoreRows(lastStores);
  });

  const MAX_IMAGE_BYTES = 8_000_000;
  const MAX_AI_IMAGES = 24;
  const MAX_GIF_BYTES = 8_000_000;
  const MAX_VIDEO_BYTES = 20_000_000;
  const MAX_GALLERY_IMAGES = 10;
  const inventoryCsvInputEl = document.getElementById("inventoryCsvInput");
  const inventoryImagesInputEl = document.getElementById("inventoryImagesInput");
  const inventoryDropzoneEl = document.getElementById("inventoryDropzone");
  const inventoryFileSummaryEl = document.getElementById("inventoryFileSummary");
  const inventoryConnectionEl = document.getElementById("inventoryConnection");
  const inventoryReviewEl = document.getElementById("inventoryReview");
  const inventoryReviewRowsEl = document.getElementById("inventoryReviewRows");
  const inventoryReviewSummaryEl = document.getElementById("inventoryReviewSummary");
  const inventoryImportStatusEl = document.getElementById("inventoryImportStatus");
  const inventoryAiWarningsEl = document.getElementById("inventoryAiWarnings");
  const inventoryCommitEl = document.getElementById("inventoryCommit");
  let preparedInventoryRows = [];
  let preparedInventoryStoreId = null;
  let inventoryImportInProgress = false;
  let inventoryImportVersion = 0;

  function localDateTimeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }

  function localDateInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }

  function localTimeInputValue(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
  }

  function isoDateTimeInputValue(value) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  function promoCodeDiscountLabel(code) {
    return code.discountType === "PERCENT"
      ? `${code.discountValue}% de descuento`
      : `${money(code.discountValue)} de descuento`;
  }

  function renderPromoCodes(codes) {
    lastPromoCodes = Array.isArray(codes) ? codes : [];
    promoCodeCountEl.textContent = `${lastPromoCodes.length} ${lastPromoCodes.length === 1 ? "código" : "códigos"}`;
    if (!lastPromoCodes.length) {
      promoCodeListEl.innerHTML = '<p class="promo-code-empty">Todavía no creaste códigos. El primero quedará activo apenas lo guardes.</p>';
      return;
    }
    promoCodeListEl.innerHTML = lastPromoCodes.map((code) => `<article class="promo-code-row${code.isActive ? "" : " is-disabled"}" data-promo-code-id="${esc(code.id)}">
      <div class="promo-code-identity"><strong>${esc(code.code)}</strong><span>${code.isActive ? "Activo y listo para compartir" : "Desactivado"}</span></div>
      <div class="promo-code-value"><strong>${esc(promoCodeDiscountLabel(code))}</strong><span>Creado ${new Intl.DateTimeFormat("es-BO", { dateStyle: "medium" }).format(new Date(code.createdAt))}</span></div>
      <div class="promo-code-actions">
        <button class="ghost" type="button" data-promo-copy="${esc(code.code)}" aria-label="Copiar código ${esc(code.code)}">Copiar</button>
        <button class="ghost" type="button" data-promo-share="${esc(code.code)}" aria-label="Compartir código ${esc(code.code)}">Compartir</button>
        <button class="ghost" type="button" data-promo-toggle="${esc(code.id)}" data-active="${code.isActive}" aria-label="${code.isActive ? "Desactivar" : "Activar"} código ${esc(code.code)}">${code.isActive ? "Desactivar" : "Activar"}</button>
      </div>
    </article>`).join("");
  }

  promoCodeTypeEl.addEventListener("change", () => {
    const percent = promoCodeTypeEl.value === "PERCENT";
    promoCodeValueLabelEl.textContent = percent ? "Descuento (%)" : "Descuento fijo (Bs)";
    promoCodeValueEl.max = percent ? "99" : "1000000";
    promoCodeValueEl.step = percent ? "1" : "0.01";
    promoCodeValueEl.value = percent ? "10" : "10.00";
  });

  promoCodeFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    promoCodeStatusEl.textContent = "";
    promoCodeStatusEl.classList.remove("is-success");
    const data = new FormData(promoCodeFormEl);
    const discountType = String(data.get("discountType"));
    const enteredValue = Number(data.get("discountValue"));
    const discountValue = discountType === "FIXED" ? Math.round(enteredValue * 100) : enteredValue;
    const submit = document.getElementById("promoCodeSubmit");
    setButtonBusy(submit, true, "Creando…");
    try {
      const created = await api(`/stores/${currentStoreId}/promo-codes`, {
        method: "POST",
        body: JSON.stringify({ code: String(data.get("code") || "").trim().toUpperCase(), discountType, discountValue }),
      });
      renderPromoCodes([created, ...lastPromoCodes]);
      promoCodeFormEl.reset();
      promoCodeTypeEl.dispatchEvent(new Event("change"));
      promoCodeStatusEl.textContent = `Código ${created.code} creado y activo.`;
      promoCodeStatusEl.classList.add("is-success");
    } catch (error) {
      promoCodeStatusEl.textContent = error.message;
      promoCodeStatusEl.classList.remove("is-success");
    } finally {
      setButtonBusy(submit, false, "Crear código");
    }
  });

  promoCodeListEl.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-promo-copy]");
    const shareButton = event.target.closest("[data-promo-share]");
    const toggleButton = event.target.closest("[data-promo-toggle]");
    if (copyButton) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(copyButton.dataset.promoCopy);
        copyButton.textContent = "Copiado";
        promoCodeStatusEl.textContent = `Código ${copyButton.dataset.promoCopy} copiado.`;
        promoCodeStatusEl.classList.add("is-success");
        window.setTimeout(() => { copyButton.textContent = "Copiar"; }, 1200);
      } catch {
        promoCodeStatusEl.textContent = `No pudimos copiar ${copyButton.dataset.promoCopy}. Selecciona el código y cópialo manualmente.`;
        promoCodeStatusEl.classList.remove("is-success");
      }
      return;
    }
    if (shareButton) {
      const store = lastStores.find((entry) => entry.id === currentStoreId);
      const code = shareButton.dataset.promoShare;
      const url = document.getElementById("currentStoreLink").value;
      const text = `Usa el código ${code} en ${store?.name || "mi tienda"}.`;
      try {
        if (navigator.share) {
          await navigator.share({ title: `Promoción de ${store?.name || "la tienda"}`, text, url });
          promoCodeStatusEl.textContent = `Código ${code} compartido.`;
          promoCodeStatusEl.classList.add("is-success");
        } else {
          if (!navigator.clipboard?.writeText) throw new Error("Share unavailable");
          await navigator.clipboard.writeText(`${text} ${url}`);
          promoCodeStatusEl.textContent = `Mensaje con el código ${code} copiado para compartir.`;
          promoCodeStatusEl.classList.add("is-success");
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          promoCodeStatusEl.textContent = `No pudimos compartir ${code}. Inténtalo de nuevo.`;
          promoCodeStatusEl.classList.remove("is-success");
        }
      }
      return;
    }
    if (!toggleButton || !currentStoreId) return;
    const isActive = toggleButton.dataset.active !== "true";
    toggleButton.disabled = true;
    try {
      const updated = await api(`/stores/${currentStoreId}/promo-codes/${toggleButton.dataset.promoToggle}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });
      renderPromoCodes(lastPromoCodes.map((code) => code.id === updated.id ? updated : code));
      promoCodeStatusEl.textContent = `Código ${updated.code} ${updated.isActive ? "activado" : "desactivado"}.`;
      promoCodeStatusEl.classList.add("is-success");
      requestAnimationFrame(() => promoCodeListEl.querySelector(`[data-promo-toggle="${CSS.escape(updated.id)}"]`)?.focus());
    } catch (error) {
      promoCodeStatusEl.textContent = error.message;
      promoCodeStatusEl.classList.remove("is-success");
      toggleButton.disabled = false;
    }
  });

  function bulkDiscountDateTime(dateValue, timeValue) {
    if (!dateValue || !timeValue) return null;
    const date = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  function visibleBulkDiscountProducts() {
    const query = normalizeProductSearch(bulkDiscountProductSearchEl.value);
    return lastPaymentLinks.filter((link) =>
      link.status === "ACTIVE" && (!query || normalizeProductSearch(link.name).includes(query)),
    );
  }

  function renderBulkDiscountProducts() {
    const activeIds = new Set(lastPaymentLinks.filter((link) => link.status === "ACTIVE").map((link) => link.id));
    [...selectedBulkDiscountProductIds].forEach((id) => {
      if (!activeIds.has(id)) selectedBulkDiscountProductIds.delete(id);
    });
    const products = visibleBulkDiscountProducts();
    bulkDiscountProductListEl.innerHTML = products.length
      ? products.map((link) => `<label class="bulk-discount-product">
          <input type="checkbox" value="${esc(link.id)}" ${selectedBulkDiscountProductIds.has(link.id) ? "checked" : ""}>
          <span>${esc(link.name)}</span>
          <small>${money(link.amount)}</small>
        </label>`).join("")
      : `<p class="payment-link-group-empty">No hay productos activos que coincidan.</p>`;
    const selectedCount = selectedBulkDiscountProductIds.size;
    bulkDiscountSelectionCountEl.textContent = `${selectedCount} ${selectedCount === 1 ? "producto seleccionado" : "productos seleccionados"}`;
    const allVisibleSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
    bulkDiscountSelectAllEl.textContent = allVisibleSelected ? "Quitar visibles" : "Seleccionar visibles";
    bulkDiscountSubmitEl.disabled = selectedCount === 0;
  }

  function updateBulkDiscountPreview() {
    const percent = Number(bulkDiscountPercentEl.value);
    const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
    const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
    if (!Number.isInteger(percent) || !start || !end) {
      bulkDiscountPreviewEl.textContent = "Completa el porcentaje y las fechas para revisar la campaña.";
      return;
    }
    const formatter = new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" });
    bulkDiscountPreviewEl.textContent = `${percent}% menos desde ${formatter.format(start)} hasta ${formatter.format(end)}. El precio normal vuelve automáticamente al terminar.`;
  }

  function seedBulkDiscountDates() {
    const start = new Date();
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);
    const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
    const today = localDateInputValue(new Date());
    bulkDiscountStartDateEl.min = today;
    bulkDiscountEndDateEl.min = today;
    bulkDiscountStartDateEl.value = localDateInputValue(start);
    bulkDiscountStartTimeEl.value = localTimeInputValue(start);
    bulkDiscountEndDateEl.value = localDateInputValue(end);
    bulkDiscountEndTimeEl.value = localTimeInputValue(end);
    updateBulkDiscountPreview();
  }

  function closeBulkDiscountStudio() {
    bulkDiscountStudioEl.hidden = true;
    document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "false");
  }

  document.getElementById("bulkDiscountOpen").addEventListener("click", () => {
    seedBulkDiscountDates();
    renderBulkDiscountProducts();
    bulkDiscountStudioEl.hidden = false;
    document.getElementById("bulkDiscountOpen").setAttribute("aria-expanded", "true");
    bulkDiscountStudioEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
    bulkDiscountProductSearchEl.focus({ preventScroll: true });
  });
  bulkDiscountClearAllEl.addEventListener("click", async () => {
    const discountedProducts = lastPaymentLinks.filter((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    if (!discountedProducts.length) return;
    const confirmed = confirm(`¿Quitar los descuentos de ${discountedProducts.length} ${discountedProducts.length === 1 ? "producto" : "productos"}? Los clientes volverán a ver el precio normal inmediatamente.`);
    if (!confirmed) return;
    errorEl.textContent = "";
    setButtonBusy(bulkDiscountClearAllEl, true, "Quitando…");
    try {
      const result = await api(`/stores/${currentStoreId}/payment_links/discount`, { method: "DELETE" });
      selectedBulkDiscountProductIds.clear();
      renderPaymentLinkRows(lastPaymentLinks.map((product) => ({
        ...product,
        discountPercent: null,
        discountStartsAt: null,
        discountEndsAt: null,
      })));
      closeBulkDiscountStudio();
      infoEl.textContent = result.count === 1
        ? "Se quitó el descuento de 1 producto."
        : `Se quitaron los descuentos de ${result.count} productos.`;
      refreshStorePreview(true);
    } catch (error) {
      errorEl.textContent = "Error: " + error.message;
    } finally {
      setButtonBusy(bulkDiscountClearAllEl, false, "Quitar todos los descuentos");
      bulkDiscountClearAllEl.disabled = !lastPaymentLinks.some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    }
  });
  document.getElementById("bulkDiscountClose").addEventListener("click", closeBulkDiscountStudio);
  document.getElementById("bulkDiscountCancel").addEventListener("click", closeBulkDiscountStudio);
  bulkDiscountProductSearchEl.addEventListener("input", renderBulkDiscountProducts);
  bulkDiscountProductListEl.addEventListener("change", (event) => {
    const checkbox = event.target.closest('input[type="checkbox"]');
    if (!checkbox) return;
    if (checkbox.checked && selectedBulkDiscountProductIds.size >= 100) {
      checkbox.checked = false;
      errorEl.textContent = "Error: puedes programar hasta 100 productos por campaña";
      return;
    }
    if (checkbox.checked) selectedBulkDiscountProductIds.add(checkbox.value);
    else selectedBulkDiscountProductIds.delete(checkbox.value);
    renderBulkDiscountProducts();
  });
  bulkDiscountSelectAllEl.addEventListener("click", () => {
    const products = visibleBulkDiscountProducts();
    const allSelected = products.length > 0 && products.every((product) => selectedBulkDiscountProductIds.has(product.id));
    if (allSelected) products.forEach((product) => selectedBulkDiscountProductIds.delete(product.id));
    else products.slice(0, Math.max(0, 100 - selectedBulkDiscountProductIds.size)).forEach((product) => selectedBulkDiscountProductIds.add(product.id));
    renderBulkDiscountProducts();
  });
  [bulkDiscountPercentEl, bulkDiscountStartDateEl, bulkDiscountStartTimeEl, bulkDiscountEndDateEl, bulkDiscountEndTimeEl].forEach((input) => {
    input.addEventListener("input", () => {
      if (input === bulkDiscountStartDateEl) bulkDiscountEndDateEl.min = bulkDiscountStartDateEl.value || localDateInputValue(new Date());
      updateBulkDiscountPreview();
    });
  });
  document.getElementById("bulkDiscountForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const productIds = [...selectedBulkDiscountProductIds];
    const discountPercent = Number(bulkDiscountPercentEl.value);
    const start = bulkDiscountDateTime(bulkDiscountStartDateEl.value, bulkDiscountStartTimeEl.value);
    const end = bulkDiscountDateTime(bulkDiscountEndDateEl.value, bulkDiscountEndTimeEl.value);
    if (!productIds.length) {
      errorEl.textContent = "Error: selecciona por lo menos un producto";
      bulkDiscountProductSearchEl.focus();
      return;
    }
    if (!Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 99) {
      errorEl.textContent = "Error: el descuento debe estar entre 1% y 99%";
      bulkDiscountPercentEl.focus();
      return;
    }
    if (!start || !end || start.getTime() < Date.now() - 60_000) {
      errorEl.textContent = "Error: el descuento no puede comenzar en el pasado";
      bulkDiscountStartDateEl.focus();
      return;
    }
    if (end <= start) {
      errorEl.textContent = "Error: el descuento debe terminar después de comenzar";
      bulkDiscountEndDateEl.focus();
      return;
    }
    errorEl.textContent = "";
    setButtonBusy(bulkDiscountSubmitEl, true, "Programando…");
    try {
      const updatedProducts = await api(`/stores/${currentStoreId}/payment_links/discount`, {
        method: "PATCH",
        body: JSON.stringify({
          productIds,
          discountPercent,
          discountStartsAt: start.toISOString(),
          discountEndsAt: end.toISOString(),
        }),
      });
      const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
      selectedBulkDiscountProductIds.clear();
      renderPaymentLinkRows(lastPaymentLinks.map((product) => updatedById.get(product.id) || product));
      closeBulkDiscountStudio();
      infoEl.textContent = `Descuento del ${discountPercent}% programado para ${productIds.length} ${productIds.length === 1 ? "producto" : "productos"}.`;
      refreshStorePreview(true);
    } catch (error) {
      errorEl.textContent = "Error: " + error.message;
    } finally {
      setButtonBusy(bulkDiscountSubmitEl, false, "Programar campaña");
    }
  });

  const storeLogoInputEl = document.getElementById("storeLogoInput");
  const storeLogoPreviewEl = document.getElementById("storeLogoPreview");
  const storeLogoRemoveBtnEl = document.getElementById("storeLogoRemoveBtn");
  const storeBannerInputEl = document.getElementById("storeBannerInput");
  const storeBannerPreviewEl = document.getElementById("storeBannerPreview");
  const storeBannerRemoveBtnEl = document.getElementById("storeBannerRemoveBtn");
  const storeHeroSlidesInputEl = document.getElementById("storeHeroSlidesInput");
  const storeHeroSlidesListEl = document.getElementById("storeHeroSlidesList");
  const storeContentOrderListEl = document.getElementById("storeContentOrderList");
  const storeReorderStatusEl = document.getElementById("storeReorderStatus");
  const storeExperienceStyleEl = document.getElementById("storeExperienceStyle");
  const storeAnimationTypePickerEl = document.getElementById("storeAnimationTypePicker");
  const storeAnimationAddEl = document.getElementById("storeAnimationAdd");
  const storeAnimationsListEl = document.getElementById("storeAnimationsList");
  const storeAnimationsStatusEl = document.getElementById("storeAnimationsStatus");
  const storeAnimationCategoryTabs = [...document.querySelectorAll("[data-animation-category]")];
  const storeMotionDuoEnabledEl = document.getElementById("storeMotionDuoEnabled");
  const STORE_MOTION_EXPERIENCES = [
    "story-scroll", "hero-carousel", "image-stream", "scroll-expansion", "hero-gallery-scroll",
    "stagger-testimonials", "portfolio-scroller", "circle-reveal", "full-screen-chapters",
    "magnetic-target", "frame-sequence", "video-background",
    "draggable-cards", "perspective-carousel", "link-preview", "video-pin-reveal",
    "gallery-accordion", "split-scroll", "sticky-gallery", "sticky-story", "text-parallax",
    "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  ];
  const STORE_TEXT_ANIMATIONS = new Set([
    "clarity-marquee", "layered-text", "text-rotate", "text-glitch", "text-reveal-block", "text-along-path",
  ]);
  const AI_SIGNATURE_ANIMATION_ID = "ai-signature-experience";
  const STORE_FONT_STYLES = ["modern", "editorial", "friendly", "classic", "geometric", "artisan", "condensed", "luxury"];
  const STORE_FONT_STYLE_LABELS = { modern: "Moderna", editorial: "Editorial", friendly: "Cercana", classic: "Clásica", geometric: "Geométrica", artisan: "Artesanal", condensed: "Condensada", luxury: "Alta moda" };
  const normalizeStoreFontStyle = (value) => STORE_FONT_STYLES.includes(value) ? value : "modern";
  const storeMotionExperienceEls = [...document.querySelectorAll('input[name="storeMotionExperience"]')];
  const storeEditorialGalleryInputEl = document.getElementById("storeEditorialGalleryInput");
  const storeEditorialGalleryListEl = document.getElementById("storeEditorialGalleryList");
  const storeEditorialPhotoOptionsEl = document.getElementById("storeEditorialPhotoOptions");
  const storeEditorialPhotoCountEl = document.getElementById("storeEditorialPhotoCount");
  const storeTaglineInputEl = document.getElementById("storeTaglineInput");
  const storeBackgroundColorEl = document.getElementById("storeBackgroundColor");
  const storeContactPhoneInputEl = document.getElementById("storeContactPhoneInput");
  const storeContactEmailInputEl = document.getElementById("storeContactEmailInput");
  const storeContactFormEditorEl = document.getElementById("storeContactFormEditor");
  const storeContactFormEnabledEl = document.getElementById("storeContactFormEnabled");
  const storeContactFormEmailEl = document.getElementById("storeContactFormEmail");
  const storeContactTitleEl = document.getElementById("storeContactTitle");
  const storeContactSubtitleEl = document.getElementById("storeContactSubtitle");
  const storeLocationsListEl = document.getElementById("storeLocationsList");
  const storeLocationAddEl = document.getElementById("storeLocationAdd");
  const storeLocationTitleEl = document.getElementById("storeLocationTitle");
  const storeLocationSubtitleEl = document.getElementById("storeLocationSubtitle");
  const storeAboutInputEl = document.getElementById("storeAboutInput");
  const storeAboutTitleEl = document.getElementById("storeAboutTitle");
  const storeAboutSubtitleEl = document.getElementById("storeAboutSubtitle");
  const storeCatalogTitleEl = document.getElementById("storeCatalogTitle");
  const storeCatalogSubtitleEl = document.getElementById("storeCatalogSubtitle");
  const storeGalleryTitleEl = document.getElementById("storeGalleryTitle");
  const storeGallerySubtitleEl = document.getElementById("storeGallerySubtitle");
  const storeLinksTitleEl = document.getElementById("storeLinksTitle");
  const storeAboutImageInputEl = document.getElementById("storeAboutImageInput");
  const storeAboutImagePreviewEl = document.getElementById("storeAboutImagePreview");
  const storeAboutImageRemoveBtnEl = document.getElementById("storeAboutImageRemoveBtn");
  const storeAnnouncementInputEl = document.getElementById("storeAnnouncementInput");
  const storeAnnouncementModeEl = document.getElementById("storeAnnouncementMode");
  const storeAnnouncementSpeedEl = document.getElementById("storeAnnouncementSpeed");
  const storeAnnouncementSizeEl = document.getElementById("storeAnnouncementSize");
  const storeAnnouncementColorEl = document.getElementById("storeAnnouncementColor");
  const storeAnnouncementFontEl = document.getElementById("storeAnnouncementFont");
  const storeAnnouncementEffectEl = document.getElementById("storeAnnouncementEffect");
  const storePromotionEditorEl = document.getElementById("storePromotionEditor");
  const storePromotionEnabledEl = document.getElementById("storePromotionEnabled");
  const storePromotionImageInputEl = document.getElementById("storePromotionImageInput");
  const storePromotionImagePreviewEl = document.getElementById("storePromotionImagePreview");
  const storePromotionImageRemoveBtnEl = document.getElementById("storePromotionImageRemoveBtn");
  const storePromotionTitleEl = document.getElementById("storePromotionTitle");
  const storePromotionBodyEl = document.getElementById("storePromotionBody");
  const storePromotionCtaLabelEl = document.getElementById("storePromotionCtaLabel");
  const storePromotionProductEl = document.getElementById("storePromotionProduct");
  const storePromotionCtaUrlEl = document.getElementById("storePromotionCtaUrl");
  const storeAccentToggleEl = document.getElementById("storeAccentToggle");
  const storeAccentColorEl = document.getElementById("storeAccentColor");
  const storeFontStyleEl = document.getElementById("storeFontStyle");
  const storeButtonStyleEl = document.getElementById("storeButtonStyle");
  const storeButtonVariantEl = document.getElementById("storeButtonVariant");
  const storeButtonMotionEl = document.getElementById("storeButtonMotion");
  const storeCartButtonLabelEl = document.getElementById("storeCartButtonLabel");
  const storeCartRecommendationsEl = document.getElementById("storeCartRecommendations");
  const storeRecommendationPickerEl = document.getElementById("storeRecommendationPicker");
  const storeRecommendationOptionsEl = document.getElementById("storeRecommendationOptions");
  const storeRecommendationCountEl = document.getElementById("storeRecommendationCount");
  const storeShowLowStockEl = document.getElementById("storeShowLowStock");
  const storeLinksEditorEl = document.getElementById("storeLinksEditor");
  const storeSettingsFormEl = document.getElementById("storeSettingsForm");
  const storeSaveButtonEl = document.getElementById("storeSaveButton");
  const storeSaveStatusEl = document.getElementById("storeSaveStatus");
  const storePreviewStageEl = document.getElementById("storePreviewStage");
  const storePreviewFrameEl = document.getElementById("storePreviewFrame");
  const previewExternalLinkNoticeEl = document.getElementById("previewExternalLinkNotice");
  const previewExternalLinkDestinationEl = document.getElementById("previewExternalLinkDestination");
  const previewExternalLinkOpenEl = document.getElementById("previewExternalLinkOpen");
  const previewExternalLinkDismissEl = document.getElementById("previewExternalLinkDismiss");
  const storePreviewStatusTitleEl = document.getElementById("storePreviewStatusTitle");
  const storePreviewStatusMessageEl = document.getElementById("storePreviewStatusMessage");
  const previewOpenEl = document.getElementById("previewOpen");
  const previewDesktopEl = document.getElementById("previewDesktop");
  const previewMobileEl = document.getElementById("previewMobile");
  const previewLiveStatusEl = document.getElementById("previewLiveStatus");
  const previewArtDirectionWrapEl = document.getElementById("previewArtDirectionWrap");
  const previewArtDirectionEl = document.getElementById("previewArtDirection");
  const storeStudioEl = document.getElementById("storeStudio");
  const storeOptionsTabEl = document.getElementById("storeOptionsTab");
  const previewExpandToggleEl = document.getElementById("previewExpandToggle");
  const previewEditorToolsEl = document.getElementById("previewEditorTools");
  const previewWorkspaceSplitterEl = document.getElementById("previewWorkspaceSplitter");
  const previewContextEditorEl = document.getElementById("previewContextEditor");
  const previewSelectionStatusEl = document.getElementById("previewSelectionStatus");
  const previewProductSearchEl = document.getElementById("previewProductSearch");
  const previewProductListEl = document.getElementById("previewProductList");
  const previewProductNavStatusEl = document.getElementById("previewProductNavStatus");
  const previewCatalogEditorEl = document.getElementById("previewCatalogEditor");
  const previewCatalogEditorStatusEl = document.getElementById("previewCatalogEditorStatus");
  const previewCatalogSectionCountEl = document.getElementById("previewCatalogSectionCount");
  const previewCatalogSectionListEl = document.getElementById("previewCatalogSectionList");
  const previewCatalogSearchEl = document.getElementById("previewCatalogSearch");
  const previewCatalogSelectionCountEl = document.getElementById("previewCatalogSelectionCount");
  const previewCatalogProductGroupsEl = document.getElementById("previewCatalogProductGroups");
  const previewCatalogSaveEl = document.getElementById("previewCatalogSave");
  const previewSelectedSectionEl = document.getElementById("previewSelectedSection");
  const previewSectionColorEnabledEl = document.getElementById("previewSectionColorEnabled");
  const previewSectionColorEl = document.getElementById("previewSectionColor");
  const previewSectionPositionEl = document.getElementById("previewSectionPosition");
  const previewSectionLockEl = document.getElementById("previewSectionLock");
  const previewSectionUpEl = document.getElementById("previewSectionUp");
  const previewSectionDownEl = document.getElementById("previewSectionDown");
  const previewAddSectionEl = document.getElementById("previewAddSection");
  const previewSectionInsertListEl = document.getElementById("previewSectionInsertList");
  const previewSaveButtonEl = document.getElementById("previewSaveButton");
  const previewUndoButtonEl = document.getElementById("previewUndo");
  const storeImagePaletteEl = document.getElementById("storeImagePalette");
  const storeImagePaletteStatusEl = document.getElementById("storeImagePaletteStatus");
  const storeImagePaletteSwatchesEl = document.getElementById("storeImagePaletteSwatches");
  const visualProgressEl = document.getElementById("visualProgress");
  const visualStepEls = [document.getElementById("visualStep1"), document.getElementById("visualStep2"), document.getElementById("visualStep3")];
  const visualSourcePreviewsEl = document.getElementById("visualSourcePreviews");
  const visualSourceStatusEl = document.getElementById("visualSourceStatus");
  const visualGenerateEl = document.getElementById("visualGenerate");
  const visualGenerationLoaderEl = document.getElementById("visualGenerationLoader");
  const visualLoaderKickerEl = document.getElementById("visualLoaderKicker");
  const visualLoaderTitleEl = document.getElementById("visualLoaderTitle");
  const visualLoaderCopyEl = document.getElementById("visualLoaderCopy");
  const storeAgentComposerEl = document.getElementById("storeAgentComposer");
  const visualAiChooseEl = document.getElementById("visualAiChoose");
  const visualAiImagesEl = document.getElementById("visualAiImages");
  const visualAiPreviewsEl = document.getElementById("visualAiPreviews");
  const visualWhatsappPhoneWrapEl = document.getElementById("visualWhatsappPhoneWrap");
  const visualWhatsappPhoneEl = document.getElementById("visualWhatsappPhone");
  const visualLeadUrlWrapEl = document.getElementById("visualLeadUrlWrap");
  const visualLeadUrlEl = document.getElementById("visualLeadUrl");
  const visualTemplateWrapEl = document.getElementById("visualTemplateWrap");
  const visualTemplateEl = document.getElementById("visualTemplate");
  const storeCheckoutModeEls = [...document.querySelectorAll('input[name="storeCheckoutMode"]')];
  const storeWhatsappPhoneWrapEl = document.getElementById("storeWhatsappPhoneWrap");
  const storeLeadUrlWrapEl = document.getElementById("storeLeadUrlWrap");
  const storeLeadUrlEl = document.getElementById("storeLeadUrl");
  const storePaymentRequirementEl = document.getElementById("storePaymentRequirement");
  const visualProposalsEl = document.getElementById("visualProposals");
  const visualProposalStatusEl = document.getElementById("visualProposalStatus");
  const visualHistoryEl = document.getElementById("visualHistory");
  const visualHistoryListEl = document.getElementById("visualHistoryList");
  const storeAgentTimelineEl = document.getElementById("storeAgentTimeline");
  let visualProposals = [];
  let visualVersions = [];
  let visualTemplates = [];
  let lockedAiSectionIds = new Set();
  let visualStudioStoreId = null;
  let activeVisualProposalId = null;
  let visualAiFiles = [];
  let visualAiPreviewUrls = [];
  const visualAiUploads = new Map();
  let storeAgentMessages = [];
  let storeAgentWorkingInstruction = "";
  function aiSectionLocksStorageKey(storeId = currentStoreId) {
    return `pagosya_ai_section_locks_v1_${storeId || "no-store"}`;
  }

  function loadAiSectionLocks(storeId = currentStoreId) {
    try {
      const value = JSON.parse(localStorage.getItem(aiSectionLocksStorageKey(storeId)) || "[]");
      lockedAiSectionIds = new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
    } catch {
      lockedAiSectionIds = new Set();
    }
  }

  function saveAiSectionLocks() {
    if (!currentStoreId) return;
    localStorage.setItem(aiSectionLocksStorageKey(), JSON.stringify([...lockedAiSectionIds]));
  }

  document.getElementById("aiSetupLaunch").addEventListener("click", () => {
    history.pushState(null, "", "#dashboard-workspace");
    setDashboardView("workspace");
  });
  let pendingLogoUrl = null;
  let pendingBannerUrl = null;
  let pendingAboutImageUrl = null;
  let pendingPromotionImageUrl = null;
  let pendingHeroSlides = [];
  const DEFAULT_STORE_CONTENT_ORDER = ["hero", "about", "products", "gallery", "links", "contact", "location"];
  const REORDER_HANDLE_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>';
  const STORE_MOTION_SECTION_COPY = {
    "story-scroll": ["Story Scroll", "Capítulos editoriales al desplazarse"],
    "hero-carousel": ["Slider principal", "Carrusel fotográfico y filmstrip"],
    "image-stream": ["Image Stream", "Corredor visual en movimiento"],
    "scroll-expansion": ["Scroll Expansion", "Imagen que se abre con la página"],
    "hero-gallery-scroll": ["Hero Gallery", "Mosaico que se recompone"],
    "stagger-testimonials": ["Reseñas", "Comentarios en tarjetas escalonadas"],
    "portfolio-scroller": ["Menú de momentos", "Escenas navegables por scroll y teclado"],
    "circle-reveal": ["Revelado circular", "La imagen aparece desde el centro"],
    "clarity-marquee": ["Preguntas en movimiento", "Frases en un ritmo editorial continuo"],
    "layered-text": ["Texto en capas", "Palabras escalonadas que cambian al pasar el cursor"],
    "text-rotate": ["Texto mecanografiado", "Una frase editorial escribe, pausa y reemplaza su final"],
    "text-glitch": ["Texto revelado", "El mensaje descubre una segunda frase al interactuar"],
    "text-reveal-block": ["Revelado por bloques", "Cada línea llega detrás de un bloque de color"],
    "text-along-path": ["Texto en recorrido", "Una frase circula por un trazado editorial"],
    "full-screen-chapters": ["Capítulos completos", "Relato visual a pantalla completa"],
    "magnetic-target": ["Llamado magnético", "Invitación que responde al cursor"],
    "frame-sequence": ["Secuencia de cuadros", "El scroll controla cada escena"],
    "video-background": ["Video de fondo", "Un video a pantalla completa con texto opcional encima"],
    "draggable-cards": ["Tarjetas arrastrables", "Escenas que el visitante puede mover y explorar"],
    "perspective-carousel": ["Carrusel con perspectiva", "Un slider editorial con profundidad y controles"],
    "link-preview": ["Vista previa de enlace", "Una imagen aparece al enfocar o pasar por el enlace"],
    "video-pin-reveal": ["Video revelado", "El scroll abre un video desde el centro"],
    "gallery-accordion": ["Galería acordeón", "Las imágenes se expanden y abren en detalle"],
    "split-scroll": ["Relato dividido", "Dos mitades avanzan en direcciones opuestas"],
    "sticky-gallery": ["Galería fija", "Una columna permanece fija mientras las demás avanzan"],
    "sticky-story": ["Historia fija", "El texto cambia la imagen que permanece en pantalla"],
    "text-parallax": ["Texto en paralaje", "Titulares atraviesan imágenes fijas al desplazarse"],
  };
  const STORE_CONTENT_SECTION_COPY = {
    hero: ["Portada", "Identidad, promoción o banner estático"],
    products: ["Productos", "Buscador, categorías y catálogo"],
    about: ["Nuestra historia", "El relato de la marca"],
    gallery: ["Fotos editoriales", "Imágenes con texto debajo"],
    links: ["Redes y enlaces", "Instagram, WhatsApp, catálogo y más"],
    contact: ["Contáctanos", "Formulario directo al correo del dueño"],
    location: ["Ubicación", "Mapa, dirección y horarios de atención"],
    ...Object.fromEntries(Object.entries(STORE_MOTION_SECTION_COPY).map(([experience, copy]) => [`motion-${experience}`, copy])),
  };
  let pendingContentOrder = [...DEFAULT_STORE_CONTENT_ORDER];
  let pendingSiteSections = [];
  let pendingSiteDocument = null;
  const SITE_ART_DIRECTION_PRESETS = {
    "editorial-house": {
      label: "Casa editorial", summary: "Relato asimétrico, tipografía con voz y catálogo como publicación.", character: "Copy primero · aire amplio · imágenes enmarcadas",
      designGenome: { composition: "narrative-offset", rhythm: "editorial", geometry: "borderless", colorStrategy: "accent-led", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "reveal" },
      theme: { headingFont: "editorial", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "dramatic", density: "airy", imageTreatment: "editorial" },
      navigation: { layout: "split", sticky: false, transparent: false, logoTreatment: "wordmark" }, motion: { intensity: "restrained" }, merchandising: { spotlightLayout: "feature-first", showDescriptions: true },
      sections: { hero: ["editorial", "split", "wide", "left"], story: ["editorial", "offset", "wide", "left"], catalog: ["product-led", "offset", "wide", "left"], gallery: ["editorial", "offset", "full", "left"], contact: ["minimal", "minimal", "contained", "left"], location: ["editorial", "split", "wide", "left"], links: ["minimal", "centered", "contained", "center"] },
    },
    "cinematic-atelier": {
      label: "Atelier cinematográfico", summary: "Medios inmersivos, escala monumental y capítulos dirigidos.", character: "Imagen primero · ritmo pausado · escenas amplias",
      designGenome: { composition: "gallery-axis", rhythm: "cinematic", geometry: "framed", colorStrategy: "surface-led", mediaStrategy: "full-bleed", typeScale: "cinematic", motionLanguage: "cinematic" },
      theme: { headingFont: "editorial", bodyFont: "humanist", radius: 2, shadow: "lifted", productLayout: "showcase", displayScale: "monumental", density: "airy", imageTreatment: "cinematic" },
      navigation: { layout: "brand-left", sticky: false, transparent: true, logoTreatment: "oversized" }, motion: { intensity: "cinematic" }, merchandising: { spotlightLayout: "lookbook", showDescriptions: true },
      sections: { hero: ["cinematic", "full-bleed", "full", "left"], story: ["cinematic", "stacked", "full", "left"], catalog: ["product-led", "grid", "wide", "left"], gallery: ["cinematic", "full-bleed", "full", "left"], contact: ["cinematic", "split", "wide", "left"], location: ["cinematic", "full-bleed", "full", "left"], links: ["minimal", "centered", "contained", "center"] },
    },
    "product-studio": {
      label: "Estudio de producto", summary: "Sistema preciso, comparación clara y mercancía en primer plano.", character: "Producto primero · retícula firme · decisiones rápidas",
      designGenome: { composition: "material-ledger", rhythm: "balanced", geometry: "structured", colorStrategy: "contrast-blocks", mediaStrategy: "framed", typeScale: "balanced", motionLanguage: "tactile" },
      theme: { headingFont: "geometric", bodyFont: "grotesk", radius: 2, shadow: "none", productLayout: "gallery", displayScale: "balanced", density: "balanced", imageTreatment: "natural" },
      navigation: { layout: "split", sticky: true, transparent: false, logoTreatment: "mark" }, motion: { intensity: "expressive" }, merchandising: { spotlightLayout: "feature-first", showDescriptions: true },
      sections: { hero: ["product-led", "split", "wide", "left"], story: ["editorial", "split", "wide", "left"], catalog: ["product-led", "grid", "wide", "left"], gallery: ["product-led", "grid", "wide", "left"], contact: ["product-led", "split", "wide", "left"], location: ["editorial", "split", "wide", "left"], links: ["minimal", "rail", "wide", "left"] },
    },
    "quiet-gallery": {
      label: "Galería silenciosa", summary: "Una dirección contenida donde cada pieza respira.", character: "Esencial · monocromía · ritmo contemplativo",
      designGenome: { composition: "quiet-monument", rhythm: "editorial", geometry: "borderless", colorStrategy: "monochrome", mediaStrategy: "framed", typeScale: "editorial", motionLanguage: "still" },
      theme: { headingFont: "classic", bodyFont: "grotesk", radius: 0, shadow: "none", productLayout: "editorial", displayScale: "balanced", density: "airy", imageTreatment: "editorial" },
      navigation: { layout: "centered", sticky: false, transparent: false, logoTreatment: "wordmark" }, motion: { intensity: "restrained" }, merchandising: { spotlightLayout: "collection", showDescriptions: true },
      sections: { hero: ["minimal", "centered", "contained", "center"], story: ["minimal", "centered", "contained", "center"], catalog: ["minimal", "minimal", "wide", "left"], gallery: ["minimal", "stacked", "contained", "left"], contact: ["minimal", "minimal", "contained", "left"], location: ["minimal", "split", "contained", "left"], links: ["minimal", "centered", "contained", "center"] },
    },
    "graphic-market": {
      label: "Mercado gráfico", summary: "Formas recortadas y un catálogo con pulso de cartel.", character: "Escala póster · contraste · ritmo compacto",
      designGenome: { composition: "spatial-cascade", rhythm: "compact", geometry: "cut-paper", colorStrategy: "contrast-blocks", mediaStrategy: "collage", typeScale: "poster", motionLanguage: "tactile" },
      theme: { headingFont: "geometric", bodyFont: "humanist", radius: 4, shadow: "soft", productLayout: "gallery", displayScale: "monumental", density: "dense", imageTreatment: "cutout" },
      navigation: { layout: "split", sticky: true, transparent: false, logoTreatment: "seal" }, motion: { intensity: "expressive" }, merchandising: { spotlightLayout: "alternating", showDescriptions: true },
      sections: { hero: ["product-led", "offset", "wide", "left"], story: ["editorial", "rail", "wide", "left"], catalog: ["product-led", "rail", "full", "left"], gallery: ["cinematic", "offset", "full", "left"], contact: ["cinematic", "split", "wide", "left"], location: ["cinematic", "offset", "full", "left"], links: ["product-led", "rail", "wide", "left"] },
    },
  };
  let pendingSectionBackgrounds = {};
  let pendingLayoutStyle = "cinematic";
  let pendingEditorialGallery = [];
  let pendingAnimations = [];
  let activeAnimationCategory = "text";
  let animationTextClipboard = null;
  let storeEditorUndoStack = [];
  let storeEditorApplyingUndo = false;
  const storeEditorControlInitialValues = new WeakMap();
  let editorialGalleryDraftsByUrl = new Map();
  const DEFAULT_EDITORIAL_BOX_COLOR = "#f4ead7";
  const storeEditorDraft = storeEditorStateModule.createStoreEditorStore();
  let websiteRevision = 0;
  let websiteHasDraft = false;
  let websiteInventoryChanges = [];
  let websiteInventoryEditedIds = new Set();
  let websitePublishing = false;
  let storeSettingsDirty = false;
  let storeSaveInFlight = false;
  let previewPostTimer = null;
  let previewReadyTimer = null;
  let previewReloadVersion = 0;
  let pendingStorePreviewSection = null;
  let pendingStorePreviewAction = null;
  let pendingStorePreviewTargetIndex = null;
  let pendingStorePreviewTargetKind = null;
  let pendingStorePreviewProduct = null;
  let selectedPreviewProductId = null;
  let storePreviewEditorEnabled = true;
  let selectedPreviewSection = "brand";
  let selectedPreviewCatalogSectionId = null;
  let activePreviewSelection = null;
  let activePreviewPageId = null;
  const SITE_SECTION_TAB_LABELS = { hero: "Portada", story: "Historia", catalog: "Catálogo", gallery: "Galería", contact: "Contacto", location: "Ubicación", links: "Redes" };

  function defaultSiteNavigationItems() {
    const items = [
      { id: "home", label: "Inicio", target: "home" },
      { id: "catalog", label: "Catálogo", target: "catalog" },
    ];
    (pendingSiteDocument?.pages || []).slice(0, 6).forEach((page) => items.push({
      id: `page-${page.id}`.slice(0, 48),
      label: boundedSiteSectionText(page.label || "Página", 40),
      target: "page",
      pageId: page.id,
    }));
    pendingSiteSections
      .filter((section) => !section.pageId && !["hero", "catalog", "links"].includes(section.kind))
      .slice(0, 6)
      .forEach((section) => items.push({
        id: `section-${section.id}`.slice(0, 48),
        label: boundedSiteSectionText(section.title || SITE_SECTION_TAB_LABELS[section.kind] || "Sección", 40),
        target: "section",
        sectionId: section.id,
      }));
    return items;
  }

  function defaultSiteFooter(store = {}) {
    const navigationItems = pendingSiteDocument?.navigation?.items || defaultSiteNavigationItems();
    const exploreItems = navigationItems.filter((item) => item.target !== "home").slice(0, 6).map((item, index) => ({
      id: `explore-${index + 1}`,
      label: item.label,
      href: item.target === "catalog" ? "#store-products" : item.sectionId ? `#site-section-${item.sectionId}` : "",
    }));
    const contactItems = [
      ...(store.contactEmail ? [{ id: "contact-email", label: store.contactEmail, href: `mailto:${store.contactEmail}` }] : []),
      ...(store.contactPhone ? [{ id: "contact-phone", label: store.contactPhone, href: `tel:${String(store.contactPhone).replace(/[^+0-9]/g, "")}` }] : []),
      ...(store.locations?.[0]?.address ? [{ id: "contact-address", label: store.locations[0].address, href: "" }] : []),
    ].slice(0, 8);
    return {
      enabled: true,
      brandDescription: boundedSiteSectionText(store.tagline || "", 320),
      columns: [
        ...(exploreItems.length ? [{ id: "explore", title: "Explorar", items: exploreItems }] : []),
        ...(contactItems.length ? [{ id: "contact", title: "Contacto", items: contactItems }] : []),
      ],
      copyright: `© ${new Date().getFullYear()} ${boundedSiteSectionText(store.name || "Mi tienda", 100)}`,
      badge: "Tienda impulsada por pagosYa",
      newsletter: {
        enabled: true,
        title: "Novedades, sin ruido",
        body: "Recibe lanzamientos y noticias de la tienda directamente en tu correo.",
        buttonLabel: "Suscribirme",
        successMessage: "Listo. Ya estás en la lista.",
      },
    };
  }

  function ensureSiteChromeDraft(store = {}) {
    if (!pendingSiteDocument) return;
    pendingSiteDocument.navigation ||= {};
    const navigation = pendingSiteDocument.navigation;
    navigation.layout ||= "brand-left";
    navigation.barStyle = "full";
    navigation.brandPosition ||= navigation.layout === "centered" ? "center" : "left";
    navigation.navPosition ||= navigation.layout === "split" ? "left" : "center";
    navigation.searchPosition ||= "right";
    navigation.profilePosition ||= "right";
    navigation.cartPosition ||= "right";
    pendingSiteDocument.pages ||= [];
    if (!Array.isArray(pendingSiteDocument.navigation.items) || !pendingSiteDocument.navigation.items.length) {
      pendingSiteDocument.navigation.items = defaultSiteNavigationItems();
    }
    if (!pendingSiteDocument.footer || typeof pendingSiteDocument.footer !== "object") {
      pendingSiteDocument.footer = defaultSiteFooter(store);
    }
  }

  function renderPreviewSectionTabs() {
    const nav = document.getElementById("previewSectionNav");
    if (!nav) return;
    const button = (section, field, label) => `<button type="button" data-preview-editor-section="${esc(section)}" data-preview-editor-field="${esc(field)}"${selectedPreviewSection === section ? ' aria-current="true"' : ""}>${esc(label)}</button>`;
    const pageSections = pendingSiteSections.filter((section) => activePreviewPageId ? section.pageId === activePreviewPageId : !section.pageId);
    const pageAnimations = pendingAnimations.filter((animation) => activePreviewPageId ? animation.pageId === activePreviewPageId : !animation.pageId);
    nav.innerHTML = [
      button("brand", "storeNameInput", "Identidad"),
      button("navigation", "section", "Navegación"),
      button("announcement", "announcementText", "Anuncio"),
      ...(pendingSiteSections.length
        ? pageSections.map((section) => button(`site-${section.id}`, "section", section.title || SITE_SECTION_TAB_LABELS[section.kind] || "Sección"))
        : [button("hero", "storeBannerInput", "Portada"), button("products", "storeCatalogTitle", "Catálogo"), button("about", "storeAboutTitle", "Historia"), button("gallery", "storeGalleryTitle", "Galería"), button("contact", "storeContactFormEnabled", "Contacto"), button("location", "location", "Ubicación"), button("links", "links", "Redes")]),
      button("motion", "animations", pageAnimations.length ? `Animaciones (${pageAnimations.length})` : "Animaciones"),
      button("footer", "section", "Pie de página"),
      button("promotion", "promotionTitle", "Promoción"),
    ].join("");
  }

  function syncPreviewSectionTabLabels() {
    pendingSiteSections.forEach((section) => {
      const button = document.querySelector(`#previewSectionNav [data-preview-editor-section="site-${CSS.escape(section.id)}"]`);
      if (button) button.textContent = section.title || SITE_SECTION_TAB_LABELS[section.kind] || "Sección";
    });
  }
  let pendingSectionInsertAfter = null;
  let pendingAnimationMediaSetupId = null;
  const SECTION_INSERT_AT_START = "__start__";
  let storePreviewExpanded = true;
  const PREVIEW_OPTIONS_HEIGHT_KEY = "pagosya_preview_options_height";
  const PREVIEW_OPTIONS_MIN_HEIGHT = 0;
  const PREVIEW_STORE_MIN_HEIGHT = 240;
  let previewOptionsHeight = 320;
  let storePaletteTimer = null;
  let storePaletteRequest = 0;
  let storePaletteSourceSignature = "";
  // Sliders and color controls should feel live. Text fields are handled
  // separately and only redraw the storefront when their value is committed.
  const STORE_PREVIEW_INPUT_DEBOUNCE_MS = 180;
  const EMPTY_IMAGE_SRC = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";
  const MAX_HERO_SLIDES = 5;
  // Botones/enlaces de la tienda (Instagram, catálogo, etc.) — se editan aquí
  // y se guardan todos juntos vía PUT /stores/:id/links al guardar la tienda.
  let pendingStoreLinks = [];
  const MAX_STORE_LINKS = 8;

  function editorialBoxColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value).toLowerCase() : DEFAULT_EDITORIAL_BOX_COLOR;
  }

  function editorialBoxInk(value) {
    const color = editorialBoxColor(value);
    const channels = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16) / 255);
    const [red, green, blue] = channels.map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue >= 0.179 ? "#000000" : "#ffffff";
  }

  function editorialProductOptions(selectedProductId = "") {
    const products = lastPaymentLinks.filter((product) => product.status === "ACTIVE");
    const selectedExists = !selectedProductId || products.some((product) => product.id === selectedProductId);
    return `<option value="">Sin enlace</option>${selectedExists ? "" : `<option value="${esc(selectedProductId)}" selected>Producto no disponible</option>`}${products.map((product) => `<option value="${esc(product.id)}" ${product.id === selectedProductId ? "selected" : ""}>${esc(product.name)}</option>`).join("")}`;
  }

  function rememberEditorialGalleryDraft(image) {
    const key = normalizedAssetKey(image?.imageUrl);
    if (!key) return;
    editorialGalleryDraftsByUrl.set(key, {
      imageUrl: image.imageUrl,
      productId: image.productId || "",
      title: image.title || "",
      caption: image.caption || "",
      body: image.body || "",
      boxColor: editorialBoxColor(image.boxColor),
    });
  }

  function editorialSourceImages() {
    const sources = [];
    const seen = new Set();
    const add = (imageUrl, label, productId = "") => {
      const key = normalizedAssetKey(imageUrl);
      if (!key || seen.has(key) || isVideoUploadUrl(imageUrl)) return;
      seen.add(key);
      sources.push({ imageUrl, label, key, productId });
    };
    add(pendingBannerUrl, "Banner de la tienda");
    add(pendingAboutImageUrl, "Imagen de la historia");
    add(pendingPromotionImageUrl, "Imagen de promoción");
    add(pendingLogoUrl, "Logo de la tienda");
    pendingHeroSlides.forEach((slide, index) => add(slide.imageUrl, `Slider ${index + 1}`));
    lastPaymentLinks.forEach((product) => (product.imageUrls || []).forEach((imageUrl, index) => add(imageUrl, `${product.name} · foto ${index + 1}`, product.id)));
    pendingEditorialGallery.forEach((image, index) => add(image.imageUrl, image.title || image.caption || `Foto editorial ${index + 1}`, image.productId));
    editorialGalleryDraftsByUrl.forEach((image) => add(image.imageUrl, image.title || image.caption || "Foto editorial", image.productId));
    return sources;
  }

  function animationVideoSources() {
    const sources = [];
    const seen = new Set();
    const add = (imageUrl, label) => {
      const key = normalizedAssetKey(imageUrl);
      if (!key || seen.has(key) || !isVideoUploadUrl(imageUrl)) return;
      seen.add(key);
      sources.push({ imageUrl, label, key, productId: "" });
    };
    pendingHeroSlides.forEach((slide, index) => add(slide.imageUrl, `Video del slider ${index + 1}`));
    pendingSiteSections.forEach((section) => (section.mediaUrls || []).forEach((url, index) => add(url, `${section.title || "Sección"} · video ${index + 1}`)));
    pendingAnimations.forEach((animation) => (animation.media || []).forEach((media, index) => add(media.imageUrl, `${animation.name || "Animación"} · video ${index + 1}`)));
    return sources;
  }

  function animationSourceMedia(type = "") {
    return ["video-background", "video-pin-reveal"].includes(type) ? animationVideoSources() : editorialSourceImages();
  }

  function animationId() {
    const token = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 14)
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    return `anim-${token}`;
  }

  function animationDisclosureKey(animationIdValue) {
    return `pagosya_store_animation_${currentStoreId || "store"}_${animationIdValue}_expanded`;
  }

  function setAnimationCardExpanded(card, expanded, remember = true) {
    const body = card.querySelector(".animation-card-body");
    const toggle = card.querySelector(".animation-card-toggle");
    const animationIdValue = card.dataset.animationId;
    if (!body || !toggle || !animationIdValue) return;
    body.hidden = !expanded;
    card.classList.toggle("is-expanded", expanded);
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.setAttribute("aria-label", `${expanded ? "Ocultar" : "Mostrar"} opciones de ${card.querySelector(".animation-card-identity strong")?.textContent || "animación"}`);
    toggle.querySelector("span").textContent = expanded ? "Ocultar" : "Mostrar";
    if (remember) localStorage.setItem(animationDisclosureKey(animationIdValue), String(expanded));
  }

  function animationTypeCopy(type) {
    return STORE_MOTION_SECTION_COPY[type] || ["Animación", "Sección visual"];
  }

  function animationCategory(type) {
    return STORE_TEXT_ANIMATIONS.has(type) ? "text" : "visual";
  }

  function ensureAnimationEditorCategory(animationIdValue) {
    const animation = pendingAnimations.find((entry) => entry.id === animationIdValue);
    if (!animation) return null;
    const category = animationCategory(animation.type);
    const escapedId = CSS.escape(animation.id);
    if (activeAnimationCategory !== category || !storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${escapedId}"]`)) {
      activeAnimationCategory = category;
      renderAnimationTypePicker();
      renderAnimationsEditor();
    }
    return animation;
  }

  function animationTypesForCategory(category) {
    return STORE_MOTION_EXPERIENCES.filter((type) => animationCategory(type) === category);
  }

  function renderAnimationTypePicker() {
    const label = activeAnimationCategory === "text" ? "Elegir texto animado…" : "Elegir animación visual…";
    storeAnimationTypePickerEl.innerHTML = `<option value="">${label}</option>${animationTypesForCategory(activeAnimationCategory).map((type) => {
      const [typeLabel, description] = animationTypeCopy(type);
      return `<option value="${esc(type)}">${esc(typeLabel)} · ${esc(description)}</option>`;
    }).join("")}`;
    storeAnimationTypePickerEl.value = "";
    storeAnimationAddEl.disabled = true;
    storeAnimationCategoryTabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.animationCategory === activeAnimationCategory)));
  }

  function animationMediaRequirement(type) {
    if (STORE_TEXT_ANIMATIONS.has(type)) return { min: 0, max: 0, copy: "Este efecto usa el título, el subtítulo y la paleta de la tienda. No necesita fotos." };
    if (["video-background", "video-pin-reveal"].includes(type)) return { min: 1, max: 1, copy: "Usa exactamente un video MP4 o WebM. Se reproduce sin sonido y en bucle." };
    if (["circle-reveal", "magnetic-target", "link-preview"].includes(type)) return { min: 1, max: 1, copy: "Usa exactamente una foto. Elegir otra pieza reemplaza la anterior." };
    if (type === "scroll-expansion") return { min: 2, max: 2, copy: "Usa exactamente 2 fotos: la primera se expande y la segunda forma el fondo inicial." };
    const min = ["hero-gallery-scroll", "gallery-accordion", "split-scroll", "sticky-gallery"].includes(type) ? 3 : 2;
    return { min, max: 8, copy: `Necesita al menos ${min} fotos y admite hasta 8.` };
  }

  function cloneAnimationMedia(image) {
    return {
      imageUrl: image.imageUrl,
      productId: image.productId || "",
      title: image.title || "",
      caption: image.caption || "",
      body: image.body || "",
      boxColor: editorialBoxColor(image.boxColor),
      ...(Number.isInteger(image.textPositionX) && image.textPositionX >= 0 && image.textPositionX <= 100 ? { textPositionX: image.textPositionX } : {}),
      ...(Number.isInteger(image.textPositionY) && image.textPositionY >= 0 && image.textPositionY <= 100 ? { textPositionY: image.textPositionY } : {}),
      ...(Number.isInteger(image.textScale) && image.textScale >= 50 && image.textScale <= 200 ? { textScale: image.textScale } : {}),
      ...(Number.isInteger(image.textWidthPercent) && image.textWidthPercent >= 20 && image.textWidthPercent <= 100 ? { textWidthPercent: image.textWidthPercent } : {}),
      ...(["left", "center", "right"].includes(image.textAlign) ? { textAlign: image.textAlign } : {}),
      ...(/^#[0-9a-f]{6}$/i.test(image.textColor || "") ? { textColor: image.textColor } : {}),
      ...(STORE_FONT_STYLES.includes(image.fontStyle) ? { fontStyle: image.fontStyle } : {}),
    };
  }

  function cloneAnimationTextBlock(block, fallbackIndex = 0) {
    return {
      id: /^[a-z0-9][a-z0-9_-]{0,47}$/.test(block?.id || "") ? block.id : `text-${fallbackIndex + 1}`,
      role: block?.role === "subtitle" ? "subtitle" : "title",
      text: String(block?.text || "").slice(0, 220),
      ...(Number.isInteger(block?.textPositionX) && block.textPositionX >= 0 && block.textPositionX <= 100 ? { textPositionX: block.textPositionX } : {}),
      ...(Number.isInteger(block?.textPositionY) && block.textPositionY >= 0 && block.textPositionY <= 100 ? { textPositionY: block.textPositionY } : {}),
      ...(Number.isInteger(block?.textScale) && block.textScale >= 50 && block.textScale <= 200 ? { textScale: block.textScale } : {}),
      ...(Number.isInteger(block?.textWidthPercent) && block.textWidthPercent >= 20 && block.textWidthPercent <= 100 ? { textWidthPercent: block.textWidthPercent } : {}),
      ...(["left", "center", "right"].includes(block?.textAlign) ? { textAlign: block.textAlign } : {}),
      ...(/^#[0-9a-f]{6}$/i.test(block?.textColor || "") ? { textColor: block.textColor } : {}),
      ...(STORE_FONT_STYLES.includes(block?.fontStyle) ? { fontStyle: block.fontStyle } : {}),
    };
  }

  function editableAiSignatureAnimation(store) {
    const document = store?.siteDocument;
    const experience = document?.experience;
    const type = String(experience?.type || "");
    if (!type || type === "none" || !STORE_MOTION_EXPERIENCES.includes(type)) return null;

    const mediaUrls = Array.isArray(experience.mediaUrls)
      ? [...new Set(experience.mediaUrls.filter((url) => typeof url === "string" && url.trim()))].slice(0, animationMediaRequirement(type).max)
      : [];
    const textOnly = STORE_TEXT_ANIMATIONS.has(type);
    if (!textOnly && mediaUrls.length < animationMediaRequirement(type).min) return null;

    const authoredTitle = String(experience.title || "").trim();
    const authoredBody = String(experience.body || "").trim();
    const productPhrases = [...new Set(lastPaymentLinks
      .filter((product) => product.status !== "ARCHIVED")
      .map((product) => String(product.name || "").trim())
      .filter(Boolean))]
      .slice(0, 5);
    const shouldSplitTypewriter = type === "text-rotate" && !authoredTitle.includes("|");
    const [typeLabel] = animationTypeCopy(type);

    return {
      id: AI_SIGNATURE_ANIMATION_ID,
      name: `IA · ${typeLabel}`,
      type,
      title: shouldSplitTypewriter ? productPhrases.join("|") || authoredTitle : authoredTitle,
      subtitle: shouldSplitTypewriter ? authoredTitle : authoredBody,
      productId: "",
      textColor: textOnly ? "#f4ead7" : document?.theme?.textColor,
      backgroundColor: textOnly ? "#171612" : document?.theme?.surfaceColor,
      media: mediaUrls.map((imageUrl, index) => cloneAnimationMedia({
        imageUrl,
        title: authoredTitle || `Escena ${index + 1}`,
        caption: authoredBody,
        body: authoredBody,
      })),
    };
  }

  function placeAiSignatureAnimation(order, store, animationId) {
    const document = store?.siteDocument;
    const sections = Array.isArray(document?.sections) ? document.sections : [];
    const baseOrder = Array.isArray(order) ? [...order] : sections.map((section) => `site-${section.id}`);
    const animationSection = `animation-${animationId}`;
    const withoutAnimation = baseOrder.filter((section) => section !== animationSection);
    const placementKind = {
      "after-hero": "hero",
      "after-story": "story",
      "after-catalog": "catalog",
    }[document?.experience?.placement] || "catalog";
    const placementSection = sections.find((section) => section?.kind === placementKind);
    const placementKey = placementSection ? `site-${placementSection.id}` : placementKind === "story" ? "about" : placementKind === "catalog" ? "products" : "hero";
    const legacyPlacementKey = placementKind === "story" ? "about" : placementKind === "catalog" ? "products" : "hero";
    const sitePlacementIndex = withoutAnimation.indexOf(placementKey);
    const placementIndex = sitePlacementIndex >= 0 ? sitePlacementIndex : withoutAnimation.indexOf(legacyPlacementKey);
    withoutAnimation.splice(placementIndex < 0 ? withoutAnimation.length : placementIndex + 1, 0, animationSection);
    return withoutAnimation;
  }

  function animationMediaDraft(imageUrl) {
    const key = normalizedAssetKey(imageUrl);
    const editorial = pendingEditorialGallery.find((image) => normalizedAssetKey(image.imageUrl) === key);
    const remembered = editorialGalleryDraftsByUrl.get(key);
    return cloneAnimationMedia(editorial || remembered || { imageUrl });
  }

  function completeAnimationMediaMinimum(animation) {
    const requirement = animationMediaRequirement(animation.type);
    const media = animation.media.slice(0, requirement.max).map((entry) => cloneAnimationMedia(entry));
    if (media.length === 0 || media.length >= requirement.min || requirement.min === 0) {
      commitAnimationCommand({ type: "replace-media-list", animationId: animation.id, media, maxMedia: requirement.max }, "", { recordUndo: false });
      return 0;
    }
    const selectedKeys = new Set(media.map((entry) => normalizedAssetKey(entry.imageUrl)));
    let added = 0;
    for (const source of animationSourceMedia(animation.type)) {
      if (selectedKeys.has(source.key)) continue;
      media.push(animationMediaDraft(source.imageUrl));
      selectedKeys.add(source.key);
      added += 1;
      if (media.length >= requirement.min) break;
    }
    commitAnimationCommand({ type: "replace-media-list", animationId: animation.id, media, maxMedia: requirement.max }, "", { recordUndo: false });
    return added;
  }

  function animationProductMedia(product) {
    const imageUrl = product?.imageUrls?.[0];
    if (!imageUrl) return null;
    const media = animationMediaDraft(imageUrl);
    return {
      ...media,
      title: media.title || product.name || "Producto destacado",
      caption: media.caption || product.tags?.[0] || "Producto destacado",
      body: media.body || product.description || "",
    };
  }

  function applyAnimationProduct(animation, productId) {
    const requirement = animationMediaRequirement(animation.type);
    const product = lastPaymentLinks.find((item) => item.id === productId && item.status !== "ARCHIVED");
    return commitAnimationCommand({
      type: "set-field",
      animationId: animation.id,
      key: "productId",
      value: productId || "",
      allowed: !productId || Boolean(product),
      productMedia: animationProductMedia(product),
      maxMedia: requirement.max,
    }, "", { recordUndo: false });
  }

  function syncLegacyMotionState() {
    const types = new Set(pendingAnimations.map((animation) => animation.type));
    storeMotionDuoEnabledEl.checked = pendingAnimations.length > 0;
    storeMotionExperienceEls.forEach((input) => {
      input.checked = types.has(input.value);
      input.disabled = true;
    });
  }

  function animationPayload() {
    return pendingAnimations.map((animation) => ({
      id: animation.id,
      name: animation.name.trim() || animationTypeCopy(animation.type)[0],
      type: animation.type,
      ...(animation.pageId && { pageId: animation.pageId }),
      ...(animation.title.trim() && { title: animation.title.trim() }),
      ...(animation.subtitle.trim() && { subtitle: animation.subtitle.trim() }),
      ...(animation.productId && { productId: animation.productId }),
      ...(String(animation.buttonLabel || "").trim() && { buttonLabel: String(animation.buttonLabel).trim() }),
      ...(Number.isInteger(animation.buttonPositionX) && { buttonPositionX: animation.buttonPositionX }),
      ...(Number.isInteger(animation.buttonPositionY) && { buttonPositionY: animation.buttonPositionY }),
      ...(Number.isInteger(animation.textPositionX) && { textPositionX: animation.textPositionX }),
      ...(Number.isInteger(animation.textPositionY) && { textPositionY: animation.textPositionY }),
      ...(Number.isInteger(animation.textScale) && { textScale: animation.textScale }),
      ...(Number.isInteger(animation.textWidthPercent) && { textWidthPercent: animation.textWidthPercent }),
      ...(["left", "center", "right"].includes(animation.textAlign) && { textAlign: animation.textAlign }),
      ...(["small", "medium", "large"].includes(animation.textSize) && { textSize: animation.textSize }),
      ...(["narrow", "medium", "wide"].includes(animation.textWidth) && { textWidth: animation.textWidth }),
      ...(/^#[0-9a-f]{6}$/i.test(animation.textColor || "") && { textColor: animation.textColor }),
      ...(/^#[0-9a-f]{6}$/i.test(animation.backgroundColor || "") && { backgroundColor: animation.backgroundColor }),
      ...(STORE_FONT_STYLES.includes(animation.fontStyle) && { fontStyle: animation.fontStyle }),
      textBlocks: (animation.textBlocks || []).filter((block) => block.text?.trim()).slice(0, 24).map((block, index) => cloneAnimationTextBlock(block, index)),
      media: animation.media.slice(0, animationMediaRequirement(animation.type).max).map((image) => ({
        imageUrl: image.imageUrl,
        ...(image.productId && { productId: image.productId }),
        ...(image.title.trim() && { title: image.title.trim() }),
        ...(image.caption.trim() && { caption: image.caption.trim() }),
        ...(image.body.trim() && { body: image.body.trim() }),
        boxColor: editorialBoxColor(image.boxColor),
        ...(Number.isInteger(image.textPositionX) && { textPositionX: image.textPositionX }),
        ...(Number.isInteger(image.textPositionY) && { textPositionY: image.textPositionY }),
        ...(Number.isInteger(image.textScale) && { textScale: image.textScale }),
        ...(Number.isInteger(image.textWidthPercent) && { textWidthPercent: image.textWidthPercent }),
        ...(["left", "center", "right"].includes(image.textAlign) && { textAlign: image.textAlign }),
        ...(/^#[0-9a-f]{6}$/i.test(image.textColor || "") && { textColor: image.textColor }),
        ...(STORE_FONT_STYLES.includes(image.fontStyle) && { fontStyle: image.fontStyle }),
      })),
    }));
  }

  function commitAnimationStructureChange() {
    syncLegacyMotionState();
    pendingContentOrder = normalizeStoreContentOrder(pendingContentOrder);
    renderStoreContentOrderEditor();
    setStoreSettingsDirty(true);
    scheduleStorePreview();
  }

  function renderAnimationsEditor() {
    syncLegacyMotionState();
    storeAnimationAddEl.disabled = !storeAnimationTypePickerEl.value;
    const animationEntries = pendingAnimations
      .map((animation, animationIndex) => ({ animation, animationIndex }))
      .filter(({ animation }) => animationCategory(animation.type) === activeAnimationCategory);
    storeAnimationsStatusEl.textContent = `${animationEntries.length} ${animationEntries.length === 1 ? "animación" : "animaciones"} de texto`;
    if (!pendingAnimations.length) {
      storeAnimationsListEl.innerHTML = `<div class="animation-empty"><div><strong>Tu tienda todavía no tiene animaciones</strong><p>Agrega una, ponle un nombre y elige sus fotos. Después podrás moverla como una sección independiente.</p></div></div>`;
      return;
    }
    if (!animationEntries.length) {
      storeAnimationsListEl.innerHTML = `<div class="animation-empty"><div><strong>${activeAnimationCategory === "text" ? "Todavía no hay texto animado" : "Todavía no hay animaciones visuales"}</strong><p>Elige un efecto de esta categoría y agrégalo como una sección independiente.</p></div></div>`;
      return;
    }
    const animationSourcesByIndex = pendingAnimations.map((animation) => animationSourceMedia(animation.type));
    const typeOptions = STORE_MOTION_EXPERIENCES.map((type) => {
      const [label, description] = animationTypeCopy(type);
      return { type, label, description };
    });
    storeAnimationsListEl.innerHTML = animationEntries.map(({ animation, animationIndex }) => {
      const sources = animationSourcesByIndex[animationIndex];
      const [typeLabel, typeDescription] = animationTypeCopy(animation.type);
      const mediaRequirement = animationMediaRequirement(animation.type);
      const usesMedia = mediaRequirement.max > 0;
      const linksProducts = usesMedia && !["video-background", "video-pin-reveal"].includes(animation.type);
      const visibleMedia = animation.media.slice(0, mediaRequirement.max);
      const activeProducts = activeStoreCtaProducts();
      const selectedKeys = new Set(visibleMedia.map((image) => normalizedAssetKey(image.imageUrl)));
      const atLimit = visibleMedia.length >= mediaRequirement.max;
      const sourceHtml = usesMedia && sources.length
        ? sources.map((source, sourceIndex) => {
            const selected = selectedKeys.has(source.key);
            const sourcePreview = isVideoUploadUrl(source.imageUrl)
              ? `<video src="${esc(dashboardAssetUrl(source.imageUrl))}" muted playsinline preload="metadata" aria-label="${esc(source.label)}"></video>`
              : `<img src="${esc(dashboardAssetUrl(source.imageUrl))}" alt="" style="object-position:${esc(catalogImagePosition(source.imageUrl))}">`;
            return `<label class="animation-source" title="${esc(source.label)}">
              <input type="${mediaRequirement.max === 1 ? "radio" : "checkbox"}" ${mediaRequirement.max === 1 ? `name="animation-source-${animationIndex}"` : ""} data-animation-source="${sourceIndex}" ${selected ? "checked" : ""} aria-label="${mediaRequirement.max === 1 ? "Usar" : selected ? "Quitar" : atLimit ? "Reemplazar la última foto por" : "Agregar"} ${esc(source.label)} ${mediaRequirement.max === 1 ? "en" : selected ? "de" : "a"} ${esc(animation.name || typeLabel)}">
              <span class="animation-source-visual">${sourcePreview}<span class="animation-source-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></span></span>
              <span class="animation-source-label">${esc(source.label)}</span>
            </label>`;
          }).join("")
        : usesMedia ? `<p class="editorial-photo-picker-empty">Agrega fotos a la identidad, galería o productos para usarlas aquí.</p>` : "";
      const mediaHtml = visibleMedia.map((image, mediaIndex) => {
        const video = isVideoUploadUrl(image.imageUrl);
        const mediaLabel = image.title || `${video ? "Video" : "Imagen"} ${mediaIndex + 1}`;
        const preview = video
          ? `<video src="${esc(dashboardAssetUrl(image.imageUrl))}" aria-label="Vista previa de ${esc(mediaLabel)}" controls muted playsinline preload="metadata"></video>`
          : `<img src="${esc(dashboardAssetUrl(image.imageUrl))}" alt="Vista previa de ${esc(mediaLabel)}" style="object-position:${esc(catalogImagePosition(image.imageUrl))}">`;
        const productLinkField = linksProducts && !video
          ? `<div class="full animation-media-product-field"><label for="animation-${animationIndex}-media-${mediaIndex}-product">Producto al tocar esta tarjeta (opcional)</label><select id="animation-${animationIndex}-media-${mediaIndex}-product" data-animation-media-field="productId" ${activeProducts.length ? "" : "disabled"}>${editorialProductOptions(image.productId || "")}</select><small>${activeProducts.length ? "Al tocar esta imagen en la tienda, el cliente abrirá directamente el producto elegido." : "Crea un producto activo para poder enlazar esta imagen."}</small></div>`
          : "";
        return `<div class="animation-media-row" data-media-index="${mediaIndex}" data-reorder-key="${esc(image.imageUrl)}" data-reorder-label="${esc(mediaLabel)}">
        ${preview}
        <div class="animation-media-fields">
          <div><label for="animation-${animationIndex}-media-${mediaIndex}-title">Título (opcional)</label><input id="animation-${animationIndex}-media-${mediaIndex}-title" data-animation-media-field="title" maxlength="100" value="${esc(image.title)}" placeholder="Déjalo vacío para mostrar solo la imagen"></div>
          <div><label for="animation-${animationIndex}-media-${mediaIndex}-caption">Subtítulo (opcional)</label><input id="animation-${animationIndex}-media-${mediaIndex}-caption" data-animation-media-field="caption" maxlength="180" value="${esc(image.caption)}" placeholder="Déjalo vacío para ocultarlo"></div>
          <div class="full"><label for="animation-${animationIndex}-media-${mediaIndex}-body">Texto adicional (opcional)${animation.type === "stagger-testimonials" ? " · comentario del cliente" : ""}</label><textarea id="animation-${animationIndex}-media-${mediaIndex}-body" data-animation-media-field="body" maxlength="360" rows="2" placeholder="${animation.type === "stagger-testimonials" ? "Escribe una reseña o déjalo vacío" : "Déjalo vacío si no quieres texto adicional"}">${esc(image.body)}</textarea></div>
          ${productLinkField}
          <div class="animation-media-actions"><button type="button" class="ghost reorder-handle" aria-label="Arrastrar ${esc(mediaLabel)} para ordenar. También puedes usar las flechas, Inicio o Fin." aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Arrastrar para ordenar">${REORDER_HANDLE_ICON}<span>Arrastrar</span></button><button type="button" class="ghost animation-media-move" data-animation-media-move="-1" ${mediaIndex === 0 ? "disabled" : ""}>Subir</button><button type="button" class="ghost animation-media-move" data-animation-media-move="1" ${mediaIndex === visibleMedia.length - 1 ? "disabled" : ""}>Bajar</button><button type="button" class="ghost animation-media-remove">Quitar</button></div>
        </div>
      </div>`;
      }).join("");
      const selectedProduct = activeProducts.find((product) => product.id === animation.productId);
      const textAlign = ["left", "center", "right"].includes(animation.textAlign) ? animation.textAlign : "left";
      const textSize = ["small", "medium", "large"].includes(animation.textSize) ? animation.textSize : "medium";
      const textWidth = ["narrow", "medium", "wide"].includes(animation.textWidth) ? animation.textWidth : "medium";
      const textScale = Number.isInteger(animation.textScale) ? animation.textScale : { small: 80, medium: 100, large: 135 }[textSize];
      const textWidthPercent = Number.isInteger(animation.textWidthPercent) ? animation.textWidthPercent : { narrow: 42, medium: 62, wide: 86 }[textWidth];
      const textColor = /^#[0-9a-f]{6}$/i.test(animation.textColor || "") ? animation.textColor : "#ffffff";
      const backgroundColor = /^#[0-9a-f]{6}$/i.test(animation.backgroundColor || "") ? animation.backgroundColor : "#111827";
      const buttonPositionX = Number.isInteger(animation.buttonPositionX) ? animation.buttonPositionX : 18;
      const buttonPositionY = Number.isInteger(animation.buttonPositionY) ? animation.buttonPositionY : 86;
      const videoCount = visibleMedia.filter((media) => isVideoUploadUrl(media.imageUrl)).length;
      const mediaSummary = usesMedia
        ? videoCount === 1 && visibleMedia.length === 1 ? "1 video" : `${visibleMedia.length} ${visibleMedia.length === 1 ? "foto" : "fotos"}`
        : "Sin fotos";
      const availableMediaSlots = Math.max(0, mediaRequirement.max - visibleMedia.length);
      const videoOnlyAnimation = ["video-background", "video-pin-reveal"].includes(animation.type);
      const batchMediaUpload = !videoOnlyAnimation && mediaRequirement.max > 1;
      const mediaUploadId = `animation-${animationIndex}-media-upload`;
      const mediaUploadStatusId = `${mediaUploadId}-status`;
      const mediaUploadHtml = usesMedia
        ? `<div class="animation-media-upload"><label for="${mediaUploadId}"><input class="sr-only" id="${mediaUploadId}" data-animation-media-upload type="file" accept="${videoOnlyAnimation ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"}" ${batchMediaUpload ? "multiple" : ""} ${availableMediaSlots === 0 && mediaRequirement.max > 1 ? "disabled" : ""} aria-describedby="${mediaUploadStatusId}">${videoOnlyAnimation ? "Subir video" : batchMediaUpload ? "Subir fotos juntas" : "Subir imagen"}</label><span class="animation-media-upload-status" id="${mediaUploadStatusId}" role="status">${availableMediaSlots === 0 && mediaRequirement.max > 1 ? "Quita una foto para subir otra." : batchMediaUpload ? `Puedes elegir hasta ${availableMediaSlots} ${availableMediaSlots === 1 ? "archivo" : "archivos"} a la vez.` : "El archivo se mostrará en cuanto termine de subir."}</span></div>`
        : "";
      const mediaEditorHtml = usesMedia
        ? `<div class="animation-media-picker"><div class="animation-media-picker-head"><div><strong>${mediaRequirement.max === 1 ? "Imagen principal" : "Fotos y textos de esta animación"}</strong><p>${esc(typeDescription)}. ${esc(mediaRequirement.copy)}</p></div><span class="animation-media-count">${visibleMedia.length} / ${mediaRequirement.max}</span></div>${mediaUploadHtml}<div class="animation-source-grid">${sourceHtml}</div><div class="animation-media-list">${mediaHtml}</div></div>`
        : `<div class="animation-text-only-note"><strong>No necesitas seleccionar fotos</strong><p>${esc(mediaRequirement.copy)}${selectedProduct ? ` El producto “${esc(selectedProduct.name)}” también formará parte de las frases.` : ""}</p></div>`;
      return `<article class="animation-card" data-animation-index="${animationIndex}" data-animation-id="${esc(animation.id)}">
        <div class="animation-card-head"><span class="animation-card-number">${animationIndex + 1}</span><div class="animation-card-identity"><strong>${esc(animation.name || typeLabel)}</strong><span>${esc(typeLabel)} · ${mediaSummary}${selectedProduct ? ` · ${esc(selectedProduct.name)}` : ""}</span></div><div class="animation-card-actions"><button type="button" class="ghost animation-card-toggle" aria-controls="animation-card-body-${animationIndex}"><span>Mostrar</span>${COLLAPSE_CHEVRON}</button><button type="button" class="ghost animation-remove" aria-label="Eliminar ${esc(animation.name || typeLabel)}">Eliminar</button></div></div>
        <div class="animation-card-body" id="animation-card-body-${animationIndex}">
          <div class="animation-basics">
            <div><label for="animation-${animationIndex}-name">Nombre para organizar</label><input id="animation-${animationIndex}-name" data-animation-field="name" maxlength="60" value="${esc(animation.name)}" placeholder="Ej. Lanzamiento de invierno"></div>
            <div><label for="animation-${animationIndex}-type">Tipo de animación</label><select id="animation-${animationIndex}-type" data-animation-field="type">${typeOptions.map((option) => `<option value="${option.type}" ${option.type === animation.type ? "selected" : ""}>${esc(option.label)} · ${esc(option.description)}</option>`).join("")}</select></div>
            <div class="full"><label for="animation-${animationIndex}-title">Título general (opcional)</label><input id="animation-${animationIndex}-title" data-animation-field="title" maxlength="100" value="${esc(animation.title)}" placeholder="Un título que acompañe toda la animación"></div>
            <div class="full"><label for="animation-${animationIndex}-subtitle">Subtítulo general (opcional)</label><input id="animation-${animationIndex}-subtitle" data-animation-field="subtitle" maxlength="220" value="${esc(animation.subtitle)}" placeholder="Escribe un subtítulo o déjalo vacío"><small>No mostramos el nombre ni el tipo de animación en la tienda.</small></div>
            <div class="animation-style-editor full">
              <div class="animation-style-head"><div><strong>Botón sobre la animación</strong><p>Escribe una etiqueta para crearlo. Después podrás arrastrarlo directamente en la vista previa.</p></div></div>
              <div class="animation-shape-controls">
                <div><label for="animation-${animationIndex}-button-label">Texto del botón</label><input id="animation-${animationIndex}-button-label" data-animation-field="buttonLabel" maxlength="36" value="${esc(animation.buttonLabel || "")}" placeholder="Ver colección"></div>
                <div class="animation-range-control"><label for="animation-${animationIndex}-button-x">Posición horizontal</label><output for="animation-${animationIndex}-button-x">${buttonPositionX}%</output><input id="animation-${animationIndex}-button-x" type="range" min="0" max="100" step="1" value="${buttonPositionX}" data-animation-field="buttonPositionX"></div>
                <div class="animation-range-control"><label for="animation-${animationIndex}-button-y">Posición vertical</label><output for="animation-${animationIndex}-button-y">${buttonPositionY}%</output><input id="animation-${animationIndex}-button-y" type="range" min="0" max="100" step="1" value="${buttonPositionY}" data-animation-field="buttonPositionY"></div>
              </div>
            </div>
            <div class="animation-style-editor full">
              <div class="animation-style-head"><div><strong>Estilo del texto</strong><p>Arrastra cada bloque de texto directamente en la vista previa. Aquí puedes ajustar su forma y sus colores.</p></div><button type="button" class="ghost animation-style-reset">Restablecer</button></div>
              <div class="animation-shape-controls">
                <div><label for="animation-${animationIndex}-text-align">Alineación</label><select id="animation-${animationIndex}-text-align" data-animation-field="textAlign"><option value="left" ${textAlign === "left" ? "selected" : ""}>Izquierda</option><option value="center" ${textAlign === "center" ? "selected" : ""}>Centro</option><option value="right" ${textAlign === "right" ? "selected" : ""}>Derecha</option></select></div>
                <div class="animation-range-control"><label for="animation-${animationIndex}-text-scale">Tamaño preciso</label><output for="animation-${animationIndex}-text-scale">${textScale}%</output><input id="animation-${animationIndex}-text-scale" type="range" min="50" max="200" step="1" value="${textScale}" data-animation-field="textScale"></div>
                <div class="animation-range-control"><label for="animation-${animationIndex}-text-width-percent">Ancho preciso</label><output for="animation-${animationIndex}-text-width-percent">${textWidthPercent}%</output><input id="animation-${animationIndex}-text-width-percent" type="range" min="20" max="100" step="1" value="${textWidthPercent}" data-animation-field="textWidthPercent"></div>
              </div>
              <div class="animation-color-controls">
                <div class="animation-color-control"><label for="animation-${animationIndex}-text-color">Color del texto</label><output for="animation-${animationIndex}-text-color">${textColor}</output><input id="animation-${animationIndex}-text-color" type="color" value="${textColor}" data-animation-field="textColor"></div>
                <div class="animation-color-control"><label for="animation-${animationIndex}-background-color">Fondo de la animación</label><output for="animation-${animationIndex}-background-color">${backgroundColor}</output><input id="animation-${animationIndex}-background-color" type="color" value="${backgroundColor}" data-animation-field="backgroundColor"></div>
              </div>
            </div>
          </div>
          ${mediaEditorHtml}
        </div>
      </article>`;
    }).join("");

    storeAnimationsListEl.querySelectorAll(".animation-card").forEach((card) => {
      const animationIndex = Number(card.dataset.animationIndex);
      const animation = pendingAnimations[animationIndex];
      const sources = animationSourcesByIndex[animationIndex];
      // Keep every animation's complete setup visible by default. Merchants can
      // still collapse a card manually, but adding or revisiting an animation
      // never hides its media, product, copy, or layout controls.
      setAnimationCardExpanded(card, true, false);
      card.querySelector(".animation-card-toggle").addEventListener("click", () => {
        const expanded = card.querySelector(".animation-card-toggle").getAttribute("aria-expanded") !== "true";
        setAnimationCardExpanded(card, expanded);
      });
      card.querySelectorAll("[data-animation-field]").forEach((field) => field.addEventListener(["type", "productId", "textAlign", "textSize", "textWidth"].includes(field.dataset.animationField) ? "change" : "input", () => {
        const key = field.dataset.animationField;
        const currentAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
        if (!currentAnimation) return;
        const product = key === "productId" && field.value
          ? lastPaymentLinks.find((entry) => entry.id === field.value && entry.status !== "ARCHIVED")
          : null;
        const result = commitAnimationCommand({
          type: "set-field",
          animationId: animation.id,
          key,
          value: field.value,
          allowed: key !== "productId" || !field.value || Boolean(product),
          productMedia: product ? animationProductMedia(product) : null,
          maxMedia: animationMediaRequirement(currentAnimation.type).max,
        }, "", { recordUndo: false });
        if (!result) return;
        let nextAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
        if (!nextAnimation) return;
        if (field.type === "range") field.closest(".animation-range-control")?.querySelector("output")?.replaceChildren(`${field.value}%`);
        if (field.type === "color") field.closest(".animation-color-control")?.querySelector("output")?.replaceChildren(field.value.toUpperCase());
        if (key === "name") {
          card.querySelector(".animation-card-identity strong").textContent = field.value || animationTypeCopy(nextAnimation.type)[0];
          renderStoreContentOrderEditor();
        }
        setStoreSettingsDirty(true);
        if (["type", "productId", "buttonLabel", "buttonPositionX", "buttonPositionY"].includes(key)) scheduleStorePreview();
        if (key === "type") {
          activeAnimationCategory = animationCategory(nextAnimation.type);
          renderAnimationTypePicker();
          if (activePreviewSelection?.animationId === nextAnimation.id && Number.isInteger(activePreviewSelection.itemIndex)) {
            activePreviewSelection = {
              section: `animation-${nextAnimation.id}`,
              field: "section",
              label: nextAnimation.name || animationTypeCopy(nextAnimation.type)[0],
              animationId: nextAnimation.id,
            };
          }
          const addedMedia = completeAnimationMediaMinimum(nextAnimation);
          nextAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
          if (nextAnimation?.productId) applyAnimationProduct(nextAnimation, nextAnimation.productId);
          if (addedMedia > 0) {
            const [typeLabel] = animationTypeCopy(nextAnimation?.type || field.value);
            previewSelectionStatusEl.innerHTML = `<strong>${esc(typeLabel)} lista.</strong> Conservamos tus fotos y agregamos ${addedMedia} ${addedMedia === 1 ? "foto disponible" : "fotos disponibles"} para que la animación no desaparezca.`;
          }
        }
        if (["type", "productId"].includes(key)) renderAnimationsEditor();
      }));
      card.querySelector(".animation-style-reset").addEventListener("click", () => {
        if (!commitAnimationCommand({ type: "reset-style", animationId: animation.id }, "restablecer el estilo de la animación")) return;
        renderAnimationsEditor();
        commitAnimationStructureChange();
      });
      card.querySelectorAll("input[data-animation-source]").forEach((input) => input.addEventListener("change", () => {
        const source = sources[Number(input.dataset.animationSource)];
        const requirement = animationMediaRequirement(animation.type);
        if (!commitAnimationCommand({
          type: "toggle-media",
          animationId: animation.id,
          media: animationMediaDraft(source.imageUrl),
          checked: input.checked,
          maxMedia: requirement.max,
        }, input.checked ? "cambiar las fotos de la animación" : "quitar una foto de la animación")) return;
        renderAnimationsEditor();
        commitAnimationStructureChange();
      }));
      const animationMediaUploadInput = card.querySelector("[data-animation-media-upload]");
      animationMediaUploadInput?.addEventListener("change", async () => {
        const files = [...animationMediaUploadInput.files];
        if (!files.length) return;
        const currentAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
        if (!currentAnimation) return;
        const currentRequirement = animationMediaRequirement(currentAnimation.type);
        const availableSlots = Math.max(0, currentRequirement.max - currentAnimation.media.length);
        const videoOnly = ["video-background", "video-pin-reveal"].includes(currentAnimation.type);
        const status = card.querySelector(".animation-media-upload-status");
        if (currentRequirement.max > 1 && files.length > availableSlots) {
          status.textContent = `Puedes agregar ${availableSlots} ${availableSlots === 1 ? "archivo" : "archivos"} más a esta animación.`;
          animationMediaUploadInput.value = "";
          return;
        }
        const allowedTypes = videoOnly ? ["video/mp4", "video/webm"] : ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
        const invalidFile = files.find((file) => !allowedTypes.includes(file.type) || file.size > (file.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES));
        if (invalidFile) {
          status.textContent = videoOnly ? "Usa un video MP4 o WebM de hasta 20 MB." : "Usa PNG, JPEG, WEBP o GIF de hasta 8 MB, o MP4/WebM de hasta 20 MB.";
          animationMediaUploadInput.value = "";
          return;
        }
        animationMediaUploadInput.disabled = true;
        status.textContent = files.length === 1 ? `Subiendo ${files[0].name}…` : `Subiendo ${files.length} fotos…`;
        try {
          const imageUrls = await runWithConcurrency(files, 3, (file) => uploadFile(file));
          const nextMedia = currentRequirement.max === 1
            ? [animationMediaDraft(imageUrls[0])]
            : [...currentAnimation.media.map(cloneAnimationMedia), ...imageUrls.map(animationMediaDraft)];
          if (!commitAnimationCommand({ type: "replace-media-list", animationId: currentAnimation.id, media: nextMedia, maxMedia: currentRequirement.max }, `agregar ${imageUrls.length === 1 ? "una imagen" : `${imageUrls.length} imágenes`} a la animación`)) return;
          renderAnimationsEditor();
          commitAnimationStructureChange();
          const nextStatus = storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${CSS.escape(currentAnimation.id)}"] .animation-media-upload-status`);
          if (nextStatus) nextStatus.textContent = imageUrls.length === 1 ? "Imagen agregada. Ya ocupa su lugar en la animación." : `${imageUrls.length} fotos agregadas. Ya ocupan sus lugares en la animación.`;
        } catch (error) {
          status.textContent = `No pudimos subir ${files.length === 1 ? "el archivo" : "los archivos"}: ${error.message}`;
        } finally {
          animationMediaUploadInput.disabled = false;
          animationMediaUploadInput.value = "";
        }
      });
      card.querySelectorAll(".animation-media-row").forEach((row) => {
        const mediaIndex = Number(row.dataset.mediaIndex);
        row.querySelectorAll("[data-animation-media-field]").forEach((field) => {
          const eventType = field.dataset.animationMediaField === "productId" ? "change" : "input";
          field.addEventListener(eventType, () => {
            const key = field.dataset.animationMediaField;
            const product = key === "productId" && field.value
              ? activeStoreCtaProducts().find((entry) => entry.id === field.value)
              : null;
            if (!commitAnimationCommand({
              type: "set-media-field",
              animationId: animation.id,
              mediaIndex,
              key,
              value: field.value,
              allowed: key !== "productId" || !field.value || Boolean(product),
            }, "", { recordUndo: false })) return;
            setStoreSettingsDirty(true);
            if (key === "productId") scheduleStorePreview(0);
          });
        });
        row.querySelector(".animation-media-remove").addEventListener("click", () => {
          if (!commitAnimationCommand({ type: "remove-media", animationId: animation.id, mediaIndex }, `quitar medio ${mediaIndex + 1}`)) return;
          renderAnimationsEditor();
          commitAnimationStructureChange();
        });
        row.querySelectorAll("[data-animation-media-move]").forEach((button) => button.addEventListener("click", () => {
          const targetIndex = mediaIndex + Number(button.dataset.animationMediaMove);
          if (!commitAnimationCommand({ type: "reorder-media", animationId: animation.id, fromIndex: mediaIndex, toIndex: targetIndex }, `reordenar medio ${mediaIndex + 1}`)) return;
          const movedLabel = row.dataset.reorderLabel || `Imagen ${mediaIndex + 1}`;
          renderAnimationsEditor();
          commitAnimationStructureChange();
          announceStoreReorder(`${movedLabel} movido a la posición ${targetIndex + 1}.`);
        }));
      });
      wireSortableList({
        container: card.querySelector(".animation-media-list"),
        rowSelector: ".animation-media-row",
        itemCount: animation.media.length,
        onMove: (fromIndex, toIndex) => {
          if (!commitAnimationCommand({ type: "reorder-media", animationId: animation.id, fromIndex, toIndex }, `reordenar medio ${fromIndex + 1}`)) return;
          renderAnimationsEditor();
          commitAnimationStructureChange();
        },
      });
      card.querySelector(".animation-remove").addEventListener("click", () => {
        localStorage.removeItem(animationDisclosureKey(animation.id));
        deleteInlineAnimation({ animationId: animation.id });
      });
    });
  }

  renderAnimationTypePicker();
  storeAnimationCategoryTabs.forEach((tab) => tab.addEventListener("click", () => {
    activeAnimationCategory = tab.dataset.animationCategory === "text" ? "text" : "visual";
    renderAnimationTypePicker();
    renderAnimationsEditor();
  }));
  storeAnimationTypePickerEl.addEventListener("change", () => {
    storeAnimationAddEl.disabled = !storeAnimationTypePickerEl.value;
  });

  function createAnimationSection(type, insertAfter = null, pageId = null) {
    if (!STORE_MOTION_EXPERIENCES.includes(type)) return;
    activeAnimationCategory = animationCategory(type);
    pendingAnimations.forEach((animation) => localStorage.setItem(animationDisclosureKey(animation.id), "false"));
    const id = animationId();
    const [name] = animationTypeCopy(type);
    if (!commitAnimationCommand({
      type: "add-animation",
      animation: {
        id, name, type, ...(pageId ? { pageId } : {}), title: "", subtitle: "", productId: "", media: [],
        textColor: storeAccentToggleEl.checked ? storeAccentColorEl.value : "#f5f5f5",
        backgroundColor: storeBackgroundColorEl.value || "#111827",
      },
    }, `agregar ${name}`)) return null;
    placeTopLevelContentSection(`animation-${id}`, insertAfter);
    localStorage.setItem(animationDisclosureKey(id), "true");
    renderAnimationsEditor();
    commitAnimationStructureChange();
    return pendingAnimations.find((animation) => animation.id === id) || null;
  }

  function openCreatedAnimationMediaSetup(created, placementCopy = "") {
    if (!created) return;
    pendingAnimationMediaSetupId = created.id;
    syncDirectPreviewSelection({ section: `animation-${created.id}`, field: "section", label: created.name, animationId: created.id });
    const requirement = animationMediaRequirement(created.type);
    const missingMedia = Math.max(0, requirement.min - created.media.length);
    if (missingMedia > 0) {
      const videoBackground = ["video-background", "video-pin-reveal"].includes(created.type);
      const mediaCopy = videoBackground
        ? "Sube 1 video MP4 o WebM"
        : `Elige ${missingMedia} ${missingMedia === 1 ? "foto" : "fotos"} o súbelas`;
      const mediaUpload = storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${CSS.escape(created.id)}"] [data-animation-media-upload]`);
      if (mediaUpload) {
        setStorePreviewExpanded(false);
        expandEditorTarget(mediaUpload);
      }
      previewSelectionStatusEl.innerHTML = `<strong>${esc(created.name)} preparada.</strong> ${esc(mediaCopy)} desde sus ajustes. La animación aparecerá cuando tenga ${missingMedia === 1 ? "el medio necesario" : "los medios necesarios"}.`;
    } else {
      previewSelectionStatusEl.innerHTML = `<strong>${esc(created.name)} agregada.</strong> ${esc(placementCopy || "Completa sus opciones directamente en la vista previa.")}`;
    }
    postStorePreviewEditorSelection(activePreviewSelection, { reveal: true });
  }

  storeAnimationAddEl.addEventListener("click", () => {
    const type = storeAnimationTypePickerEl.value;
    const insertAfter = pendingSectionInsertAfter || previewSectionKey(selectedPreviewSection);
    const created = createAnimationSection(type, insertAfter, activePreviewPageId);
    if (!created) return;
    pendingSectionInsertAfter = null;
    storeAnimationTypePickerEl.value = "";
    storeAnimationAddEl.disabled = true;
    openCreatedAnimationMediaSetup(created);
  });

  function renderEditorialPhotoPicker() {
    const sources = editorialSourceImages();
    const selectedKeys = new Set(pendingEditorialGallery.map((image) => normalizedAssetKey(image.imageUrl)));
    storeEditorialPhotoCountEl.textContent = `${pendingEditorialGallery.length} de 8 ${pendingEditorialGallery.length === 1 ? "seleccionada" : "seleccionadas"}`;
    if (sources.length === 0) {
      storeEditorialPhotoOptionsEl.innerHTML = `<p class="editorial-photo-picker-empty">Todavía no hay fotos disponibles. Agrega imágenes a tus productos o usa “Agregar fotos”.</p>`;
      return;
    }
    const atLimit = pendingEditorialGallery.length >= 8;
    storeEditorialPhotoOptionsEl.innerHTML = sources.map((source, index) => {
      const selected = selectedKeys.has(source.key);
      return `<label class="editorial-photo-option" title="${esc(source.label)}">
        <input type="checkbox" data-source-index="${index}" data-source-key="${esc(source.key)}" data-source-label="${esc(source.label)}" ${selected ? "checked" : ""} ${atLimit && !selected ? "disabled" : ""} aria-label="${selected ? "Dejar de mostrar" : "Mostrar"} ${esc(source.label)} en fotos editoriales">
        <span class="editorial-photo-visual">
          <img src="${esc(dashboardAssetUrl(source.imageUrl))}" alt="" style="object-position:${esc(catalogImagePosition(source.imageUrl))}">
          <span class="editorial-photo-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg></span>
        </span>
        <span class="editorial-photo-label">${esc(source.label)}</span>
      </label>`;
    }).join("");
    storeEditorialPhotoOptionsEl.querySelectorAll("input[data-source-index]").forEach((input) => input.addEventListener("change", () => {
      const source = sources[Number(input.dataset.sourceIndex)];
      const selectedIndex = pendingEditorialGallery.findIndex((image) => normalizedAssetKey(image.imageUrl) === source.key);
      if (input.checked && selectedIndex < 0) {
        if (pendingEditorialGallery.length >= 8) {
          input.checked = false;
          return;
        }
        const draft = editorialGalleryDraftsByUrl.get(source.key);
        pendingEditorialGallery.push(draft ? { ...draft, productId: draft.productId || source.productId || "" } : { imageUrl: source.imageUrl, productId: source.productId || "", title: "", caption: "", body: "", boxColor: DEFAULT_EDITORIAL_BOX_COLOR });
      } else if (!input.checked && selectedIndex >= 0) {
        rememberEditorialGalleryDraft(pendingEditorialGallery[selectedIndex]);
        pendingEditorialGallery.splice(selectedIndex, 1);
      }
      syncEditorialPhotoPickerState();
      renderEditorialGalleryEditor({ preservePicker: true });
      setStoreSettingsDirty(true);
      scheduleStorePreview();
    }));
  }

  function syncEditorialPhotoPickerState() {
    const selectedKeys = new Set(pendingEditorialGallery.map((image) => normalizedAssetKey(image.imageUrl)));
    const atLimit = pendingEditorialGallery.length >= 8;
    storeEditorialPhotoCountEl.textContent = `${pendingEditorialGallery.length} de 8 ${pendingEditorialGallery.length === 1 ? "seleccionada" : "seleccionadas"}`;
    storeEditorialPhotoOptionsEl.querySelectorAll("input[data-source-key]").forEach((input) => {
      const selected = selectedKeys.has(input.dataset.sourceKey);
      input.checked = selected;
      input.disabled = atLimit && !selected;
      input.setAttribute("aria-label", `${selected ? "Dejar de mostrar" : "Mostrar"} ${input.dataset.sourceLabel} en fotos editoriales`);
    });
  }

  storeAccentToggleEl.addEventListener("change", () => {
    storeAccentColorEl.disabled = !storeAccentToggleEl.checked;
  });

  function syncStoreCustomizationControls() {
    storeAnnouncementSpeedEl.disabled = storeAnnouncementModeEl.value !== "marquee";
    syncLegacyMotionState();
    storePromotionEditorEl.classList.toggle("is-disabled", !storePromotionEnabledEl.checked);
    [storePromotionImageInputEl, storePromotionImageRemoveBtnEl, storePromotionTitleEl, storePromotionBodyEl, storePromotionCtaLabelEl, storePromotionCtaUrlEl].forEach(
      (field) => (field.disabled = !storePromotionEnabledEl.checked),
    );
    storePromotionProductEl.disabled = !storePromotionEnabledEl.checked || activeStoreCtaProducts().length === 0;
    storeContactFormEditorEl.classList.toggle("is-disabled", !storeContactFormEnabledEl.checked);
    storeContactFormEmailEl.disabled = !storeContactFormEnabledEl.checked;
  }
  storeAnnouncementModeEl.addEventListener("change", syncStoreCustomizationControls);
  storePromotionEnabledEl.addEventListener("change", syncStoreCustomizationControls);
  storeContactFormEnabledEl.addEventListener("change", syncStoreCustomizationControls);
  syncStoreCustomizationControls();

  function selectedStoreMotionExperiences() {
    return [...new Set(pendingAnimations.map((animation) => animation.type))];
  }

  function editableWebsiteStore(store) {
    if (!store?.websiteDraft?.data) return store;
    const edited = { ...store, ...store.websiteDraft.data, ...(store.websiteDraft.links ? { links: store.websiteDraft.links } : {}) };
    edited.locations = (edited.locations || []).map((location) => ({ ...location, inventory: store.websiteDraft.locationInventory?.find((entry) => entry.id === location.id)?.inventory || location.inventory || [] }));
    return edited;
  }

  function currentAgentSelection() {
    return storeEditorStateModule.storeAgentSelection(activePreviewSelection, currentStorePreviewPatch());
  }

  function syncAgentSelectionChip() {
    const chip = document.getElementById("storeAgentSelectionChip");
    const selected = currentAgentSelection();
    chip.hidden = !selected;
    chip.textContent = selected ? `${selected.pageId ? (pendingSiteDocument?.pages || []).find((page) => page.id === selected.pageId)?.label || "Página" : "Inicio"} › ${activePreviewSelection?.label || "Elemento seleccionado"} ×` : "";
  }

  document.getElementById("storeAgentSelectionChip").addEventListener("click", () => {
    activePreviewSelection = null;
    renderPreviewContextEditor(null);
    postStorePreviewEditorSelection(null, { reveal: false });
    syncAgentSelectionChip();
  });

  async function persistCapturedWebsiteDraft(operation) {
    const payload = storeEditorStateModule.storeSettingsPayloadFromSnapshot(operation.snapshot);
    const inventoryProductIds = [...websiteInventoryEditedIds];
    const saved = await api(`/stores/${operation.storeId}/settings`, { method: "PUT", body: JSON.stringify({ ...payload, revision: websiteRevision, inventoryProductIds }) });
    if (operation.storeId !== currentStoreId || storeEditorDraft.getState().activeSave?.token !== operation.token) return saved;
    websiteRevision = saved.websiteRevision;
    websiteHasDraft = true;
    websiteInventoryChanges = saved.websiteDraft?.inventoryChanges || [];
    if (operation.fingerprint === storeEditorDraft.getState().fingerprint) websiteInventoryEditedIds.clear();
    storeEditorDraft.acknowledgeSave(operation);
    return saved;
  }

  document.getElementById("previewPublishButton").addEventListener("click", async () => {
    if (!currentStoreId || storeSettingsDirty || storeSaveInFlight || websitePublishing || activeVisualProposalId || !websiteHasDraft) return;
    const storeId = currentStoreId;
    websitePublishing = true;
    syncStoreDraftUi();
    try {
      const published = await api(`/stores/${storeId}/website-draft/publish`, { method: "POST", body: JSON.stringify({ revision: websiteRevision }) });
      if (storeId !== currentStoreId) return;
      websiteRevision = published.websiteRevision;
      websiteHasDraft = false;
      websiteInventoryChanges = [];
      await refresh();
      infoEl.textContent = "Tu tienda ya está publicada. Guardamos la versión anterior para que puedas recuperarla.";
    } catch (error) {
      if (storeId === currentStoreId) errorEl.textContent = error.message;
    } finally { websitePublishing = false; syncStoreDraftUi(); }
  });

  document.getElementById("discardWebsiteDraft").addEventListener("click", async () => {
    if (!currentStoreId || storeSaveInFlight || websitePublishing) return;
    if (!confirm("¿Descartar el borrador y los cambios locales para volver a la tienda publicada?")) return;
    const storeId = currentStoreId;
    try {
      await api(`/stores/${storeId}/website-draft/discard`, { method: "POST", body: JSON.stringify({ revision: websiteRevision }) });
      if (storeId !== currentStoreId) return;
      storeEditorDraft.markClean();
      activeVisualProposalId = null;
      await refresh();
      refreshStorePreview(true);
    } catch (error) { if (storeId === currentStoreId) errorEl.textContent = error.message; }
  });

  function syncStoreDraftUi() {
    const sourceStore = lastStores.find(store => store.id === currentStoreId);
    const sourcePublished = sourceStore?.publishedSourceRevision;
    const sourcePaused = sourceStore?.sourcePublicationPaused === true;
    const draftState = storeEditorDraft.getState();
    storeSettingsDirty = storeEditorStateModule.isStoreEditorDirty(draftState);
    storeSaveInFlight = storeEditorStateModule.isStoreEditorSaving(draftState);
    storeSaveStatusEl.textContent = storeSaveInFlight
      ? storeSettingsDirty ? "Guardando · hay cambios nuevos" : "Guardando cambios"
      : draftState.saveStatus === "failed" ? "No se pudieron guardar los cambios"
      : storeSettingsDirty ? "Cambios locales sin guardar" : websiteHasDraft ? "Borrador guardado · privado" : sourcePaused ? "Sin publicar · diseño guardado en YAPI" : sourcePublished ? `Diseño publicado en YAPI · revisión ${sourcePublished}` : "Publicado";
    storeSaveStatusEl.classList.toggle("is-dirty", storeSettingsDirty);
    storeSaveButtonEl.disabled = storeSaveInFlight;
    storeSaveButtonEl.textContent = storeSaveInFlight ? "Guardando…" : "Guardar borrador";
    previewSaveButtonEl.disabled = storeSaveInFlight || !storeSettingsDirty;
    previewSaveButtonEl.textContent = storeSaveInFlight ? "Guardando…" : storeSettingsDirty ? "Guardar borrador" : "Guardado";
    const publishButton = document.getElementById("previewPublishButton");
    publishButton.disabled = websitePublishing || storeSaveInFlight || storeSettingsDirty || !websiteHasDraft || Boolean(activeVisualProposalId);
    publishButton.textContent = websitePublishing ? "Publicando…" : websiteInventoryChanges.length ? "Publicar sitio y stock" : sourcePublished ? "Aplicar configuración" : "Publicar";
    publishButton.title = websiteInventoryChanges.map((change) => `${change.name}: ${change.beforeStock ?? "sin límite"} → ${change.stock ?? "sin límite"}`).join("; ");
    document.getElementById("discardWebsiteDraft").hidden = !websiteHasDraft;
    document.getElementById("discardWebsiteDraft").disabled = storeSaveInFlight || websitePublishing;
    previewLiveStatusEl.textContent = activeVisualProposalId ? "Propuesta privada" : websiteHasDraft || storeSettingsDirty ? "Borrador privado" : sourcePaused ? "Sin publicar" : sourcePublished ? "Diseño administrado en YAPI" : "Publicado";
    previewCatalogSaveEl.disabled = storeSaveInFlight || !storeSettingsDirty;
    previewCatalogSaveEl.textContent = storeSaveInFlight ? "Guardando…" : storeSettingsDirty ? "Guardar catálogo" : "Guardado";
  }

  function resetStoreDraftSession(storeId = currentStoreId, { preserveSave = false } = {}) {
    const draftState = storeEditorDraft.getState();
    if (preserveSave && draftState.storeId === (storeId || null) && storeEditorStateModule.isStoreEditorSaving(draftState)) {
      syncStoreDraftUi();
      return;
    }
    storeEditorDraft.hydrate(storeId || null, null);
    syncStoreDraftUi();
  }

  function hydrateStoreDraftSnapshot(storeId = currentStoreId) {
    storeEditorDraft.hydrate(storeId || null, storeId ? readStoreEditorAdapterSnapshot() : null);
    syncStoreDraftUi();
  }

  function setStoreSettingsDirty(isDirty) {
    if (storeEditorDraft.getState().storeId !== currentStoreId) resetStoreDraftSession(currentStoreId);
    if (isDirty) storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    else storeEditorDraft.markClean();
    syncStoreDraftUi();
  }

  function syncStoreEditorUndoButton() {
    const latest = storeEditorUndoStack.at(-1);
    previewUndoButtonEl.disabled = !latest;
    previewUndoButtonEl.title = latest ? `Deshacer: ${latest.label}` : "Nada para deshacer";
    previewUndoButtonEl.setAttribute("aria-label", latest ? `Deshacer ${latest.label}` : "Nada para deshacer");
  }

  function clearStoreEditorUndo() {
    storeEditorUndoStack = [];
    syncStoreEditorUndoButton();
  }

  function pushStoreEditorUndo(label, restore) {
    if (storeEditorApplyingUndo || typeof restore !== "function") return;
    storeEditorUndoStack.push({ label: String(label || "último cambio"), restore });
    if (storeEditorUndoStack.length > 50) storeEditorUndoStack.shift();
    syncStoreEditorUndoButton();
  }

  function restoreStoreEditorControl(id, state) {
    const control = document.getElementById(id);
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement)) return;
    if (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)) control.checked = state.checked;
    else control.value = state.value;
    const changeOnly = control instanceof HTMLSelectElement || (control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type));
    if (!changeOnly) control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function undoStoreEditorChange() {
    const entry = storeEditorUndoStack.pop();
    if (!entry) return;
    storeEditorApplyingUndo = true;
    try {
      entry.restore();
    } finally {
      storeEditorApplyingUndo = false;
    }
    setStoreSettingsDirty(true);
    scheduleStorePreview(0);
    renderPreviewContextEditor(activePreviewSelection);
    renderPreviewCatalogEditor();
    previewSelectionStatusEl.innerHTML = `<strong>Cambio deshecho.</strong> ${esc(entry.label)}.`;
    syncStoreEditorUndoButton();
  }

  function animationUndoSnapshot(animation) {
    return JSON.parse(JSON.stringify(animation));
  }

  const ANIMATION_TEXT_LAYOUT_KEYS = ["textPositionX", "textPositionY", "textScale", "textWidthPercent", "textAlign", "textColor", "fontStyle"];

  function animationTextTarget(selection = activePreviewSelection) {
    const section = String(selection?.section || "");
    const animationId = selection?.animationId || (section.startsWith("animation-") ? section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    if (!animation) return null;
    const block = selection?.itemId ? (animation.textBlocks || []).find((entry) => entry.id === selection.itemId) : null;
    if (block) return { animation, itemIndex: null, target: block, valueKey: "text", role: block.role, block };
    const itemIndex = Number.isInteger(selection?.itemIndex) && animation.media[selection.itemIndex] ? selection.itemIndex : null;
    const target = itemIndex === null ? animation : animation.media[itemIndex];
    const valueKey = itemIndex === null
      ? ["animationSubtitle", "subtitle", "caption", "body"].includes(selection?.field) ? "subtitle" : "title"
      : selection?.field === "caption" ? "caption" : selection?.field === "body" ? "body" : "title";
    const role = ["subtitle", "caption", "body"].includes(valueKey) ? "subtitle" : "title";
    return { animation, itemIndex, target, valueKey, role, block: null };
  }

  function findSiteSectionBlock(section, blockId) {
    const visit = (blocks) => {
      for (const block of blocks || []) {
        if (block.id === blockId) return block;
        const nested = visit(block.children);
        if (nested) return nested;
      }
      return null;
    };
    return blockId ? visit(section?.blocks) : null;
  }

  function siteSectionMediaBlocks(section) {
    const media = [];
    const visit = (blocks) => (blocks || []).forEach((block) => {
      if (block.kind === "media") media.push(block);
      visit(block.children);
    });
    visit(section?.blocks);
    return media;
  }

  function siteSectionBlockLocation(section, blockId) {
    const visit = (blocks) => {
      for (let index = 0; index < (blocks || []).length; index += 1) {
        if (blocks[index].id === blockId) return { blocks, index, block: blocks[index] };
        const nested = visit(blocks[index].children);
        if (nested) return nested;
      }
      return null;
    };
    return blockId ? visit(section?.blocks) : null;
  }

  function resolvedSiteSectionFamily(section) {
    const supported = ["editorial", "cinematic", "product-led", "minimal"];
    if (supported.includes(section?.family)) return section.family;
    const composition = pendingSiteDocument?.designGenome?.composition;
    const byComposition = {
      "editorial-split": "editorial", "narrative-offset": "editorial",
      "spatial-cascade": "cinematic", "gallery-axis": "cinematic",
      "collection-rail": "product-led", "material-ledger": "product-led", "catalog-poster": "product-led",
      "quiet-monument": "minimal", "studio-index": "minimal",
    };
    return byComposition[composition] || "editorial";
  }

  function applyPendingSiteArtDirection(value, { recordUndo = true } = {}) {
    const preset = SITE_ART_DIRECTION_PRESETS[value];
    if (!pendingSiteDocument || !preset) return false;
    const previousDocument = structuredClone(pendingSiteDocument);
    const previousSections = structuredClone(pendingSiteSections);
    if (recordUndo) pushStoreEditorUndo(`cambiar la dirección a ${preset.label}`, () => {
      pendingSiteDocument = structuredClone(previousDocument);
      pendingSiteSections = structuredClone(previousSections);
      pendingSiteDocument.sections = pendingSiteSections;
    });
    pendingSiteSections = pendingSiteSections.map((section) => {
      const [family, layout, width, align] = preset.sections[section.kind] || [];
      return family ? { ...section, family, layout, width, align } : section;
    });
    pendingSiteDocument = {
      ...pendingSiteDocument,
      artDirection: value,
      designGenome: { ...preset.designGenome },
      theme: { ...(pendingSiteDocument.theme || {}), ...preset.theme },
      navigation: { ...(pendingSiteDocument.navigation || {}), ...preset.navigation },
      motion: { ...(pendingSiteDocument.motion || {}), ...preset.motion },
      merchandising: { ...(pendingSiteDocument.merchandising || {}), ...preset.merchandising },
      sections: pendingSiteSections,
    };
    setStoreSettingsDirty(true);
    scheduleStorePreview(0);
    syncPreviewSectionInspector();
    return true;
  }

  function syncSiteSectionBlockProjection(section, block) {
    if (!section || !block) return;
    if (block.id === "heading") section.title = block.text || "";
    if (block.id === "body") section.body = block.text || "";
    if (block.id === "action") section.ctaLabel = block.text || "";
    const chapterMatch = /^chapter-(\d+)-(heading|body)$/.exec(block.id);
    const chapterItem = chapterMatch ? section.items?.[Number(chapterMatch[1]) - 1] : null;
    if (chapterItem) chapterItem[chapterMatch[2] === "heading" ? "title" : "body"] = block.text || "";
  }

  function siteCanvasTextStyleTarget(selection = activePreviewSelection) {
    const sectionKey = String(selection?.section || "");
    if (sectionKey === "brand") {
      const styleKey = selection?.field === "storeTagline" ? "taglineStyle" : selection?.field === "storeName" ? "brandStyle" : "";
      return styleKey && pendingSiteDocument?.navigation ? { owner: pendingSiteDocument.navigation, styleKey } : null;
    }
    if (sectionKey === "navigation" && selection?.field === "navigationLabel" && Number.isInteger(selection?.itemIndex)) {
      const owner = pendingSiteDocument?.navigation?.items?.[selection.itemIndex];
      return owner ? { owner, styleKey: "style" } : null;
    }
    if (!sectionKey.startsWith("site-")) return null;
    const sectionIndex = pendingSiteSections.findIndex((entry) => `site-${entry.id}` === sectionKey);
    const section = pendingSiteSections[sectionIndex];
    if (!section) return null;
    const block = findSiteSectionBlock(section, selection?.itemId);
    if (block && ["heading", "text", "action"].includes(block.kind)) return { section, sectionIndex, owner: block, styleKey: "style" };
    const isBody = ["siteBody", "siteItemBody"].includes(selection?.field);
    const isItem = ["siteItemTitle", "siteItemBody"].includes(selection?.field) && Number.isInteger(selection?.itemIndex);
    const owner = isItem ? section.items?.[selection.itemIndex] : section;
    if (!owner) return null;
    const styleKey = isBody ? "bodyStyle" : "titleStyle";
    return { section, sectionIndex, owner, styleKey };
  }

  function commitStoreDocumentCommand(command, undoLabel) {
    const previousDocument = pendingSiteDocument ? structuredClone(pendingSiteDocument) : null;
    const result = storeEditorStateModule.applyStoreDocumentCommand(pendingSiteDocument, command);
    if (!result.changed || !result.document) return false;
    pushStoreEditorUndo(undoLabel, () => {
      pendingSiteDocument = previousDocument ? structuredClone(previousDocument) : null;
      pendingSiteSections = pendingSiteDocument?.sections || [];
    });
    pendingSiteDocument = result.document;
    pendingSiteSections = result.document.sections || [];
    storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    syncStoreDraftUi();
    return result;
  }

  function commitAnimationCommand(command, undoLabel = "", { recordUndo = Boolean(undoLabel) } = {}) {
    const previousAnimations = structuredClone(pendingAnimations);
    const result = storeEditorStateModule.applyAnimationCommand(pendingAnimations, command);
    if (!result.changed) return null;
    if (recordUndo) pushStoreEditorUndo(undoLabel, () => {
      pendingAnimations = structuredClone(previousAnimations);
      renderAnimationsEditor();
      renderStoreContentOrderEditor();
      if (result.animationId) {
        pendingStorePreviewSection = `animation-${result.animationId}`;
        pendingStorePreviewAction = "motion";
      }
    });
    pendingAnimations = result.animations;
    storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    syncStoreDraftUi();
    return result;
  }

  function siteTextClipboardSource(selection, fallbackText = "") {
    const sectionKey = String(selection?.section || "");
    if (!sectionKey.startsWith("site-")) return null;
    const section = pendingSiteSections.find((entry) => `site-${entry.id}` === sectionKey);
    if (!section) return null;
    const block = findSiteSectionBlock(section, selection?.itemId);
    if (block && ["heading", "text", "action"].includes(block.kind)) return {
      sourceId: block.id,
      kind: block.kind,
      slot: block.slot,
      role: block.role,
      text: String(fallbackText || block.text || ""),
      style: structuredClone(block.style || {}),
    };
    const item = Number.isInteger(selection?.itemIndex) ? section.items?.[selection.itemIndex] : null;
    const field = String(selection?.field || "");
    const projectedId = field === "siteBlockText" ? selection?.itemId : field === "siteTitle" ? "heading" : field === "siteBody" ? "body" : field === "siteCtaLabel" ? "action" : "";
    const kind = projectedId === "heading" || field === "siteItemTitle" ? "heading" : projectedId === "action" ? "action" : "text";
    const text = String(fallbackText || (field === "siteItemTitle" ? item?.title : field === "siteItemBody" ? item?.body : projectedId === "heading" ? section.title : projectedId === "action" ? section.ctaLabel : section.body) || "");
    const style = field === "siteItemTitle" ? item?.titleStyle : field === "siteItemBody" ? item?.bodyStyle : kind === "heading" ? section.titleStyle : kind === "text" ? section.bodyStyle : null;
    return text ? { sourceId: projectedId || null, kind, role: kind === "text" ? "supporting" : "primary", text, style: structuredClone(style || {}) } : null;
  }

  function copyAnimationText(selection = activePreviewSelection, sourceValue) {
    const resolved = animationTextTarget(selection);
    const target = resolved?.target;
    const valueKey = resolved?.valueKey;
    const role = resolved?.role || (["siteBody", "siteItemBody", "body", "caption", "animationSubtitle", "subtitle"].includes(selection?.field) ? "subtitle" : "title");
    const siteBlockSource = siteTextClipboardSource(selection, sourceValue);
    const text = String(resolved ? target[valueKey] || "" : sourceValue || siteBlockSource?.text || "").replace(/\u00a0/g, " ").trim();
    if (!text) return false;
    animationTextClipboard = {
      role,
      text,
      siteBlockSource: siteBlockSource || {
        sourceId: null,
        kind: role === "subtitle" ? "text" : "heading",
        role: role === "subtitle" ? "supporting" : "primary",
        text,
        style: resolved ? {
          fontStyle: target.fontStyle,
          textScale: target.textScale,
          textColor: target.textColor,
          textAlign: target.textAlign,
        } : {},
      },
      ...(resolved ? Object.fromEntries(ANIMATION_TEXT_LAYOUT_KEYS.filter((key) => target[key] !== undefined).map((key) => [key, target[key]])) : {}),
    };
    previewSelectionStatusEl.innerHTML = "<strong>Texto copiado.</strong> Selecciona otro texto y usa Pegar o Ctrl+V.";
    renderPreviewContextEditor(activePreviewSelection);
    return true;
  }

  function pasteAnimationText(selection = activePreviewSelection) {
    if (!animationTextClipboard) return false;
    if (String(selection?.section || "").startsWith("site-")) {
      return duplicateSiteCanvasText(selection, animationTextClipboard.siteBlockSource);
    }
    const resolved = animationTextTarget(selection);
    if (!resolved) {
      if (!selection?.field) return false;
      applyInlinePreviewText(selection, animationTextClipboard.text);
      previewSelectionStatusEl.innerHTML = "<strong>Texto pegado.</strong> Puedes seguir editándolo directamente en la vista previa.";
      return true;
    }
    const { animation } = resolved;
    if ((animation.textBlocks || []).length >= 24) {
      previewSelectionStatusEl.textContent = "Esta sección ya tiene el máximo de 24 textos adicionales.";
      return false;
    }
    const result = commitAnimationCommand({
      type: "add-text-block",
      animationId: animation.id,
      source: animationTextClipboard,
      defaultFontStyle: storeFontStyleEl.value,
    }, "pegar una copia del texto");
    if (!result?.createdBlockId) return false;
    const nextAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
    const block = nextAnimation?.textBlocks?.find((entry) => entry.id === result.createdBlockId);
    if (!block) return false;
    renderAnimationsEditor();
    commitAnimationStructureChange();
    const nextSelection = { section: `animation-${animation.id}`, field: "textBlock", label: block.role === "title" ? "título adicional" : "subtítulo adicional", animationId: animation.id, itemId: block.id };
    activePreviewSelection = nextSelection;
    renderPreviewContextEditor(nextSelection);
    previewSelectionStatusEl.innerHTML = "<strong>Texto pegado como una copia nueva.</strong> Puedes moverlo y darle un estilo distinto sin cambiar el original.";
    return true;
  }

  // Compatibility input adapter for the remaining advanced form controls. It
  // writes a complete snapshot into StoreEditorState; preview and persistence
  // never read these controls or pending values directly afterward.
  function readStoreEditorAdapterSnapshot() {
    const locations = serializedStoreLocations();
    const primaryLocation = locations[0];
    return {
      storeName: document.getElementById("storeNameInput").value.trim(),
      tagline: storeTaglineInputEl.value || null,
      logoUrl: pendingLogoUrl,
      bannerUrl: pendingBannerUrl,
      backgroundColor: storeBackgroundColorEl.value,
      contactPhone: storeContactPhoneInputEl.value || null,
      contactEmail: storeContactEmailInputEl.value || null,
      contactFormEnabled: storeContactFormEnabledEl.checked,
      contactTitle: storeContactTitleEl.value || null,
      contactSubtitle: storeContactSubtitleEl.value || null,
      contactFormEmail: storeContactFormEmailEl.value || null,
      locationMapUrl: primaryLocation?.mapEmbedUrl || null,
      locationHighlight: primaryLocation?.highlight || null,
      locationDescription: primaryLocation?.description || null,
      locationTitle: storeLocationTitleEl.value || null,
      locationSubtitle: storeLocationSubtitleEl.value || null,
      locations,
      aboutText: storeAboutInputEl.value || null,
      aboutTitle: storeAboutTitleEl.value || null,
      aboutSubtitle: storeAboutSubtitleEl.value || null,
      aboutImageUrl: pendingAboutImageUrl,
      catalogTitle: storeCatalogTitleEl.value || null,
      catalogSubtitle: storeCatalogSubtitleEl.value || null,
      galleryTitle: storeGalleryTitleEl.value || null,
      gallerySubtitle: storeGallerySubtitleEl.value || null,
      linksTitle: storeLinksTitleEl.value || null,
      announcement: storeAnnouncementInputEl.value || null,
      announcementMode: storeAnnouncementModeEl.value,
      announcementSpeed: Number(storeAnnouncementSpeedEl.value) || 18,
      announcementSize: storeAnnouncementSizeEl.value,
      announcementColor: storeAnnouncementColorEl.value,
      announcementFont: storeAnnouncementFontEl.value,
      announcementEffect: storeAnnouncementEffectEl.value,
      promotionEnabled: storePromotionEnabledEl.checked,
      promotionImageUrl: pendingPromotionImageUrl,
      promotionTitle: storePromotionTitleEl.value || null,
      promotionBody: storePromotionBodyEl.value || null,
      promotionCtaLabel: storePromotionCtaLabelEl.value || null,
      promotionCtaUrl: storePromotionCtaUrlEl.value || null,
      heroSlides: pendingHeroSlides.map((slide) => ({
        imageUrl: slide.imageUrl,
        title: slide.title.trim(),
        body: slide.body.trim(),
        ctaLabel: slide.ctaLabel.trim(),
        ctaUrl: slide.ctaUrl.trim(),
      })),
      siteDocument: pendingSiteDocument ? { ...pendingSiteDocument, sections: pendingSiteSections.map((section) => structuredClone(section)) } : null,
      contentOrder: [...pendingContentOrder],
      sectionBackgrounds: { ...pendingSectionBackgrounds },
      experienceStyle: storeExperienceStyleEl.value,
      motionDuoEnabled: pendingAnimations.length > 0,
      motionExperience: selectedStoreMotionExperiences()[0] || "clarity-marquee",
      motionExperiences: selectedStoreMotionExperiences(),
      animations: animationPayload(),
      editorialGallery: pendingEditorialGallery.map((image) => ({
        imageUrl: image.imageUrl,
        ...(image.productId && { productId: image.productId }),
        title: image.title.trim(),
        caption: image.caption.trim(),
        body: image.body.trim(),
        boxColor: editorialBoxColor(image.boxColor),
      })),
      layoutStyle: pendingLayoutStyle,
      accentColor: storeAccentToggleEl.checked ? storeAccentColorEl.value : null,
      fontStyle: storeFontStyleEl.value,
      buttonStyle: storeButtonStyleEl.value,
      buttonVariant: storeButtonVariantEl.value,
      buttonMotion: storeButtonMotionEl.value,
      cartButtonLabel: storeCartButtonLabelEl.value.trim() || "Ir a pagar",
      checkoutMode: selectedStoreCheckoutMode(),
      leadCaptureUrl: null,
      cartRecommendationsEnabled: storeCartRecommendationsEl.checked,
      cartRecommendationProductIds: [...pendingCartRecommendationProductIds],
      showLowStockToCustomers: storeShowLowStockEl.checked,
      links: pendingStoreLinks
        .map((link) => ({ label: link.label.trim(), url: link.url.trim() }))
        .filter((link) => link.label && link.url),
    };
  }

  function currentStorePreviewPatch() {
    const draftState = storeEditorDraft.getState();
    if (draftState.storeId === currentStoreId && draftState.snapshot) {
      return structuredClone(draftState.snapshot);
    }
    return null;
  }

  function boundedSiteSectionText(value, maxLength) {
    return Array.from(String(value ?? "").trim()).slice(0, maxLength).join("");
  }

  const STORE_PREVIEW_INTENT_BY_CONTROL = {
    storeNameInput: "brand",
    storeTaglineInput: "brand",
    storeLogoInput: "brand",
    storeLogoRemoveBtn: "brand",
    storeBannerInput: "hero",
    storeBannerRemoveBtn: "hero",
    storeHeroSlidesInput: "hero",
    storeExperienceStyle: "gallery",
    storeMotionDuoEnabled: "motion",
    storeMotionHero: "motion",
    storeMotionStream: "motion",
    storeMotionExpansion: "motion",
    storeMotionGallery: "motion",
    storeMotionTestimonials: "motion",
    storeMotionStory: "motion",
    storeAnimationAdd: "motion",
    storeContactPhoneInput: "cart",
    storeLeadUrl: "cart",
    storeCartRecommendations: "cart",
    storeShowLowStock: "products",
    storeFontStyle: "brand",
    storeButtonStyle: "cart",
    storeButtonVariant: "cart",
    storeButtonMotion: "cart",
    storeCartButtonLabel: "cart",
    storeAccentToggle: "brand",
    storeAccentColor: "brand",
    storeBackgroundColor: "brand",
    storeAnnouncementInput: "announcement",
    storeAnnouncementMode: "announcement",
    storeAnnouncementSpeed: "announcement",
    storeAnnouncementSize: "announcement",
    storeAnnouncementColor: "announcement",
    storeAnnouncementFont: "announcement",
    storeAnnouncementEffect: "announcement",
    storePromotionEnabled: "promotion",
    storePromotionImageInput: "promotion",
    storePromotionImageRemoveBtn: "promotion",
    storePromotionTitle: "promotion",
    storePromotionBody: "promotion",
    storePromotionCtaLabel: "promotion",
    storePromotionCtaUrl: "promotion",
    storeContactEmailInput: "products",
    storeContactFormEnabled: "contact",
    storeContactFormEmail: "contact",
    storeContactTitle: "contact",
    storeContactSubtitle: "contact",
    storeLocationTitle: "location",
    storeLocationSubtitle: "location",
    storeAboutTitle: "about",
    storeAboutSubtitle: "about",
    storeAboutInput: "about",
    storeAboutImageInput: "about",
    storeAboutImageRemoveBtn: "about",
    storeCatalogTitle: "products",
    storeCatalogSubtitle: "products",
    storeGalleryTitle: "gallery",
    storeGallerySubtitle: "gallery",
    storeLinksTitle: "links",
    storeLinkAdd: "links",
  };

  function storePreviewIntentForControl(control) {
    if (!(control instanceof Element)) return null;
    if (control.closest(".store-locations-editor")) return { section: "location" };
    if (control.matches('input[name="storeCheckoutMode"]')) return { section: "products", action: "cart" };
    const directIntent = control.id && STORE_PREVIEW_INTENT_BY_CONTROL[control.id];
    if (directIntent === "cart") return { section: "products", action: "cart" };
    if (directIntent === "motion") return { section: "gallery", action: "motion" };
    if (directIntent) return { section: directIntent, action: "scroll" };
    const heroRow = control.closest(".hero-slide-editor-row");
    if (heroRow) {
      const index = Number(heroRow.dataset.index);
      return { section: "hero", action: "hero-item", targetIndex: index, targetKind: "media" };
    }
    const editorialRow = control.closest(".editorial-gallery-row");
    if (editorialRow) {
      const index = Number(editorialRow.dataset.index);
      if (control.closest(".remove-editorial-image")) return { section: "gallery", action: "motion" };
      return {
        section: "gallery",
        action: "editorial-item",
        targetIndex: index,
        targetKind: control.closest(".editorial-card-preview") ? "media" : "text",
      };
    }
    const animationCard = control.closest(".animation-card");
    if (animationCard) return { section: `animation-${animationCard.dataset.animationId}`, action: "motion" };
    if (control.closest(".animation-workspace")) return { section: "gallery", action: "motion" };
    if (control.closest(".editorial-gallery-editor")) return { section: "gallery", action: "scroll" };
    if (control.closest(".store-link-editor-row")) return { section: "links", action: "scroll" };
    if (control.closest(".store-recommendation-picker")) return { section: "products", action: "cart" };
    const orderRow = control.closest(".store-content-order-row");
    if (orderRow) return { section: pendingContentOrder[Number(orderRow.dataset.index)] || "products", action: "scroll" };
    const editorSection = control.closest(".store-editor-section");
    if (editorSection) {
      const sections = [...storeSettingsFormEl.querySelectorAll(".store-editor-section")];
      const index = sections.indexOf(editorSection);
      const sectionIntents = [
        { section: "brand", action: "scroll" },
        { section: "gallery", action: "scroll" },
        { section: "gallery", action: "motion" },
        { section: "products", action: "cart" },
        { section: "brand", action: "scroll" },
        { section: "announcement", action: "scroll" },
      ];
      return sectionIntents[index] || null;
    }
    return null;
  }

  function rememberStorePreviewIntent(control) {
    const intent = storePreviewIntentForControl(control);
    pendingStorePreviewSection = intent?.section || null;
    pendingStorePreviewAction = intent?.action || null;
    pendingStorePreviewTargetIndex = Number.isInteger(intent?.targetIndex) ? intent.targetIndex : null;
    pendingStorePreviewTargetKind = intent?.targetKind || null;
    pendingStorePreviewProduct = null;
    return intent;
  }

  function postStorePreviewNavigation(intent) {
    if (!intent || !storePreviewFrameEl.contentWindow) return;
    let targetOrigin = "*";
    try {
      targetOrigin = new URL(storePreviewFrameEl.src).origin;
    } catch {
      // The preview itself already reports a malformed URL.
    }
    storePreviewFrameEl.contentWindow.postMessage(
      {
        type: "PAGOSYA_STORE_PREVIEW_NAVIGATION",
        previewSection: intent.section || null,
        previewAction: intent.action || null,
        previewTargetIndex: Number.isInteger(intent.targetIndex) ? intent.targetIndex : null,
        previewTargetKind: intent.targetKind || null,
      },
      targetOrigin,
    );
  }

  function renderPreviewProductNavigation() {
    const products = lastPaymentLinks.filter((product) => product.status === "ACTIVE");
    if (selectedPreviewProductId && !products.some((product) => product.id === selectedPreviewProductId)) selectedPreviewProductId = null;
    const query = normalizeProductSearch(previewProductSearchEl.value);
    const matching = query
      ? products.filter((product) => normalizeProductSearch([product.name, product.description, ...(product.tags || [])].filter(Boolean).join(" ")).includes(query))
      : products;
    const visible = matching.slice(0, 50);
    previewProductNavStatusEl.textContent = query
      ? `${matching.length} de ${products.length}`
      : `${products.length} ${products.length === 1 ? "producto" : "productos"}`;
    if (!visible.length) {
      previewProductListEl.innerHTML = `<p class="preview-product-empty">${products.length ? "No encontramos productos con ese nombre." : "Crea un producto para verlo aquí."}</p>`;
      return;
    }
    previewProductListEl.innerHTML = visible.map((product) => {
      const cover = product.imageUrls?.[0];
      const visual = cover
        ? `<img src="${esc(dashboardAssetUrl(cover))}" alt="" style="object-position:${esc(product.imagePositions?.[0] || "50% 50%")}">`
        : `<span class="preview-product-placeholder" aria-hidden="true">${esc((product.name || "P").trim().charAt(0).toUpperCase() || "P")}</span>`;
      return `<button type="button" class="preview-product-button" data-preview-product-id="${esc(product.id)}" ${product.id === selectedPreviewProductId ? 'aria-current="true"' : ""} aria-label="Abrir ${esc(product.name)} en la vista previa">
        ${visual}
        <span class="preview-product-button-copy"><strong>${esc(product.name)}</strong><small>${money(product.amount)}</small></span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>
      </button>`;
    }).join("") + (matching.length > visible.length ? `<p class="preview-product-empty">Mostrando 50 resultados. Escribe parte del nombre para encontrar los demás.</p>` : "");
  }

  function previewCatalogSections() {
    return pendingSiteSections.filter((section) => section.kind === "catalog");
  }

  function previewCatalogSectionLabel(section, index) {
    const page = section.pageId ? (pendingSiteDocument?.pages || []).find((entry) => entry.id === section.pageId) : null;
    const title = section.title?.trim() || `Productos ${index + 1}`;
    return page ? `${page.label || "Página"} · ${title}` : title;
  }

  function selectedPreviewCatalogSection() {
    const sections = previewCatalogSections();
    if (!sections.some((section) => section.id === selectedPreviewCatalogSectionId)) {
      selectedPreviewCatalogSectionId = sections.find((section) => !section.pageId)?.id || sections[0]?.id || null;
    }
    return sections.find((section) => section.id === selectedPreviewCatalogSectionId) || null;
  }

  function renderPreviewCatalogEditor() {
    if (!previewCatalogEditorEl) return;
    previewCatalogEditorEl.hidden = !currentStoreId;
    if (!currentStoreId) return;

    const sections = previewCatalogSections();
    const activeSection = selectedPreviewCatalogSection();
    const products = activeStoreCtaProducts();
    const selectedIds = new Set(activeSection
      ? Array.isArray(activeSection.productIds) ? activeSection.productIds : products.map((product) => product.id)
      : []);

    previewCatalogSectionCountEl.textContent = `${sections.length} ${sections.length === 1 ? "sección" : "secciones"}`;
    previewCatalogEditorStatusEl.textContent = activeSection
      ? `${selectedIds.size} ${selectedIds.size === 1 ? "publicado" : "publicados"}`
      : "Sin sección";
    previewCatalogSelectionCountEl.textContent = `${selectedIds.size} ${selectedIds.size === 1 ? "seleccionado" : "seleccionados"}`;

    previewCatalogSectionListEl.innerHTML = sections.map((section, index) => {
      const sectionIds = Array.isArray(section.productIds) ? section.productIds : products.map((product) => product.id);
      return `<button type="button" class="preview-catalog-section-button" data-catalog-section-id="${esc(section.id)}" ${section.id === activeSection?.id ? 'aria-current="true"' : ""}><span>${esc(previewCatalogSectionLabel(section, index))}</span><small>${sectionIds.length}</small></button>`;
    }).join("") + (pendingSiteDocument
      ? `<button type="button" class="ghost preview-catalog-add-section" data-add-catalog-section>+ Nueva sección</button>`
      : "");

    if (!pendingSiteDocument) {
      previewCatalogProductGroupsEl.innerHTML = '<p class="preview-catalog-empty">Aplica un diseño de tienda para poder elegir productos por sección. Tus productos guardados siguen disponibles en el catálogo actual.</p>';
      return;
    }
    if (!activeSection) {
      previewCatalogProductGroupsEl.innerHTML = '<p class="preview-catalog-empty">Crea una sección de productos y después elige aquí qué quieres publicar.</p>';
      return;
    }
    if (!products.length) {
      previewCatalogProductGroupsEl.innerHTML = '<p class="preview-catalog-empty">Todavía no hay productos guardados. Guarda el primero y aparecerá aquí con su foto.</p>';
      return;
    }

    const query = normalizeProductSearch(previewCatalogSearchEl.value);
    const visibleProducts = query
      ? products.filter((product) => normalizeProductSearch([product.name, product.description, ...(product.tags || [])].filter(Boolean).join(" ")).includes(query))
      : products;
    if (!visibleProducts.length) {
      previewCatalogProductGroupsEl.innerHTML = '<p class="preview-catalog-empty">No encontramos productos con ese nombre.</p>';
      return;
    }

    const categoryRank = new Map(lastCategories.map((category, index) => [category.id, index]));
    const groups = new Map();
    visibleProducts.forEach((product) => {
      const category = lastCategories.find((entry) => entry.id === product.categoryId);
      const key = category?.id || "uncategorized";
      if (!groups.has(key)) groups.set(key, { key, label: category?.name || "Sin categoría", products: [] });
      groups.get(key).products.push(product);
    });
    const orderedGroups = [...groups.values()].sort((first, second) =>
      (categoryRank.get(first.key) ?? Number.MAX_SAFE_INTEGER) - (categoryRank.get(second.key) ?? Number.MAX_SAFE_INTEGER)
      || first.label.localeCompare(second.label, "es"));
    const checkIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';
    const addIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    previewCatalogProductGroupsEl.innerHTML = orderedGroups.map((group) => `<section class="preview-catalog-product-group" aria-labelledby="previewCatalogGroup-${esc(group.key)}"><h4 id="previewCatalogGroup-${esc(group.key)}">${esc(group.label)} · ${group.products.length}</h4><div class="preview-catalog-product-grid">${group.products.map((product) => {
      const selected = selectedIds.has(product.id);
      const cover = (product.imageUrls || []).find(Boolean);
      const media = cover
        ? `<img src="${esc(dashboardAssetUrl(cover))}" alt="" style="object-position:${esc(product.imagePositions?.[0] || catalogImagePosition(cover))}">`
        : `<span aria-hidden="true">${esc((product.name || "P").trim().charAt(0).toUpperCase() || "P")}</span>`;
      return `<button type="button" class="preview-catalog-product" data-catalog-product-id="${esc(product.id)}" aria-pressed="${selected}" aria-label="${selected ? "Quitar" : "Agregar"} ${esc(product.name)} ${selected ? "de" : "a"} ${esc(activeSection.title || "esta sección")}"><span class="preview-catalog-product-media">${media}</span><span class="preview-catalog-product-check">${selected ? checkIcon : addIcon}</span><span class="preview-catalog-product-copy"><strong>${esc(product.name)}</strong><small>${selected ? "Publicado" : money(product.amount)}</small></span></button>`;
    }).join("")}</div></section>`).join("");
  }

  function togglePreviewCatalogProduct(productId) {
    const section = selectedPreviewCatalogSection();
    const product = activeStoreCtaProducts().find((entry) => entry.id === productId);
    if (!section || !product) return;
    const availableIds = activeStoreCtaProducts().map((entry) => entry.id);
    const previousIds = Array.isArray(section.productIds) ? [...section.productIds] : [...availableIds];
    const nextIds = new Set(previousIds);
    const removing = nextIds.has(product.id);
    if (removing) nextIds.delete(product.id);
    else nextIds.add(product.id);
    pushStoreEditorUndo(`${removing ? "quitar" : "agregar"} ${product.name} ${removing ? "de" : "a"} la sección`, () => {
      section.productIds = [...previousIds];
      if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
      renderPreviewCatalogEditor();
    });
    section.productIds = [...nextIds];
    pendingSiteDocument.sections = pendingSiteSections;
    pendingStorePreviewSection = `site-${section.id}`;
    pendingStorePreviewAction = "scroll";
    setStoreSettingsDirty(true);
    scheduleStorePreview(0);
    renderPreviewCatalogEditor();
  }

  previewCatalogSearchEl?.addEventListener("input", renderPreviewCatalogEditor);
  previewCatalogSectionListEl?.addEventListener("click", (event) => {
    const sectionButton = event.target.closest("[data-catalog-section-id]");
    if (sectionButton) {
      selectedPreviewCatalogSectionId = sectionButton.dataset.catalogSectionId;
      const section = selectedPreviewCatalogSection();
      if (section) {
        pendingStorePreviewSection = `site-${section.id}`;
        pendingStorePreviewAction = "scroll";
        scheduleStorePreview(0);
      }
      renderPreviewCatalogEditor();
      return;
    }
    if (!event.target.closest("[data-add-catalog-section]") || !pendingSiteDocument) return;
    const section = createGeneratedSiteSection("catalog");
    if (!section) return;
    selectedPreviewCatalogSectionId = section.id;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `site-${section.id}`;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    renderPreviewCatalogEditor();
  });
  previewCatalogProductGroupsEl?.addEventListener("click", (event) => {
    const productButton = event.target.closest("[data-catalog-product-id]");
    if (productButton) togglePreviewCatalogProduct(productButton.dataset.catalogProductId);
  });

  function openProductInStorePreview(productId) {
    const product = lastPaymentLinks.find((entry) => entry.id === productId && entry.status === "ACTIVE");
    if (!product) return;
    selectedPreviewProductId = product.id;
    setPreviewSectionCurrent("products");
    pendingStorePreviewSection = "products";
    pendingStorePreviewAction = "product";
    pendingStorePreviewTargetIndex = null;
    pendingStorePreviewTargetKind = null;
    pendingStorePreviewProduct = product;
    renderPreviewProductNavigation();
    previewSelectionStatusEl.innerHTML = `<strong>${esc(product.name)}.</strong> Abrimos su página dentro de la vista previa.`;
    scheduleStorePreview(0);
  }

  function postStorePreview() {
    if (!currentStoreId || !storePreviewFrameEl.contentWindow || activeVisualProposalId) return;
    let targetOrigin = "*";
    try {
      targetOrigin = new URL(storePreviewFrameEl.src).origin;
    } catch {
      // A malformed local URL is already surfaced by the empty iframe; the
      // preview message remains harmless because checkout only accepts it in
      // explicit ?preview=1 mode and only from its direct parent window.
    }
    const previewSection = pendingStorePreviewSection;
    const previewAction = pendingStorePreviewAction;
    const previewTargetIndex = pendingStorePreviewTargetIndex;
    const previewTargetKind = pendingStorePreviewTargetKind;
    const previewProduct = pendingStorePreviewProduct;
    storePreviewFrameEl.contentWindow.postMessage(
      { type: "PAGOSYA_STORE_PREVIEW", patch: currentStorePreviewPatch(), previewSection, previewAction, previewTargetIndex, previewTargetKind, previewProduct, editorMode: storePreviewEditorEnabled, editorSelection: activePreviewSelection, lockedSectionIds: [...lockedAiSectionIds] },
      targetOrigin,
    );
    if (storePreviewStageEl.classList.contains("is-ready")) {
      pendingStorePreviewSection = null;
      pendingStorePreviewAction = null;
      pendingStorePreviewTargetIndex = null;
      pendingStorePreviewTargetKind = null;
      pendingStorePreviewProduct = null;
    }
  }

  function postStorePreviewEditorSelection(selection = activePreviewSelection, { reveal = true } = {}) {
    if (!storePreviewFrameEl.contentWindow) return;
    let targetOrigin = "*";
    try {
      targetOrigin = new URL(storePreviewFrameEl.src).origin;
    } catch {
      // The preview itself already reports a malformed URL.
    }
    storePreviewFrameEl.contentWindow.postMessage(
      { type: "PAGOSYA_STORE_EDITOR_SELECTION", editorMode: storePreviewEditorEnabled, editorSelection: selection, reveal },
      targetOrigin,
    );
  }

  function postStorePreviewEditorText(selection, value) {
    if (!storePreviewFrameEl.contentWindow) return;
    let targetOrigin = "*";
    try {
      targetOrigin = new URL(storePreviewFrameEl.src).origin;
    } catch {
      // The preview already surfaces malformed checkout URLs.
    }
    storePreviewFrameEl.contentWindow.postMessage(
      { type: "PAGOSYA_STORE_EDITOR_TEXT_UPDATE", editorMode: storePreviewEditorEnabled, selection, value: String(value ?? "") },
      targetOrigin,
    );
  }

  function postStorePreviewAnimationStyle(animationId, key, value, selection = null) {
    if (!storePreviewFrameEl.contentWindow || !animationId) return;
    let targetOrigin = "*";
    try {
      targetOrigin = new URL(storePreviewFrameEl.src).origin;
    } catch {
      // The preview already surfaces malformed checkout URLs.
    }
    storePreviewFrameEl.contentWindow.postMessage(
      { type: "PAGOSYA_STORE_EDITOR_STYLE_UPDATE", editorMode: storePreviewEditorEnabled, animationId, key, value, selection },
      targetOrigin,
    );
  }

  function visualProposalPreviewUrl(proposal) {
    const storeUrl = currentStoreUrl();
    if (!storeUrl) return "";
    try {
      const url = new URL(storeUrl);
      url.searchParams.set("preview", "1");
      url.searchParams.set("editor", "0");
      // Each direction must be a full iframe navigation. Changing only the
      // fragment leaves the Checkout SPA mounted with the previous proposal,
      // so switching options can appear to do nothing.
      url.searchParams.set("ai_option", String(proposal.id || "proposal"));
      url.hash = new URLSearchParams({
        parent_origin: window.location.origin,
        proposal: JSON.stringify(storeEditorStateModule.replaceStoreCreativeCanvas(currentStorePreviewPatch(), proposal.config || {})),
      }).toString();
      return url.toString();
    } catch {
      return "";
    }
  }

  function syncVisualProposalSelection() {
    visualProposalsEl.querySelectorAll(".visual-proposal").forEach((row) => {
      const selected = row.dataset.id === activeVisualProposalId;
      row.classList.toggle("is-previewing", selected);
      row.setAttribute("aria-current", selected ? "true" : "false");
      const previewButton = row.querySelector(".visual-preview-proposal");
      if (!previewButton) return;
      previewButton.setAttribute("aria-pressed", String(selected));
      previewButton.textContent = selected ? "Viendo aquí" : "Ver aquí";
    });
  }

  function previewVisualProposal(proposal, { announce = true } = {}) {
    if (!proposal || visualStudioStoreId !== currentStoreId) return false;
    const previewUrl = visualProposalPreviewUrl(proposal);
    if (!previewUrl) {
      visualProposalStatusEl.textContent = "No pudimos mostrar esta opción. Revisa la URL de Checkout e intenta nuevamente.";
      return false;
    }
    activeVisualProposalId = proposal.id;
    activePreviewSelection = null;
    syncAgentSelectionChip();
    syncStoreDraftUi();
    hidePreviewExternalLinkNotice();
    syncVisualProposalSelection();
    previewLiveStatusEl.textContent = "Propuesta privada";
    storePreviewFrameEl.title = `Vista previa de ${proposal.title}`;
    setStorePreviewState("loading");
    storePreviewFrameEl.src = previewUrl;
    waitForStorePreviewHandshake();
    if (announce) visualProposalStatusEl.textContent = `Mostrando “${proposal.title}” en Tu tienda. Puedes recorrerla y cambiar de opción sin publicar nada.`;
    return true;
  }

  function leaveVisualProposalPreview({ reload = true } = {}) {
    if (!activeVisualProposalId) return;
    activeVisualProposalId = null;
    syncVisualProposalSelection();
    syncStoreDraftUi();
    storePreviewFrameEl.title = "Vista previa editable de la tienda";
    if (reload) refreshStorePreview(true);
  }

  async function undoStoreAgentChange(message, button) {
    if (!message?.proposalId || !currentStoreId) return;
    const proposalId = message.proposalId;
    const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata : {};
    const sourceProposalId = typeof metadata.sourceProposalId === "string" ? metadata.sourceProposalId : "";
    const savedVersion = visualVersions.find((version) => version.source === `draft-proposal:${proposalId}` || version.source === `proposal:${proposalId}`);

    if (savedVersion) {
      if (storeSettingsDirty && !confirm("Tienes cambios sin guardar. ¿Deshacer el cambio de Yapi y descartarlos?")) return;
      if (!confirm("¿Deshacer este cambio de Yapi? La apariencia actual quedará guardada para que también puedas recuperarla.")) return;
      setButtonBusy(button, true, "Deshaciendo…");
      try {
        const restoreStoreId = currentStoreId;
        await api(`/stores/${restoreStoreId}/visual-versions/${savedVersion.id}/restore`, { method: "POST", body: JSON.stringify({ revision: websiteRevision }) });
        if (restoreStoreId !== currentStoreId) return;
        storeEditorDraft.markClean();
        activeVisualProposalId = null;
        syncStoreDraftUi();
        await refresh();
        refreshStorePreview(true);
        infoEl.textContent = "Cambio de Yapi deshecho en el borrador privado. La tienda publicada sigue igual.";
      } catch (err) {
        errorEl.textContent = "No se pudo deshacer el cambio: " + err.message;
      } finally {
        setButtonBusy(button, false, "Deshacer cambio");
      }
      return;
    }

    const sourceProposal = sourceProposalId
      ? visualProposals.find((proposal) => proposal.id === sourceProposalId)
      : null;
    if (sourceProposal) {
      previewVisualProposal(sourceProposal, { announce: false });
      visualProposalStatusEl.textContent = `Volviste al borrador anterior: “${sourceProposal.title}”. Nada se publicó.`;
    } else {
      leaveVisualProposalPreview({ reload: true });
      visualProposalStatusEl.textContent = "Cerramos la propuesta y volvimos al editor. Nada se publicó.";
    }
  }

  function setVisualStep(step) {
    // Yapi stays a continuous chat. Generation progress and proposal review
    // are represented by messages and their actions instead of replacing it.
    visualStepEls[0].hidden = false;
    visualStepEls[1].hidden = true;
    visualStepEls[2].hidden = true;
    visualProgressEl.querySelectorAll("li").forEach((item) => item.classList.toggle("is-active", Number(item.dataset.step) <= step));
  }

  function storeAgentMessageTime(message) {
    const date = new Date(message?.createdAt || "");
    if (!Number.isFinite(date.getTime())) return "";
    const today = new Date();
    const sameDay = date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
    return new Intl.DateTimeFormat("es-BO", sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(date);
  }

  function renderStoreAgentTimeline({ forceBottom = false } = {}) {
    if (!storeAgentTimelineEl) return;
    const activityTitle = document.getElementById("storeAgentActivityTitle");
    if (activityTitle) activityTitle.textContent = storeAgentMessages.length
      ? `Yapi y tú · ${storeAgentMessages.length} ${storeAgentMessages.length === 1 ? "mensaje" : "mensajes"}`
      : "Yapi y tú";
    const previousScrollTop = storeAgentTimelineEl.scrollTop;
    const wasNearBottom = storeAgentTimelineEl.scrollHeight <= storeAgentTimelineEl.clientHeight
      || storeAgentTimelineEl.scrollHeight - storeAgentTimelineEl.scrollTop - storeAgentTimelineEl.clientHeight < 64;
    const messages = [];
    const visibleMessages = storeAgentMessages;
    const latestAppliedProposalId = visualProposals
      .filter((proposal) => proposal.status === "APPLIED")
      .sort((first, second) => new Date(second.appliedAt || 0) - new Date(first.appliedAt || 0))[0]?.id;
    visibleMessages.forEach((message, index) => {
      const metadata = message?.metadata && typeof message.metadata === "object" ? message.metadata : {};
      const changedAreas = Array.isArray(metadata.changedAreas)
        ? [...new Set(metadata.changedAreas.filter((area) => typeof area === "string" && area.trim()))].slice(0, 6)
        : [];
      const timestamp = storeAgentMessageTime(message);
      const messageHead = (role) => `<header class="store-agent-message-head"><span class="store-agent-message-role">${role}</span>${timestamp ? `<time class="store-agent-message-time" datetime="${esc(message.createdAt)}">${esc(timestamp)}</time>` : ""}</header>`;
      if (message.role === "USER") {
        messages.push(`<article class="store-agent-message is-user${metadata.optimistic ? " is-working" : ""}">
          ${messageHead(`Tú${metadata.optimistic ? " · enviando" : ""}`)}
          <p>${esc(message.content || "Cambio solicitado")}</p>
        </article>`);
      } else {
        const clarification = metadata.clarification && typeof metadata.clarification === "object" ? metadata.clarification : null;
        const options = Array.isArray(clarification?.options)
          ? clarification.options.filter((option) => option && typeof option.id === "string" && typeof option.label === "string" && typeof option.value === "string").slice(0, 4)
          : [];
        const nextUserMessage = visibleMessages.slice(index + 1).find((candidate) => candidate?.role === "USER");
        const answered = Boolean(nextUserMessage);
        const replies = options.length && !answered
          ? `<div class="store-agent-replies" role="group" aria-label="Respuestas sugeridas">
              ${options.map((option) => `<button type="button" class="store-agent-reply" data-agent-reply="${esc(option.value)}" aria-pressed="false">${esc(option.label)}</button>`).join("")}
            </div>
            <p class="store-agent-custom-reply">También puedes responder con tus propias palabras abajo.</p>`
          : "";
        const proposalIds = [...new Set([
          ...(Array.isArray(metadata.proposalIds) ? metadata.proposalIds : []),
          message.proposalId,
        ].filter((id) => typeof id === "string" && id))];
        const messageProposals = proposalIds
          .map((id) => visualProposals.find((proposal) => proposal.id === id))
          .filter(Boolean);
        const proposalActions = messageProposals.length && metadata.failed !== true
          ? `<div class="store-agent-message-actions" aria-label="Borradores de esta respuesta">
              ${messageProposals.map((proposal) => `
                <button type="button" class="store-agent-message-action" data-agent-preview-proposal="${esc(proposal.id)}">${messageProposals.length === 1 ? "Ver borrador" : `Ver ${esc(proposal.title || "borrador")}`}</button>
                <button type="button" class="store-agent-message-action is-primary" data-agent-apply-proposal="${esc(proposal.id)}">${proposal.id === latestAppliedProposalId ? "Usar en borrador" : "Usar en borrador"}</button>
                <button type="button" class="store-agent-message-action" data-agent-save-template="${esc(proposal.id)}">Guardar receta</button>
              `).join("")}
              <button type="button" class="store-agent-message-action" data-agent-undo-message-index="${index}">Deshacer cambio</button>
            </div>`
          : "";
        messages.push(`<article class="store-agent-message is-yapi${metadata.failed === true ? " is-error" : ""}">
          ${messageHead(`Yapi${message.proposalId ? " · vista privada" : ""}`)}
          <p>${esc(message.content || "")}</p>
          ${replies}
          ${changedAreas.length && !clarification && metadata.failed !== true ? `<div class="store-agent-change-list" aria-label="Áreas modificadas">${changedAreas.map((area) => `<span>${esc(area)}</span>`).join("")}</div>` : ""}
          ${proposalActions}
        </article>`);
      }
    });
    if (storeAgentWorkingInstruction) {
      messages.push(`<article class="store-agent-message is-yapi is-working">
        <header class="store-agent-message-head"><span class="store-agent-message-role">Yapi · pensando</span></header>
        <p data-agent-progress>${esc(visualLoaderPhases[storeAgentWorkingPhase]?.copy || "Preparando tu pedido…")}</p>
      </article>`);
    }
    storeAgentTimelineEl.innerHTML = messages.length
      ? messages.join("")
      : '<p class="store-agent-empty">Cuéntale a Yapi qué quieres lograr. Si falta una decisión importante, te preguntará antes de tocar el borrador.</p>';
    requestAnimationFrame(() => {
      storeAgentTimelineEl.scrollTop = forceBottom || wasNearBottom
        ? storeAgentTimelineEl.scrollHeight
        : previousScrollTop;
    });
  }

  async function loadStoreAgentConversation(storeId = currentStoreId) {
    storeAgentMessages = [];
    storeAgentWorkingInstruction = "";
    renderStoreAgentTimeline();
    if (!storeId) return;
    try {
      const conversation = await api(`/stores/${storeId}/agent-conversation`);
      if (storeId !== currentStoreId) return;
      storeAgentMessages = Array.isArray(conversation.messages) ? conversation.messages : [];
      renderStoreAgentTimeline({ forceBottom: true });
    } catch (error) {
      if (storeId !== currentStoreId) return;
      storeAgentTimelineEl.innerHTML = `<p class="store-agent-empty">No pudimos cargar la actividad anterior. Puedes enviar un cambio nuevo. ${esc(error.message)}</p>`;
    }
  }

  let storeAgentWorkingPhase = "preparing";
  const visualLoaderPhases = {
    preparing: { kicker: "Pedido recibido", title: "Preparando tu pedido", copy: "Estoy preparando tu pedido para enviarlo con las referencias que elegiste." },
    uploading: { kicker: "Tus referencias", title: "Subiendo tus fotos", copy: "Estoy subiendo las fotos adjuntas. Conservaré su orden para usarlas en este pedido." },
    composing: { kicker: "Pedido en curso", title: "Yapi está trabajando", copy: "Tu pedido está en proceso. Puedes escribir el siguiente mensaje mientras esperas." },
    finishing: { kicker: "Respuesta recibida", title: "Listo para revisar", copy: "Ya recibí el resultado. Puedes revisar los cambios en la vista previa." },
  };

  function setVisualGenerationPhase(phase) {
    const next = visualLoaderPhases[phase] || visualLoaderPhases.preparing;
    visualGenerationLoaderEl.dataset.phase = phase;
    visualLoaderKickerEl.textContent = next.kicker;
    visualLoaderTitleEl.textContent = next.title;
    visualLoaderCopyEl.textContent = next.copy;
    storeAgentWorkingPhase = phase;
    const progress = storeAgentTimelineEl?.querySelector("[data-agent-progress]");
    if (progress) progress.textContent = next.copy;
  }

  function stopVisualGenerationLoader() {
    document.body.classList.remove("is-generating-visual");
  }

  function startVisualGenerationLoader() {
    document.body.classList.add("is-generating-visual");
    setVisualGenerationPhase("preparing");
  }

  function renderVisualSources() {
    const visualCount = [pendingBannerUrl, pendingAboutImageUrl, pendingPromotionImageUrl, ...pendingAnimations.flatMap((animation) => animation.media.map((image) => image.imageUrl)), ...pendingEditorialGallery.map((image) => image.imageUrl)].filter(Boolean).length;
    visualSourcePreviewsEl.innerHTML = `<span class="badge">${visualCount ? `${visualCount} recursos visuales detectados` : "Usaremos las fotos del catálogo"}</span><span class="badge">${pendingStoreLinks.length ? `${pendingStoreLinks.length} enlaces listos` : "Redes opcionales"}</span>`;
    visualGenerateEl.disabled = !currentStoreId;
  }

  function selectedVisualCheckoutMode() {
    return document.querySelector('input[name="visualCheckoutMode"]:checked')?.value || "payment";
  }

  function selectedStoreCheckoutMode() {
    return document.querySelector('input[name="storeCheckoutMode"]:checked')?.value || "payment";
  }

  function renderStoreRecommendationChoices() {
    storeRecommendationPickerEl.hidden = !storeCartRecommendationsEl.checked;
    const products = lastPaymentLinks.filter((product) => product.status !== "ARCHIVED");
    if (!products.length) {
      storeRecommendationOptionsEl.innerHTML = '<p class="store-recommendation-empty">Crea productos para poder elegir cuáles recomendar.</p>';
      storeRecommendationCountEl.textContent = "0 seleccionados";
      return;
    }
    const availableIds = new Set(products.map((product) => product.id));
    pendingCartRecommendationProductIds = pendingCartRecommendationProductIds.filter((id) => availableIds.has(id));
    storeRecommendationOptionsEl.innerHTML = products.map((product) => `
      <label class="store-recommendation-option" title="${esc(product.name)}">
        <input type="checkbox" value="${esc(product.id)}" aria-label="Recomendar ${esc(product.name)}" ${pendingCartRecommendationProductIds.includes(product.id) ? "checked" : ""}>
        <span class="store-recommendation-thumb" aria-hidden="true">${product.imageUrls?.[0] ? `<img src="${esc(dashboardAssetUrl(product.imageUrls[0]))}" alt="" style="object-position:${esc(product.imagePositions?.[0] || "50% 50%")}">` : esc(product.name.trim().slice(0, 2).toUpperCase())}</span>
      </label>`).join("");
    const updateCount = () => {
      pendingCartRecommendationProductIds = [...storeRecommendationOptionsEl.querySelectorAll('input:checked')].map((input) => input.value).slice(0, 12);
      storeRecommendationCountEl.textContent = `${pendingCartRecommendationProductIds.length} ${pendingCartRecommendationProductIds.length === 1 ? "seleccionado" : "seleccionados"}`;
    };
    storeRecommendationOptionsEl.querySelectorAll("input").forEach((input) => input.addEventListener("change", () => {
      if (input.checked && storeRecommendationOptionsEl.querySelectorAll('input:checked').length > 12) {
        input.checked = false;
        infoEl.textContent = "Puedes recomendar hasta 12 productos.";
      }
      updateCount();
    }));
    updateCount();
  }

  function activeStoreCtaProducts() {
    return lastPaymentLinks.filter((product) => product.status !== "ARCHIVED");
  }

  function storeProductCtaUrl(productId) {
    const store = lastStores.find((candidate) => candidate.id === currentStoreId);
    if (!store || !productId) return "";
    return `${publicStoreUrl(store)}/p/${encodeURIComponent(productId)}`;
  }

  function storeProductIdFromCtaUrl(value) {
    const store = lastStores.find((candidate) => candidate.id === currentStoreId);
    if (!store || !value) return "";
    try {
      const url = new URL(value);
      const canonical = url.pathname.match(/^\/s\/([^/]+)\/p\/([^/]+)\/?$/);
      if (canonical && decodeURIComponent(canonical[1]) === store.slug) return decodeURIComponent(canonical[2]);
      return url.searchParams.get("link") === store.slug ? url.searchParams.get("product") || "" : "";
    } catch {
      return "";
    }
  }

  function storeProductCtaOptions(value) {
    const products = activeStoreCtaProducts();
    const selectedProductId = storeProductIdFromCtaUrl(value);
    const selectedProductIsMissing = selectedProductId && !products.some((product) => product.id === selectedProductId);
    return [
      `<option value="">${products.length ? "Usar un enlace personalizado" : "Crea un producto primero"}</option>`,
      ...(selectedProductIsMissing ? [`<option value="${esc(selectedProductId)}" selected disabled>Producto no disponible</option>`] : []),
      ...products.map((product) => `<option value="${esc(product.id)}" ${product.id === selectedProductId ? "selected" : ""}>${esc(product.name)}</option>`),
    ].join("");
  }

  function renderPromotionProductChoice() {
    storePromotionProductEl.innerHTML = storeProductCtaOptions(storePromotionCtaUrlEl.value);
    storePromotionProductEl.disabled = !storePromotionEnabledEl.checked || activeStoreCtaProducts().length === 0;
  }

  storePromotionProductEl.addEventListener("change", () => {
    storePromotionCtaUrlEl.value = storeProductCtaUrl(storePromotionProductEl.value);
  });
  storePromotionCtaUrlEl.addEventListener("input", () => {
    const productId = storeProductIdFromCtaUrl(storePromotionCtaUrlEl.value);
    storePromotionProductEl.value = [...storePromotionProductEl.options].some((option) => option.value === productId) ? productId : "";
  });

  function hasUsableWhatsAppPhone(value) {
    const digitCount = String(value || "").replace(/\D/g, "").length;
    return digitCount >= 7 && digitCount <= 15;
  }

  function normalizedStoreLocationMapUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const iframeSource = raw.match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    return String(iframeSource || raw).replace(/&amp;/gi, "&").trim();
  }

  function isSupportedStoreLocationMapUrl(value) {
    if (!value) return true;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return false;
      const hostname = url.hostname.toLowerCase();
      const googleHost = /^(?:[a-z0-9-]+\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/.test(hostname);
      const googleEmbed = googleHost && url.pathname.startsWith("/maps/embed");
      const openStreetMapEmbed = (hostname === "openstreetmap.org" || hostname === "www.openstreetmap.org")
        && url.pathname === "/export/embed.html";
      return googleEmbed || openStreetMapEmbed;
    } catch {
      return false;
    }
  }

  const STORE_LOCATION_DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

  function defaultStoreLocationHours() {
    return STORE_LOCATION_DAYS.map((_, day) => ({ day, open: "09:00", close: "18:00", closed: day === 0 }));
  }

  function serializedStoreLocations() {
    return pendingStoreLocations.map((location) => ({
      id: location.id,
      name: String(location.name || "").trim(),
      address: String(location.address || "").trim() || null,
      mapEmbedUrl: normalizedStoreLocationMapUrl(location.mapEmbedUrl),
      highlight: String(location.highlight || "").trim() || null,
      description: String(location.description || "").trim() || null,
      pickupEnabled: location.pickupEnabled === true,
      deliveryEnabled: location.deliveryEnabled === true,
      openingHours: (location.openingHours || defaultStoreLocationHours()).map((hours) => ({ day: hours.day, open: hours.open, close: hours.close, closed: hours.closed === true })),
      inventory: lastPaymentLinks.filter((product) => product.status !== "ARCHIVED").map((product) => ({
        paymentLinkId: product.id,
        stock: location.inventory?.[product.id] === null ? null : Math.max(0, Number(location.inventory?.[product.id]) || 0),
      })),
    }));
  }

  function renderStoreLocationsEditor() {
    if (!pendingStoreLocations.length) {
      storeLocationsListEl.innerHTML = '<p class="faint" style="margin:0">Todavía no agregaste ubicaciones. La tienda seguirá usando su inventario general.</p>';
      return;
    }
    const products = lastPaymentLinks.filter((product) => product.status !== "ARCHIVED");
    storeLocationsListEl.innerHTML = pendingStoreLocations.map((location, index) => `<article class="store-location-editor-card" data-location-id="${esc(location.id)}">
      <div class="store-location-editor-head"><strong>Ubicación ${index + 1}</strong><button class="ghost store-location-remove" type="button" data-location-id="${esc(location.id)}">Quitar</button></div>
      <div class="store-location-editor-grid">
        <div><label for="store-location-${esc(location.id)}-name">Nombre</label><input id="store-location-${esc(location.id)}-name" data-location-field="name" maxlength="80" value="${esc(location.name || "")}" placeholder="Sucursal Centro"></div>
        <div><label for="store-location-${esc(location.id)}-address">Dirección o referencia</label><input id="store-location-${esc(location.id)}-address" data-location-field="address" maxlength="240" value="${esc(location.address || "")}" placeholder="Av. Arce 1234, Sopocachi"></div>
        <div class="full"><label for="store-location-${esc(location.id)}-map">Mapa para insertar (opcional)</label><textarea id="store-location-${esc(location.id)}-map" data-location-field="mapEmbedUrl" rows="3" maxlength="2400" spellcheck="false" aria-describedby="locationMapHelp-${esc(location.id)} locationMapError-${esc(location.id)}" aria-errormessage="locationMapError-${esc(location.id)}" placeholder="Pega el código &lt;iframe&gt; de Google Maps o su URL de inserción">${esc(location.mapEmbedUrl || "")}</textarea><p class="faint" id="locationMapHelp-${esc(location.id)}" style="margin:7px 0 0">Google Maps: Compartir → Insertar un mapa → Copiar HTML. También aceptamos OpenStreetMap.</p><p class="field-validation-error" id="locationMapError-${esc(location.id)}" role="alert" hidden></p></div>
        <div class="full"><label for="store-location-${esc(location.id)}-highlight">Texto destacado (opcional)</label><input id="store-location-${esc(location.id)}-highlight" data-location-field="highlight" maxlength="140" value="${esc(location.highlight || "")}" placeholder="A media cuadra de la plaza principal"></div>
        <div class="full"><label for="store-location-${esc(location.id)}-description">Descripción (opcional)</label><textarea id="store-location-${esc(location.id)}-description" data-location-field="description" rows="3" maxlength="600" placeholder="Horarios, estacionamiento y acceso.">${esc(location.description || "")}</textarea></div>
        <div class="full store-location-capabilities">
          <span class="checkbox-row"><input id="store-location-${esc(location.id)}-pickup" type="checkbox" data-location-field="pickupEnabled" ${location.pickupEnabled ? "checked" : ""}><label for="store-location-${esc(location.id)}-pickup" style="margin:0">Permite retiro</label></span>
          <span class="checkbox-row"><input id="store-location-${esc(location.id)}-delivery" type="checkbox" data-location-field="deliveryEnabled" ${location.deliveryEnabled ? "checked" : ""}><label for="store-location-${esc(location.id)}-delivery" style="margin:0">Permite entrega desde aquí</label></span>
        </div>
        <div class="store-location-hours-editor"><h5>Horario de atención</h5>
          ${(location.openingHours || defaultStoreLocationHours()).map((hours) => `<div class="store-location-hours-row"><span>${STORE_LOCATION_DAYS[hours.day]}</span><input type="time" data-location-hours-day="${hours.day}" data-location-hours-field="open" value="${esc(hours.open)}" ${hours.closed ? "disabled" : ""} aria-label="Apertura ${STORE_LOCATION_DAYS[hours.day]}"><input type="time" data-location-hours-day="${hours.day}" data-location-hours-field="close" value="${esc(hours.close)}" ${hours.closed ? "disabled" : ""} aria-label="Cierre ${STORE_LOCATION_DAYS[hours.day]}"><label><input type="checkbox" data-location-hours-day="${hours.day}" data-location-hours-field="closed" ${hours.closed ? "checked" : ""}> Cerrado</label></div>`).join("")}
        </div>
        <div class="store-location-inventory"><h5>Stock en esta ubicación</h5><p class="faint">El cliente solo podrá elegirla si alcanza para todo su carrito.</p><div class="store-location-stock-list">
          ${products.length ? products.map((product) => {
            const stock = location.inventory?.[product.id];
            const unlimited = stock === null;
            return `<div class="store-location-stock-row"><strong>${esc(product.name)}</strong><input type="number" min="0" max="999999" step="1" data-location-stock="${esc(product.id)}" value="${unlimited ? "" : Number(stock) || 0}" ${unlimited ? "disabled" : ""} aria-label="Stock de ${esc(product.name)} en ${esc(location.name || `ubicación ${index + 1}`)}"><label><input type="checkbox" data-location-unlimited="${esc(product.id)}" ${unlimited ? "checked" : ""}> Sin límite</label></div>`;
          }).join("") : '<p class="faint" style="margin:0">Agrega productos para repartir su stock.</p>'}
        </div>
      </div>
    </article>`).join("");
  }

  storeLocationAddEl.addEventListener("click", () => {
    lastPaymentLinks.filter((product) => product.status !== "ARCHIVED").forEach((product) => websiteInventoryEditedIds.add(product.id));
    const id = `location-${Date.now().toString(36)}`;
    pendingStoreLocations.push({
      id,
      name: `Ubicación ${pendingStoreLocations.length + 1}`,
      address: "",
      mapEmbedUrl: "",
      highlight: "",
      description: "",
      pickupEnabled: true,
      deliveryEnabled: false,
      openingHours: defaultStoreLocationHours(),
      inventory: Object.fromEntries(lastPaymentLinks.filter((product) => product.status !== "ARCHIVED").map((product) => [product.id, pendingStoreLocations.length === 0 ? product.stock : 0])),
    });
    renderStoreLocationsEditor();
    setStoreSettingsDirty(true);
    scheduleStorePreview(0);
  });

  storeLocationsListEl.addEventListener("click", (event) => {
    const button = event.target.closest(".store-location-remove");
    if (!button) return;
    deleteInlineLocation({ locationId: button.dataset.locationId });
  });

  storeLocationsListEl.addEventListener("input", (event) => {
    const card = event.target.closest("[data-location-id]");
    const location = pendingStoreLocations.find((entry) => entry.id === card?.dataset.locationId);
    if (!location) return;
    const target = event.target;
    if (target.dataset.locationField) {
      location[target.dataset.locationField] = target.type === "checkbox" ? target.checked : target.value;
      if (target.dataset.locationField === "mapEmbedUrl") {
        target.removeAttribute("aria-invalid");
        const mapError = card.querySelector(".field-validation-error");
        mapError.hidden = true;
        mapError.textContent = "";
      }
    }
    if (target.dataset.locationHoursDay) {
      const hours = location.openingHours.find((entry) => entry.day === Number(target.dataset.locationHoursDay));
      if (hours) {
        const field = target.dataset.locationHoursField;
        hours[field] = field === "closed" ? target.checked : target.value;
        if (field === "closed") renderStoreLocationsEditor();
      }
    }
    if (target.dataset.locationStock) { websiteInventoryEditedIds.add(target.dataset.locationStock); location.inventory[target.dataset.locationStock] = Math.max(0, Number(target.value) || 0); }
    setStoreSettingsDirty(true);
    scheduleStorePreview(STORE_PREVIEW_INPUT_DEBOUNCE_MS);
  });

  storeLocationsListEl.addEventListener("change", (event) => {
    const card = event.target.closest("[data-location-id]");
    const location = pendingStoreLocations.find((entry) => entry.id === card?.dataset.locationId);
    if (!location || !event.target.dataset.locationUnlimited) return;
    const productId = event.target.dataset.locationUnlimited;
    websiteInventoryEditedIds.add(productId);
    location.inventory[productId] = event.target.checked ? null : 0;
    renderStoreLocationsEditor();
    setStoreSettingsDirty(true);
    scheduleStorePreview(0);
  });

  function syncVisualCheckoutMode() {
    const mode = selectedVisualCheckoutMode();
    const whatsapp = mode === "whatsapp";
    const external = mode === "external";
    visualWhatsappPhoneWrapEl.hidden = !whatsapp;
    visualWhatsappPhoneEl.required = whatsapp;
    visualLeadUrlWrapEl.hidden = !external;
    visualLeadUrlEl.required = false;
  }

  function syncStoreCheckoutMode({ updateLabel = false } = {}) {
    const mode = selectedStoreCheckoutMode();
    const whatsapp = mode === "whatsapp";
    storeWhatsappPhoneWrapEl.hidden = !whatsapp;
    storeContactPhoneInputEl.required = whatsapp;
    storeLeadUrlWrapEl.hidden = mode !== "external";
    storeLeadUrlEl.required = false;
    storePaymentRequirementEl.textContent = mode === "payment"
      ? currentInvoicingProfile?.cuis
        ? "Pagos integrados activos. Tu NIT y CUIS ya están configurados."
        : "Al guardar, abriremos Cumplimiento para pedir KYC y NIT antes de aceptar pagos."
      : mode === "whatsapp"
        ? "No se crea un cobro ni se solicita NIT. El pedido llegará al número indicado justo arriba."
        : "No se crea un cobro ni se solicita NIT. pagosYa enviará por correo los datos y el carrito del interesado.";
    if (updateLabel && ["Ir a pagar", "Continuar al pago", "Enviar pedido por WhatsApp", "Continuar al enlace", "Enviar mis datos"].includes(storeCartButtonLabelEl.value.trim())) {
      storeCartButtonLabelEl.value = mode === "payment" ? "Continuar al pago" : mode === "whatsapp" ? "Enviar pedido por WhatsApp" : "Enviar mis datos";
    }
  }

  function renderVisualAiFiles() {
    visualAiPreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    visualAiPreviewUrls = visualAiFiles.map((file) => URL.createObjectURL(file));
    visualAiPreviewsEl.innerHTML = visualAiFiles.map((file, index) => {
      const upload = visualAiUploads.get(visualAiFileKey(file));
      const status = upload?.status || "uploading";
      const statusLabel = status === "ready" ? "Adjuntada" : status === "error" ? "Error al subir" : "Subiendo…";
      return `<span class="visual-ai-preview is-${status}">
      <span class="visual-ai-preview-media"><img src="${esc(visualAiPreviewUrls[index])}" alt="${esc(file.name)}"></span>
      <button type="button" data-remove-visual-ai-image="${index}" aria-label="Quitar ${esc(file.name)}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
      </button>
      <span class="visual-ai-preview-state">${statusLabel}</span>
    </span>`;
    }).join("");
  }

  function visualAiFileKey(file) {
    return `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
  }

  function prepareAiImageAdditions(existingFiles, selectedFiles) {
    const invalidFiles = selectedFiles.filter((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES);
    const knownKeys = new Set(existingFiles.map(visualAiFileKey));
    const validNewFiles = selectedFiles.filter((file) => {
      if (invalidFiles.includes(file)) return false;
      const key = visualAiFileKey(file);
      if (knownKeys.has(key)) return false;
      knownKeys.add(key);
      return true;
    });
    const availableSlots = Math.max(0, MAX_AI_IMAGES - existingFiles.length);
    return { selectedFiles, invalidFiles, validNewFiles, availableSlots, filesToAdd: validNewFiles.slice(0, availableSlots) };
  }

  function updateVisualAiFileStatus(message = "") {
    const states = visualAiFiles.map((file) => visualAiUploads.get(visualAiFileKey(file))?.status || "uploading");
    const readyCount = states.filter((status) => status === "ready").length;
    const uploadingCount = states.filter((status) => status === "uploading").length;
    const errorCount = states.filter((status) => status === "error").length;
    visualSourceStatusEl.textContent = message || (errorCount
      ? `${errorCount} ${errorCount === 1 ? "foto no pudo subirse" : "fotos no pudieron subirse"}. Al enviar, Yapi volverá a intentarlo.`
      : uploadingCount
        ? `Subiendo ${uploadingCount} ${uploadingCount === 1 ? "foto" : "fotos"}…`
        : readyCount
          ? `${readyCount} ${readyCount === 1 ? "foto adjuntada" : "fotos adjuntadas"}. Yapi recibirá tanto la imagen como tu instrucción.`
          : "La IA también redactará textos de muestra. Revísalos antes de aprobar.");
  }

  function startVisualAiUpload(file, { retry = false } = {}) {
    const key = visualAiFileKey(file);
    const current = visualAiUploads.get(key);
    if (current && !retry) return current.promise;
    const upload = { status: "uploading", url: "", error: "", promise: null };
    visualAiUploads.set(key, upload);
    renderVisualAiFiles();
    updateVisualAiFileStatus();
    upload.promise = uploadFile(file).then((url) => {
      upload.status = "ready";
      upload.url = url;
      renderVisualAiFiles();
      updateVisualAiFileStatus();
      return url;
    }).catch((error) => {
      upload.status = "error";
      upload.error = error?.message || "No pudimos subir esta foto.";
      renderVisualAiFiles();
      updateVisualAiFileStatus();
      return null;
    });
    return upload.promise;
  }

  function addVisualAiFiles(selectedFiles) {
    const selection = prepareAiImageAdditions(visualAiFiles, selectedFiles);
    visualAiFiles.push(...selection.filesToAdd);
    selection.filesToAdd.forEach((file) => startVisualAiUpload(file));
    renderVisualAiFiles();
    if (selection.invalidFiles.length) {
      updateVisualAiFileStatus(`No agregamos “${selection.invalidFiles[0].name}”: usa PNG, JPG o WEBP de máximo 8 MB. Tus fotos anteriores siguen adjuntadas.`);
    } else if (selection.validNewFiles.length > selection.availableSlots) {
      updateVisualAiFileStatus(`Agregamos ${selection.filesToAdd.length} fotos. Puedes usar hasta 24; las demás no se añadieron.`);
    } else if (!selection.filesToAdd.length && selection.selectedFiles.length) {
      updateVisualAiFileStatus(selection.availableSlots === 0 ? "Ya tienes el máximo de 24 fotos. Quita una para agregar otra." : "Esas fotos ya estaban seleccionadas.");
    } else {
      updateVisualAiFileStatus();
    }
  }

  async function uploadedVisualAiAssetUrls() {
    const urls = await Promise.all(visualAiFiles.map((file) => {
      const upload = visualAiUploads.get(visualAiFileKey(file));
      return !upload || upload.status === "error" ? startVisualAiUpload(file, { retry: true }) : upload.promise;
    }));
    if (urls.some((url) => !url)) throw new Error("No pudimos adjuntar una de las fotos. Revisa tu conexión y vuelve a enviar.");
    return urls;
  }

  document.querySelectorAll('input[name="visualCheckoutMode"]').forEach((radio) => radio.addEventListener("change", syncVisualCheckoutMode));
  storeCheckoutModeEls.forEach((radio) => radio.addEventListener("change", () => {
    syncStoreCheckoutMode({ updateLabel: true });
    setStoreSettingsDirty(true);
    scheduleStorePreview();
  }));
  storeCartRecommendationsEl.addEventListener("change", renderStoreRecommendationChoices);
  visualAiChooseEl.addEventListener("click", () => visualAiImagesEl.click());
  visualAiImagesEl.addEventListener("change", () => {
    addVisualAiFiles([...visualAiImagesEl.files]);
    // Clear only the native picker. The selected draft and upload state live
    // separately, so choosing another batch adds to it instead of replacing it.
    visualAiImagesEl.value = "";
  });
  let visualAiDragDepth = 0;
  storeAgentComposerEl.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    visualAiDragDepth++;
    storeAgentComposerEl.classList.add("is-dragging");
  });
  storeAgentComposerEl.addEventListener("dragover", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  });
  storeAgentComposerEl.addEventListener("dragleave", () => {
    visualAiDragDepth = Math.max(0, visualAiDragDepth - 1);
    if (!visualAiDragDepth) storeAgentComposerEl.classList.remove("is-dragging");
  });
  storeAgentComposerEl.addEventListener("drop", (event) => {
    event.preventDefault();
    visualAiDragDepth = 0;
    storeAgentComposerEl.classList.remove("is-dragging");
    addVisualAiFiles([...(event.dataTransfer?.files || [])]);
  });
  storeAgentComposerEl.addEventListener("paste", (event) => {
    const images = [...(event.clipboardData?.files || [])].filter((file) => file.type.startsWith("image/"));
    if (!images.length) return;
    event.preventDefault();
    addVisualAiFiles(images);
  });
  visualAiPreviewsEl.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-visual-ai-image]");
    if (!removeButton) return;
    const index = Number(removeButton.dataset.removeVisualAiImage);
    if (!Number.isInteger(index) || index < 0 || index >= visualAiFiles.length) return;
    const [removed] = visualAiFiles.splice(index, 1);
    if (removed) visualAiUploads.delete(visualAiFileKey(removed));
    renderVisualAiFiles();
    updateVisualAiFileStatus();
  });
  syncVisualCheckoutMode();
  syncStoreCheckoutMode();

  function proposalImageUrl(proposal) {
    const config = proposal.config || {};
    const documentImage = config.siteDocument?.sections
      ?.flatMap((section) => section.mediaUrls || [])
      .find((url) => !isVideoUploadUrl(url));
    return documentImage || config.bannerUrl || config.editorialGallery?.[0]?.imageUrl || config.heroSlides?.find((slide) => !isVideoUploadUrl(slide.imageUrl))?.imageUrl || proposal.sourceAssetUrls?.find((url) => !isVideoUploadUrl(url)) || "";
  }

  function renderVisualTemplates() {
    visualTemplateWrapEl.hidden = visualTemplates.length === 0;
    const selected = visualTemplateEl.value;
    visualTemplateEl.innerHTML = `<option value="">Sin receta · crear una dirección nueva</option>${visualTemplates.map((template) => `<option value="${esc(template.id)}">${esc(template.name)}</option>`).join("")}`;
    if (visualTemplates.some((template) => template.id === selected)) visualTemplateEl.value = selected;
  }

  function catalogImagePosition(imageUrl) {
    if (!imageUrl) return "50% 50%";
    const imageKey = normalizedAssetKey(imageUrl);
    for (const product of lastPaymentLinks) {
      const index = (product.imageUrls || []).findIndex((productImageUrl) => normalizedAssetKey(productImageUrl) === imageKey);
      if (index >= 0) return product.imagePositions?.[index] || "50% 50%";
    }
    return "50% 50%";
  }

  function normalizedAssetKey(imageUrl) {
    const value = String(imageUrl || "").trim();
    if (!value) return "";
    try {
      const parsed = new URL(value, apiRoot() + "/");
      return decodeURIComponent(parsed.pathname).replace(/^\/v1(?=\/uploads\/)/, "");
    } catch {
      return value.split(/[?#]/, 1)[0].replace(/^\/v1(?=\/uploads\/)/, "");
    }
  }

  async function applyVisualProposal(proposal, button) {
    if (!proposal || !button) return;
    if (storeSettingsDirty || storeSaveInFlight) { errorEl.textContent = "Guarda tus cambios antes de usar una propuesta. Si parte de una versión anterior, vuelve a pedir el cambio a Yapi."; return; }
    const renderedStoreId = visualStudioStoreId;
    const idleLabel = button.textContent;
    const applyFingerprint = storeEditorDraft.getState().fingerprint;
    setButtonBusy(button, true, "Aplicando…");
    try {
      const appliedStore = await api(`/stores/${renderedStoreId}/visual-proposals/${proposal.id}/apply`, { method: "POST", body: JSON.stringify({ revision: websiteRevision }) });
      if (renderedStoreId !== currentStoreId) return;
      if (applyFingerprint !== storeEditorDraft.getState().fingerprint) {
        errorEl.textContent = "La propuesta se guardó en privado. Tus cambios locales posteriores siguen aquí; recarga para revisar el borrador antes de guardar.";
        return;
      }
      websiteRevision = appliedStore.websiteRevision;
      websiteHasDraft = true;
      // Applying is an explicit replacement boundary. Mark the replacement
      // snapshot clean before refresh so draft protection cannot restore the
      // merchant's pre-confirmation canvas over the approved proposal.
      const appliedSnapshot = storeEditorStateModule.replaceStoreCreativeCanvas(currentStorePreviewPatch(), appliedStore || proposal.config || {});
      storeEditorDraft.hydrate(currentStoreId, appliedSnapshot);
      syncStoreDraftUi();
      activeVisualProposalId = null;
      syncStoreDraftUi();
      await refresh();
      refreshStorePreview(true);
      infoEl.textContent = `“${proposal.title}” quedó guardada como borrador privado. Revísala y pulsa Publicar cuando esté lista.`;
    } catch (err) {
      errorEl.textContent = "No se pudo aplicar la propuesta: " + err.message;
    } finally {
      if (button.isConnected) setButtonBusy(button, false, idleLabel);
    }
  }

  async function saveVisualProposalTemplate(proposal, button) {
    if (!proposal || !button) return;
    const name = window.prompt("Nombre de esta receta visual", proposal.title);
    if (!name?.trim()) return;
    const renderedStoreId = visualStudioStoreId;
    const idleLabel = button.textContent;
    setButtonBusy(button, true, "Guardando…");
    try {
      const template = await api(`/stores/${renderedStoreId}/visual-proposals/${proposal.id}/template`, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      });
      if (renderedStoreId !== currentStoreId) return;
      visualTemplates = [template, ...visualTemplates.filter((entry) => entry.id !== template.id)];
      renderVisualTemplates();
      visualTemplateEl.value = template.id;
      visualSourceStatusEl.textContent = `Guardamos “${template.name}” como receta. Conserva composición y pesos, sin copiar productos, fotos ni textos.`;
      visualProposalStatusEl.textContent = visualSourceStatusEl.textContent;
    } catch (err) {
      errorEl.textContent = "No se pudo guardar la receta: " + err.message;
    } finally {
      if (button.isConnected) setButtonBusy(button, false, idleLabel);
    }
  }

  function renderVisualStudio() {
    const renderedStoreId = visualStudioStoreId;
    const visible = visualProposals.filter((proposal) => proposal.status !== "DISMISSED").slice(0, 3);
    if (activeVisualProposalId && !visible.some((proposal) => proposal.id === activeVisualProposalId)) {
      activeVisualProposalId = null;
      syncStoreDraftUi();
    }
    if (visible.length) {
      setVisualStep(3);
      const appliedProposalId = visible
        .filter((proposal) => proposal.status === "APPLIED")
        .sort((first, second) => new Date(second.appliedAt || 0) - new Date(first.appliedAt || 0))[0]?.id;
      visualProposalsEl.innerHTML = visible.map((proposal) => {
        const config = proposal.config || {};
        const siteDocument = config.siteDocument && typeof config.siteDocument === "object" ? config.siteDocument : null;
        const imageUrl = proposalImageUrl(proposal);
        const applied = proposal.id === appliedProposalId;
        const conversionLabel = config.checkoutMode === "whatsapp" ? "Pedidos por WhatsApp" : config.checkoutMode === "external" ? "Interesados a enlace" : "Pago integrado";
        const layoutLabels = { cinematic: "Portada cinematográfica", editorial: "Relato editorial", collage: "Composición collage", "catalog-first": "Catálogo primero" };
        const proposalBackground = config.backgroundColor || "#f8fafc";
        const experienceLabels = { "editorial-grid": "Galería editorial", "story-scroller": "Relato interactivo" };
        const motionLabels = {
          "story-scroll": "Story Scroll", "hero-carousel": "Slider principal",
          "image-stream": "Image Stream", "scroll-expansion": "Scroll Expansion", "hero-gallery-scroll": "Hero Gallery",
          "stagger-testimonials": "Reseñas escalonadas",
          "portfolio-scroller": "Menú de momentos", "circle-reveal": "Revelado circular", "clarity-marquee": "Preguntas en movimiento",
          "layered-text": "Texto en capas", "text-rotate": "Texto rotativo", "text-glitch": "Texto con interferencia",
          "text-reveal-block": "Revelado tipográfico", "text-along-path": "Texto en recorrido",
          "full-screen-chapters": "Capítulos completos", "magnetic-target": "Llamado magnético",
          "frame-sequence": "Secuencia de cuadros", "video-background": "Video de fondo",
          "draggable-cards": "Tarjetas arrastrables", "perspective-carousel": "Carrusel con perspectiva",
          "link-preview": "Vista previa de enlace", "video-pin-reveal": "Video revelado",
          "gallery-accordion": "Galería acordeón", "split-scroll": "Relato dividido",
          "sticky-gallery": "Galería fija", "sticky-story": "Historia fija", "text-parallax": "Texto en paralaje",
        };
        const motionExperiences = Array.isArray(config.motionExperiences) && config.motionExperiences.length
          ? config.motionExperiences.filter((experience) => motionLabels[experience])
          : [motionLabels[config.motionExperience] ? config.motionExperience : "clarity-marquee"];
        const sectionCount = Array.isArray(siteDocument?.sections) ? siteDocument.sections.length : 0;
        const pageCount = Array.isArray(siteDocument?.pages) ? siteDocument.pages.length : 0;
        const artDirection = SITE_ART_DIRECTION_PRESETS[siteDocument?.artDirection];
        const productLabels = { gallery: "Catálogo visual", editorial: "Catálogo editorial", compact: "Catálogo compacto", showcase: "Productos protagonistas" };
        const generatedAnimationLabels = Array.isArray(config.animations)
          ? config.animations.map((animation) => motionLabels[animation?.type]).filter(Boolean)
          : [];
        const featureLabels = siteDocument
          ? [artDirection?.label, "Sitio completo", pageCount ? `${pageCount + 1} páginas` : "Una página", `${sectionCount} secciones propias`, ...generatedAnimationLabels, productLabels[siteDocument.theme?.productLayout] || "Catálogo integrado", siteDocument.navigation?.layout === "centered" ? "Navegación centrada" : siteDocument.navigation?.layout === "split" ? "Navegación dividida" : "Marca al frente", conversionLabel, pendingStoreLinks.length ? "Redes integradas" : null].filter(Boolean)
          : [layoutLabels[config.layoutStyle] || "Composición clásica", experienceLabels[config.experienceStyle] || "Galería editorial", ...(config.motionDuoEnabled ? motionExperiences.map((experience) => motionLabels[experience]) : []), "Fondo sólido", conversionLabel, config.announcementMode === "marquee" ? "Cinta animada" : "Anuncio fijo", config.heroSlides?.length ? `${config.heroSlides.length} banners` : "Portada tipográfica", config.editorialGallery?.length ? "Historias y animación" : "Catálogo", pendingStoreLinks.length ? "Botones sociales" : null].filter(Boolean);
        return `<article class="visual-proposal" data-id="${esc(proposal.id)}">
          <div class="visual-proposal-cover" style="--proposal-bg:${esc(proposalBackground)};--proposal-accent:${esc(config.accentColor || "#4f46e5")}">${imageUrl ? `<img src="${esc(dashboardAssetUrl(imageUrl))}" alt="Portada de ${esc(proposal.title)}" style="object-position:${esc(catalogImagePosition(imageUrl))}">` : `<span>${esc(config.tagline || proposal.title)}</span>`}</div>
          <div class="visual-proposal-copy">
            <strong>${esc(proposal.title)}${applied ? " · En uso" : ""}</strong>
            <p>${esc(proposal.rationale)}</p>
            <div class="visual-proposal-meta">
              <span class="visual-swatch" style="background:${esc(proposalBackground)}" title="Fondo"></span>
              <span class="visual-swatch" style="background:${esc(config.accentColor || "#4f46e5")}" title="Acento"></span>
              <span>${esc(STORE_FONT_STYLE_LABELS[normalizeStoreFontStyle(config.fontStyle)])} · ${proposal.provider?.startsWith("openai:") ? "sitio compuesto con IA" : "composición local"}</span>
              ${featureLabels.map((label) => `<span class="visual-proposal-feature">${esc(label)}</span>`).join("")}
            </div>
          </div>
          <div class="visual-proposal-actions">
            <button type="button" class="ghost visual-preview-proposal" aria-label="Mostrar ${esc(proposal.title)} en Tu tienda" aria-pressed="false">Ver aquí</button>
            <button type="button" class="primary visual-apply-proposal" aria-label="${applied ? "Usar en borrador" : "Usar en borrador"}: ${esc(proposal.title)}">${applied ? "Usar en borrador" : "Usar en borrador"}</button>
            <button type="button" class="ghost visual-save-template" aria-label="Guardar la receta de ${esc(proposal.title)} como plantilla">Guardar receta</button>
          </div>
        </article>`;
      }).join("");
      visualProposalsEl.querySelectorAll(".visual-proposal").forEach((row) => {
        const proposal = visible.find((item) => item.id === row.dataset.id);
        row.querySelector(".visual-preview-proposal").addEventListener("click", () => {
          if (renderedStoreId !== currentStoreId) return;
          previewVisualProposal(proposal);
        });
        row.querySelector(".visual-apply-proposal").addEventListener("click", async (event) => {
          await applyVisualProposal(proposal, event.currentTarget);
        });
        row.querySelector(".visual-save-template").addEventListener("click", async (event) => {
          await saveVisualProposalTemplate(proposal, event.currentTarget);
        });
      });
      syncVisualProposalSelection();
    } else {
      visualProposalsEl.innerHTML = "";
      setVisualStep(1);
    }

    visualHistoryEl.hidden = true;
    visualHistoryListEl.innerHTML = visualVersions.map((version) => `<div class="visual-version" data-id="${esc(version.id)}"><span>${esc(version.label)} · ${esc(new Date(version.createdAt).toLocaleString())}</span><button type="button" class="ghost">Restaurar</button></div>`).join("");
    visualHistoryListEl.querySelectorAll(".visual-version").forEach((row) => row.querySelector("button").addEventListener("click", async () => {
      if (renderedStoreId !== currentStoreId) return;
      if (storeSettingsDirty && !confirm("Tienes cambios sin guardar. ¿Restaurar esta apariencia y descartarlos?")) return;
      if (!confirm("¿Restaurar esta apariencia? La apariencia actual también quedará guardada para poder volver.")) return;
      const button = row.querySelector("button");
      setButtonBusy(button, true, "Restaurando…");
      try {
        await api(`/stores/${renderedStoreId}/visual-versions/${row.dataset.id}/restore`, { method: "POST", body: JSON.stringify({ revision: websiteRevision }) });
        if (renderedStoreId !== currentStoreId) return;
        await refresh();
        infoEl.textContent = "Versión recuperada como borrador privado. Revísala antes de publicar.";
      } catch (err) {
        errorEl.textContent = "No se pudo restaurar la versión: " + err.message;
      } finally {
        setButtonBusy(button, false, "Restaurar");
      }
    }));
    renderStoreAgentTimeline();
  }

  async function loadVisualStudioState(storeId = currentStoreId) {
    if (visualStudioStoreId !== storeId) {
      activeVisualProposalId = null;
      syncStoreDraftUi();
    }
    visualStudioStoreId = storeId;
    visualProposals = [];
    visualVersions = [];
    visualTemplates = [];
    renderVisualTemplates();
    visualProposalsEl.innerHTML = "";
    visualHistoryListEl.innerHTML = "";
    visualHistoryEl.hidden = true;
    visualProposalStatusEl.textContent = storeId ? "Cargando las propuestas de esta tienda…" : "";
    visualSourceStatusEl.textContent = storeId
      ? "Cargando el contenido y los borradores de esta tienda…"
      : "Selecciona una tienda para comenzar.";
    setVisualStep(1);
    loadStoreAgentConversation(storeId);
    if (!storeId) {
      renderVisualStudio();
      return;
    }
    try {
      const state = await api(`/stores/${storeId}/visual-studio`);
      if (storeId !== currentStoreId) return;
      visualProposals = state.proposals || [];
      visualVersions = state.versions || [];
      visualTemplates = state.templates || [];
      renderVisualTemplates();
      lockedAiSectionIds = new Set(Array.isArray(state.lockedSectionIds) ? state.lockedSectionIds : [...lockedAiSectionIds]);
      saveAiSectionLocks();
      visualProposalStatusEl.textContent = "";
      visualSourceStatusEl.textContent = "Puedes cambiar títulos, textos, botones, colores, orden, redes y tono visual. Catálogo, precios y checkout quedan protegidos.";
      renderVisualStudio();
    } catch (err) {
      if (storeId !== currentStoreId) return;
      visualProposalStatusEl.textContent = "No pudimos cargar las propuestas anteriores: " + err.message;
      visualSourceStatusEl.textContent = "No pudimos cargar los borradores de esta tienda. Puedes volver a intentarlo cambiando de tienda y regresando.";
    }
  }

  function scheduleStorePreview(delay = 60) {
    clearTimeout(previewPostTimer);
    previewPostTimer = setTimeout(postStorePreview, delay);
    scheduleStorePaletteExtraction();
  }

  function storePreviewTextEntry(target) {
    if (target instanceof HTMLTextAreaElement) return true;
    if (!(target instanceof HTMLInputElement)) return false;
    return ["text", "search", "email", "url", "tel"].includes(target.type);
  }

  function editableStorePreviewUrl() {
    const storeUrl = currentStoreUrl();
    if (!storeUrl) return "";
    try {
      const url = new URL(storeUrl);
      url.searchParams.set("preview", "1");
      url.searchParams.set("editor", "1");
      // The dashboard deliberately sends Referrer-Policy: no-referrer, so the
      // embedded checkout cannot discover its parent from document.referrer.
      // Pass the authenticated postMessage recipient explicitly in the URL
      // fragment (which is never sent to the checkout server).
      const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
      fragment.set("parent_origin", window.location.origin);
      url.hash = fragment.toString();
      return url.toString();
    } catch {
      return storeUrl + (storeUrl.includes("?") ? "&" : "?") + "preview=1&editor=1";
    }
  }

  function setStorePreviewState(state, message = "") {
    storePreviewStageEl.classList.remove("is-empty", "is-loading", "is-ready", "is-error");
    storePreviewStageEl.classList.add(`is-${state}`);
    storePreviewStageEl.setAttribute("aria-busy", String(state === "loading"));
    if (state === "loading") {
      storePreviewStatusTitleEl.textContent = "Preparando vista previa";
      storePreviewStatusMessageEl.textContent = "Conectando con Checkout de pagosYa…";
    } else if (state === "error") {
      storePreviewStatusTitleEl.textContent = "Checkout no está disponible aquí";
      storePreviewStatusMessageEl.textContent = message || `No encontramos Checkout de pagosYa en ${checkoutOriginEl.value}. Revisa “Página de pago” o inicia la app de checkout y vuelve a intentar.`;
    }
  }

  function waitForStorePreviewHandshake() {
    clearTimeout(previewReadyTimer);
    previewReadyTimer = setTimeout(() => setStorePreviewState("error"), 4500);
  }

  function refreshStorePreview(force = false) {
    hidePreviewExternalLinkNotice();
    const activeProposal = activeVisualProposalId
      ? visualProposals.find((proposal) => proposal.id === activeVisualProposalId)
      : null;
    const previewUrl = activeProposal ? visualProposalPreviewUrl(activeProposal) : editableStorePreviewUrl();
    const currentStore = lastStores.find((store) => store.id === currentStoreId);
    previewOpenEl.href = currentStore ? publicStoreUrl(currentStore) : "#";
    if (!previewUrl) {
      clearTimeout(previewReadyTimer);
      setStorePreviewState("empty");
      storePreviewFrameEl.removeAttribute("src");
      return;
    }
    let previewUrlMatches = storePreviewFrameEl.src === previewUrl;
    try {
      const currentUrl = new URL(storePreviewFrameEl.src);
      const intendedUrl = new URL(previewUrl);
      currentUrl.searchParams.delete("preview_refresh");
      intendedUrl.searchParams.delete("preview_refresh");
      previewUrlMatches = currentUrl.toString() === intendedUrl.toString();
    } catch {
      // The normal equality check above remains the safe fallback.
    }
    if (force || !previewUrlMatches) {
      setStorePreviewState("loading");
      // Assigning the exact same iframe URL is not a reliable reload across
      // browsers. Operational edits such as creating a category or product
      // must fetch fresh public-store data rather than keep the iframe's old
      // in-memory catalog, so force a distinct, harmless preview URL.
      if (force) {
        try {
          const forcedUrl = new URL(previewUrl);
          forcedUrl.searchParams.set("preview_refresh", String(++previewReloadVersion));
          storePreviewFrameEl.src = forcedUrl.toString();
        } catch {
          storePreviewFrameEl.src = `${previewUrl}${previewUrl.includes("?") ? "&" : "?"}preview_refresh=${++previewReloadVersion}`;
        }
      } else {
        storePreviewFrameEl.src = previewUrl;
      }
      waitForStorePreviewHandshake();
    } else if (!activeVisualProposalId) {
      scheduleStorePreview();
    }
  }

  const STORE_PREVIEW_EDITOR_CONTROLS = {
    storeName: "#storeNameInput",
    storeTagline: "#storeTaglineInput",
    storeLogo: "#storeLogoInput",
    storeBanner: "#storeBannerInput",
    storeBackground: "#storeBackgroundColor",
    storeAccent: "#storeAccentColor",
    announcementText: "#storeAnnouncementInput",
    announcementMotion: "#storeAnnouncementMode",
    catalogTitle: "#storeCatalogTitle",
    catalogSubtitle: "#storeCatalogSubtitle",
    aboutTitle: "#storeAboutTitle",
    aboutSubtitle: "#storeAboutSubtitle",
    aboutBody: "#storeAboutInput",
    aboutImage: "#storeAboutImageInput",
    galleryTitle: "#storeGalleryTitle",
    gallerySubtitle: "#storeGallerySubtitle",
    contact: "#storeContactFormEnabled",
    contactTitle: "#storeContactTitle",
    contactSubtitle: "#storeContactSubtitle",
    location: "#storeLocationAdd",
    locationTitle: "#storeLocationTitle",
    locationSubtitle: "#storeLocationSubtitle",
    promotionTitle: "#storePromotionTitle",
    promotionBody: "#storePromotionBody",
    promotionImage: "#storePromotionImageInput",
    promotionAction: "#storePromotionCtaLabel",
    cartButton: "#storeCartButtonLabel",
    linksTitle: "#storeLinksTitle",
    storeNameInput: "#storeNameInput",
    storeBannerInput: "#storeBannerInput",
    storeCatalogTitle: "#storeCatalogTitle",
    storeAboutTitle: "#storeAboutTitle",
    storeGalleryTitle: "#storeGalleryTitle",
    storeContactFormEnabled: "#storeContactFormEnabled",
  };

  const PREVIEW_SECTION_LABELS = {
    brand: "Identidad",
    navigation: "Navegación",
    announcement: "Marquesina",
    hero: "Portada",
    products: "Catálogo",
    about: "Historia",
    gallery: "Galería",
    motion: "Animación",
    contact: "Contacto",
    links: "Redes sociales",
    location: "Ubicación",
    footer: "Pie de página",
    promotion: "Promoción",
  };

  function previewEditorTarget(selection) {
    const section = String(selection?.section || "");
    const field = String(selection?.field || "");
    const siteSection = section.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === section)
      : null;
    if ((section === "motion" || section.startsWith("animation-")) && selection?.animationId) {
      ensureAnimationEditorCategory(String(selection.animationId));
      const card = storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${CSS.escape(String(selection.animationId))}"]`);
      if (!card) return null;
      const mediaRow = Number.isInteger(selection?.itemIndex)
        ? card.querySelector(`.animation-media-row[data-media-index="${selection.itemIndex}"]`)
        : null;
      if (field === "animationTitle") return card.querySelector('[data-animation-field="title"]');
      if (field === "animationSubtitle") return card.querySelector('[data-animation-field="subtitle"]');
      if (["name", "type", "subtitle", "productId", "buttonLabel", "buttonPositionX", "buttonPositionY", "textPositionX", "textPositionY", "textScale", "textWidthPercent", "textAlign", "textSize", "textWidth", "textColor", "backgroundColor"].includes(field)) return card.querySelector(`[data-animation-field="${field}"]`);
      if (["title", "caption", "body"].includes(field)) return mediaRow?.querySelector(`[data-animation-media-field="${field}"]`) || card.querySelector(`[data-animation-media-field="${field}"]`);
      if (field === "media") return mediaRow || card.querySelector(".animation-source, .animation-media-row");
      return card;
    }
    if (section === "hero" && Number.isInteger(selection?.itemIndex)) {
      const row = storeHeroSlidesListEl.querySelector(`.hero-slide-editor-row[data-index="${selection.itemIndex}"]`);
      if (field === "title") return row?.querySelector(".slide-title") || null;
      if (field === "body") return row?.querySelector(".slide-body") || null;
      if (field === "ctaLabel") return row?.querySelector(".slide-cta-label") || null;
      return row?.querySelector(".replace-slide-media") || row || null;
    }
    if ((section === "gallery" || siteSection?.kind === "gallery") && Number.isInteger(selection?.itemIndex)) {
      const row = storeEditorialGalleryListEl.querySelector(`.editorial-gallery-row[data-index="${selection.itemIndex}"]`);
      if (field === "editorialTitle") return row?.querySelector(".editorial-title") || null;
      if (field === "editorialCaption") return row?.querySelector(".editorial-caption") || null;
      if (field === "editorialBody") return row?.querySelector(".editorial-body") || null;
      return row?.querySelector(".editorial-card-preview") || row || null;
    }
    if (section === "links") {
      const index = Number.isInteger(selection?.itemIndex) ? selection.itemIndex : 0;
      const row = storeLinksEditorEl.querySelector(`.store-link-editor-row[data-index="${index}"]`);
      if (field === "linkUrl") return row?.querySelector(".link-url") || null;
      if (field === "linkLabel") return row?.querySelector(".link-label") || null;
    }
    if (field === "animations") return storeAnimationTypePickerEl;
    if (field === "links") return storeLinksEditorEl.querySelector(".store-link-editor-row .link-label") || document.getElementById("storeLinkAdd");
    const controlSelector = STORE_PREVIEW_EDITOR_CONTROLS[field];
    return controlSelector ? document.querySelector(controlSelector) : null;
  }

  function prepareInlinePreviewSelection(selection) {
    const section = String(selection?.section || "brand").slice(0, 64);
    const field = String(selection?.field || "section").slice(0, 64);
    const normalized = {
      section,
      field,
      label: String(selection?.label || "Parte seleccionada").slice(0, 120),
      ...(selection?.itemId ? { itemId: String(selection.itemId).slice(0, 200) } : {}),
      ...(Number.isInteger(selection?.itemIndex) ? { itemIndex: Math.max(0, selection.itemIndex) } : {}),
      ...(selection?.animationId ? { animationId: String(selection.animationId).slice(0, 64) } : {}),
    };
    activePreviewSelection = normalized;
    syncAgentSelectionChip();
    if (normalized.animationId) ensureAnimationEditorCategory(normalized.animationId);
    setDashboardView("appearance");
    setStorePreviewExpanded(true);
    setPreviewSectionCurrent(section);
    return normalized;
  }

  function scheduleStorePreviewInPlace() {
    pendingStorePreviewSection = null;
    pendingStorePreviewAction = null;
    pendingStorePreviewTargetIndex = null;
    pendingStorePreviewTargetKind = null;
    pendingStorePreviewProduct = null;
    scheduleStorePreview(0);
  }

  function applyInlinePreviewText(selection, value) {
    const normalized = prepareInlinePreviewSelection(selection);
    if (normalized.section === "navigation" && normalized.field === "navigationLabel" && Number.isInteger(normalized.itemIndex)) {
      if (commitStoreDocumentCommand({ type: "set-inline-text", selection: normalized, value }, "editar el enlace superior")) {
        setStoreSettingsDirty(true);
        postStorePreviewEditorText(normalized, value);
        scheduleStorePreviewInPlace();
        renderPreviewContextEditor(normalized);
        previewSelectionStatusEl.innerHTML = `<strong>Enlace superior actualizado.</strong> El nuevo nombre está listo para guardar.`;
      }
      return;
    }
    if (normalized.section === "footer") {
      if (commitStoreDocumentCommand({ type: "set-inline-text", selection: normalized, value }, "editar el pie de página")) {
        setStoreSettingsDirty(true);
        postStorePreviewEditorText(normalized, value);
        scheduleStorePreviewInPlace();
        renderPreviewContextEditor(normalized);
        previewSelectionStatusEl.innerHTML = `<strong>Pie de página actualizado.</strong> Revisa el resultado y guarda cuando esté listo.`;
      }
      return;
    }
    const siteSection = normalized.section.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === normalized.section)
      : null;
    const siteBlock = siteSection && normalized.itemId ? findSiteSectionBlock(siteSection, normalized.itemId) : null;
    if (siteBlock && normalized.field === "siteBlockText" && ["heading", "text", "action"].includes(siteBlock.kind)) {
      if (!commitStoreDocumentCommand({ type: "set-inline-text", selection: normalized, value }, `editar ${normalized.label}`)) return;
      syncPreviewSectionTabLabels();
      setStoreSettingsDirty(true);
      postStorePreviewEditorText(normalized, value);
      clearTimeout(previewPostTimer);
      renderPreviewContextEditor(normalized);
      previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizado.</strong> El bloque mantiene su posición y ranura.`;
      return;
    }
    // Older generated documents expose their projected heading/body/action as
    // canvas blocks even when they do not yet contain a canonical `blocks`
    // array. Commit those targets back to the matching section field. Falling
    // through used to resolve an unknown `siteBlockText` field to storeName,
    // which changed the header brand and made the AI heading appear to reset.
    const projectedSiteField = normalized.field === "siteBlockText"
      ? { heading: "siteTitle", body: "siteBody", action: "siteCtaLabel" }[normalized.itemId]
      : null;
    if (siteSection && !siteBlock && projectedSiteField) {
      const projectedSelection = { ...normalized, field: projectedSiteField };
      if (!commitStoreDocumentCommand({ type: "set-inline-text", selection: projectedSelection, value }, `editar ${normalized.label}`)) return;
      if (projectedSiteField === "siteTitle") syncPreviewSectionTabLabels();
      setStoreSettingsDirty(true);
      postStorePreviewEditorText(normalized, value);
      clearTimeout(previewPostTimer);
      renderPreviewContextEditor(normalized);
      previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizado.</strong> El texto ya pertenece a esta sección.`;
      return;
    }
    if (siteSection && ["siteTitle", "siteBody", "siteCtaLabel", "siteItemTitle", "siteItemBody"].includes(normalized.field)) {
      if (commitStoreDocumentCommand({ type: "set-inline-text", selection: normalized, value }, `editar ${normalized.label}`)) {
        if (normalized.field === "siteTitle") syncPreviewSectionTabLabels();
        setStoreSettingsDirty(true);
        postStorePreviewEditorText(normalized, value);
        clearTimeout(previewPostTimer);
        renderPreviewContextEditor(normalized);
        previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizado.</strong> Revisa el cambio y guárdalo cuando esté listo.`;
        return;
      }
    }
    if (normalized.field === "textBlock" && normalized.itemId) {
      const resolved = animationTextTarget(normalized);
      if (resolved?.block) {
        if (!commitAnimationCommand({ type: "set-inline-text", selection: normalized, value }, `editar ${normalized.label}`)) return;
        renderAnimationsEditor();
        setStoreSettingsDirty(true);
        postStorePreviewEditorText(normalized, value);
        clearTimeout(previewPostTimer);
        previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizado.</strong> Sigue editando directamente en la vista previa.`;
        return;
      }
    }
    const source = previewEditorTarget(normalized);
    if (!(source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement) || source.type === "file") {
      previewSelectionStatusEl.textContent = "Este texto todavía necesita el panel de edición.";
      renderPreviewContextEditor(normalized);
      return;
    }
    const limit = source.maxLength > 0 ? source.maxLength : 2_000;
    const previous = { value: source.value, checked: false };
    const nextValue = String(value ?? "").slice(0, limit);
    if (source.id && nextValue !== source.value) pushStoreEditorUndo(`editar ${normalized.label}`, () => restoreStoreEditorControl(source.id, previous));
    source.value = nextValue;
    source.dispatchEvent(new Event("input", { bubbles: true }));
    source.dispatchEvent(new Event("change", { bubbles: true }));
    postStorePreviewEditorText(normalized, nextValue);
    if (normalized.animationId) clearTimeout(previewPostTimer);
    else scheduleStorePreviewInPlace();
    renderPreviewContextEditor(normalized);
    previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizado.</strong> Revisa el cambio y guárdalo cuando esté listo.`;
  }

  function dispatchInlinePreviewFile(input, file) {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function applyInlinePreviewImage(selection, file) {
    const normalized = prepareInlinePreviewSelection(selection);
    const animationMedia = normalized.section.startsWith("animation-") && ["media", "mediaAdd"].includes(normalized.field);
    const allowedTypes = animationMedia
      ? ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"]
      : ["image/png", "image/jpeg", "image/webp"];
    const maxBytes = file?.type?.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (!file || !allowedTypes.includes(file.type) || file.size > maxBytes) {
      previewSelectionStatusEl.textContent = file?.size > maxBytes
        ? file?.type?.startsWith("video/") ? "El video supera el máximo de 20 MB." : "La imagen supera el máximo de 8 MB."
        : animationMedia ? "Usa PNG, JPEG, WEBP, GIF, MP4 o WebM." : "Usa una imagen PNG, JPEG o WEBP.";
      renderPreviewContextEditor(normalized);
      return;
    }
    previewSelectionStatusEl.textContent = `Subiendo ${file.name}…`;
    const section = normalized.section;
    const field = normalized.field;
    const siteSection = section.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === section)
      : null;
    try {
      if (section === "products" && field === "categoryBanner" && normalized.itemId) {
        const category = lastCategories.find((entry) => entry.id === normalized.itemId);
        if (!category) throw new Error("No encontramos esa sección de productos.");
        const bannerUrl = await uploadFile(file);
        const updated = await api(`/stores/${currentStoreId}/categories/${encodeURIComponent(category.id)}`, {
          method: "PATCH",
          body: JSON.stringify({ bannerUrl }),
        });
        openCategoryEditorIds.add(category.id);
        renderCategoryRows(lastCategories.map((entry) => entry.id === updated.id ? updated : entry));
        refreshStorePreview(true);
      } else if (siteSection && field === "siteBlockMedia" && normalized.itemId) {
        const block = findSiteSectionBlock(siteSection, normalized.itemId);
        if (!block || block.kind !== "media") throw new Error("No encontramos ese bloque de imagen.");
        const imageUrl = await uploadFile(file);
        block.mediaUrl = imageUrl;
        const mediaIndex = siteSectionMediaBlocks(siteSection).indexOf(block);
        if (mediaIndex >= 0) siteSection.mediaUrls[mediaIndex] = imageUrl;
        const chapterMatch = /^chapter-(\d+)-media$/.exec(block.id);
        if (chapterMatch && siteSection.items?.[Number(chapterMatch[1]) - 1]) siteSection.items[Number(chapterMatch[1]) - 1].mediaUrl = imageUrl;
        setStoreSettingsDirty(true);
        scheduleStorePreview(0);
      } else if (siteSection && field === "siteMedia" && Number.isInteger(normalized.itemIndex) && siteSection.items?.[normalized.itemIndex]) {
        const imageUrl = await uploadFile(file);
        siteSection.items[normalized.itemIndex].mediaUrl = imageUrl;
        siteSection.mediaUrls[normalized.itemIndex] = imageUrl;
        setStoreSettingsDirty(true);
        scheduleStorePreview(0);
      } else if ((section === "gallery" || siteSection?.kind === "gallery") && field === "editorialMedia" && Number.isInteger(normalized.itemIndex) && pendingEditorialGallery[normalized.itemIndex]) {
        pendingEditorialGallery[normalized.itemIndex].imageUrl = await uploadFile(file);
        rememberEditorialGalleryDraft(pendingEditorialGallery[normalized.itemIndex]);
        renderEditorialGalleryEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview(0);
      } else if (section.startsWith("animation-") && ["media", "mediaAdd"].includes(field) && Number.isInteger(normalized.itemIndex)) {
        const animationId = normalized.animationId || section.slice("animation-".length);
        const animation = pendingAnimations.find((entry) => entry.id === animationId);
        const adding = field === "mediaAdd" && normalized.itemIndex === animation?.media.length;
        if (!animation || (!adding && !animation.media[normalized.itemIndex])) throw new Error("No encontramos ese medio en la animación.");
        const imageUrl = await uploadFile(file);
        const command = adding
          ? { type: "add-media", animationId, media: animationMediaDraft(imageUrl), maxMedia: animationMediaRequirement(animation.type).max }
          : { type: "replace-media", animationId, mediaIndex: normalized.itemIndex, media: animationMediaDraft(imageUrl) };
        if (!commitAnimationCommand(command, `${adding ? "agregar" : "cambiar"} medio ${normalized.itemIndex + 1}`)) return;
        renderAnimationsEditor();
        commitAnimationStructureChange();
      } else {
        const source = previewEditorTarget(normalized);
        const input = source instanceof HTMLInputElement && source.type === "file"
          ? source
          : source?.closest(".hero-slide-editor-row")?.querySelector(".slide-media-input");
        if (!(input instanceof HTMLInputElement)) throw new Error("Esta imagen todavía necesita el panel de edición.");
        dispatchInlinePreviewFile(input, file);
        previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} seleccionada.</strong> La imagen se está subiendo.`;
        renderPreviewContextEditor(normalized);
        return;
      }
      renderPreviewContextEditor(normalized);
      previewSelectionStatusEl.innerHTML = `<strong>${esc(normalized.label)} actualizada.</strong> Revisa el cambio y guárdalo cuando esté listo.`;
    } catch (error) {
      previewSelectionStatusEl.textContent = `No pudimos cambiar la imagen: ${error.message}`;
      renderPreviewContextEditor(normalized);
    }
  }

  function previewContextAssetUrl(value) {
    return dashboardAssetUrl(value);
  }

  function wirePreviewContextAnimationMediaReorder(animation, selection) {
    const slots = [...previewContextEditorEl.querySelectorAll(".preview-context-slot[data-animation-media-index]")];
    if (slots.length <= 1) return;
    const clearState = () => slots.forEach((slot) => slot.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
    const commitMove = (fromIndex, toIndex) => {
      if (fromIndex === toIndex) return;
      const animationId = animation.id;
      if (!commitAnimationCommand({ type: "reorder-media", animationId, fromIndex, toIndex }, `reordenar la imagen ${fromIndex + 1}`)) return;
      renderAnimationsEditor();
      commitAnimationStructureChange();
      const nextSelection = {
        ...selection,
        section: `animation-${animation.id}`,
        field: "media",
        label: `imagen ${toIndex + 1} de la animación`,
        animationId: animation.id,
        itemIndex: toIndex,
      };
      renderPreviewContextEditor(nextSelection);
      previewSelectionStatusEl.innerHTML = `<strong>Imagen movida a la posición ${toIndex + 1}.</strong> El nuevo orden está listo para guardar.`;
      window.requestAnimationFrame(() => previewContextEditorEl.querySelector(`.preview-context-slot[data-animation-media-index="${toIndex}"]`)?.focus());
    };

    slots.forEach((slot, index) => {
      slot.addEventListener("keydown", (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const targetIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? slots.length - 1
            : Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), slots.length - 1));
        commitMove(index, targetIndex);
      });
      slot.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const startX = event.clientX;
        const startY = event.clientY;
        let targetIndex = index;
        let placeAfter = false;
        let moved = false;
        const nearestSlot = (clientX, clientY) => {
          const direct = document.elementFromPoint(clientX, clientY)?.closest?.(".preview-context-slot[data-animation-media-index]");
          if (direct && slots.includes(direct)) return direct;
          return slots.reduce((nearest, candidate) => {
            const bounds = candidate.getBoundingClientRect();
            const distance = (clientX - (bounds.left + bounds.width / 2)) ** 2 + (clientY - (bounds.top + bounds.height / 2)) ** 2;
            return !nearest || distance < nearest.distance ? { candidate, distance } : nearest;
          }, null)?.candidate || slot;
        };
        const onMove = (moveEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          if (!moved && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 5) return;
          moved = true;
          moveEvent.preventDefault();
          const candidate = nearestSlot(moveEvent.clientX, moveEvent.clientY);
          targetIndex = slots.indexOf(candidate);
          const bounds = candidate.getBoundingClientRect();
          placeAfter = moveEvent.clientX >= bounds.left + bounds.width / 2;
          clearState();
          slot.classList.add("is-dragging");
          if (targetIndex !== index) candidate.classList.add(placeAfter ? "is-drop-after" : "is-drop-before");
        };
        const finish = (finishEvent) => {
          if (finishEvent.pointerId !== event.pointerId) return;
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", finish, true);
          window.removeEventListener("pointercancel", cancel, true);
          clearState();
          if (!moved) return;
          finishEvent.preventDefault();
          slot.dataset.reorderSuppressClick = "true";
          commitMove(index, sortableDestination(index, targetIndex, placeAfter, slots.length));
        };
        const cancel = (cancelEvent) => {
          if (cancelEvent.pointerId !== event.pointerId) return;
          window.removeEventListener("pointermove", onMove, true);
          window.removeEventListener("pointerup", finish, true);
          window.removeEventListener("pointercancel", cancel, true);
          clearState();
        };
        window.addEventListener("pointermove", onMove, { capture: true, passive: false });
        window.addEventListener("pointerup", finish, true);
        window.addEventListener("pointercancel", cancel, true);
      });
    });
  }

  function renderPreviewContextEditor(selection = activePreviewSelection, { focus = false } = {}) {
    activePreviewSelection = selection;
    syncAgentSelectionChip();
    storeStudioEl.classList.toggle("has-site-selection", Boolean(selection));
    const bindings = [];
    const actions = [];
    let productSortState = null;
    let controlIndex = 0;
    const fieldMarkup = (getter, label, helper = "", { rerender = false, beforeChange = null } = {}) => {
      const source = getter();
      if (!(source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement || source instanceof HTMLSelectElement)) return "";
      const id = `previewContextControl${controlIndex++}`;
      bindings.push({ id, getter, rerender, beforeChange });
      let control = "";
      if (source instanceof HTMLSelectElement) {
        control = `<select id="${id}">${[...source.options].map((option) => `<option value="${esc(option.value)}" ${option.value === source.value ? "selected" : ""}>${esc(option.textContent)}</option>`).join("")}</select>`;
      } else if (source.type === "checkbox") {
        control = `<label class="checkbox-row"><input id="${id}" type="checkbox" ${source.checked ? "checked" : ""}><span>${esc(label)}</span></label>`;
        label = "";
      } else if (source.type === "color") {
        control = `<span class="preview-context-color-input"><input id="${id}" type="color" value="${esc(source.value)}"><output for="${id}">${esc(source.value)}</output></span>`;
      } else if (source instanceof HTMLTextAreaElement) {
        control = `<textarea id="${id}" rows="${Math.max(2, source.rows || 2)}" ${source.maxLength > 0 ? `maxlength="${source.maxLength}"` : ""}>${esc(source.value)}</textarea>`;
      } else {
        const safeType = ["email", "tel", "url", "number", "range"].includes(source.type) ? source.type : "text";
        const rangeAttributes = safeType === "range" ? `min="${esc(source.min)}" max="${esc(source.max)}" step="${esc(source.step || "1")}"` : "";
        control = `<input id="${id}" type="${safeType}" value="${esc(source.value)}" ${rangeAttributes} ${source.maxLength > 0 ? `maxlength="${source.maxLength}"` : ""} ${source.placeholder ? `placeholder="${esc(source.placeholder)}"` : ""}>`;
      }
      return `<div class="preview-context-field">${label ? `<label for="${id}">${esc(label)}</label>` : ""}${control}${helper ? `<small>${esc(helper)}</small>` : ""}</div>`;
    };
    const actionMarkup = (label, handler, { primary = false, danger = false } = {}) => {
      const id = `previewContextAction${controlIndex++}`;
      actions.push({ id, handler });
      return `<button type="button" class="${primary ? "primary" : "ghost"}${danger ? " danger" : ""}" id="${id}">${esc(label)}</button>`;
    };
    const uploadMarkup = (label, accept, handler, { multiple = false } = {}) => {
      const id = `previewContextUpload${controlIndex++}`;
      const buttonId = `${id}Button`;
      actions.push({ id: buttonId, handler: () => document.getElementById(id)?.click() });
      actions.push({ id, event: "change", handler: (event) => {
        const files = [...(event.target.files || [])];
        return handler(multiple ? files : files[0], event.target);
      }});
      return `<span class="preview-context-upload"><input id="${id}" type="file" accept="${accept}" ${multiple ? "multiple" : ""}><button type="button" class="ghost" id="${buttonId}">${esc(label)}</button></span>`;
    };
    const siteDraftFieldMarkup = (target, key, label, { type = "text", maxLength = 0, options = [], helper = "", beforeInput = null, onInput = null } = {}) => {
      if (!target || !(key in target)) return "";
      const id = `previewContextSite${controlIndex++}`;
      let capturedUndo = false;
      actions.push({ id, event: "input", handler: (event) => {
        if (!capturedUndo) {
          beforeInput?.(target[key]);
          capturedUndo = true;
        }
        target[key] = event.target.value;
        onInput?.(target[key]);
        if (type === "color") event.target.nextElementSibling && (event.target.nextElementSibling.textContent = event.target.value);
        setStoreSettingsDirty(true);
        scheduleStorePreview();
        syncPreviewSectionInspector();
      }});
      const control = type === "select"
        ? `<select id="${id}">${options.map(([value, copy]) => `<option value="${esc(value)}" ${target[key] === value ? "selected" : ""}>${esc(copy)}</option>`).join("")}</select>`
        : type === "textarea"
          ? `<textarea id="${id}" rows="4" ${maxLength ? `maxlength="${maxLength}"` : ""}>${esc(target[key])}</textarea>`
          : type === "color"
            ? `<span class="preview-context-color-input"><input id="${id}" type="color" value="${esc(target[key])}"><output for="${id}">${esc(target[key])}</output></span>`
            : `<input id="${id}" type="text" value="${esc(target[key])}" ${maxLength ? `maxlength="${maxLength}"` : ""}>`;
      return `<div class="preview-context-field"><label for="${id}">${esc(label)}</label>${control}${helper ? `<small>${esc(helper)}</small>` : ""}</div>`;
    };
    const siteTextStyleMarkup = (styleSelection, label = "Tamaño del título superior") => {
      const resolved = siteCanvasTextStyleTarget(styleSelection);
      if (!resolved) return "";
      const currentStyle = resolved.owner?.[resolved.styleKey] || {};
      const scale = Math.min(200, Math.max(50, Math.round(Number(currentStyle.textScale) || 100)));
      const fontStyle = normalizeStoreFontStyle(currentStyle.fontStyle || storeFontStyleEl.value);
      const textColor = /^#[0-9a-f]{6}$/i.test(currentStyle.textColor || "")
        ? currentStyle.textColor
        : pendingSiteDocument?.theme?.textColor || "#171717";
      const scaleId = `previewContextTextScale${controlIndex++}`;
      const fontId = `previewContextTextFont${controlIndex++}`;
      const colorId = `previewContextTextColor${controlIndex++}`;
      const capturedUndo = new Set();
      const captureStyleUndo = (key, copy) => {
        if (capturedUndo.has(key)) return;
        const previousDocument = pendingSiteDocument ? structuredClone(pendingSiteDocument) : null;
        pushStoreEditorUndo(copy, () => {
          pendingSiteDocument = previousDocument ? structuredClone(previousDocument) : null;
          pendingSiteSections = pendingSiteDocument?.sections || [];
        });
        capturedUndo.add(key);
      };
      const updateStyle = (key, value, status) => {
        const currentTarget = siteCanvasTextStyleTarget(styleSelection);
        if (!currentTarget) return;
        currentTarget.owner[currentTarget.styleKey] = { ...(currentTarget.owner[currentTarget.styleKey] || {}), [key]: value };
        setStoreSettingsDirty(true);
        pendingStorePreviewSection = "brand";
        pendingStorePreviewAction = "scroll";
        scheduleStorePreview(0);
        previewSelectionStatusEl.innerHTML = `<strong>${esc(status)}</strong> El cambio está listo para guardar.`;
      };
      actions.push({ id: scaleId, event: "input", handler: (event) => {
        const nextScale = Math.min(200, Math.max(50, Math.round(Number(event.target.value) || 100)));
        captureStyleUndo("textScale", "cambiar el tamaño del título superior");
        event.target.setAttribute("aria-valuetext", `${nextScale}%`);
        event.target.closest(".animation-range-control")?.querySelector("output")?.replaceChildren(`${nextScale}%`);
        updateStyle("textScale", nextScale, `Título superior a ${nextScale}%.`);
      }});
      actions.push({ id: fontId, event: "change", handler: (event) => {
        const nextFont = normalizeStoreFontStyle(event.target.value);
        captureStyleUndo("fontStyle", "cambiar la tipografía del título superior");
        updateStyle("fontStyle", nextFont, `Tipografía ${STORE_FONT_STYLE_LABELS[nextFont].toLowerCase()} aplicada.`);
      }});
      actions.push({ id: colorId, event: "input", handler: (event) => {
        const nextColor = /^#[0-9a-f]{6}$/i.test(event.target.value) ? event.target.value : textColor;
        captureStyleUndo("textColor", "cambiar el color del título superior");
        event.target.closest(".preview-context-color-input")?.querySelector("output")?.replaceChildren(nextColor.toUpperCase());
        updateStyle("textColor", nextColor, `Color ${nextColor.toUpperCase()} aplicado.`);
      }});
      const fontOptions = STORE_FONT_STYLES.map((value) => `<option value="${value}" ${value === fontStyle ? "selected" : ""}>${esc(STORE_FONT_STYLE_LABELS[value])}</option>`).join("");
      return `<div class="preview-context-field animation-range-control"><label for="${scaleId}">${esc(label)}</label><output for="${scaleId}">${scale}%</output><input id="${scaleId}" data-store-heading-scale type="range" min="50" max="200" step="5" value="${scale}" aria-valuetext="${scale}%"><small>Ajusta el nombre que aparece en el encabezado del sitio web.</small></div><div class="preview-context-grid"><div class="preview-context-field"><label for="${fontId}">Tipografía del heading</label><select id="${fontId}">${fontOptions}</select></div><div class="preview-context-field"><label for="${colorId}">Color del heading</label><span class="preview-context-color-input"><input id="${colorId}" type="color" value="${esc(textColor)}"><output for="${colorId}">${esc(textColor.toUpperCase())}</output></span></div></div>`;
    };

    if (!selection) {
      previewContextEditorEl.className = "preview-context-editor is-idle";
      previewContextEditorEl.innerHTML = `<p class="preview-context-copy"><strong>Edita directamente en tu tienda.</strong> Usa el agarre de seis puntos para mover el texto y haz clic para escribir. El ancho y el tamaño quedan aquí, sin llenar el lienzo de controles. Usa Ctrl+C y Ctrl+V para repetirlo; Ctrl+Z deshace.</p>`;
      return;
    }

    const section = String(selection.section || "brand");
    const field = String(selection.field || "section");
    const label = String(selection.label || PREVIEW_SECTION_LABELS[section] || "Parte seleccionada").slice(0, 120);
    const animationId = selection.animationId || (section.startsWith("animation-") ? section.slice("animation-".length) : null);
    const animationIndex = animationId ? pendingAnimations.findIndex((entry) => entry.id === animationId) : -1;
    const animation = animationIndex >= 0 ? pendingAnimations[animationIndex] : null;
    if (animation && animation.id === pendingAnimationMediaSetupId && animation.media.length >= animationMediaRequirement(animation.type).min) {
      pendingAnimationMediaSetupId = null;
    }
    if (animation) ensureAnimationEditorCategory(animation.id);
    const selectedSiteSection = section.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === section)
      : null;
    const selectedAnimationMediaIndex = animation && Number.isInteger(selection.itemIndex) && selection.itemIndex >= 0 && selection.itemIndex < animation.media.length
      ? selection.itemIndex
      : null;
    let content = `<p class="preview-context-copy"><strong>${esc(label)}</strong></p>`;

    if (section === "navigation") {
      ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
      const navigationItems = pendingSiteDocument?.navigation?.items || [];
      const pages = pendingSiteDocument?.pages || [];
      const navigation = pendingSiteDocument.navigation;
      const stickyId = `previewContextNavigationSticky${controlIndex++}`;
      const transparentId = `previewContextNavigationTransparent${controlIndex++}`;
      actions.push({ id: stickyId, event: "change", handler: (event) => { navigation.sticky = event.target.checked; setStoreSettingsDirty(true); scheduleStorePreview(0); }});
      actions.push({ id: transparentId, event: "change", handler: (event) => { navigation.transparent = event.target.checked; setStoreSettingsDirty(true); scheduleStorePreview(0); }});
      content = `<p class="preview-context-copy"><strong>Encabezado y páginas</strong><br>Elige la forma de la barra y decide en qué lado vive cada pieza. El orden que ves será el mismo que recorrerá el cliente.</p>`;
      content += `<section class="preview-context-site-scene"><strong>Marca del encabezado</strong>${siteTextStyleMarkup({ section: "brand", field: "storeName", label: "nombre de la tienda" })}</section>`;
      content += `<section class="preview-context-site-scene"><strong>Barra superior completa</strong><p class="preview-context-copy">El encabezado siempre ocupa todo el ancho y queda unido al borde superior.</p><div class="preview-context-grid">${siteDraftFieldMarkup(navigation, "logoTreatment", "Tratamiento del logo", { type: "select", options: [["mark", "Símbolo"], ["wordmark", "Nombre y logo"], ["oversized", "Logo protagonista"], ["seal", "Sello"]] })}</div><div class="preview-context-grid"><label class="checkbox-row"><input id="${stickyId}" type="checkbox" ${navigation.sticky !== false ? "checked" : ""}><span>Fijar encabezado al desplazarse</span></label><label class="checkbox-row"><input id="${transparentId}" type="checkbox" ${navigation.transparent === true ? "checked" : ""}><span>Fondo translúcido</span></label></div></section>`;
      content += `<section class="preview-context-site-scene"><strong>Posición de cada elemento</strong><p class="preview-context-copy">Puedes combinar libremente las tres zonas. En pantallas pequeñas el menú baja a una fila propia para conservar espacio.</p><div class="preview-context-grid">${siteDraftFieldMarkup(navigation, "brandPosition", "Logo y marca", { type: "select", options: [["left", "Izquierda"], ["center", "Centro"], ["right", "Derecha"]] })}${siteDraftFieldMarkup(navigation, "navPosition", "Menú", { type: "select", options: [["left", "Izquierda"], ["center", "Centro"], ["right", "Derecha"]] })}</div><div class="preview-context-grid">${siteDraftFieldMarkup(navigation, "searchPosition", "Búsqueda", { type: "select", options: [["left", "Izquierda"], ["right", "Derecha"]] })}${siteDraftFieldMarkup(navigation, "profilePosition", "Perfil", { type: "select", options: [["left", "Izquierda"], ["right", "Derecha"]] })}${siteDraftFieldMarkup(navigation, "cartPosition", "Carrito", { type: "select", options: [["left", "Izquierda"], ["right", "Derecha"]] })}</div></section>`;
      content += `<section class="preview-context-site-scene"><strong>Páginas</strong><p class="preview-context-copy">Cada página muestra solo las secciones que le asignes. Inicio permanece como la página principal.</p>`;
      pages.forEach((page, pageIndex) => {
        content += `<div class="preview-context-site-scene"><strong>Página ${pageIndex + 1}</strong><div class="preview-context-grid">${siteDraftFieldMarkup(page, "label", "Nombre", { maxLength: 40 })}${siteDraftFieldMarkup(page, "slug", "URL", { maxLength: 48, helper: `?page=${page.slug || "pagina"}`, onInput: (value) => { page.slug = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); } })}</div><div class="preview-context-actions">${actionMarkup("Quitar página", () => {
          const previousDocument = structuredClone(pendingSiteDocument);
          const previousContentOrder = [...pendingContentOrder];
          const previousBackgrounds = structuredClone(pendingSectionBackgrounds);
          const previousLocks = new Set(lockedAiSectionIds);
          const previousAnimations = structuredClone(pendingAnimations);
          const previousActivePageId = activePreviewPageId;
          const ownedSectionIds = new Set(pendingSiteSections.filter((candidate) => candidate.pageId === page.id).map((candidate) => candidate.id));
          const ownedAnimationIds = new Set(pendingAnimations.filter((candidate) => candidate.pageId === page.id).map((candidate) => candidate.id));
          pushStoreEditorUndo("quitar la página y su contenido", () => {
            pendingSiteDocument = structuredClone(previousDocument);
            pendingSiteSections = pendingSiteDocument.sections || [];
            pendingContentOrder = [...previousContentOrder];
            pendingSectionBackgrounds = structuredClone(previousBackgrounds);
            lockedAiSectionIds = new Set(previousLocks);
            pendingAnimations = structuredClone(previousAnimations);
            activePreviewPageId = previousActivePageId;
            previewAddSectionEl.innerHTML = previewSectionInsertionOptions(Boolean(activePreviewPageId));
            renderPreviewSectionTabs();
            renderStoreContentOrderEditor();
            pendingStorePreviewSection = "navigation";
          });
          pendingSiteSections = pendingSiteSections.filter((candidate) => !ownedSectionIds.has(candidate.id));
          pendingSiteDocument.sections = pendingSiteSections;
          pendingSiteDocument.deletedSectionIds = [...new Set([...(pendingSiteDocument.deletedSectionIds || []), ...ownedSectionIds])].slice(0, 10);
          pendingSiteDocument.navigation.items = navigationItems.filter((item) => !(item.target === "page" && item.pageId === page.id) && !(item.target === "section" && ownedSectionIds.has(item.sectionId)));
          pendingAnimations = pendingAnimations.filter((candidate) => !ownedAnimationIds.has(candidate.id));
          pendingContentOrder = pendingContentOrder.filter((key) =>
            (!key.startsWith("site-") || !ownedSectionIds.has(key.slice("site-".length)))
            && (!key.startsWith("animation-") || !ownedAnimationIds.has(key.slice("animation-".length))),
          );
          ownedSectionIds.forEach((sectionId) => {
            delete pendingSectionBackgrounds[`site-${sectionId}`];
            lockedAiSectionIds.delete(sectionId);
          });
          ownedAnimationIds.forEach((animationId) => delete pendingSectionBackgrounds[`animation-${animationId}`]);
          pages.splice(pageIndex, 1);
          if (activePreviewPageId === page.id) {
            activePreviewPageId = null;
            previewAddSectionEl.innerHTML = previewSectionInsertionOptions(false);
          }
          renderPreviewSectionTabs();
          renderStoreContentOrderEditor();
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
          const removedContentCount = ownedSectionIds.size + ownedAnimationIds.size;
          previewSelectionStatusEl.innerHTML = `<strong>${esc(page.label)} eliminada.</strong> También quitamos ${removedContentCount} ${removedContentCount === 1 ? "bloque que pertenecía" : "bloques que pertenecían"} a esa página. Puedes deshacer antes de guardar.`;
        }, { danger: true })}</div></div>`;
      });
      if (pages.length < 6) content += `<div class="preview-context-actions">${actionMarkup("Crear página", () => {
        const usedIds = new Set(pages.map((page) => page.id));
        let number = pages.length + 1;
        while (usedIds.has(`page-${number}`)) number += 1;
        const page = { id: `page-${number}`, label: `Página ${number}`, slug: `pagina-${number}` };
        pages.push(page);
        navigationItems.push({ id: `nav-page-${number}`, label: page.label, target: "page", pageId: page.id });
        setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
      }, { primary: true })}</div>`;
      if (pages.length) {
        content += `<strong>Contenido por página</strong>`;
        pendingSiteSections.forEach((candidate, sectionIndex) => {
          const pageSelectId = `previewContextSectionPage${controlIndex++}`;
          actions.push({ id: pageSelectId, event: "change", handler: (event) => {
            if (event.target.value) candidate.pageId = event.target.value;
            else delete candidate.pageId;
            setStoreSettingsDirty(true); scheduleStorePreview(0);
          }});
          content += `<div class="preview-context-field"><label for="${pageSelectId}">${esc(candidate.title || SITE_SECTION_TAB_LABELS[candidate.kind] || `Sección ${sectionIndex + 1}`)}</label><select id="${pageSelectId}"><option value="" ${candidate.pageId ? "" : "selected"}>Inicio</option>${pages.map((page) => `<option value="${esc(page.id)}" ${candidate.pageId === page.id ? "selected" : ""}>${esc(page.label)}</option>`).join("")}</select></div>`;
        });
        pendingAnimations.forEach((animation) => {
          const pageSelectId = `previewContextAnimationPage${controlIndex++}`;
          actions.push({ id: pageSelectId, event: "change", handler: (event) => {
            if (event.target.value) animation.pageId = event.target.value;
            else delete animation.pageId;
            setStoreSettingsDirty(true); scheduleStorePreview(0);
          }});
          content += `<div class="preview-context-field"><label for="${pageSelectId}">${esc(animation.name || animationTypeCopy(animation.type)[0])} · animación</label><select id="${pageSelectId}"><option value="" ${animation.pageId ? "" : "selected"}>Inicio</option>${pages.map((page) => `<option value="${esc(page.id)}" ${animation.pageId === page.id ? "selected" : ""}>${esc(page.label)}</option>`).join("")}</select></div>`;
        });
      }
      content += `</section><strong>Enlaces visibles</strong>`;
      navigationItems.forEach((item, index) => {
        const targetId = `previewContextNavigationTarget${controlIndex++}`;
        actions.push({ id: targetId, event: "change", handler: (event) => {
          const value = event.target.value;
          if (value === "home" || value === "catalog") {
            item.target = value;
            delete item.sectionId;
            delete item.pageId;
          } else if (value.startsWith("page:")) {
            item.target = "page";
            item.pageId = value.slice("page:".length);
            delete item.sectionId;
          } else if (value.startsWith("section:")) {
            item.target = "section";
            item.sectionId = value.slice("section:".length);
            delete item.pageId;
          }
          setStoreSettingsDirty(true);
          scheduleStorePreview(0);
          renderPreviewContextEditor({ section: "navigation", field: "navigationLabel", label: item.label, itemIndex: index });
        }});
        const selectedTarget = item.target === "section" ? `section:${item.sectionId || ""}` : item.target === "page" ? `page:${item.pageId || ""}` : item.target;
        content += `<section class="preview-context-site-scene"><strong>Enlace ${index + 1}</strong>${siteDraftFieldMarkup(item, "label", "Texto visible", { maxLength: 40 })}<div class="preview-context-field"><label for="${targetId}">Destino</label><select id="${targetId}"><option value="home" ${selectedTarget === "home" ? "selected" : ""}>Inicio de la tienda</option><option value="catalog" ${selectedTarget === "catalog" ? "selected" : ""}>Catálogo</option>${pages.map((page) => `<option value="page:${esc(page.id)}" ${selectedTarget === `page:${page.id}` ? "selected" : ""}>Página: ${esc(page.label)}</option>`).join("")}${pendingSiteSections.filter((candidate) => !["hero", "catalog"].includes(candidate.kind)).map((candidate) => `<option value="section:${esc(candidate.id)}" ${selectedTarget === `section:${candidate.id}` ? "selected" : ""}>Sección: ${esc(candidate.title || SITE_SECTION_TAB_LABELS[candidate.kind] || "Sección")}</option>`).join("")}</select></div><div class="preview-context-actions">${actionMarkup("Mover antes", () => {
          if (index <= 0) return;
          [navigationItems[index - 1], navigationItems[index]] = [navigationItems[index], navigationItems[index - 1]];
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
        })}${actionMarkup("Mover después", () => {
          if (index >= navigationItems.length - 1) return;
          [navigationItems[index + 1], navigationItems[index]] = [navigationItems[index], navigationItems[index + 1]];
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
        })}${actionMarkup("Quitar", () => {
          navigationItems.splice(index, 1);
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
        }, { danger: true })}</div></section>`;
      });
      if (navigationItems.length < 8) content += `<div class="preview-context-actions">${actionMarkup("Agregar enlace", () => {
        const used = new Set(navigationItems.map((item) => item.id));
        let number = 1;
        while (used.has(`nav-${number}`)) number += 1;
        const candidate = pendingSiteSections.find((section) => !navigationItems.some((item) => item.sectionId === section.id));
        navigationItems.push(candidate
          ? { id: `nav-${number}`, label: boundedSiteSectionText(candidate.title || SITE_SECTION_TAB_LABELS[candidate.kind] || "Sección", 40), target: "section", sectionId: candidate.id }
          : { id: `nav-${number}`, label: "Nuevo enlace", target: "home" });
        setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "navigation", field: "section", label: "Navegación" });
      }, { primary: true })}</div>`;
    } else if (section === "footer") {
      ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
      const footer = pendingSiteDocument?.footer;
      if (!footer) return;
      const enabledId = `previewContextFooterEnabled${controlIndex++}`;
      actions.push({ id: enabledId, event: "change", handler: (event) => {
        footer.enabled = event.target.checked;
        setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
      }});
      content = `<p class="preview-context-copy"><strong>Pie de página</strong><br>Controla la presentación final, las columnas de información y el sello inferior.</p><div class="preview-context-field"><label class="checkbox-row"><input id="${enabledId}" type="checkbox" ${footer.enabled !== false ? "checked" : ""}><span>Mostrar pie de página</span></label></div>`;
      footer.newsletter ||= defaultSiteFooter(lastStores.find((store) => store.id === currentStoreId) || {}).newsletter;
      const newsletterEnabledId = `previewContextNewsletterEnabled${controlIndex++}`;
      actions.push({ id: newsletterEnabledId, event: "change", handler: (event) => {
        footer.newsletter.enabled = event.target.checked;
        setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
      }});
      content += `<section class="preview-context-site-scene"><strong>Boletín por correo</strong><label class="checkbox-row"><input id="${newsletterEnabledId}" type="checkbox" ${footer.newsletter.enabled !== false ? "checked" : ""}><span>Mostrar formulario de suscripción</span></label>${siteDraftFieldMarkup(footer.newsletter, "title", "Título", { maxLength: 80 })}${siteDraftFieldMarkup(footer.newsletter, "body", "Descripción", { type: "textarea", maxLength: 240 })}<div class="preview-context-grid">${siteDraftFieldMarkup(footer.newsletter, "buttonLabel", "Botón", { maxLength: 40 })}${siteDraftFieldMarkup(footer.newsletter, "successMessage", "Mensaje de éxito", { maxLength: 120 })}</div></section>`;
      content += siteDraftFieldMarkup(footer, "brandDescription", "Descripción de la marca", { type: "textarea", maxLength: 320 });
      content += `<div class="preview-context-grid">${siteDraftFieldMarkup(footer, "copyright", "Texto inferior", { maxLength: 160 })}${siteDraftFieldMarkup(footer, "badge", "Sello", { maxLength: 80 })}</div>`;
      (footer.columns || []).forEach((column, columnIndex) => {
        content += `<section class="preview-context-site-scene"><strong>Columna ${columnIndex + 1}</strong>${siteDraftFieldMarkup(column, "title", "Título de la columna", { maxLength: 60 })}`;
        (column.items || []).forEach((item, itemIndex) => {
          content += `<div class="preview-context-grid">${siteDraftFieldMarkup(item, "label", `Texto ${itemIndex + 1}`, { maxLength: 100 })}${siteDraftFieldMarkup(item, "href", "Enlace opcional", { maxLength: 500, helper: "Usa https://, mailto:, tel: o un ancla #." })}</div><div class="preview-context-actions">${actionMarkup(`Quitar texto ${itemIndex + 1}`, () => {
            column.items.splice(itemIndex, 1);
            setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
          }, { danger: true })}</div>`;
        });
        if (column.items.length < 8) content += `<div class="preview-context-actions">${actionMarkup("Agregar texto", () => {
          const used = new Set(column.items.map((item) => item.id));
          let number = 1;
          while (used.has(`item-${number}`)) number += 1;
          column.items.push({ id: `item-${number}`, label: "Nuevo texto", href: "" });
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
        })}${actionMarkup("Quitar columna", () => {
          footer.columns.splice(columnIndex, 1);
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
        }, { danger: true })}</div>`;
        content += `</section>`;
      });
      if (footer.columns.length < 4) content += `<div class="preview-context-actions">${actionMarkup("Agregar columna", () => {
        const used = new Set(footer.columns.map((column) => column.id));
        let number = 1;
        while (used.has(`column-${number}`)) number += 1;
        footer.columns.push({ id: `column-${number}`, title: "Nueva columna", items: [{ id: "item-1", label: "Nuevo texto", href: "" }] });
        setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section: "footer", field: "section", label: "Pie de página" });
      }, { primary: true })}</div>`;
    } else if (section === "announcement") {
      content += fieldMarkup(() => storeAnnouncementInputEl, "Texto de la marquesina", "Separa varias frases con •.");
      content += `<div class="preview-context-grid">${fieldMarkup(() => storeAnnouncementModeEl, "Movimiento", "Elige texto fijo o cinta en movimiento.", { rerender: true })}${fieldMarkup(() => storeAnnouncementColorEl, "Color de fondo")}</div>`;
      content += `<div class="preview-context-grid">${fieldMarkup(() => storeAnnouncementFontEl, "Tipografía")}${fieldMarkup(() => storeAnnouncementEffectEl, "Letras animadas", "Se pausa fuera de pantalla y respeta la preferencia de movimiento reducido.")}</div>`;
      if (storeAnnouncementModeEl.value === "marquee") {
        content += fieldMarkup(() => storeAnnouncementSpeedEl, "Duración de una vuelta", "Entre 8 y 40 segundos; un número menor se mueve más rápido.");
      }
    } else if (section === "hero" && Number.isInteger(selection.itemIndex) && pendingHeroSlides[selection.itemIndex]) {
      const index = selection.itemIndex;
      const row = () => storeHeroSlidesListEl.querySelector(`.hero-slide-editor-row[data-index="${index}"]`);
      content += `<div class="preview-context-grid">${fieldMarkup(() => row()?.querySelector(".slide-title"), "Título")}${fieldMarkup(() => row()?.querySelector(".slide-cta-label"), "Texto del botón")}</div>`;
      content += fieldMarkup(() => row()?.querySelector(".slide-body"), "Descripción");
      content += `<div class="preview-context-actions">${actionMarkup("Cambiar imagen o video", () => row()?.querySelector(".replace-slide-media")?.click(), { primary: field === "media" })}</div>`;
    } else if (selectedSiteSection && !(selectedSiteSection.kind === "gallery" && Number.isInteger(selection.itemIndex) && pendingEditorialGallery[selection.itemIndex])) {
      const sectionKindLabels = { hero: "Portada", story: "Historia", catalog: "Catálogo", gallery: "Galería", contact: "Contacto", location: "Ubicación", links: "Redes" };
      const layoutOptions = [["split", "Dividida"], ["full-bleed", "A pantalla completa"], ["centered", "Centrada"], ["offset", "Desplazada"], ["grid", "Cuadrícula"], ["stacked", "Apilada"], ["rail", "Carril horizontal"], ["minimal", "Mínima"]];
      const familyOptions = [["editorial", "Editorial"], ["cinematic", "Cinemática"], ["product-led", "Producto protagonista"], ["minimal", "Esencial"]];
      const motionOptions = [["none", "Sin animación"]];
      selectedSiteSection.family = resolvedSiteSectionFamily(selectedSiteSection);
      content = `<p class="preview-context-copy"><strong>${esc(sectionKindLabels[selectedSiteSection.kind] || "Sección de marca")}</strong> · ${esc(selectedSiteSection.title || "Sin título")}</p>`;
      const directionControlId = `previewContextDirection${controlIndex++}`;
      const activeDirection = SITE_ART_DIRECTION_PRESETS[pendingSiteDocument?.artDirection];
      actions.push({ id: directionControlId, event: "change", handler: (event) => {
        if (!applyPendingSiteArtDirection(event.target.value)) return;
        renderPreviewContextEditor(activePreviewSelection);
      }});
      let advancedContent = `<div class="preview-context-field preview-context-direction"><label for="${directionControlId}">Dirección base</label><select id="${directionControlId}">${Object.entries(SITE_ART_DIRECTION_PRESETS).map(([value, preset]) => `<option value="${esc(value)}" ${pendingSiteDocument?.artDirection === value ? "selected" : ""}>${esc(preset.label)}</option>`).join("")}</select><small>${esc(activeDirection?.character || "Coordina tipografía, navegación, catálogo y todas las secciones sin cambiar tu contenido ni tus colores.")}</small></div>`;
      if ((pendingSiteDocument?.pages || []).length) {
        selectedSiteSection.pageId ||= "";
        content += siteDraftFieldMarkup(selectedSiteSection, "pageId", "Página", { type: "select", options: [["", "Inicio"], ...pendingSiteDocument.pages.map((page) => [page.id, page.label])], helper: "La sección solo aparecerá dentro de esta página." });
      }
      const selectedSiteSectionIndex = pendingSiteSections.indexOf(selectedSiteSection);
      const pushSiteSectionUndo = (label) => {
        const snapshot = structuredClone(selectedSiteSection);
        pushStoreEditorUndo(label, () => {
          pendingSiteSections[selectedSiteSectionIndex] = structuredClone(snapshot);
          if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
          pendingStorePreviewSection = section;
          pendingStorePreviewAction = "scroll";
        });
      };
      if (selectedSiteSection.kind === "catalog") {
        const availableProducts = activeStoreCtaProducts();
        const selectedProductIds = new Set(selectedSiteSection.productIds || []);
        const productsById = new Map(availableProducts.map((product) => [product.id, product]));
        const selectedProducts = (selectedSiteSection.productIds || []).map((id) => productsById.get(id)).filter(Boolean);
        const selectedCategoryIds = new Set(selectedProducts.map((product) => product.categoryId).filter(Boolean));
        const selectedTags = new Set(selectedProducts.flatMap((product) => product.tags || []).map((tag) => String(tag).trim().toLocaleLowerCase()).filter(Boolean));
        const featuredProductIds = new Set(pendingSiteDocument?.merchandising?.featuredProductIds || []);
        const canSuggestProducts = selectedProducts.length > 0 || featuredProductIds.size > 0;
        const suggestedProducts = canSuggestProducts ? availableProducts
          .filter((product) => !selectedProductIds.has(product.id))
          .map((product) => {
            const tagMatches = (product.tags || []).filter((tag) => selectedTags.has(String(tag).trim().toLocaleLowerCase())).length;
            const score = (product.categoryId && selectedCategoryIds.has(product.categoryId) ? 8 : 0)
              + tagMatches * 4
              + (featuredProductIds.has(product.id) ? 5 : 0)
              + ((product.imageUrls || []).some(Boolean) ? 1 : 0)
              + Math.min(3, Math.floor(Number(product.soldCount || 0) / 5));
            return { product, score };
          })
          .sort((first, second) => second.score - first.score || String(first.product.name).localeCompare(String(second.product.name), "es"))
          .slice(0, 4)
          .map(({ product }) => product) : [];
        const toggleProduct = (product, selected, undoLabel) => {
          pushSiteSectionUndo(undoLabel);
          const nextIds = new Set(selectedSiteSection.productIds || []);
          if (selected) nextIds.delete(product.id);
          else if (nextIds.size < 200) nextIds.add(product.id);
          selectedSiteSection.productIds = [...nextIds];
          if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
          setStoreSettingsDirty(true);
          scheduleStorePreview(0);
          renderPreviewContextEditor(selection);
        };
        const productButtonMarkup = (product, { selected = false, suggestion = false } = {}) => {
          const productButtonId = `previewContextProduct${controlIndex++}`;
          const productImageUrl = (product.imageUrls || []).find(Boolean);
          actions.push({ id: productButtonId, event: "click", handler: () => toggleProduct(
            product,
            selected,
            selected ? "quitar un producto de la página" : suggestion ? "agregar un producto sugerido a la página" : "agregar un producto a la página",
          ) });
          return `<button id="${productButtonId}" type="button" aria-pressed="${selected}" aria-label="${suggestion ? "Agregar sugerencia" : selected ? "Quitar" : "Agregar"} ${esc(product.name)}" title="${selected ? "Quitar" : "Agregar"} ${esc(product.name)}"><span class="preview-context-product-media">${productImageUrl ? `<img src="${esc(dashboardAssetUrl(productImageUrl))}" alt="" style="object-position:${esc(catalogImagePosition(productImageUrl))}">` : `<span aria-hidden="true">${esc(product.name.slice(0, 1).toUpperCase())}</span>`}</span><span>${esc(product.name)}</span><small>${suggestion ? "Sugerido · agregar" : selected ? "Seleccionado" : "Agregar"}</small></button>`;
        };
        content += `<section class="preview-context-site-scene preview-context-product-section"><strong>Productos de esta página · ${selectedProducts.length}</strong><p class="preview-context-copy">Elige productos de todo tu catálogo. Solo los seleccionados aparecerán aquí y respetarán el orden que definas abajo.</p>`;
        if (availableProducts.length) {
          if (suggestedProducts.length) {
            content += `<div class="preview-context-product-suggestions"><span>Sugeridos según categoría, etiquetas y destacados</span><div class="preview-context-product-picker" role="group" aria-label="Productos sugeridos">${suggestedProducts.map((product) => productButtonMarkup(product, { suggestion: true })).join("")}</div></div>`;
          }
          if (selectedProducts.length) {
            productSortState = { selectedSiteSection, selection, pushUndo: pushSiteSectionUndo };
            content += `<div class="preview-context-field"><span>Orden en la página</span><div class="preview-context-product-sort">${selectedProducts.map((product, index) => {
              const removeId = `previewContextProductRemove${controlIndex++}`;
              actions.push({ id: removeId, handler: () => toggleProduct(product, true, "quitar un producto de la página") });
              return `<div class="preview-context-product-sort-row" data-reorder-key="${esc(product.id)}" data-reorder-label="${esc(product.name)}"><button type="button" class="ghost reorder-handle" aria-label="Mover ${esc(product.name)}. Usa flechas, Inicio o Fin." aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Arrastrar ${esc(product.name)}">${REORDER_HANDLE_ICON}</button><span class="preview-context-product-sort-index">${index + 1}</span><span class="preview-context-product-sort-copy"><strong>${esc(product.name)}</strong><small>${money(product.amount)}</small></span><button type="button" class="ghost preview-context-product-sort-remove" id="${removeId}" aria-label="Quitar ${esc(product.name)}">Quitar</button></div>`;
            }).join("")}</div><small>Arrastra cada producto o usa las flechas del control para cambiar su posición.</small></div>`;
          } else {
            content += `<p class="preview-context-copy">Elige tu primer producto. En cuanto lo agregues aparecerá aquí el ordenador.</p>`;
          }
          content += `<div class="preview-context-field"><span>Todo el catálogo</span><div class="preview-context-product-picker" role="group" aria-label="Productos de esta página">${availableProducts.map((product) => productButtonMarkup(product, { selected: selectedProductIds.has(product.id) })).join("")}</div></div>`;
        } else {
          content += `<p class="preview-context-copy">Todavía no hay productos activos. Crea uno en Productos y volverá a aparecer aquí.</p>`;
        }
        content += `</section>`;
      }
      const selectedBlockLocation = siteSectionBlockLocation(selectedSiteSection, selection.itemId);
      if (selectedBlockLocation && ["heading", "text", "action"].includes(selectedBlockLocation.block.kind)) {
        content += siteDraftFieldMarkup(selectedBlockLocation.block, "text", selectedBlockLocation.block.kind === "heading" ? "Texto del título" : selectedBlockLocation.block.kind === "action" ? "Texto del botón" : "Contenido del texto", {
          type: selectedBlockLocation.block.kind === "text" ? "textarea" : "text",
          maxLength: selectedBlockLocation.block.kind === "action" ? 40 : selectedBlockLocation.block.kind === "heading" ? 120 : 600,
          helper: `Ranura: ${selectedBlockLocation.block.slot}`,
          beforeInput: () => pushSiteSectionUndo("editar un bloque de la sección"),
          onInput: () => syncSiteSectionBlockProjection(selectedSiteSection, selectedBlockLocation.block),
        });
        content += `<div class="preview-context-actions">${actionMarkup("Mover antes", () => {
          if (selectedBlockLocation.index <= 0) return;
          pushSiteSectionUndo("mover un bloque de la sección");
          const [block] = selectedBlockLocation.blocks.splice(selectedBlockLocation.index, 1);
          selectedBlockLocation.blocks.splice(selectedBlockLocation.index - 1, 0, block);
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor(selection);
        })}${actionMarkup("Mover después", () => {
          if (selectedBlockLocation.index >= selectedBlockLocation.blocks.length - 1) return;
          pushSiteSectionUndo("mover un bloque de la sección");
          const [block] = selectedBlockLocation.blocks.splice(selectedBlockLocation.index, 1);
          selectedBlockLocation.blocks.splice(selectedBlockLocation.index + 1, 0, block);
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor(selection);
        })}${actionMarkup("Eliminar bloque", () => {
          pushSiteSectionUndo("eliminar un bloque de la sección");
          const [removed] = selectedBlockLocation.blocks.splice(selectedBlockLocation.index, 1);
          if (removed.id === "heading") selectedSiteSection.title = "";
          if (removed.id === "body") selectedSiteSection.body = "";
          if (removed.id === "action") selectedSiteSection.ctaLabel = "";
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor({ section, field: "section", label: selectedSiteSection.title || "Sección" });
        }, { danger: true })}</div>`;
      }
      content += siteDraftFieldMarkup(selectedSiteSection, "title", "Título", { maxLength: 120, onInput: syncPreviewSectionTabLabels });
      content += siteDraftFieldMarkup(selectedSiteSection, "body", "Texto", { type: "textarea", maxLength: 600 });
      content += siteDraftFieldMarkup(selectedSiteSection, "ctaLabel", "Texto del botón", { maxLength: 40, helper: "Déjalo vacío cuando esta sección no necesite una acción." });
      advancedContent += siteDraftFieldMarkup(selectedSiteSection, "family", "Familia visual", { type: "select", options: familyOptions, helper: "Cambia la jerarquía de los mismos bloques sin perder su contenido.", beforeInput: () => pushSiteSectionUndo("cambiar la familia visual de la sección") });
      advancedContent += `<div class="preview-context-grid">${siteDraftFieldMarkup(selectedSiteSection, "layout", "Variación", { type: "select", options: layoutOptions })}${siteDraftFieldMarkup(selectedSiteSection, "width", "Ancho", { type: "select", options: [["full", "Completo"], ["wide", "Amplio"], ["contained", "Contenido"]] })}</div>`;
      advancedContent += `<div class="preview-context-grid">${siteDraftFieldMarkup(selectedSiteSection, "align", "Alineación", { type: "select", options: [["left", "Izquierda"], ["center", "Centro"], ["right", "Derecha"]] })}${siteDraftFieldMarkup(selectedSiteSection, "motion", "Animación", { type: "select", options: motionOptions, helper: "El movimiento reducido siempre se respeta." })}</div>`;
      if (["hero", "gallery"].includes(selectedSiteSection.kind) && (selectedSiteSection.mediaUrls || []).length >= 2) {
        advancedContent += `<div class="preview-context-actions">${actionMarkup("Aplicar dúo editorial", () => {
          pushSiteSectionUndo("aplicar el dúo editorial");
          selectedSiteSection.layout = "split";
          selectedSiteSection.motion = "clip";
          selectedSiteSection.width = "full";
          setStoreSettingsDirty(true); scheduleStorePreview(0); renderPreviewContextEditor(selection);
        }, { primary: true })}</div><p class="preview-context-copy">Dos imágenes lado a lado con una entrada única de recorte. En movimiento reducido, usa solo un fundido breve.</p>`;
      }
      if (selectedSiteSection.motion !== "none") {
        advancedContent += `<div class="preview-context-actions">${actionMarkup("Eliminar animación", () => {
          pushSiteSectionUndo("eliminar la animación de la sección");
          selectedSiteSection.motion = "none";
          if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
          setStoreSettingsDirty(true);
          pendingStorePreviewSection = section;
          pendingStorePreviewAction = "scroll";
          scheduleStorePreview(0);
          renderPreviewContextEditor(selection);
          previewSelectionStatusEl.innerHTML = `<strong>Animación eliminada.</strong> La sección y su contenido se conservan.`;
        }, { danger: true })}</div>`;
      }
      advancedContent += `<div class="preview-context-grid">${siteDraftFieldMarkup(selectedSiteSection, "backgroundColor", "Fondo", { type: "color" })}${siteDraftFieldMarkup(selectedSiteSection, "textColor", "Texto", { type: "color" })}</div>`;
      content += `<details class="preview-context-advanced"><summary>Diseño avanzado</summary><div class="preview-context-advanced-body">${advancedContent}</div></details>`;
      const blockSlots = {
        hero: { heading: "heading", text: "body", action: "actions" }, story: { heading: "heading", text: "body", action: "body" },
        catalog: { heading: "heading", text: "intro", action: "footer-action" }, gallery: { heading: "heading", text: "body", action: "caption" },
        contact: { heading: "heading", text: "body", action: "actions" }, location: { heading: "heading", text: "address", action: "hours" },
        links: { heading: "heading", text: "body", action: "links" },
      };
      const nextBlockId = (kind) => {
        const used = new Set();
        const collect = (blocks) => (blocks || []).forEach((block) => { used.add(block.id); collect(block.children); });
        collect(selectedSiteSection.blocks);
        let index = 1;
        while (used.has(`${kind}-${index}`)) index += 1;
        return `${kind}-${index}`;
      };
      const addSiteBlock = (kind, copy) => {
        selectedSiteSection.blocks ||= [];
        if (selectedSiteSection.blocks.length >= 16) return;
        pushSiteSectionUndo("agregar un bloque a la sección");
        const id = nextBlockId(kind);
        selectedSiteSection.blocks.push({ id, kind, slot: blockSlots[selectedSiteSection.kind]?.[kind] || "body", role: kind === "heading" || kind === "action" ? "primary" : "supporting", text: copy, mediaUrl: null, children: [] });
        setStoreSettingsDirty(true);
        scheduleStorePreview(0);
        renderPreviewContextEditor({ section, field: "siteBlockText", label: kind === "heading" ? "título nuevo" : kind === "action" ? "botón nuevo" : "texto nuevo", itemId: id });
      };
      content += `<p class="preview-context-action-label">Bloques dentro de esta sección</p><div class="preview-context-actions">${actionMarkup("+ Título", () => addSiteBlock("heading", "Escribe aquí tu título"))}${actionMarkup("+ Texto", () => addSiteBlock("text", "Escribe aquí tu texto"), { primary: true })}${actionMarkup("+ Botón", () => addSiteBlock("action", "Ver más"))}</div>`;
      if (selectedSiteSection.items?.length) {
        content += `<p class="preview-context-action-label">Escenas de esta sección</p>`;
        selectedSiteSection.items.forEach((item, itemIndex) => {
          const sources = animationSourceMedia().filter((source) => !isVideoUploadUrl(source.imageUrl));
          content += `<div class="preview-context-site-scene"><strong>Escena ${itemIndex + 1}</strong>${siteDraftFieldMarkup(item, "title", `Título de escena ${itemIndex + 1}`, { maxLength: 100 })}${siteDraftFieldMarkup(item, "body", `Texto de escena ${itemIndex + 1}`, { type: "textarea", maxLength: 320 })}`;
          if (sources.length) {
            content += `<div class="preview-context-field"><span>Imagen de escena ${itemIndex + 1}</span><div class="preview-context-media">${sources.map((source) => {
              const id = `previewContextSiteAsset${controlIndex++}`;
              actions.push({ id, handler: () => {
                item.mediaUrl = source.imageUrl;
                selectedSiteSection.mediaUrls[itemIndex] = source.imageUrl;
                setStoreSettingsDirty(true);
                scheduleStorePreview(0);
                renderPreviewContextEditor(selection);
              }});
              return `<button type="button" id="${id}" aria-label="Usar ${esc(source.label)} en escena ${itemIndex + 1}" aria-pressed="${normalizedAssetKey(item.mediaUrl) === source.key}"><img src="${esc(previewContextAssetUrl(source.imageUrl))}" alt=""></button>`;
            }).join("")}</div></div>`;
          }
          content += `${uploadMarkup(`Subir imagen para escena ${itemIndex + 1}`, "image/png,image/jpeg,image/webp", async (file, input) => {
            if (!file) return;
            if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
              previewSelectionStatusEl.textContent = "Usa una imagen PNG, JPEG o WEBP de hasta 8 MB.";
              input.value = "";
              return;
            }
            input.disabled = true;
            try {
              const imageUrl = await uploadFile(file);
              item.mediaUrl = imageUrl;
              selectedSiteSection.mediaUrls[itemIndex] = imageUrl;
              setStoreSettingsDirty(true);
              scheduleStorePreview(0);
              renderPreviewContextEditor(selection);
            } catch (error) {
              previewSelectionStatusEl.textContent = `No pudimos subir la imagen: ${error.message}`;
            } finally {
              input.disabled = false;
              input.value = "";
            }
          })}</div>`;
        });
      }
    } else if ((section === "gallery" || selectedSiteSection?.kind === "gallery") && Number.isInteger(selection.itemIndex) && pendingEditorialGallery[selection.itemIndex]) {
      const index = selection.itemIndex;
      const row = () => storeEditorialGalleryListEl.querySelector(`.editorial-gallery-row[data-index="${index}"]`);
      content += `<div class="preview-context-grid">${fieldMarkup(() => row()?.querySelector(".editorial-title"), "Título")}${fieldMarkup(() => row()?.querySelector(".editorial-caption"), "Línea corta")}</div>`;
      content += fieldMarkup(() => row()?.querySelector(".editorial-body"), "Texto");
      content += `<div class="preview-context-grid">${fieldMarkup(() => row()?.querySelector(".editorial-box-color"), "Color de la caja")}</div>`;
      content += fieldMarkup(() => row()?.querySelector(".editorial-product-link"), "Producto al tocar la foto", "El cliente abrirá directamente la página del producto elegido.");
      content += `<div class="preview-context-actions">${uploadMarkup("Reemplazar foto", "image/png,image/jpeg,image/webp", async (file, input) => {
        if (!file) return;
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > MAX_IMAGE_BYTES) {
          previewSelectionStatusEl.textContent = file.size > MAX_IMAGE_BYTES ? "La imagen supera el máximo de 8 MB." : "Usa una imagen PNG, JPEG o WEBP.";
          input.value = "";
          return;
        }
        input.disabled = true;
        previewSelectionStatusEl.textContent = `Subiendo ${file.name}…`;
        try {
          pendingEditorialGallery[index].imageUrl = await uploadFile(file);
          renderEditorialGalleryEditor();
          setStoreSettingsDirty(true);
          scheduleStorePreview(0);
          renderPreviewContextEditor(selection);
          previewSelectionStatusEl.innerHTML = `<strong>Foto reemplazada.</strong> Revisa el resultado y guarda cuando esté listo.`;
        } catch (error) {
          previewSelectionStatusEl.textContent = `No pudimos subir la foto: ${error.message}`;
        } finally {
          input.disabled = false;
          input.value = "";
        }
      })}</div>`;
    } else if (animation) {
      const card = () => storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${CSS.escape(animation.id)}"]`);
      const requirement = animationMediaRequirement(animation.type);
      const missingMedia = Math.max(0, requirement.min - animation.media.length);
      const animationPageControlId = `previewContextAnimationPage${controlIndex++}`;
      const animationPageLabel = (pendingSiteDocument?.pages || []).find((page) => page.id === animation.pageId)?.label || "Inicio";
      actions.push({ id: animationPageControlId, event: "change", handler: (event) => {
        const nextPageId = String(event.target.value || "");
        if (nextPageId && !(pendingSiteDocument?.pages || []).some((page) => page.id === nextPageId)) return;
        const previousPageId = animation.pageId || "";
        if (previousPageId === nextPageId) return;
        pushStoreEditorUndo("mover la animación a otra página", () => {
          const target = pendingAnimations.find((entry) => entry.id === animation.id);
          if (!target) return;
          if (previousPageId) target.pageId = previousPageId;
          else delete target.pageId;
          renderAnimationsEditor();
          renderPreviewSectionTabs();
          renderStoreContentOrderEditor();
        });
        if (nextPageId) animation.pageId = nextPageId;
        else delete animation.pageId;
        setStoreSettingsDirty(true);
        renderAnimationsEditor();
        renderPreviewSectionTabs();
        renderStoreContentOrderEditor();
        scheduleStorePreview(0);
        if ((activePreviewPageId || "") === nextPageId) renderPreviewContextEditor(selection);
        else {
          setPreviewSectionCurrent("motion");
          renderPreviewContextEditor({ section: "motion", field: "animations", label: "Animaciones" });
        }
        previewSelectionStatusEl.innerHTML = `<strong>Animación movida.</strong> Ahora aparece solo en ${esc(nextPageId ? (pendingSiteDocument.pages.find((page) => page.id === nextPageId)?.label || "la página elegida") : "Inicio")}.`;
      }});
      content += `<section class="preview-context-site-scene"><strong>Visible en ${esc(animationPageLabel)}</strong><div class="preview-context-field"><label for="${animationPageControlId}">Página de esta animación</label><select id="${animationPageControlId}"><option value="" ${animation.pageId ? "" : "selected"}>Inicio</option>${(pendingSiteDocument?.pages || []).map((page) => `<option value="${esc(page.id)}" ${animation.pageId === page.id ? "selected" : ""}>${esc(page.label)}</option>`).join("")}</select><small>La animación no se repetirá en Inicio ni en otras pestañas.</small></div></section>`;
      if (missingMedia > 0) {
        const mediaInstruction = ["video-background", "video-pin-reveal"].includes(animation.type)
          ? "Sube 1 video MP4 o WebM aquí."
          : `Elige ${missingMedia} ${missingMedia === 1 ? "foto" : "fotos"} o súbelas aquí.`;
        content += `<p class="preview-context-copy"><strong>${esc(mediaInstruction)}</strong> La animación aparecerá en la tienda en cuanto tenga ${missingMedia === 1 ? "el medio necesario" : "los medios necesarios"}.</p>`;
      }
      const mediaRow = () => selectedAnimationMediaIndex === null
        ? card()?.querySelector(".animation-media-row")
        : card()?.querySelector(`.animation-media-row[data-media-index="${selectedAnimationMediaIndex}"]`);
      const animationSectionKey = `animation-${animation.id}`;
      const animationOrderIndex = pendingContentOrder.indexOf(animationSectionKey);
      const positionTitleId = `previewContextPositionTitle${controlIndex++}`;
      const moveUpId = `previewContextMoveUp${controlIndex++}`;
      const moveDownId = `previewContextMoveDown${controlIndex++}`;
      const positionSelectId = `previewContextPositionSelect${controlIndex++}`;
      const moveAnimationAndRefresh = (toIndex, focusId) => {
        if (!movePreviewContentSection(animationSectionKey, toIndex, selection)) return;
        renderPreviewContextEditor(selection);
        window.requestAnimationFrame(() => document.getElementById(focusId)?.focus());
      };
      actions.push({ id: moveUpId, handler: () => moveAnimationAndRefresh(animationOrderIndex - 1, moveUpId) });
      actions.push({ id: moveDownId, handler: () => moveAnimationAndRefresh(animationOrderIndex + 1, moveDownId) });
      actions.push({ id: positionSelectId, event: "change", handler: (event) => moveAnimationAndRefresh(Number(event.target.value), positionSelectId) });
      content += `<section class="preview-context-position-control" aria-labelledby="${positionTitleId}">
        <div class="preview-context-position-head"><strong id="${positionTitleId}">Mover esta animación</strong><span>Posición ${animationOrderIndex + 1} de ${pendingContentOrder.length}</span></div>
        <div class="preview-context-position-actions">
          <button type="button" class="ghost" id="${moveUpId}" ${animationOrderIndex <= 0 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg><span>Subir</span></button>
          <button type="button" class="ghost" id="${moveDownId}" ${animationOrderIndex < 0 || animationOrderIndex >= pendingContentOrder.length - 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>Bajar</span></button>
        </div>
        <label class="preview-context-position-select" for="${positionSelectId}"><span>Mover directamente a</span><select id="${positionSelectId}" aria-label="Posición de ${esc(animation.name)}">${pendingContentOrder.map((entry, index) => `<option value="${index}" ${index === animationOrderIndex ? "selected" : ""}>${index + 1}. ${esc(storeContentOrderEntryLabel(entry)[0])}</option>`).join("")}</select></label>
      </section>`;
      content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="name"]'), "Nombre interno")}${fieldMarkup(() => card()?.querySelector('[data-animation-field="type"]'), "Tipo de animación", "Cambia el movimiento sin crear otra sección.", { rerender: true })}</div>`;
      content += fieldMarkup(() => card()?.querySelector('[data-animation-field="title"]'), "Título general");
      content += fieldMarkup(() => card()?.querySelector('[data-animation-field="subtitle"]'), "Subtítulo general");
      content += fieldMarkup(() => card()?.querySelector('[data-animation-field="productId"]'), "Tarjeta de producto", "El cliente podrá tocarla para abrir directamente el producto.", { rerender: true });
      if (String(animation.buttonLabel || "").trim()) {
        content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="buttonLabel"]'), "Texto del botón")}${fieldMarkup(() => card()?.querySelector('[data-animation-field="buttonPositionX"]'), "Posición horizontal")}</div>`;
        content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="buttonPositionY"]'), "Posición vertical")}</div>`;
        content += `<div class="preview-context-actions">${actionMarkup("Quitar botón", () => {
          if (!commitAnimationCommand({ type: "set-field", animationId: animation.id, key: "buttonLabel", value: "" }, "quitar el botón")) return;
          commitAnimationCommand({ type: "unset-fields", animationId: animation.id, keys: ["buttonPositionX", "buttonPositionY"] }, "", { recordUndo: false });
          renderAnimationsEditor();
          commitAnimationStructureChange();
          renderPreviewContextEditor({ section: `animation-${animation.id}`, field: "section", label: animation.name, animationId: animation.id });
        }, { danger: true })}</div>`;
      } else {
        content += `<div class="preview-context-actions">${actionMarkup("Agregar botón", () => {
          if (!commitAnimationCommand({ type: "set-field", animationId: animation.id, key: "buttonLabel", value: "Ver colección" }, "agregar un botón")) return;
          commitAnimationCommand({ type: "set-button-layout", animationId: animation.id, buttonPositionX: 18, buttonPositionY: 86 }, "", { recordUndo: false });
          renderAnimationsEditor();
          commitAnimationStructureChange();
          selectStorePreviewEditorTarget({ section: `animation-${animation.id}`, field: "buttonLabel", label: "botón de la animación", animationId: animation.id });
        }, { primary: true })}</div>`;
      }
      const generalTextSelection = { section: `animation-${animation.id}`, field: "animationTitle", label: "bloque de texto de la animación", animationId: animation.id };
      const textActions = [];
      let textActionLabel = "Texto general de la animación";
      if (selectedAnimationMediaIndex === null) {
        const titleSelection = { ...generalTextSelection, field: "animationTitle", label: "título general de la animación" };
        const subtitleSelection = { ...generalTextSelection, field: "animationSubtitle", label: "subtítulo general de la animación" };
        textActions.push(actionMarkup(animation.title.trim() ? "Editar título general" : "Insertar título general", () => {
          if (!animation.title.trim()) {
            if (!commitAnimationCommand({ type: "set-field", animationId: animation.id, key: "title", value: "Escribe aquí tu título" }, "añadir un título general")) return;
            renderAnimationsEditor();
            commitAnimationStructureChange();
          }
          selectStorePreviewEditorTarget(titleSelection);
        }, { primary: !animation.title.trim() }));
        textActions.push(actionMarkup(animation.subtitle.trim() ? "Editar subtítulo general" : "Insertar subtítulo general", () => {
          if (!animation.subtitle.trim()) {
            if (!commitAnimationCommand({ type: "set-field", animationId: animation.id, key: "subtitle", value: "Escribe aquí tu subtítulo" }, "añadir un subtítulo general")) return;
            renderAnimationsEditor();
            commitAnimationStructureChange();
          }
          selectStorePreviewEditorTarget(subtitleSelection);
        }));
        if (animation.title.trim() || animation.subtitle.trim()) textActions.push(actionMarkup("Copiar texto", () => copyAnimationText(generalTextSelection)));
        if (animationTextClipboard) textActions.push(actionMarkup("Pegar texto", () => pasteAnimationText(generalTextSelection)));
      } else if (animation.media[selectedAnimationMediaIndex]) {
        const textMediaIndex = selectedAnimationMediaIndex;
        textActionLabel = `Texto de la escena ${textMediaIndex + 1}`;
        const media = animation.media[textMediaIndex];
        const mediaHasText = Boolean(media.title.trim() || media.caption.trim() || media.body.trim());
        const mediaTextSelection = { section: `animation-${animation.id}`, field: "title", label: `texto de la escena ${textMediaIndex + 1}`, animationId: animation.id, itemIndex: textMediaIndex };
        const mediaTitleSelection = { ...mediaTextSelection, field: "title", label: `título de la escena ${textMediaIndex + 1}` };
        const mediaSubtitleSelection = { ...mediaTextSelection, field: "caption", label: `subtítulo de la escena ${textMediaIndex + 1}` };
        textActions.push(actionMarkup(media.title.trim() ? `Editar título de escena ${textMediaIndex + 1}` : `Insertar título en escena ${textMediaIndex + 1}`, () => {
          if (!media.title.trim()) {
            if (!commitAnimationCommand({ type: "set-field", selection: mediaTitleSelection, key: "title", value: "Escribe aquí tu título" }, `añadir título sobre imagen ${textMediaIndex + 1}`)) return;
            renderAnimationsEditor();
            commitAnimationStructureChange();
          }
          selectStorePreviewEditorTarget(mediaTitleSelection);
        }, { primary: !mediaHasText }));
        textActions.push(actionMarkup(media.caption.trim() ? `Editar subtítulo de escena ${textMediaIndex + 1}` : `Insertar subtítulo en escena ${textMediaIndex + 1}`, () => {
          if (!media.caption.trim()) {
            if (!commitAnimationCommand({ type: "set-field", selection: mediaSubtitleSelection, key: "caption", value: "Escribe aquí tu subtítulo" }, `añadir subtítulo sobre imagen ${textMediaIndex + 1}`)) return;
            renderAnimationsEditor();
            commitAnimationStructureChange();
          }
          selectStorePreviewEditorTarget(mediaSubtitleSelection);
        }));
        if (mediaHasText) textActions.push(actionMarkup("Copiar texto", () => copyAnimationText(mediaTextSelection)));
        if (animationTextClipboard) textActions.push(actionMarkup("Pegar texto aquí", () => pasteAnimationText(mediaTextSelection)));
      }
      content += `<p class="preview-context-action-label">${esc(textActionLabel)}</p><div class="preview-context-actions">${textActions.join("")}</div>`;
      content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="textAlign"]'), "Alineación")}${fieldMarkup(() => card()?.querySelector('[data-animation-field="textScale"]'), "Tamaño preciso")}</div>`;
      content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="textWidthPercent"]'), "Ancho preciso")}${fieldMarkup(() => card()?.querySelector('[data-animation-field="textColor"]'), "Color del texto")}</div>`;
      content += `<div class="preview-context-grid">${fieldMarkup(() => card()?.querySelector('[data-animation-field="backgroundColor"]'), "Fondo de la animación")}</div>`;
      if (animation.media.length) {
        const reorderHelp = animation.type === "scroll-expansion"
          ? "Esta animación usa 2 fotos: la 1 se expande y la 2 es el fondo inicial. Arrástralas para intercambiarlas."
          : "Arrastra una miniatura y suéltala entre las demás. También puedes usar las flechas izquierda y derecha.";
        content += `<div class="preview-context-field"><span>Orden de las imágenes · ${animation.media.length}/${requirement.max}</span><div class="preview-context-slots">${animation.media.map((media, mediaIndex) => {
          const id = `previewContextSlot${controlIndex++}`;
          actions.push({ id, handler: (event) => {
            if (event.currentTarget.dataset.reorderSuppressClick === "true") {
              delete event.currentTarget.dataset.reorderSuppressClick;
              return;
            }
            selectStorePreviewEditorTarget(selectedAnimationMediaIndex === mediaIndex
            ? { section: `animation-${animation.id}`, field: "section", label: animation.name, animationId: animation.id }
            : {
                section: `animation-${animation.id}`,
                field: "media",
                label: `imagen ${mediaIndex + 1} de la animación`,
                animationId: animation.id,
                itemIndex: mediaIndex,
              });
          } });
          const mediaUrl = previewContextAssetUrl(media.imageUrl);
          const preview = isVideoUploadUrl(media.imageUrl)
            ? `<video src="${esc(mediaUrl)}" muted playsinline></video>`
            : `<img src="${esc(mediaUrl)}" alt="">`;
          return `<button type="button" class="preview-context-slot" id="${id}" data-animation-media-index="${mediaIndex}" aria-label="Editar imagen ${mediaIndex + 1}" aria-description="Arrastra para cambiar su posición" aria-keyshortcuts="ArrowLeft ArrowRight Home End" aria-pressed="${selectedAnimationMediaIndex === mediaIndex}" title="Arrastrar para ordenar · tocar para editar">${preview}<span class="preview-context-slot-label">${mediaIndex + 1}</span></button>`;
        }).join("")}</div><small>${esc(reorderHelp)}</small></div>`;
        if (selectedAnimationMediaIndex !== null) {
          content += `<div class="preview-context-actions">${actionMarkup("Agregar o quitar fotos", () => selectStorePreviewEditorTarget({
            section: `animation-${animation.id}`,
            field: "section",
            label: animation.name,
            animationId: animation.id,
          }))}</div>`;
        }
      }
      if (animation.media[selectedAnimationMediaIndex ?? 0]) {
        content += `<div class="preview-context-grid">${fieldMarkup(() => mediaRow()?.querySelector('[data-animation-media-field="title"]'), "Título (opcional)")}${fieldMarkup(() => mediaRow()?.querySelector('[data-animation-media-field="caption"]'), "Subtítulo (opcional)")}</div>`;
        content += fieldMarkup(() => mediaRow()?.querySelector('[data-animation-media-field="body"]'), "Texto adicional (opcional)", "Cada escena puede tener su propio título, subtítulo y texto.");
      }
      const sources = animationSourceMedia(animation.type);
      const videoBackground = ["video-background", "video-pin-reveal"].includes(animation.type);
      if (requirement.max > 0 && sources.length) {
        const selectedKeys = new Set(animation.media.map((media) => normalizedAssetKey(media.imageUrl)));
        const selectedMediaKey = selectedAnimationMediaIndex === null ? "" : normalizedAssetKey(animation.media[selectedAnimationMediaIndex]?.imageUrl);
        const sourceHeading = selectedAnimationMediaIndex === null
          ? `${videoBackground ? "Elegir video" : "Agregar o quitar fotos"} · ${animation.media.length}/${requirement.max}`
          : `Reemplazar ${videoBackground ? "video" : "imagen"} ${selectedAnimationMediaIndex + 1} con`;
        content += `<div class="preview-context-field"><span>${sourceHeading}</span><div class="preview-context-media">${sources.map((source) => {
          const id = `previewContextAsset${controlIndex++}`;
          actions.push({ id, handler: () => {
            if (selectedAnimationMediaIndex !== null) {
              if (!commitAnimationCommand({ type: "replace-media", animationId: animation.id, mediaIndex: selectedAnimationMediaIndex, media: animationMediaDraft(source.imageUrl) }, `cambiar imagen ${selectedAnimationMediaIndex + 1}`)) return;
              renderAnimationsEditor();
              commitAnimationStructureChange();
              renderPreviewContextEditor(selection);
              return;
            }
            const existingIndex = animation.media.findIndex((media) => normalizedAssetKey(media.imageUrl) === source.key);
            if (!commitAnimationCommand({
              type: "toggle-media",
              animationId: animation.id,
              media: animationMediaDraft(source.imageUrl),
              checked: existingIndex < 0,
              maxMedia: requirement.max,
            }, "cambiar las fotos de la animación")) return;
            renderAnimationsEditor();
            commitAnimationStructureChange();
            renderPreviewContextEditor(selection);
          }});
          const sourceUrl = previewContextAssetUrl(source.imageUrl);
          const media = isVideoUploadUrl(source.imageUrl) ? `<video src="${esc(sourceUrl)}" muted playsinline></video>` : `<img src="${esc(sourceUrl)}" alt="">`;
          const actionLabel = selectedAnimationMediaIndex === null ? `Usar ${source.label}` : `Reemplazar imagen ${selectedAnimationMediaIndex + 1} por ${source.label}`;
          const pressed = selectedAnimationMediaIndex === null ? selectedKeys.has(source.key) : selectedMediaKey === source.key;
          return `<button type="button" id="${id}" aria-label="${esc(actionLabel)}" aria-pressed="${pressed}" title="${esc(source.label)}">${media}</button>`;
        }).join("")}</div></div>`;
      }
      const availableAnimationSlots = Math.max(0, requirement.max - animation.media.length);
      const batchAnimationUpload = selectedAnimationMediaIndex === null && !videoBackground && requirement.max > 1 && availableAnimationSlots > 0;
      const animationUploadLabel = selectedAnimationMediaIndex !== null
        ? `Reemplazar ${videoBackground ? "video" : "medio"}`
        : videoBackground
          ? "Subir video"
          : batchAnimationUpload
            ? `Subir fotos juntas`
            : "Subir foto o video";
      content += `<div class="preview-context-actions">${uploadMarkup(animationUploadLabel, videoBackground ? "video/mp4,video/webm" : "image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm", async (fileSelection, input) => {
        const files = Array.isArray(fileSelection) ? fileSelection : fileSelection ? [fileSelection] : [];
        if (!files.length) return;
        if (batchAnimationUpload && files.length > availableAnimationSlots) {
          previewSelectionStatusEl.textContent = `Puedes agregar ${availableAnimationSlots} ${availableAnimationSlots === 1 ? "archivo" : "archivos"} más a esta animación.`;
          input.value = "";
          return;
        }
        const allowedTypes = videoBackground ? ["video/mp4", "video/webm"] : ["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"];
        const invalidFile = files.find((file) => !allowedTypes.includes(file.type) || file.size > (file.type.startsWith("video/") ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES));
        const validationError = invalidFile
          ? videoBackground ? "Usa un video MP4 o WebM de hasta 20 MB." : "Usa PNG, JPEG, WEBP o GIF de hasta 8 MB, o MP4/WebM de hasta 20 MB."
          : "";
        if (validationError) { previewSelectionStatusEl.textContent = validationError; input.value = ""; return; }
        input.disabled = true;
        previewSelectionStatusEl.textContent = files.length === 1 ? `Subiendo ${files[0].name}…` : `Subiendo ${files.length} fotos…`;
        try {
          const imageUrls = await runWithConcurrency(files, 3, (file) => uploadFile(file));
          if (selectedAnimationMediaIndex !== null) {
            const imageUrl = imageUrls[0];
            if (!commitAnimationCommand({ type: "replace-media", animationId: animation.id, mediaIndex: selectedAnimationMediaIndex, media: animationMediaDraft(imageUrl) }, `cambiar imagen ${selectedAnimationMediaIndex + 1}`)) return;
          }
          else if (requirement.max === 1) {
            const imageUrl = imageUrls[0];
            const command = animation.media.length
              ? { type: "replace-media", animationId: animation.id, mediaIndex: 0, media: animationMediaDraft(imageUrl) }
              : { type: "add-media", animationId: animation.id, media: animationMediaDraft(imageUrl), maxMedia: 1 };
            if (!commitAnimationCommand(command, "cambiar la imagen de la animación")) return;
          }
          else if (availableAnimationSlots > 0) {
            const nextMedia = [
              ...animation.media.map(cloneAnimationMedia),
              ...imageUrls.slice(0, availableAnimationSlots).map(animationMediaDraft),
            ];
            if (!commitAnimationCommand({ type: "replace-media-list", animationId: animation.id, media: nextMedia, maxMedia: requirement.max }, `agregar ${imageUrls.length === 1 ? "una imagen" : `${imageUrls.length} imágenes`} a la animación`)) return;
          }
          else {
            if (!commitAnimationCommand({ type: "replace-media", animationId: animation.id, mediaIndex: 0, media: animationMediaDraft(imageUrls[0]) }, "cambiar la imagen de la animación")) return;
          }
          renderAnimationsEditor();
          commitAnimationStructureChange();
          renderPreviewContextEditor(selection);
          previewSelectionStatusEl.innerHTML = selectedAnimationMediaIndex === null && imageUrls.length > 1
            ? `<strong>${imageUrls.length} fotos agregadas.</strong> Ya ocupan sus lugares en la animación.`
            : selectedAnimationMediaIndex === null
              ? `<strong>Medio agregado.</strong> Ya aparece en la animación.`
            : `<strong>Foto ${selectedAnimationMediaIndex + 1} reemplazada.</strong> Ya aparece en la animación.`;
        } catch (error) {
          previewSelectionStatusEl.textContent = `No pudimos subir ${files.length === 1 ? "el archivo" : "los archivos"}: ${error.message}`;
        } finally {
          input.disabled = false;
          input.value = "";
        }
      }, { multiple: batchAnimationUpload })}${actionMarkup("Eliminar animación", () => {
        deleteInlineAnimation({ animationId: animation.id });
      }, { danger: true })}</div>`;
    } else if (field === "animations" || section === "motion") {
      const animationOptions = (category) => animationTypesForCategory(category).map((type) => {
        const [name, description] = animationTypeCopy(type);
        return `<option value="${esc(type)}">${esc(name)} · ${esc(description)}</option>`;
      }).join("");
      const options = `<optgroup label="Animaciones visuales">${animationOptions("visual")}</optgroup><optgroup label="Animaciones de texto">${animationOptions("text")}</optgroup>`;
      const selectId = `previewContextAnimationType${controlIndex++}`;
      const addId = `previewContextAnimationAdd${controlIndex++}`;
      actions.push({ id: addId, handler: () => {
        const picker = document.getElementById(selectId);
        storeAnimationTypePickerEl.value = picker.value;
        storeAnimationTypePickerEl.dispatchEvent(new Event("change", { bubbles: true }));
        storeAnimationAddEl.click();
        const created = pendingAnimations.at(-1);
        const nextSelection = created ? { section: `animation-${created.id}`, field: "section", label: created.name, animationId: created.id } : selection;
        setPreviewSectionCurrent(nextSelection.section);
        renderPreviewContextEditor(nextSelection, { focus: true });
      }});
      content += `<div class="preview-context-field"><label for="${selectId}">Nueva animación visual o de texto</label><select id="${selectId}">${options}</select><small>Los efectos visuales usan fotos; las animaciones de texto aparecen en un grupo separado y no piden imágenes.</small></div><div class="preview-context-actions"><button type="button" class="primary" id="${addId}">Agregar animación</button></div>`;
    } else if (field === "section") {
      content += `<p class="preview-context-copy">Usa el fondo y la posición de abajo, o toca un texto o una imagen dentro de esta sección para cambiarlo.</p>`;
      const sectionActions = [];
      if (section === "hero") sectionActions.push(actionMarkup("Agregar escena", () => storeHeroSlidesInputEl.click(), { primary: true }));
      if (section === "gallery") sectionActions.push(actionMarkup("Agregar fotos", () => storeEditorialGalleryInputEl.click(), { primary: true }));
      if (section === "links") sectionActions.push(actionMarkup("Agregar enlace", () => document.getElementById("storeLinkAdd").click(), { primary: true }));
      if (section === "location") sectionActions.push(actionMarkup("Configurar ubicación", () => focusEditorTarget(storeLocationAddEl, "Ubicación"), { primary: true }));
      if (section === "contact") content += fieldMarkup(() => storeContactFormEnabledEl, "Mostrar formulario de contacto");
      if (sectionActions.length) content += `<div class="preview-context-actions">${sectionActions.join("")}</div>`;
    } else {
      const sourceGetter = () => previewEditorTarget(selection);
      const source = sourceGetter();
      if (source instanceof HTMLInputElement && source.type === "file") {
        const removeIds = { storeLogo: "storeLogoRemoveBtn", storeBanner: "storeBannerRemoveBtn", aboutImage: "storeAboutImageRemoveBtn", promotionImage: "storePromotionImageRemoveBtn" };
        content += `<div class="preview-context-actions">${actionMarkup("Cambiar imagen", () => sourceGetter()?.click(), { primary: true })}${removeIds[field] ? actionMarkup("Quitar imagen", () => document.getElementById(removeIds[field])?.click(), { danger: true }) : ""}</div>`;
      } else if (source instanceof HTMLButtonElement) {
        content += `<div class="preview-context-actions">${actionMarkup(source.textContent.trim() || "Abrir ajuste", () => sourceGetter()?.click(), { primary: true })}</div>`;
      } else {
        content += fieldMarkup(sourceGetter, label);
      }
      if (section === "brand") {
        ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
        content += siteTextStyleMarkup({ section: "brand", field: "storeName", label: "nombre de la tienda" });
        content += `<div class="preview-context-color-row">${fieldMarkup(() => storeBackgroundColorEl, "Fondo de la tienda")}${fieldMarkup(() => storeAccentColorEl, "Color de marca", "Se activa automáticamente.", { beforeChange: () => { storeAccentToggleEl.checked = true; storeAccentColorEl.disabled = false; storeAccentToggleEl.dispatchEvent(new Event("change", { bubbles: true })); } })}</div>`;
      }
    }

    previewContextEditorEl.className = "preview-context-editor";
    previewContextEditorEl.innerHTML = content;
    bindings.forEach(({ id, getter, rerender, beforeChange }) => {
      const proxy = document.getElementById(id);
      if (!proxy) return;
      const source = getter();
      const eventName = source instanceof HTMLSelectElement || (source instanceof HTMLInputElement && source.type === "checkbox") ? "change" : "input";
      let previousSourceState = source ? {
        value: source.value,
        checked: source instanceof HTMLInputElement ? source.checked : false,
      } : null;
      proxy.addEventListener("focus", () => {
        const currentSource = getter();
        previousSourceState = currentSource ? {
          value: currentSource.value,
          checked: currentSource instanceof HTMLInputElement ? currentSource.checked : false,
        } : null;
      });
      proxy.addEventListener(eventName, () => {
        const currentSource = getter();
        if (!currentSource) return;
        beforeChange?.();
        if (currentSource instanceof HTMLInputElement && currentSource.type === "checkbox") currentSource.checked = proxy.checked;
        else currentSource.value = proxy.value;
        if (proxy.type === "color") proxy.closest(".preview-context-color-input")?.querySelector("output")?.replaceChildren(proxy.value.toUpperCase());
        currentSource.dispatchEvent(new Event(eventName, { bubbles: true }));
        if (rerender) window.requestAnimationFrame(() => renderPreviewContextEditor(activePreviewSelection));
      });
      const commitProxyChange = () => {
        const currentSource = getter();
        if (!currentSource || !previousSourceState) return;
        const currentState = {
          value: currentSource.value,
          checked: currentSource instanceof HTMLInputElement ? currentSource.checked : false,
        };
        if (previousSourceState.value === currentState.value && previousSourceState.checked === currentState.checked) return;
        const stateToRestore = previousSourceState;
        const sourceId = currentSource.id;
        if (sourceId) pushStoreEditorUndo(label, () => restoreStoreEditorControl(sourceId, stateToRestore));
        previousSourceState = currentState;
        if (eventName === "input") currentSource.dispatchEvent(new Event("change", { bubbles: true }));
      };
      if (eventName === "input") proxy.addEventListener("change", commitProxyChange);
      else proxy.addEventListener("change", () => window.queueMicrotask(commitProxyChange));
    });
    actions.forEach(({ id, event = "click", handler }) => document.getElementById(id)?.addEventListener(event, handler));
    if (productSortState) {
      const sortable = previewContextEditorEl.querySelector(".preview-context-product-sort");
      const ids = productSortState.selectedSiteSection.productIds || [];
      wireSortableList({
        container: sortable,
        rowSelector: ".preview-context-product-sort-row",
        itemCount: ids.length,
        onMove: (fromIndex, toIndex) => {
          const movedId = ids[fromIndex];
          productSortState.pushUndo("reordenar los productos de la página");
          if (!moveSortableEntry(ids, fromIndex, toIndex)) return;
          productSortState.selectedSiteSection.productIds = ids;
          if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
          setStoreSettingsDirty(true);
          scheduleStorePreview(0);
          renderPreviewContextEditor(productSortState.selection);
          window.requestAnimationFrame(() => previewContextEditorEl.querySelector(`[data-reorder-key="${CSS.escape(movedId)}"] .reorder-handle`)?.focus());
        },
      });
    }
    if (animation) wirePreviewContextAnimationMediaReorder(animation, selection);
    if (focus) window.requestAnimationFrame(() => window.setTimeout(() => previewContextEditorEl.querySelector("input:not([type='file']), textarea, select, button")?.focus(), 0));
  }

  function previewSectionKey(section) {
    if (String(section).startsWith("animation-")) return String(section);
    if (String(section).startsWith("site-") && pendingSiteSections.some((entry) => `site-${entry.id}` === String(section))) return String(section);
    if (section === "motion") return pendingContentOrder.find((entry) => entry.startsWith("animation-")) || null;
    return ["hero", "products", "about", "gallery", "contact", "links", "location"].includes(section) ? section : null;
  }

  function contentOrderForPage(pageId = activePreviewPageId) {
    return pendingContentOrder.filter((entry) => {
      if (entry.startsWith("animation-")) {
        const animation = pendingAnimations.find((candidate) => `animation-${candidate.id}` === entry);
        return pageId ? animation?.pageId === pageId : !animation?.pageId;
      }
      if (!entry.startsWith("site-")) return !pageId;
      const siteSection = pendingSiteSections.find((candidate) => `site-${candidate.id}` === entry);
      return pageId ? siteSection?.pageId === pageId : !siteSection?.pageId;
    });
  }

  function moveContentSectionInPage(sectionKey, direction, selection = activePreviewSelection) {
    const pageOrder = contentOrderForPage(
      sectionKey?.startsWith("site-")
        ? pendingSiteSections.find((entry) => `site-${entry.id}` === sectionKey)?.pageId || null
        : sectionKey?.startsWith("animation-")
          ? pendingAnimations.find((entry) => `animation-${entry.id}` === sectionKey)?.pageId || null
          : null,
    );
    const pageIndex = pageOrder.indexOf(sectionKey);
    const targetKey = pageOrder[pageIndex + (direction < 0 ? -1 : 1)];
    if (!targetKey) return false;
    return movePreviewContentSection(sectionKey, pendingContentOrder.indexOf(targetKey), selection);
  }

  function syncPreviewSectionInspector() {
    const hasArtDirectionDocument = Boolean(pendingSiteDocument && pendingSiteSections.length);
    previewArtDirectionWrapEl.hidden = !hasArtDirectionDocument;
    if (hasArtDirectionDocument && SITE_ART_DIRECTION_PRESETS[pendingSiteDocument.artDirection]) {
      previewArtDirectionEl.value = pendingSiteDocument.artDirection;
    }
    const sectionKey = previewSectionKey(selectedPreviewSection);
    const animation = sectionKey?.startsWith("animation-")
      ? pendingAnimations.find((entry) => `animation-${entry.id}` === sectionKey)
      : null;
    const siteSection = sectionKey?.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === sectionKey)
      : null;
    storeStudioEl.classList.toggle("has-site-selection", Boolean(activePreviewSelection));
    previewSelectedSectionEl.textContent = animation?.name || siteSection?.title || PREVIEW_SECTION_LABELS[selectedPreviewSection] || "Sección";
    const configuredColor = sectionKey ? pendingSectionBackgrounds[sectionKey] : null;
    previewSectionColorEnabledEl.closest(".preview-section-color").hidden = !sectionKey;
    previewSectionPositionEl.closest(".preview-section-position").hidden = !sectionKey;
    previewSectionLockEl.hidden = !siteSection;
    previewSectionLockEl.disabled = !siteSection;
    previewSectionLockEl.setAttribute("aria-pressed", String(Boolean(siteSection && lockedAiSectionIds.has(siteSection.id))));
    previewSectionLockEl.querySelector("span").textContent = siteSection && lockedAiSectionIds.has(siteSection.id)
      ? "Protegida"
      : "Conservar";
    previewSectionLockEl.title = siteSection && lockedAiSectionIds.has(siteSection.id)
      ? "Permitir que Yapi cambie esta sección al regenerar"
      : "Conservar esta sección cuando Yapi regenere el sitio";
    previewSectionColorEnabledEl.disabled = !sectionKey;
    previewSectionColorEnabledEl.checked = !!configuredColor;
    previewSectionColorEl.disabled = !sectionKey || !configuredColor;
    previewSectionColorEl.value = configuredColor || storeBackgroundColorEl.value || "#f8fafc";
    const pageOrder = contentOrderForPage(siteSection?.pageId || null);
    const orderIndex = sectionKey ? pageOrder.indexOf(sectionKey) : -1;
    previewSectionUpEl.disabled = orderIndex <= 0;
    previewSectionDownEl.disabled = orderIndex < 0 || orderIndex >= pageOrder.length - 1;
    previewSectionPositionEl.disabled = orderIndex < 0;
    previewSectionPositionEl.innerHTML = pageOrder.map((entry, index) => {
      const entryAnimation = entry.startsWith("animation-") ? pendingAnimations.find((candidate) => `animation-${candidate.id}` === entry) : null;
      const entrySiteSection = entry.startsWith("site-") ? pendingSiteSections.find((candidate) => `site-${candidate.id}` === entry) : null;
      const entryLabel = entryAnimation?.name || entrySiteSection?.title || STORE_CONTENT_SECTION_COPY[entry]?.[0] || PREVIEW_SECTION_LABELS[entry] || "Sección";
      return `<option value="${pendingContentOrder.indexOf(entry)}" ${index === orderIndex ? "selected" : ""}>${index + 1}. ${esc(entryLabel)}</option>`;
    }).join("");
  }

  function previewOptionsMaximumHeight() {
    const panel = document.querySelector(".store-preview-panel");
    const toolbar = panel?.querySelector(".store-preview-toolbar");
    if (!panel) return 600;
    return Math.max(
      PREVIEW_OPTIONS_MIN_HEIGHT,
      Math.floor(panel.clientHeight - (toolbar?.offsetHeight || 0) - (previewWorkspaceSplitterEl?.offsetHeight || 30) - PREVIEW_STORE_MIN_HEIGHT - 32),
    );
  }

  function syncPreviewWorkspaceSplitter() {
    if (!previewWorkspaceSplitterEl) return;
    const maximum = previewOptionsMaximumHeight();
    const measured = Math.round(previewEditorToolsEl.getBoundingClientRect().height) || PREVIEW_OPTIONS_MIN_HEIGHT;
    const current = Math.max(PREVIEW_OPTIONS_MIN_HEIGHT, Math.min(previewOptionsHeight ?? measured, maximum));
    if (previewOptionsHeight !== null) {
      previewOptionsHeight = current;
      document.querySelector(".store-preview-panel")?.style.setProperty("--preview-options-height", `${current}px`);
    }
    previewWorkspaceSplitterEl.setAttribute("aria-valuemin", String(PREVIEW_OPTIONS_MIN_HEIGHT));
    previewWorkspaceSplitterEl.setAttribute("aria-valuemax", String(maximum));
    previewWorkspaceSplitterEl.setAttribute("aria-valuenow", String(current));
    previewWorkspaceSplitterEl.setAttribute("aria-valuetext", current === 0 ? "Opciones ocultas" : `${current} píxeles para opciones`);
    const stackedMobileLayout = window.matchMedia("(max-width: 760px)").matches;
    const hidden = current === 0 && !stackedMobileLayout;
    storeStudioEl.classList.toggle("is-preview-options-hidden", hidden);
    previewEditorToolsEl.toggleAttribute("inert", hidden);
    if (hidden) previewEditorToolsEl.setAttribute("aria-hidden", "true");
    else previewEditorToolsEl.removeAttribute("aria-hidden");
  }

  function setPreviewOptionsHeight(nextHeight, { persist = false } = {}) {
    const maximum = previewOptionsMaximumHeight();
    previewOptionsHeight = Math.max(PREVIEW_OPTIONS_MIN_HEIGHT, Math.min(Math.round(nextHeight), maximum));
    document.querySelector(".store-preview-panel")?.style.setProperty("--preview-options-height", `${previewOptionsHeight}px`);
    if (persist) {
      try { localStorage.setItem(PREVIEW_OPTIONS_HEIGHT_KEY, String(previewOptionsHeight)); } catch {}
    }
    syncPreviewWorkspaceSplitter();
  }

  function revealPreviewOptionsForSelection() {
    const stackedMobileLayout = window.matchMedia("(max-width: 760px)").matches;
    if (!stackedMobileLayout) return;
    window.requestAnimationFrame(() => {
      const bounds = previewContextEditorEl.getBoundingClientRect();
      const outsideViewport = bounds.top < 8 || bounds.top > window.innerHeight - 96;
      if (!outsideViewport) return;
      previewContextEditorEl.scrollIntoView({
        block: stackedMobileLayout ? "start" : "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });
  }

  function restorePreviewOptionsHeight() {
    let storedHeight = NaN;
    try {
      const storedValue = localStorage.getItem(PREVIEW_OPTIONS_HEIGHT_KEY);
      storedHeight = storedValue === null ? NaN : Number(storedValue);
    } catch {}
    if (Number.isFinite(storedHeight)) {
      previewOptionsHeight = storedHeight;
      setPreviewOptionsHeight(storedHeight);
    } else {
      syncPreviewWorkspaceSplitter();
    }
  }

  function setStorePreviewExpanded(expanded, { preservePosition = true } = {}) {
    const previewPanel = document.querySelector(".store-preview-panel");
    const previewTop = previewPanel?.getBoundingClientRect().top ?? 0;
    const targetPreviewTop = expanded ? 16 : previewTop;
    const changed = storePreviewExpanded !== expanded;
    storePreviewExpanded = expanded;
    storeStudioEl.classList.toggle("is-preview-expanded", expanded);
    previewExpandToggleEl.setAttribute("aria-pressed", String(expanded));
    previewExpandToggleEl.setAttribute("aria-label", expanded ? "Mostrar ajustes avanzados" : "Ocultar ajustes avanzados");
    previewExpandToggleEl.title = expanded ? "Mostrar ajustes avanzados" : "Ocultar ajustes avanzados";
    storeOptionsTabEl.setAttribute("aria-expanded", String(!expanded));
    window.requestAnimationFrame(() => expanded ? restorePreviewOptionsHeight() : syncPreviewWorkspaceSplitter());
    if (!changed || !preservePosition) return;
    window.requestAnimationFrame(() => {
      if (!previewPanel) return;
      const nextPreviewTop = previewPanel.getBoundingClientRect().top;
      if (Math.abs(nextPreviewTop - targetPreviewTop) > 1) {
        window.scrollBy({ top: nextPreviewTop - targetPreviewTop, left: 0, behavior: "auto" });
      }
    });
  }

  previewExpandToggleEl.addEventListener("click", () => setStorePreviewExpanded(!storePreviewExpanded));
  storeOptionsTabEl.addEventListener("click", () => {
    // Advanced settings remain an escape hatch for non-visual configuration.
    const assistant = document.getElementById("visualAssistantToggle");
    if (assistant?.getAttribute("aria-expanded") === "true") assistant.click();
    setStorePreviewExpanded(false);
  });
  previewWorkspaceSplitterEl?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = previewEditorToolsEl.getBoundingClientRect().height;
    previewWorkspaceSplitterEl.classList.add("is-dragging");
    previewWorkspaceSplitterEl.setPointerCapture?.(event.pointerId);
    const move = (moveEvent) => setPreviewOptionsHeight(startHeight + moveEvent.clientY - startY);
    const finish = (finishEvent) => {
      previewWorkspaceSplitterEl.releasePointerCapture?.(finishEvent.pointerId);
      previewWorkspaceSplitterEl.classList.remove("is-dragging");
      previewWorkspaceSplitterEl.removeEventListener("pointermove", move);
      previewWorkspaceSplitterEl.removeEventListener("pointerup", finish);
      previewWorkspaceSplitterEl.removeEventListener("pointercancel", finish);
      setPreviewOptionsHeight(previewOptionsHeight, { persist: true });
    };
    previewWorkspaceSplitterEl.addEventListener("pointermove", move);
    previewWorkspaceSplitterEl.addEventListener("pointerup", finish);
    previewWorkspaceSplitterEl.addEventListener("pointercancel", finish);
  });
  previewWorkspaceSplitterEl?.addEventListener("keydown", (event) => {
    if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const current = previewOptionsHeight ?? previewEditorToolsEl.getBoundingClientRect().height;
    const next = event.key === "Home"
      ? PREVIEW_OPTIONS_MIN_HEIGHT
      : event.key === "End"
        ? previewOptionsMaximumHeight()
        : current + (event.key === "ArrowUp" ? -32 : 32);
    setPreviewOptionsHeight(next, { persist: true });
  });
  window.addEventListener("resize", () => window.requestAnimationFrame(syncPreviewWorkspaceSplitter));
  const previewAiCreateEl = document.getElementById("previewAiCreate");
  const previewAiCreateLabelEl = document.getElementById("previewAiCreateLabel");
  const visualAssistantToggleEl = document.getElementById("visualAssistantToggle");
  function syncVisualAssistantMode({ focus = false } = {}) {
    const expanded = visualAssistantToggleEl?.getAttribute("aria-expanded") === "true";
    storeStudioEl.classList.toggle("is-ai-mode", expanded);
    previewAiCreateEl.setAttribute("aria-pressed", String(expanded));
    previewAiCreateEl.setAttribute("aria-label", expanded ? "Ocultar conversación con Yapi" : "Abrir conversación con Yapi");
    previewAiCreateEl.title = expanded ? "Ocultar conversación con Yapi" : "Abrir conversación con Yapi";
    previewAiCreateLabelEl.textContent = expanded ? "Ocultar Yapi" : "Diseñar con IA";
    if (!expanded) {
      storePreviewEditorEnabled = true;
      leaveVisualProposalPreview();
      previewLiveStatusEl.textContent = lastStores.find(store => store.id === currentStoreId)?.publishedSourceRevision ? "Diseño administrado en YAPI" : "Edición directa";
      syncDirectPreviewSelection();
      postStorePreviewEditorSelection(activePreviewSelection, { reveal: false });
      return;
    }
    // Yapi is a companion to the canvas, not a mutually exclusive mode. The
    // merchant can keep typing to Yapi while editing the live storefront.
    storePreviewEditorEnabled = true;
    postStorePreviewEditorSelection(activePreviewSelection, { reveal: false });
    syncDirectPreviewSelection(activePreviewSelection);
    setStorePreviewExpanded(true);
    syncStoreDraftUi();
    if (focus) {
      const focusTarget = visualStepEls[0].hidden
        ? visualProposalsEl.querySelector(".visual-preview-proposal")
        : document.getElementById("visualCreativeBrief");
      window.setTimeout(() => focusTarget?.focus({ preventScroll: true }), 180);
    }
  }
  previewAiCreateEl.addEventListener("click", () => visualAssistantToggleEl?.click());
  visualAssistantToggleEl?.addEventListener("click", () => syncVisualAssistantMode());
  syncVisualAssistantMode();
  setStorePreviewExpanded(true, { preservePosition: false });

  function setPreviewSectionCurrent(section) {
    selectedPreviewSection = section || "brand";
    let currentTab = null;
    previewEditorToolsEl.querySelectorAll("[data-preview-editor-section]").forEach((button) => {
      if (button.dataset.previewEditorSection === section || (section?.startsWith("animation-") && button.dataset.previewEditorSection === "motion")) {
        button.setAttribute("aria-current", "true");
        currentTab = button;
      } else {
        button.removeAttribute("aria-current");
      }
    });
    if (currentTab) {
      const nav = currentTab.closest(".preview-section-nav");
      nav?.scrollTo({ left: Math.max(0, currentTab.offsetLeft - nav.clientWidth / 2 + currentTab.clientWidth / 2), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }
    syncPreviewSectionInspector();
  }

  function expandEditorTarget(target) {
    if (!(target instanceof Element)) return;
    const editorSection = target.closest(".store-editor-section");
    const editorToggle = editorSection?.querySelector(":scope > .editor-section-head .editor-section-toggle");
    if (editorToggle?.getAttribute("aria-expanded") !== "true") editorToggle?.click();
    const settingsGroup = target.closest(".editor-settings-group");
    const settingsToggle = settingsGroup?.querySelector(":scope > .editor-settings-heading .settings-group-toggle");
    if (settingsToggle?.getAttribute("aria-expanded") !== "true") settingsToggle?.click();
    const animationCard = target.closest(".animation-card");
    if (animationCard) {
      storeAnimationsListEl.querySelectorAll(".animation-card").forEach((card) => {
        if (card !== animationCard) setAnimationCardExpanded(card, false);
      });
      setAnimationCardExpanded(animationCard, true);
    }
  }

  function focusEditorTarget(target, label) {
    if (!(target instanceof HTMLElement)) return;
    setStorePreviewExpanded(false);
    expandEditorTarget(target);
    target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    window.setTimeout(() => {
      if (typeof target.focus === "function") target.focus({ preventScroll: true });
      const pulseTarget = target.closest(".animation-card, .editorial-gallery-row, .store-link-editor-row, .editor-settings-group, .store-editor-section") || target;
      pulseTarget.classList.remove("editor-focus-pulse");
      void pulseTarget.offsetWidth;
      pulseTarget.classList.add("editor-focus-pulse");
      window.setTimeout(() => pulseTarget.classList.remove("editor-focus-pulse"), 950);
    }, 180);
    previewSelectionStatusEl.innerHTML = `<strong>${esc(label || "Parte seleccionada")}.</strong> Ya abrimos su control de edición.`;
  }

  function movePreviewContentSection(sectionKey, toIndex, selection = activePreviewSelection) {
    const fromIndex = sectionKey ? pendingContentOrder.indexOf(sectionKey) : -1;
    if (fromIndex < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= pendingContentOrder.length || fromIndex === toIndex) return false;
    const previousOrder = [...pendingContentOrder];
    const result = storeEditorStateModule.reorderStoreEditorList(pendingContentOrder, fromIndex, toIndex);
    if (!result.changed) return false;
    pendingContentOrder = result.order;
    const [sectionLabel] = storeContentOrderEntryLabel(sectionKey);
    pushStoreEditorUndo(`mover ${sectionLabel}`, () => {
      pendingContentOrder = [...previousOrder];
      renderStoreContentOrderEditor();
      setPreviewSectionCurrent(sectionKey);
      pendingStorePreviewSection = sectionKey;
      pendingStorePreviewAction = sectionKey.startsWith("animation-") ? "motion" : "scroll";
    });
    renderStoreContentOrderEditor();
    setStoreSettingsDirty(true);
    setPreviewSectionCurrent(sectionKey);
    pendingStorePreviewSection = sectionKey;
    pendingStorePreviewAction = sectionKey.startsWith("animation-") ? "motion" : "scroll";
    scheduleStorePreview(0);
    const nextPosition = pendingContentOrder.indexOf(sectionKey) + 1;
    previewSelectionStatusEl.innerHTML = `<strong>${esc(sectionLabel)} movida a la posición ${nextPosition}.</strong> Puedes seguir moviéndola o deshacer el cambio.`;
    if (selection) activePreviewSelection = selection;
    return true;
  }

  function moveSelectedPreviewSection(direction) {
    const sectionKey = previewSectionKey(selectedPreviewSection);
    moveContentSectionInPage(sectionKey, direction);
  }

  previewSectionPositionEl.addEventListener("change", () => {
    const sectionKey = previewSectionKey(selectedPreviewSection);
    const fromIndex = sectionKey ? pendingContentOrder.indexOf(sectionKey) : -1;
    const toIndex = Number(previewSectionPositionEl.value);
    if (fromIndex < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= pendingContentOrder.length || fromIndex === toIndex) return;
    movePreviewContentSection(sectionKey, toIndex);
  });

  previewSectionUpEl.addEventListener("click", () => moveSelectedPreviewSection(-1));
  previewSectionDownEl.addEventListener("click", () => moveSelectedPreviewSection(1));
  previewSectionLockEl.addEventListener("click", async () => {
    const sectionKey = previewSectionKey(selectedPreviewSection);
    const siteSection = sectionKey?.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === sectionKey)
      : null;
    if (!siteSection) return;
    const wasLocked = lockedAiSectionIds.has(siteSection.id);
    if (wasLocked) lockedAiSectionIds.delete(siteSection.id);
    else lockedAiSectionIds.add(siteSection.id);
    saveAiSectionLocks();
    syncPreviewSectionInspector();
    previewSelectionStatusEl.innerHTML = lockedAiSectionIds.has(siteSection.id)
      ? `<strong>${esc(siteSection.title || "Sección")} queda protegida.</strong> La próxima regeneración cambiará todo lo demás.`
      : `<strong>${esc(siteSection.title || "Sección")} vuelve a participar.</strong> La IA podrá recomponerla en la próxima generación.`;
    try {
      await api(`/stores/${currentStoreId}/visual-section-locks`, {
        method: "PUT",
        body: JSON.stringify({ sectionIds: [...lockedAiSectionIds] }),
      });
    } catch (err) {
      if (wasLocked) lockedAiSectionIds.add(siteSection.id);
      else lockedAiSectionIds.delete(siteSection.id);
      saveAiSectionLocks();
      syncPreviewSectionInspector();
      errorEl.textContent = "No se pudo guardar el bloqueo de la sección: " + err.message;
    }
  });
  previewSectionColorEnabledEl.addEventListener("change", () => {
    const sectionKey = previewSectionKey(selectedPreviewSection);
    if (!sectionKey) return;
    if (previewSectionColorEnabledEl.checked) pendingSectionBackgrounds[sectionKey] = previewSectionColorEl.value;
    else delete pendingSectionBackgrounds[sectionKey];
    previewSectionColorEl.disabled = !previewSectionColorEnabledEl.checked;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = selectedPreviewSection;
    pendingStorePreviewAction = selectedPreviewSection.startsWith("animation-") ? "motion" : "scroll";
    scheduleStorePreview(0);
  });
  previewSectionColorEl.addEventListener("input", () => {
    const sectionKey = previewSectionKey(selectedPreviewSection);
    if (!sectionKey || !previewSectionColorEnabledEl.checked) return;
    pendingSectionBackgrounds[sectionKey] = previewSectionColorEl.value;
    setStoreSettingsDirty(true);
    scheduleStorePreview();
  });

  function generatedSiteSectionId(kind) {
    const base = kind === "story" ? "story" : kind === "gallery" ? "gallery" : kind;
    const existing = new Set(pendingSiteSections.map((section) => section.id));
    let suffix = 1;
    let candidate = `${base}-${Date.now().toString(36).slice(-5)}`;
    while (existing.has(candidate)) candidate = `${base}-${Date.now().toString(36).slice(-4)}-${suffix++}`;
    return candidate;
  }

  function createGeneratedSiteSection(kind, pageId = null) {
    if (!pendingSiteDocument) return null;
    const theme = pendingSiteDocument.theme || {};
    const sources = editorialSourceImages().filter((source) => !isVideoUploadUrl(source.imageUrl));
    const presets = {
      story: { title: "Nueva historia", body: "Cuenta aquí una parte de la marca que ayude a entenderla mejor.", ctaLabel: "", layout: "offset", width: "wide", align: "left", motion: "reveal", mediaCount: 1 },
      gallery: { title: "Nueva galería", body: "Elige las imágenes que continúan la historia visual de la marca.", ctaLabel: "", layout: "grid", width: "full", align: "left", motion: "none", mediaCount: 3 },
      contact: { title: "Hablemos", body: "Escríbenos y te responderemos pronto.", ctaLabel: "Enviar mensaje", layout: "split", width: "wide", align: "left", motion: "none", mediaCount: 0 },
      location: { title: "Encuéntranos", body: "Consulta la dirección y los horarios disponibles.", ctaLabel: "", layout: "split", width: "wide", align: "left", motion: "none", mediaCount: 0 },
      links: { title: "Sigue la marca", body: "", ctaLabel: "", layout: "minimal", width: "wide", align: "center", motion: "none", mediaCount: 0 },
      catalog: { title: "Productos seleccionados", body: "Elige qué productos de toda la tienda aparecen en esta página.", ctaLabel: "", layout: "grid", width: "full", align: "left", motion: "none", mediaCount: 0 },
    };
    const preset = presets[kind];
    if (!preset) return null;
    const selectedSources = sources.slice(0, preset.mediaCount);
    const section = {
      id: generatedSiteSectionId(kind),
      ...(pageId ? { pageId } : {}),
      kind,
      title: preset.title,
      body: preset.body,
      ctaLabel: preset.ctaLabel,
      layout: preset.layout,
      width: preset.width,
      align: preset.align,
      motion: preset.motion,
      backgroundColor: /^#[0-9a-f]{6}$/i.test(theme.surfaceColor || "") ? theme.surfaceColor : "#fffaf2",
      textColor: /^#[0-9a-f]{6}$/i.test(theme.textColor || "") ? theme.textColor : "#171717",
      mediaUrls: selectedSources.map((source) => source.imageUrl),
      items: selectedSources.map((source) => ({ title: source.label || "", body: "", mediaUrl: source.imageUrl })),
      ...(kind === "catalog" ? { productIds: [] } : {}),
    };
    pendingSiteSections.push(section);
    pendingSiteDocument.sections = pendingSiteSections;
    renderPreviewSectionTabs();
    return section;
  }

  function insertStoreSectionChoice(choice, insertAfter = null, pageId = null) {
    if (!choice) return;
    const targetPage = pageId
      ? (pendingSiteDocument?.pages || []).find((page) => page.id === pageId)
      : null;
    if (pageId && !targetPage) return;
    if (targetPage && choice === "footer") {
      previewSelectionStatusEl.innerHTML = `<strong>${esc(targetPage.label)}.</strong> El pie de página pertenece a toda la tienda.`;
      return;
    }
    if (choice === "footer") {
      ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
      if (!pendingSiteDocument?.footer) return;
      pendingSiteDocument.footer.enabled = true;
      setStoreSettingsDirty(true);
      pendingStorePreviewSection = "footer";
      pendingStorePreviewAction = "scroll";
      scheduleStorePreview(0);
      selectStorePreviewEditorTarget({ section: "footer", field: "section", label: "Pie de página" });
      previewSelectionStatusEl.innerHTML = "<strong>Pie de página agregado.</strong> Tócalo dentro de la tienda para cambiar sus textos y enlaces.";
      return;
    }
    if (choice.startsWith("animation:")) {
      const type = choice.slice("animation:".length);
      const created = createAnimationSection(type, insertAfter, targetPage?.id || null);
      if (!created) return;
      openCreatedAnimationMediaSetup(created, "La insertamos en el lugar elegido y ya puedes editarla.");
      return;
    }
    const section = choice;
    const siteKind = { about: "story", products: "catalog", gallery: "gallery", links: "links", contact: "contact", location: "location" }[section];
    let authoredSection = siteKind && !targetPage ? pendingSiteSections.find((entry) => entry.kind === siteKind && !entry.pageId) : null;
    if (pendingSiteDocument && siteKind && (Boolean(targetPage) || ["story", "gallery"].includes(siteKind) || !authoredSection)) {
      authoredSection = createGeneratedSiteSection(siteKind, targetPage?.id || null);
    }
    const orderSection = authoredSection ? `site-${authoredSection.id}` : section;
    const moved = placeTopLevelContentSection(orderSection, insertAfter);
    if (section === "links" && pendingStoreLinks.length === 0) document.getElementById("storeLinkAdd").click();
    if (section === "contact" && !storeContactFormEnabledEl.checked) {
      storeContactFormEnabledEl.checked = true;
      syncStoreCustomizationControls();
      setStoreSettingsDirty(true);
      scheduleStorePreview(0);
    }
    if (section === "location" && pendingStoreLocations.length === 0) storeLocationAddEl.click();
    if (moved || authoredSection) {
      renderStoreContentOrderEditor();
      setStoreSettingsDirty(true);
      scheduleStorePreview(0);
    }
    if (authoredSection) {
      selectStorePreviewEditorTarget({ section: orderSection, field: "section", label: authoredSection.title });
      previewSelectionStatusEl.innerHTML = `<strong>${esc(authoredSection.title)} agregada${targetPage ? ` a ${esc(targetPage.label)}` : ""}.</strong> Ya puedes cambiar su contenido, color y posición.`;
      return;
    }
    const fields = { about: "aboutTitle", products: "products", gallery: "galleryTitle", links: "links", contact: "contact", location: "location" };
    selectStorePreviewEditorTarget({ section, field: fields[section], label: PREVIEW_SECTION_LABELS[section] || "sección" });
  }

  previewAddSectionEl.innerHTML = previewSectionInsertionOptions();
  previewAddSectionEl.addEventListener("change", () => {
    const choice = previewAddSectionEl.value;
    const insertAfter = previewSectionKey(selectedPreviewSection);
    previewAddSectionEl.value = "";
    insertStoreSectionChoice(choice, insertAfter, activePreviewPageId);
  });

  function selectStorePreviewEditorTarget(selection, { reveal = true, focus = true } = {}) {
    const section = String(selection?.section || "");
    const field = String(selection?.field || "");
    const label = String(selection?.label || "Parte seleccionada").slice(0, 120);
    const normalizedSelection = {
      section: section || "brand",
      field: field || "section",
      label,
      ...(selection?.itemId ? { itemId: String(selection.itemId) } : {}),
      ...(Number.isInteger(selection?.itemIndex) ? { itemIndex: selection.itemIndex } : {}),
      ...(selection?.animationId ? { animationId: String(selection.animationId) } : {}),
    };
    if (selection?.itemId && lastPaymentLinks.some((product) => product.id === selection.itemId)) {
      setDashboardView("products");
      beginPaymentLinkEdit(lastPaymentLinks.find((product) => product.id === selection.itemId));
      previewSelectionStatusEl.innerHTML = `<strong>${esc(label)}.</strong> El producto está listo para editarse.`;
      return;
    }
    setDashboardView("appearance");
    setStorePreviewExpanded(true);
    setPreviewSectionCurrent(section);
    if (normalizedSelection.animationId) ensureAnimationEditorCategory(normalizedSelection.animationId);
    renderPreviewContextEditor(normalizedSelection, { focus: focus && field !== "section" });
    window.requestAnimationFrame(() => revealPreviewOptionsForSelection());
    const siteCanvasText = section.startsWith("site-") && ["siteTitle", "siteBody", "siteCtaLabel", "siteItemTitle", "siteItemBody", "siteBlockText"].includes(field);
    previewSelectionStatusEl.innerHTML = field === "section"
      ? `<strong>${esc(label)}.</strong> Mueve la sección, cambia su fondo o toca uno de sus elementos.`
      : siteCanvasText
      ? `<strong>${esc(label)}.</strong> Arrástralo para moverlo, haz doble clic para escribir o usa Ctrl+C, Ctrl+V y Ctrl+D.`
      : `<strong>${esc(label)}.</strong> Edítalo arriba sin salir de la vista previa.`;
    // Selecting an element is presentation state, not store data. Updating it
    // directly keeps the current carousel scene and avoids a full iframe redraw.
    postStorePreviewEditorSelection(normalizedSelection, { reveal });
  }

  function storePaletteImageUrls() {
    const productImages = lastPaymentLinks.flatMap((product) => product.imageUrls || []);
    const animationImages = pendingAnimations.flatMap((animation) => animation.media.map((media) => media.imageUrl));
    return [...new Set([
      pendingLogoUrl,
      pendingBannerUrl,
      pendingAboutImageUrl,
      pendingPromotionImageUrl,
      ...pendingHeroSlides.map((slide) => slide.imageUrl),
      ...pendingEditorialGallery.map((image) => image.imageUrl),
      ...animationImages,
      ...productImages,
    ].filter((url) => typeof url === "string" && url && !isVideoUploadUrl(url)))].slice(0, 8);
  }

  function dashboardAssetUrl(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    if (/^(?:data:|blob:|https?:\/\/)/i.test(source)) return source;
    return apiRoot() + (source.startsWith("/") ? source : `/${source}`);
  }

  function palettePixelsForImage(source) {
    return new Promise((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = (pixels) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.onload = null;
        image.onerror = null;
        resolve(pixels);
      };
      const timeout = window.setTimeout(() => {
        image.src = "";
        finish([]);
      }, 3500);
      image.crossOrigin = "anonymous";
      image.decoding = "async";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = 48;
          canvas.height = 48;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) return finish([]);
          context.drawImage(image, 0, 0, 48, 48);
          finish([...context.getImageData(0, 0, 48, 48).data]);
        } catch {
          finish([]);
        }
      };
      image.onerror = () => finish([]);
      image.src = dashboardAssetUrl(source);
    });
  }

  function paletteFromPixelSets(pixelSets) {
    const buckets = new Map();
    pixelSets.forEach((pixels) => {
      for (let index = 0; index < pixels.length; index += 16) {
        const alpha = pixels[index + 3];
        if (alpha < 180) continue;
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const maximum = Math.max(red, green, blue);
        const minimum = Math.min(red, green, blue);
        const luminance = (maximum + minimum) / 2;
        if (luminance < 18 || luminance > 244) continue;
        const key = `${Math.round(red / 24) * 24},${Math.round(green / 24) * 24},${Math.round(blue / 24) * 24}`;
        const bucket = buckets.get(key) || { red: 0, green: 0, blue: 0, count: 0, energy: 0 };
        bucket.red += red;
        bucket.green += green;
        bucket.blue += blue;
        bucket.count += 1;
        bucket.energy += 1 + (maximum - minimum) / 255;
        buckets.set(key, bucket);
      }
    });
    const ranked = [...buckets.values()].sort((left, right) => right.energy - left.energy);
    const selected = [];
    for (const bucket of ranked) {
      const color = [bucket.red, bucket.green, bucket.blue].map((channel) => Math.round(channel / bucket.count));
      if (selected.some((existing) => Math.hypot(existing[0] - color[0], existing[1] - color[1], existing[2] - color[2]) < 58)) continue;
      selected.push(color);
      if (selected.length === 6) break;
    }
    return selected.map((color) => `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`);
  }

  function renderStoreImagePalette(colors) {
    if (!colors.length) {
      storeImagePaletteSwatchesEl.innerHTML = `<span class="store-image-palette-empty">Agrega una foto para crear la paleta</span>`;
      storeImagePaletteStatusEl.textContent = "La paleta se actualizará al subir logo, productos o escenas.";
      return;
    }
    storeImagePaletteStatusEl.textContent = "Toca un color para usarlo en la sección seleccionada.";
    storeImagePaletteSwatchesEl.innerHTML = colors.map((color) => `<button type="button" class="store-image-palette-swatch" style="--palette-color:${color}" data-palette-color="${color}" aria-label="Usar ${color} como color de marca" title="Usar ${color} como color de marca">${color}</button>`).join("");
  }

  async function extractStoreImagePalette(signature, sources) {
    const request = ++storePaletteRequest;
    storeImagePaletteEl.setAttribute("aria-busy", "true");
    storeImagePaletteStatusEl.textContent = "Leyendo los colores dominantes…";
    const pixelSets = await Promise.all(sources.map(palettePixelsForImage));
    if (request !== storePaletteRequest || signature !== storePaletteSourceSignature) return;
    renderStoreImagePalette(paletteFromPixelSets(pixelSets));
    storeImagePaletteEl.setAttribute("aria-busy", "false");
  }

  function scheduleStorePaletteExtraction(delay = 180) {
    const sources = storePaletteImageUrls();
    const signature = sources.join("|");
    if (signature === storePaletteSourceSignature) return;
    storePaletteSourceSignature = signature;
    window.clearTimeout(storePaletteTimer);
    if (!sources.length) {
      storePaletteRequest += 1;
      storeImagePaletteEl.setAttribute("aria-busy", "false");
      renderStoreImagePalette([]);
      return;
    }
    storePaletteTimer = window.setTimeout(() => extractStoreImagePalette(signature, sources), delay);
  }

  storeImagePaletteSwatchesEl.addEventListener("click", (event) => {
    const swatch = event.target.closest("[data-palette-color]");
    if (!swatch) return;
    const sectionKey = previewSectionKey(selectedPreviewSection);
    if (sectionKey) {
      pendingSectionBackgrounds[sectionKey] = swatch.dataset.paletteColor;
      setStoreSettingsDirty(true);
      syncPreviewSectionInspector();
      pendingStorePreviewSection = selectedPreviewSection;
      pendingStorePreviewAction = selectedPreviewSection.startsWith("animation-") ? "motion" : "scroll";
      scheduleStorePreview(0);
      previewSelectionStatusEl.innerHTML = `<strong>${esc(swatch.dataset.paletteColor)}.</strong> Fondo aplicado a ${esc(previewSelectedSectionEl.textContent)}.`;
      return;
    }
    storeAccentToggleEl.checked = true;
    storeAccentColorEl.disabled = false;
    storeAccentColorEl.value = swatch.dataset.paletteColor;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = "brand";
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    selectStorePreviewEditorTarget({ section: "brand", field: "storeAccent", label: `Color de marca ${swatch.dataset.paletteColor}` });
  });

  function syncDirectPreviewSelection(selection = activePreviewSelection) {
    previewEditorToolsEl.hidden = true;
    previewEditorToolsEl.setAttribute("inert", "");
    previewEditorToolsEl.setAttribute("aria-hidden", "true");
    if (selection) selectStorePreviewEditorTarget(selection);
  }

  previewEditorToolsEl.querySelector(".preview-section-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-editor-section]");
    if (!button) return;
    const selection = { section: button.dataset.previewEditorSection, field: button.dataset.previewEditorField, label: button.textContent.trim() };
    selectedPreviewProductId = null;
    renderPreviewProductNavigation();
    selectStorePreviewEditorTarget(selection);
    pendingStorePreviewSection = selection.section === "motion" ? "gallery" : selection.section;
    pendingStorePreviewAction = selection.section === "motion" ? "motion" : "scroll";
    scheduleStorePreview(0);
  });
  previewProductSearchEl.addEventListener("input", renderPreviewProductNavigation);
  previewProductListEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-product-id]");
    if (button) openProductInStorePreview(button.dataset.previewProductId);
  });

  function applyAnimationCanvasLayout(payload) {
    // A drag already updated the iframe in place. Cancel any older debounced
    // patch so it cannot rebuild the canvas with pre-gesture coordinates and
    // make the text appear to snap back.
    clearTimeout(previewPostTimer);
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const animationId = normalized.animationId || (normalized.section.startsWith("animation-") ? normalized.section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    if (!animation) return;
    if (!commitAnimationCommand({
      type: "set-text-layout",
      selection: normalized,
      textPositionX: payload?.textPositionX,
      textPositionY: payload?.textPositionY,
      textScale: payload?.textScale,
      textWidthPercent: payload?.textWidthPercent,
      textAlign: payload?.textAlign,
    }, "mover o redimensionar el texto")) return;
    const nextAnimation = pendingAnimations.find((entry) => entry.id === animationId);
    const textTarget = animationTextTarget(normalized)?.target;
    if (!nextAnimation || !textTarget) return;
    if (!Number.isInteger(normalized.itemIndex) && !normalized.itemId) {
      const card = storeAnimationsListEl.querySelector(`.animation-card[data-animation-id="${CSS.escape(nextAnimation.id)}"]`);
      const syncControl = (key, value) => {
        const control = card?.querySelector(`[data-animation-field="${key}"]`);
        if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return;
        control.value = String(value);
        control.closest(".animation-range-control")?.querySelector("output")?.replaceChildren(`${value}%`);
      };
      syncControl("textScale", textTarget.textScale);
      syncControl("textWidthPercent", textTarget.textWidthPercent);
      if (textTarget.textAlign) syncControl("textAlign", textTarget.textAlign);
    }
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${animation.id}`;
    pendingStorePreviewAction = "motion";
    renderPreviewContextEditor(normalized);
    previewSelectionStatusEl.innerHTML = `<strong>Texto ajustado directamente.</strong> La vista previa se mantiene en su lugar y el cambio está listo para guardar.`;
  }

  function applySiteTextCanvasLayout(payload) {
    clearTimeout(previewPostTimer);
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    if (!commitStoreDocumentCommand({
      type: "set-text-layout",
      selection: normalized,
      textOffsetX: payload?.textOffsetX,
      textOffsetY: payload?.textOffsetY,
      textOffsetBasis: payload?.textOffsetBasis,
      textWidthPercent: payload?.textWidthPercent,
    }, "mover el texto")) return;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = normalized.section;
    pendingStorePreviewAction = "scroll";
    renderPreviewContextEditor(normalized);
    previewSelectionStatusEl.innerHTML = "<strong>Texto movido directamente.</strong> La posición está lista para guardar.";
  }

  function applySiteSectionCanvasHeight(payload) {
    clearTimeout(previewPostTimer);
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const viewport = payload?.viewport === "mobile" ? "mobile" : "desktop";
    const heightPx = payload?.heightPx === null ? null : Number(payload?.heightPx);
    if (!commitStoreDocumentCommand({
      type: "set-section-height",
      selection: normalized,
      viewport,
      heightPx,
    }, "cambiar el alto de la sección")) return;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = normalized.section;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = heightPx === null
      ? `<strong>Alto automático restaurado.</strong> La sección volverá a adaptarse a su contenido en ${viewport === "mobile" ? "móvil" : "escritorio"}.`
      : `<strong>Alto fijado en ${Math.round(heightPx)} px.</strong> El texto ya no hará crecer esta sección en ${viewport === "mobile" ? "móvil" : "escritorio"}.`;
  }

  function moveSiteTextToSection(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const targetSectionId = String(payload?.targetSectionId || "");
    const result = commitStoreDocumentCommand({
      type: "move-site-text-block",
      selection: normalized,
      targetSectionId,
    }, "mover el texto a otra sección");
    if (!result?.createdBlockId || !result.targetSectionId) return;
    const targetSection = pendingSiteSections.find((section) => section.id === result.targetSectionId);
    const nextSelection = {
      section: `site-${result.targetSectionId}`,
      field: "siteBlockText",
      label: normalized.label || "texto movido",
      itemId: result.createdBlockId,
    };
    activePreviewSelection = nextSelection;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = nextSelection.section;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    renderPreviewContextEditor(nextSelection);
    previewSelectionStatusEl.innerHTML = `<strong>Texto movido a ${esc(targetSection?.title || "la sección elegida")}.</strong> Conserva su color, tamaño, ancho y posición independiente.`;
  }

  function applyCanvasTextStyle(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const siteResolved = siteCanvasTextStyleTarget(normalized);
    const key = String(payload?.key || "");
    if (siteResolved) {
      if (!commitStoreDocumentCommand({ type: "set-text-style", selection: normalized, key, value: payload?.value }, "cambiar el estilo del texto")) return;
      setStoreSettingsDirty(true);
      pendingStorePreviewSection = normalized.section;
      pendingStorePreviewAction = "scroll";
      scheduleStorePreview(0);
      previewSelectionStatusEl.innerHTML = "<strong>Estilo actualizado en el lienzo.</strong> También se guardará en esta escena animada.";
      return;
    }
    const resolved = animationTextTarget(normalized);
    if (!resolved) return;
    const result = commitAnimationCommand({ type: "set-text-style", selection: normalized, key, value: payload?.value }, `cambiar ${key === "fontStyle" ? "la tipografía" : key === "textScale" ? "el tamaño" : key === "textColor" ? "el color" : "la alineación"} del texto`);
    if (!result) return;
    const nextResolved = animationTextTarget(normalized);
    const value = nextResolved?.target?.[key];
    postStorePreviewAnimationStyle(resolved.animation.id, key, value, normalized);
    renderAnimationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${resolved.animation.id}`;
    pendingStorePreviewAction = "motion";
    clearTimeout(previewPostTimer);
    previewSelectionStatusEl.innerHTML = "<strong>Estilo actualizado en el lienzo.</strong> El cambio está listo para guardar.";
  }

  function applyCanvasAnimationField(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const animationId = normalized.animationId || (normalized.section.startsWith("animation-") ? normalized.section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    if (!animation) return;
    const key = String(payload?.key || "");
    const scene = Number.isInteger(normalized.itemIndex) ? animation.media[normalized.itemIndex] : null;
    const value = String(payload?.value ?? "");
    const product = key === "productId" && value ? lastPaymentLinks.find((entry) => entry.id === value && entry.status !== "ARCHIVED") : null;
    const productMedia = product ? animationProductMedia(product) : null;
    if (!commitAnimationCommand({
      type: "set-field",
      selection: normalized,
      key,
      value,
      allowed: key !== "productId" || !value || Boolean(product),
      productMedia,
      maxMedia: animationMediaRequirement(animation.type).max,
    }, `editar ${scene ? `la escena ${normalized.itemIndex + 1}` : "la animación"}`)) return;
    const nextAnimation = pendingAnimations.find((entry) => entry.id === animation.id);
    const appliedTarget = scene ? nextAnimation?.media?.[normalized.itemIndex] : nextAnimation;
    const appliedValue = String(appliedTarget?.[key] ?? "");
    renderAnimationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${animation.id}`;
    pendingStorePreviewAction = "motion";
    if (["title", "subtitle"].includes(key)) {
      const directSelection = {
        ...normalized,
        field: scene ? key : key === "title" ? "animationTitle" : "animationSubtitle",
      };
      postStorePreviewEditorText(directSelection, appliedValue);
      clearTimeout(previewPostTimer);
    } else {
      scheduleStorePreview(0);
    }
    previewSelectionStatusEl.innerHTML = `<strong>${scene ? `Escena ${normalized.itemIndex + 1}` : "Animación"} actualizada.</strong> El cambio está listo para guardar.`;
  }

  function applyCanvasSiteField(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const sectionKey = String(normalized.section || "");
    if (!sectionKey.startsWith("site-")) return;
    const key = String(payload?.key || "");
    const item = Number.isInteger(normalized.itemIndex);
    if (!commitStoreDocumentCommand({ type: "set-section-field", selection: normalized, key, value: payload?.value }, "editar la sección animada")) return;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = sectionKey;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = `<strong>${item ? `Escena ${normalized.itemIndex + 1}` : "Sección"} actualizada.</strong> El cambio está listo para guardar.`;
  }

  function applyCanvasSiteProducts(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const sectionId = normalized.section.startsWith("site-") ? normalized.section.slice("site-".length) : "";
    const section = pendingSiteSections.find((entry) => entry.id === sectionId && entry.kind === "catalog");
    const productId = String(payload?.productId || "");
    const product = lastPaymentLinks.find((entry) => entry.id === productId && entry.status !== "ARCHIVED");
    if (!section || !product) return;
    const activeProductIds = lastPaymentLinks.filter((entry) => entry.status !== "ARCHIVED").map((entry) => entry.id);
    const recoverGeneratedPrimaryCatalog = Array.isArray(section.productIds)
      && section.productIds.length === 0
      && !section.pageId
      && (pendingSiteDocument?.merchandising?.productOrderIds?.length || 0) > 0;
    const previousIds = [...new Set(Array.isArray(section.productIds) && !recoverGeneratedPrimaryCatalog
      ? section.productIds
      : activeProductIds)];
    const nextIds = [...previousIds];
    const currentIndex = nextIds.indexOf(productId);
    const action = String(payload?.action || "");
    let undoLabel = "elegir productos de la sección";
    if (action === "toggle") {
      if (payload?.selected === true && currentIndex < 0) nextIds.push(productId);
      else if (payload?.selected !== true && currentIndex >= 0) nextIds.splice(currentIndex, 1);
      else return;
    } else if (action === "move") {
      const direction = Number(payload?.direction) < 0 ? -1 : 1;
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= nextIds.length) return;
      [nextIds[currentIndex], nextIds[targetIndex]] = [nextIds[targetIndex], nextIds[currentIndex]];
      undoLabel = "ordenar productos de la sección";
    } else {
      return;
    }
    pushStoreEditorUndo(undoLabel, () => {
      const target = pendingSiteSections.find((entry) => entry.id === sectionId);
      if (target) target.productIds = [...previousIds];
      if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
      pendingStorePreviewSection = normalized.section;
      pendingStorePreviewAction = "scroll";
    });
    section.productIds = nextIds;
    if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
    storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    syncStoreDraftUi();
    setStoreSettingsDirty(true);
    activePreviewSelection = { section: normalized.section, field: "section", label: section.title || "Productos" };
    pendingStorePreviewSection = normalized.section;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = `<strong>Productos actualizados.</strong> ${nextIds.length} ${nextIds.length === 1 ? "producto aparecerá" : "productos aparecerán"} en esta sección.`;
  }

  function applyCanvasAnnouncementStyle(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    if (normalized.section !== "announcement") return;
    const controls = {
      announcementMode: storeAnnouncementModeEl,
      announcementSpeed: storeAnnouncementSpeedEl,
      announcementSize: storeAnnouncementSizeEl,
      announcementColor: storeAnnouncementColorEl,
      announcementFont: storeAnnouncementFontEl,
      announcementEffect: storeAnnouncementEffectEl,
    };
    const key = String(payload?.key || "");
    const control = controls[key];
    if (!control) return;
    let value = payload?.value;
    if (key === "announcementMode" && !["static", "marquee"].includes(value)) return;
    if (key === "announcementSize" && !["small", "medium", "large"].includes(value)) return;
    if (key === "announcementFont" && !["store", ...STORE_FONT_STYLES].includes(value)) return;
    if (key === "announcementEffect" && !["none", "wave", "pulse", "sparkle"].includes(value)) return;
    if (key === "announcementColor" && !/^#[0-9a-f]{6}$/i.test(String(value))) return;
    if (key === "announcementSpeed") {
      value = Math.min(40, Math.max(8, Math.round(Number(value))));
      if (!Number.isFinite(value)) return;
    }
    const previous = { value: control.value, checked: false };
    if (String(value) === control.value) return;
    pushStoreEditorUndo("cambiar la marquesina", () => restoreStoreEditorControl(control.id, previous));
    control.value = String(value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = "announcement";
    scheduleStorePreview(0);
    renderPreviewContextEditor(normalized);
    previewSelectionStatusEl.innerHTML = "<strong>Marquesina actualizada.</strong> El cambio está listo para guardar.";
  }

  function removeCanvasAnnouncement(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    if (normalized.section !== "announcement" || !storeAnnouncementInputEl.value) return;
    const previous = { value: storeAnnouncementInputEl.value, checked: false };
    pushStoreEditorUndo("quitar la marquesina", () => restoreStoreEditorControl(storeAnnouncementInputEl.id, previous));
    storeAnnouncementInputEl.value = "";
    storeAnnouncementInputEl.dispatchEvent(new Event("input", { bubbles: true }));
    storeAnnouncementInputEl.dispatchEvent(new Event("change", { bubbles: true }));
    setStoreSettingsDirty(true);
    activePreviewSelection = null;
    setPreviewSectionCurrent("announcement");
    scheduleStorePreviewInPlace();
    renderPreviewContextEditor(null);
    previewSelectionStatusEl.innerHTML = "<strong>Marquesina quitada.</strong> Puedes deshacer este cambio antes de guardar.";
  }

  function addCanvasText(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    if (normalized.section.startsWith("site-")) {
      const kind = payload?.role === "subtitle" ? "text" : "heading";
      duplicateSiteCanvasText(normalized, {
        sourceId: null,
        kind,
        role: kind === "text" ? "supporting" : "primary",
        text: kind === "heading" ? "Escribe aquí tu título" : "Escribe aquí tu texto",
        style: { fontStyle: storeFontStyleEl.value, textScale: kind === "heading" ? 100 : 82 },
      }, { inserted: true });
      return;
    }
    const animationId = normalized.animationId || (normalized.section.startsWith("animation-") ? normalized.section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    if (!animation) return;
    const role = payload?.role === "subtitle" ? "subtitle" : "title";
    if ((animation.textBlocks || []).length >= 24) {
      previewSelectionStatusEl.textContent = "Esta sección ya tiene el máximo de 24 textos adicionales.";
      return;
    }
    const result = commitAnimationCommand({ type: "add-text-block", animationId, role, defaultFontStyle: storeFontStyleEl.value }, `agregar ${role === "title" ? "un título" : "un subtítulo"}`);
    if (!result?.createdBlockId) return;
    const block = pendingAnimations.find((entry) => entry.id === animationId)?.textBlocks?.find((entry) => entry.id === result.createdBlockId);
    if (!block) return;
    renderAnimationsEditor();
    setStoreSettingsDirty(true);
    activePreviewSelection = { section: `animation-${animation.id}`, field: "textBlock", label: role === "title" ? "título adicional" : "subtítulo adicional", animationId: animation.id, itemId: block.id };
    pendingStorePreviewSection = `animation-${animation.id}`;
    pendingStorePreviewAction = "motion";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = `<strong>${role === "title" ? "Título" : "Subtítulo"} agregado.</strong> Tócalo para escribir, moverlo o cambiar su estilo.`;
  }

  function duplicateSiteCanvasText(selection, source = null, { inserted = false } = {}) {
    const normalized = prepareInlinePreviewSelection(selection);
    const siteSource = source || siteTextClipboardSource(normalized);
    if (!siteSource) return false;
    const result = commitStoreDocumentCommand({
      type: "duplicate-site-text-block",
      selection: normalized,
      source: siteSource,
    }, inserted ? "agregar texto a la sección" : `duplicar ${normalized.label}`);
    if (!result?.createdBlockId) return false;
    const nextSelection = {
      section: normalized.section,
      field: "siteBlockText",
      label: siteSource.kind === "heading" ? inserted ? "título nuevo" : "título duplicado" : siteSource.kind === "action" ? inserted ? "botón nuevo" : "botón duplicado" : inserted ? "texto nuevo" : "texto duplicado",
      itemId: result.createdBlockId,
    };
    activePreviewSelection = nextSelection;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = normalized.section;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    renderPreviewContextEditor(nextSelection);
    previewSelectionStatusEl.innerHTML = inserted
      ? "<strong>Texto agregado.</strong> Arrástralo sobre la galería o animación y haz doble clic para escribir."
      : "<strong>Texto duplicado.</strong> Arrastra la copia para colocarla y haz doble clic para editarla.";
    return true;
  }

  function duplicateCanvasText(selection) {
    if (String(selection?.section || "").startsWith("site-")) {
      duplicateSiteCanvasText(selection);
      return;
    }
    if (!copyAnimationText(selection)) return;
    pasteAnimationText(selection);
  }

  function deleteCanvasText(selection) {
    const normalized = prepareInlinePreviewSelection(selection);
    if (String(normalized.section || "").startsWith("site-")) {
      if (!commitStoreDocumentCommand({ type: "delete-site-text", selection: normalized }, "eliminar un texto")) return;
      activePreviewSelection = { section: normalized.section, field: "section", label: "sección" };
      setStoreSettingsDirty(true);
      pendingStorePreviewSection = normalized.section;
      pendingStorePreviewAction = "scroll";
      scheduleStorePreview(0);
      renderPreviewContextEditor(activePreviewSelection);
      previewSelectionStatusEl.innerHTML = "<strong>Texto eliminado.</strong> Puedes deshacer el cambio desde la barra superior.";
      return;
    }
    const resolved = animationTextTarget(normalized);
    if (!resolved?.block) return;
    if (!commitAnimationCommand({ type: "delete-text-block", animationId: resolved.animation.id, blockId: resolved.block.id }, "eliminar un texto")) return;
    activePreviewSelection = { section: `animation-${resolved.animation.id}`, field: "section", label: resolved.animation.name, animationId: resolved.animation.id };
    renderAnimationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${resolved.animation.id}`;
    pendingStorePreviewAction = "motion";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = "<strong>Texto eliminado.</strong> Puedes deshacer el cambio desde la barra superior.";
  }

  function applyCanvasSectionStyle(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const animationId = normalized.animationId || (normalized.section.startsWith("animation-") ? normalized.section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    const value = String(payload?.value || "");
    if (!animation || payload?.key !== "backgroundColor" || !/^#[0-9a-f]{6}$/i.test(value)) return;
    if (!commitAnimationCommand({ type: "set-field", animationId, key: "backgroundColor", value }, "cambiar el fondo de la sección")) return;
    renderAnimationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${animation.id}`;
    pendingStorePreviewAction = "motion";
    scheduleStorePreview(0);
  }

  function moveCanvasSection(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const key = normalized.animationId ? `animation-${normalized.animationId}` : normalized.section;
    if (!pendingContentOrder.includes(key)) return;
    const targetKey = typeof payload?.targetKey === "string" ? payload.targetKey : "";
    if (targetKey && contentOrderForPage(
      key.startsWith("site-")
        ? pendingSiteSections.find((entry) => `site-${entry.id}` === key)?.pageId || null
        : key.startsWith("animation-")
          ? pendingAnimations.find((entry) => `animation-${entry.id}` === key)?.pageId || null
          : null,
    ).includes(targetKey)) {
      movePreviewContentSection(key, pendingContentOrder.indexOf(targetKey), normalized);
      return;
    }
    moveContentSectionInPage(key, Number(payload?.direction) < 0 ? -1 : 1, normalized);
  }

  function applyAnimationButtonCanvasLayout(payload) {
    const normalized = prepareInlinePreviewSelection(payload?.selection);
    const animationId = normalized.animationId || (normalized.section.startsWith("animation-") ? normalized.section.slice("animation-".length) : "");
    const animation = pendingAnimations.find((entry) => entry.id === animationId);
    if (!animation) return;
    if (!commitAnimationCommand({ type: "set-button-layout", animationId, buttonPositionX: payload?.buttonPositionX, buttonPositionY: payload?.buttonPositionY }, "mover el botón")) return;
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = `animation-${animation.id}`;
    pendingStorePreviewAction = "motion";
    renderPreviewContextEditor({ ...normalized, field: "buttonLabel", label: "botón de la animación" });
    previewSelectionStatusEl.innerHTML = `<strong>Botón movido.</strong> La nueva posición está lista para guardar.`;
  }

  function applyInlineLocationMap(payload) {
    const locationId = typeof payload?.locationId === "string" ? payload.locationId : "";
    const location = pendingStoreLocations.find((entry) => entry.id === locationId);
    if (!location) return;
    const mapEmbedUrl = normalizedStoreLocationMapUrl(payload?.mapEmbedUrl) || "";
    if (!isSupportedStoreLocationMapUrl(mapEmbedUrl)) {
      previewSelectionStatusEl.textContent = "Ese mapa no es válido. Pega el código de inserción de Google Maps u OpenStreetMap.";
      return;
    }
    const previous = String(location.mapEmbedUrl || "");
    if (previous === mapEmbedUrl) return;
    pushStoreEditorUndo(mapEmbedUrl ? "insertar el mapa" : "quitar el mapa", () => {
      const target = pendingStoreLocations.find((entry) => entry.id === locationId);
      if (!target) return;
      target.mapEmbedUrl = previous;
      renderStoreLocationsEditor();
      pendingStorePreviewSection = "location";
    });
    location.mapEmbedUrl = mapEmbedUrl;
    renderStoreLocationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = "location";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = mapEmbedUrl
      ? `<strong>Mapa insertado.</strong> Ya aparece dentro de esta ubicación.`
      : `<strong>Mapa quitado.</strong> Puedes deshacer el cambio desde la barra de la vista previa.`;
  }

  function deleteInlineLocation(payload) {
    const locationId = typeof payload?.locationId === "string" ? payload.locationId : "";
    const index = pendingStoreLocations.findIndex((entry) => entry.id === locationId);
    if (index < 0) return;
    lastPaymentLinks.filter((product) => product.status !== "ARCHIVED").forEach((product) => websiteInventoryEditedIds.add(product.id));
    const snapshot = JSON.parse(JSON.stringify(pendingStoreLocations[index]));
    pushStoreEditorUndo("eliminar la ubicación", () => {
      if (pendingStoreLocations.some((entry) => entry.id === snapshot.id)) return;
      pendingStoreLocations.splice(Math.min(index, pendingStoreLocations.length), 0, JSON.parse(JSON.stringify(snapshot)));
      renderStoreLocationsEditor();
      pendingStorePreviewSection = "location";
    });
    pendingStoreLocations.splice(index, 1);
    renderStoreLocationsEditor();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = "location";
    scheduleStorePreview(0);
    previewSelectionStatusEl.innerHTML = `<strong>Ubicación eliminada.</strong> Puedes deshacer el cambio desde la barra de la vista previa.`;
  }

  function deleteCanvasSection(payload) {
    const selection = prepareInlinePreviewSelection(payload?.selection);
    if (!pendingSiteDocument || !selection.section.startsWith("site-")) return;
    const sectionId = selection.section.slice("site-".length);
    const sectionIndex = pendingSiteSections.findIndex((entry) => entry.id === sectionId);
    const section = pendingSiteSections[sectionIndex];
    if (!section) return;
    const previousDocument = structuredClone(pendingSiteDocument);
    const previousContentOrder = [...pendingContentOrder];
    const previousBackgrounds = structuredClone(pendingSectionBackgrounds);
    const previousLocks = new Set(lockedAiSectionIds);
    const result = storeEditorStateModule.applyStoreDocumentCommand(pendingSiteDocument, { type: "delete-section", selection });
    if (!result.changed || !result.document) return;
    const nextSections = result.document.sections || [];
    const nextSection = nextSections[Math.min(sectionIndex, Math.max(0, nextSections.length - 1))];
    const nextKey = nextSection ? `site-${nextSection.id}` : "motion";
    pushStoreEditorUndo("eliminar la sección", () => {
      pendingSiteDocument = structuredClone(previousDocument);
      pendingSiteSections = pendingSiteDocument.sections || [];
      pendingContentOrder = [...previousContentOrder];
      pendingSectionBackgrounds = structuredClone(previousBackgrounds);
      lockedAiSectionIds = new Set(previousLocks);
      renderPreviewSectionTabs();
      renderStoreContentOrderEditor();
      pendingStorePreviewSection = selection.section;
      pendingStorePreviewAction = "scroll";
    });
    pendingSiteDocument = result.document;
    pendingSiteSections = nextSections;
    pendingContentOrder = pendingContentOrder.filter((key) => key !== selection.section);
    delete pendingSectionBackgrounds[selection.section];
    lockedAiSectionIds.delete(sectionId);
    activePreviewSelection = nextSection
      ? { section: nextKey, field: "section", label: nextSection.title || "Sección" }
      : { section: "motion", field: "animations", label: "Animaciones" };
    renderPreviewSectionTabs();
    renderStoreContentOrderEditor();
    setPreviewSectionCurrent(nextKey);
    storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    syncStoreDraftUi();
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = nextKey;
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = `<strong>${esc(section.title || "Sección")} eliminada.</strong> Puedes recuperarla con Deshacer.`;
  }

  function deleteInlineAnimation(payload) {
    const animationId = typeof payload?.animationId === "string" ? payload.animationId : "";
    const index = pendingAnimations.findIndex((entry) => entry.id === animationId);
    if (index < 0) return;
    const snapshot = animationUndoSnapshot(pendingAnimations[index]);
    const contentOrderSnapshot = [...pendingContentOrder];
    const backgroundKey = `animation-${animationId}`;
    const hadBackground = Object.prototype.hasOwnProperty.call(pendingSectionBackgrounds, backgroundKey);
    const backgroundSnapshot = pendingSectionBackgrounds[backgroundKey];
    if (!commitAnimationCommand({ type: "delete-animation", animationId }, "", { recordUndo: false })) return;
    pushStoreEditorUndo("eliminar la animación", () => {
      if (!pendingAnimations.some((entry) => entry.id === animationId)) {
        pendingAnimations = [
          ...pendingAnimations.slice(0, Math.min(index, pendingAnimations.length)),
          animationUndoSnapshot(snapshot),
          ...pendingAnimations.slice(Math.min(index, pendingAnimations.length)),
        ];
      }
      pendingContentOrder = [...contentOrderSnapshot];
      if (hadBackground) pendingSectionBackgrounds[backgroundKey] = backgroundSnapshot;
      else delete pendingSectionBackgrounds[backgroundKey];
      renderAnimationsEditor();
      renderStoreContentOrderEditor();
      pendingStorePreviewSection = backgroundKey;
      pendingStorePreviewAction = "motion";
    });
    delete pendingSectionBackgrounds[backgroundKey];
    activePreviewSelection = { section: "motion", field: "animations", label: "Animaciones" };
    renderAnimationsEditor();
    commitAnimationStructureChange();
    setPreviewSectionCurrent("motion");
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = `<strong>Animación eliminada.</strong> Puedes deshacer el cambio desde la barra de la vista previa.`;
  }

  function applyCanvasFooterField(payload) {
    const selection = prepareInlinePreviewSelection(payload?.selection || { section: "footer", field: "section", label: "Pie de página" });
    ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
    const footer = pendingSiteDocument?.footer;
    if (!footer) return;
    const key = String(payload?.key || "");
    const value = payload?.value;
    if (key === "enabled") {
      footer.enabled = value !== false;
    } else if (key === "brandDescription") {
      footer.brandDescription = boundedSiteSectionText(value, 320);
    } else if (key === "copyright") {
      footer.copyright = boundedSiteSectionText(value, 160);
    } else if (key === "badge") {
      footer.badge = boundedSiteSectionText(value, 80);
    } else if (key === "columnTitle" && Number.isInteger(selection.itemIndex)) {
      const column = footer.columns?.[selection.itemIndex];
      if (!column) return;
      column.title = boundedSiteSectionText(value, 60);
    } else if (["itemLabel", "itemHref"].includes(key) && selection.itemId) {
      const [columnIndex, itemIndex] = selection.itemId.split(":").map(Number);
      const item = footer.columns?.[columnIndex]?.items?.[itemIndex];
      if (!item) return;
      if (key === "itemLabel") item.label = boundedSiteSectionText(value, 100);
      else item.href = String(value || "").trim().slice(0, 500);
    } else {
      return;
    }
    setStoreSettingsDirty(true);
    scheduleStorePreviewInPlace();
    renderPreviewContextEditor(selection);
    previewSelectionStatusEl.innerHTML = footer.enabled
      ? "<strong>Pie de página actualizado.</strong> El cambio está listo para guardar."
      : "<strong>Pie de página oculto.</strong> Puedes recuperarlo desde cualquier botón + de la tienda.";
  }

  function applyCanvasNavigationStyle(payload) {
    ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
    const navigation = pendingSiteDocument?.navigation;
    if (!navigation) return;
    const key = String(payload?.key || "");
    const allowed = {
      barStyle: ["floating", "square", "full"],
      logoTreatment: ["mark", "wordmark", "oversized", "seal"],
      brandPosition: ["left", "center", "right"],
      navPosition: ["left", "center", "right"],
      searchPosition: ["left", "right"],
      profilePosition: ["left", "right"],
      cartPosition: ["left", "right"],
    };
    let value = payload?.value;
    if (key === "sticky" || key === "transparent") value = value === true;
    else if (!allowed[key]?.includes(value)) return;
    if (navigation[key] === value) return;
    navigation[key] = value;
    setStoreSettingsDirty(true);
    activePreviewSelection = { section: "navigation", field: "section", label: "Encabezado" };
    setPreviewSectionCurrent("navigation");
    scheduleStorePreviewInPlace();
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = "<strong>Encabezado actualizado.</strong> Sigue ajustándolo en la vista previa o guarda cuando esté listo.";
  }

  function applyCanvasNavigationField(payload) {
    ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
    const navigationItems = pendingSiteDocument?.navigation?.items;
    if (!navigationItems) return;
    const action = String(payload?.action || "");
    const index = Number(payload?.index);
    if (action === "add") {
      if (navigationItems.length >= 8) return;
      const used = new Set(navigationItems.map((item) => item.id));
      let number = 1;
      while (used.has(`nav-${number}`)) number += 1;
      const candidate = pendingSiteSections.find((section) => !navigationItems.some((item) => item.sectionId === section.id));
      navigationItems.push(candidate
        ? { id: `nav-${number}`, label: boundedSiteSectionText(candidate.title || SITE_SECTION_TAB_LABELS[candidate.kind] || "Sección", 40), target: "section", sectionId: candidate.id }
        : { id: `nav-${number}`, label: "Nuevo enlace", target: "home" });
    } else if (action === "remove") {
      if (!Number.isInteger(index) || index < 0 || index >= navigationItems.length) return;
      navigationItems.splice(index, 1);
    } else if (action === "update") {
      if (!Number.isInteger(index) || index < 0 || index >= navigationItems.length) return;
      const item = navigationItems[index];
      const key = String(payload?.key || "");
      if (key === "label") {
        item.label = boundedSiteSectionText(payload?.value, 40) || "Enlace";
      } else if (key === "target") {
        const value = String(payload?.value || "");
        if (value === "home" || value === "catalog") {
          item.target = value;
          delete item.sectionId;
          delete item.pageId;
        } else if (value.startsWith("page:")) {
          const pageId = value.slice("page:".length);
          if (!(pendingSiteDocument?.pages || []).some((page) => page.id === pageId)) return;
          item.target = "page";
          item.pageId = pageId;
          delete item.sectionId;
        } else if (value.startsWith("section:")) {
          const sectionId = value.slice("section:".length);
          if (!pendingSiteSections.some((section) => section.id === sectionId)) return;
          item.target = "section";
          item.sectionId = sectionId;
          delete item.pageId;
        } else {
          return;
        }
      } else {
        return;
      }
    } else {
      return;
    }
    setStoreSettingsDirty(true);
    activePreviewSelection = { section: "navigation", field: "section", label: "Navegación superior" };
    setPreviewSectionCurrent("navigation");
    scheduleStorePreviewInPlace();
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = "<strong>Navegación actualizada.</strong> Los enlaces y sus destinos están listos para guardar.";
  }

  function applyCanvasCollectionField(payload) {
    ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
    if (!pendingSiteDocument) return;
    const collections = storefrontCollections().map((collection) => ({
      ...collection,
      productIds: [...new Set(collection.productIds || [])],
    }));
    const action = String(payload?.action || "");
    const index = Number(payload?.index);
    let undoLabel = "editar el menú de colecciones";
    if (action === "add") {
      if (collections.length >= 12) return;
      const usedIds = new Set(collections.map((collection) => collection.id));
      let number = collections.length + 1;
      while (usedIds.has(`coleccion-${number}`)) number += 1;
      collections.push({ id: `coleccion-${number}`, name: `Colección ${number}`, productIds: [] });
      const navigationItems = pendingSiteDocument.navigation?.items || [];
      let catalogItem = navigationItems.find((item) => item.target === "catalog");
      if (!catalogItem && navigationItems.length < 8) {
        catalogItem = { id: `nav-collections-${number}`.slice(0, 48), label: "Colecciones", target: "catalog" };
        navigationItems.push(catalogItem);
      } else if (catalogItem && /^(catálogo|catalogo|tienda)$/i.test(String(catalogItem.label || "").trim())) {
        catalogItem.label = "Colecciones";
      }
      undoLabel = "crear una colección";
    } else if (action === "remove") {
      if (!Number.isInteger(index) || index < 0 || index >= collections.length) return;
      collections.splice(index, 1);
      undoLabel = "quitar una colección";
    } else if (action === "rename") {
      if (!Number.isInteger(index) || index < 0 || index >= collections.length) return;
      collections[index].name = boundedSiteSectionText(payload?.value, 60) || `Colección ${index + 1}`;
      undoLabel = "renombrar una colección";
    } else if (action === "product") {
      if (!Number.isInteger(index) || index < 0 || index >= collections.length) return;
      const productId = String(payload?.productId || "");
      if (!lastPaymentLinks.some((product) => product.id === productId)) return;
      const productIds = new Set(collections[index].productIds);
      if (payload?.selected === true) productIds.add(productId);
      else productIds.delete(productId);
      collections[index].productIds = [...productIds];
      undoLabel = "asignar productos a una colección";
    } else {
      return;
    }
    const menuStyle = pendingSiteDocument.merchandising?.collectionMenuStyle || "tabs";
    if (!updateStorefrontCollections(collections, menuStyle, undoLabel)) return;
    activePreviewSelection = { section: "navigation", field: "section", label: "Encabezado" };
    setPreviewSectionCurrent("navigation");
    pendingStorePreviewSection = "navigation";
    pendingStorePreviewAction = "select";
    scheduleStorePreview(0);
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = "<strong>Menú de colecciones actualizado.</strong> Pasa el cursor por “Colecciones” en la cabecera para comprobarlo.";
  }

  function applyCanvasFooterStructure(payload) {
    ensureSiteChromeDraft(lastStores.find((store) => store.id === currentStoreId) || {});
    const footer = pendingSiteDocument?.footer;
    if (!footer) return;
    const action = String(payload?.action || "");
    const columnIndex = Number(payload?.columnIndex);
    const itemIndex = Number(payload?.itemIndex);
    if (action === "add-column") {
      if (footer.columns.length >= 4) return;
      const used = new Set(footer.columns.map((column) => column.id));
      let number = 1;
      while (used.has(`column-${number}`)) number += 1;
      footer.columns.push({ id: `column-${number}`, title: "Nueva columna", items: [{ id: "item-1", label: "Nuevo enlace", href: "" }] });
    } else if (action === "remove-column") {
      if (!Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= footer.columns.length) return;
      footer.columns.splice(columnIndex, 1);
    } else if (action === "add-item") {
      const column = footer.columns[columnIndex];
      if (!column || column.items.length >= 8) return;
      const used = new Set(column.items.map((item) => item.id));
      let number = 1;
      while (used.has(`item-${number}`)) number += 1;
      column.items.push({ id: `item-${number}`, label: "Nuevo enlace", href: "" });
    } else if (action === "remove-item") {
      const column = footer.columns[columnIndex];
      if (!column || !Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= column.items.length) return;
      column.items.splice(itemIndex, 1);
    } else {
      return;
    }
    setStoreSettingsDirty(true);
    activePreviewSelection = { section: "footer", field: "section", label: "Pie de página" };
    setPreviewSectionCurrent("footer");
    scheduleStorePreviewInPlace();
    renderPreviewContextEditor(activePreviewSelection);
    previewSelectionStatusEl.innerHTML = "<strong>Pie de página actualizado.</strong> El cambio está listo para guardar.";
  }

  function postPreviewBuilderResult(requestId, result) {
    if (!storePreviewFrameEl.contentWindow || !requestId) return;
    let targetOrigin = "*";
    try { targetOrigin = new URL(storePreviewFrameEl.src).origin; } catch { /* preview error is already visible */ }
    storePreviewFrameEl.contentWindow.postMessage({ type: "PAGOSYA_PREVIEW_BUILDER_RESULT", requestId, ...result }, targetOrigin);
  }

  function validPreviewBuilderImage(file) {
    return file instanceof File
      && ["image/png", "image/jpeg", "image/webp"].includes(file.type)
      && file.size <= MAX_IMAGE_BYTES;
  }

  async function createCategoryFromPreview(payload) {
    const requestId = String(payload?.requestId || "");
    const name = String(payload?.name || "").trim().slice(0, 60);
    const file = payload?.image;
    if (!name) return postPreviewBuilderResult(requestId, { ok: false, error: "Escribe un nombre para la categoría.", submitLabel: "Crear categoría" });
    if (file && !validPreviewBuilderImage(file)) return postPreviewBuilderResult(requestId, { ok: false, error: file.size > MAX_IMAGE_BYTES ? "La imagen supera el máximo de 8 MB." : "Usa una imagen PNG, JPEG o WEBP.", submitLabel: "Crear categoría" });
    try {
      let category = await api(`/stores/${currentStoreId}/categories`, { method: "POST", body: JSON.stringify({ name }) });
      if (file) {
        const bannerUrl = await uploadFile(file);
        category = await api(`/stores/${currentStoreId}/categories/${encodeURIComponent(category.id)}`, { method: "PATCH", body: JSON.stringify({ bannerUrl }) });
      }
      renderCategoryRows([...lastCategories, category]);
      infoEl.textContent = `Categoría "${category.name}" agregada desde la vista previa.`;
      postPreviewBuilderResult(requestId, { ok: true });
      refreshStorePreview(true);
    } catch (error) {
      postPreviewBuilderResult(requestId, { ok: false, error: `No pudimos crear la categoría: ${error.message}`, submitLabel: "Crear categoría" });
    }
  }

  async function createProductFromPreview(payload) {
    const requestId = String(payload?.requestId || "");
    const name = String(payload?.name || "").trim().slice(0, 120);
    const description = String(payload?.description || "").trim().slice(0, 500);
    const amountBob = Number.parseFloat(String(payload?.price || "").replace(",", "."));
    const categoryId = payload?.categoryId && lastCategories.some((category) => category.id === payload.categoryId) ? payload.categoryId : null;
    const file = payload?.image;
    if (!name) return postPreviewBuilderResult(requestId, { ok: false, error: "Escribe un nombre para el producto.", submitLabel: "Crear producto" });
    if (!Number.isFinite(amountBob) || amountBob < 0) return postPreviewBuilderResult(requestId, { ok: false, error: "Ingresa un precio válido de 0 o mayor.", submitLabel: "Crear producto" });
    if (file && !validPreviewBuilderImage(file)) return postPreviewBuilderResult(requestId, { ok: false, error: file.size > MAX_IMAGE_BYTES ? "La imagen supera el máximo de 8 MB." : "Usa una imagen PNG, JPEG o WEBP.", submitLabel: "Crear producto" });
    try {
      const imageUrls = file ? [await uploadFile(file)] : [];
      const product = await api(`/stores/${currentStoreId}/payment_links`, {
        method: "POST",
        body: JSON.stringify({ name, description: description || null, amount: Math.round(amountBob * 100), categoryId, imageUrls, imagePositions: imageUrls.map(() => "50% 50%"), tags: [], stock: null, variants: [], extras: [] }),
      });
      resetPaymentLinkBrowseState();
      renderPaymentLinkRows([product, ...lastPaymentLinks]);
      selectedPreviewProductId = product.id;
      pendingStorePreviewSection = "products";
      pendingStorePreviewAction = "product";
      pendingStorePreviewProduct = product;
      infoEl.textContent = `Producto "${product.name}" creado desde la vista previa.`;
      postPreviewBuilderResult(requestId, { ok: true });
      refreshStorePreview(true);
    } catch (error) {
      postPreviewBuilderResult(requestId, { ok: false, error: `No pudimos crear el producto: ${error.message}`, submitLabel: "Crear producto" });
    }
  }

  async function updateProductRecommendationsFromPreview(payload) {
    const requestId = String(payload?.requestId || "");
    const productId = String(payload?.productId || "");
    const recommendedProductIds = Array.isArray(payload?.recommendedProductIds)
      ? [...new Set(payload.recommendedProductIds.filter((id) => typeof id === "string" && id !== productId))].slice(0, 4)
      : [];
    const product = lastPaymentLinks.find((entry) => entry.id === productId && entry.status === "ACTIVE");
    if (!product) return postPreviewBuilderResult(requestId, { ok: false, error: "Este producto ya no está disponible.", submitLabel: "Guardar recomendados" });
    if (recommendedProductIds.some((id) => !lastPaymentLinks.some((entry) => entry.id === id && entry.status === "ACTIVE"))) {
      return postPreviewBuilderResult(requestId, { ok: false, error: "Uno de los productos elegidos ya no está disponible.", submitLabel: "Guardar recomendados" });
    }
    const requestController = new AbortController();
    const requestTimeout = window.setTimeout(() => requestController.abort(), 12_000);
    try {
      const updated = await api(`/stores/${currentStoreId}/payment_links/${encodeURIComponent(productId)}`, { method: "PATCH", body: JSON.stringify({ recommendedProductIds }), signal: requestController.signal });
      renderPaymentLinkRows(lastPaymentLinks.map((entry) => entry.id === updated.id ? updated : entry));
      selectedPreviewProductId = updated.id;
      pendingStorePreviewSection = "products";
      pendingStorePreviewAction = "product";
      pendingStorePreviewProduct = updated;
      infoEl.textContent = `Recomendados de "${updated.name}" actualizados.`;
      postPreviewBuilderResult(requestId, { ok: true });
      refreshStorePreview(true);
    } catch (error) {
      const reason = error?.name === "AbortError" ? "La conexión tardó demasiado. Intenta nuevamente." : error.message;
      postPreviewBuilderResult(requestId, { ok: false, error: `No pudimos guardar los recomendados: ${reason}`, submitLabel: "Guardar recomendados" });
    } finally {
      window.clearTimeout(requestTimeout);
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== storePreviewFrameEl.contentWindow) return;
    if (!event.data || event.data.source !== "pagosya-checkout") return;
    try {
      if (event.origin !== new URL(storePreviewFrameEl.src).origin) return;
    } catch {
      return;
    }
    try {
    if (event.data.type === "STORE_EDITOR_CREATE_CATEGORY" && storePreviewEditorEnabled) {
      void createCategoryFromPreview(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_CREATE_PRODUCT" && storePreviewEditorEnabled) {
      void createProductFromPreview(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_UPDATE_PRODUCT_RECOMMENDATIONS" && storePreviewEditorEnabled) {
      void updateProductRecommendationsFromPreview(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_PREVIEW_EXTERNAL_LINK") {
      const rawUrl = typeof event.data.payload?.url === "string" ? event.data.payload.url.slice(0, 500) : "";
      let destination;
      try {
        destination = new URL(rawUrl);
      } catch {
        return;
      }
      if (!["https:", "http:", "mailto:", "tel:"].includes(destination.protocol)) return;
      previewExternalLinkOpenEl.href = destination.href;
      previewExternalLinkDestinationEl.textContent = destination.protocol === "mailto:"
        ? destination.pathname
        : destination.protocol === "tel:"
          ? destination.pathname
          : destination.hostname;
      previewExternalLinkNoticeEl.hidden = false;
      previewExternalLinkOpenEl.focus({ preventScroll: true });
      return;
    }
    if (event.data.type === "STORE_PREVIEW_SCROLL_BOUNDARY") {
      const deltaY = Number(event.data.payload?.deltaY);
      if (Number.isFinite(deltaY)) window.scrollBy({ top: Math.max(-240, Math.min(240, deltaY)), behavior: "auto" });
      return;
    }
    if (event.data.type === "STORE_EDITOR_SELECT" && storePreviewEditorEnabled) {
      if (!event.data.payload?.selection) {
        const pendingAnimationId = pendingAnimationMediaSetupId || activePreviewSelection?.animationId
          || (String(activePreviewSelection?.section || "").startsWith("animation-") ? String(activePreviewSelection.section).slice("animation-".length) : "");
        const pendingAnimation = pendingAnimationId ? pendingAnimations.find((animation) => animation.id === pendingAnimationId) : null;
        const keepsMediaSetupOpen = pendingAnimation
          && pendingAnimation.media.length < animationMediaRequirement(pendingAnimation.type).min;
        if (keepsMediaSetupOpen) return;
        activePreviewSelection = null;
        renderPreviewContextEditor(null);
        previewSelectionStatusEl.textContent = "Ningún elemento seleccionado. Toca una parte de la tienda para editarla.";
        return;
      }
      const incomingSelection = event.data.payload.selection;
      const incomingAnimationId = incomingSelection.animationId
        || (String(incomingSelection.section || "").startsWith("animation-") ? String(incomingSelection.section).slice("animation-".length) : "");
      if (pendingAnimationMediaSetupId && incomingAnimationId !== pendingAnimationMediaSetupId) pendingAnimationMediaSetupId = null;
      // The merchant clicked something that is already visible inside the
      // preview. Echo the highlight without scrolling the iframe back to that
      // section; the old reveal caused a brief trip through the large blank
      // spacing between storefront sections on every click.
      // A preview-originated selection may be the first click/double-click of
      // an inline edit. Focusing the mirrored side-panel control here steals
      // focus from the contenteditable node and commits/cancels the edit before
      // the merchant can type.
      selectStorePreviewEditorTarget(incomingSelection, { reveal: false, focus: false });
      return;
    }
    if (event.data.type === "STORE_EDITOR_INLINE_TEXT" && storePreviewEditorEnabled) {
      applyInlinePreviewText(event.data.payload?.selection, event.data.payload?.value);
      return;
    }
    if (event.data.type === "STORE_EDITOR_PAGE_CONTEXT" && storePreviewEditorEnabled) {
      const requestedPageId = typeof event.data.payload?.pageId === "string" ? event.data.payload.pageId : null;
      activePreviewPageId = requestedPageId && (pendingSiteDocument?.pages || []).some((page) => page.id === requestedPageId)
        ? requestedPageId
        : null;
      previewAddSectionEl.innerHTML = previewSectionInsertionOptions(Boolean(activePreviewPageId));
      renderStoreContentOrderEditor();
      return;
    }
    if (event.data.type === "STORE_EDITOR_FOOTER_FIELD" && storePreviewEditorEnabled) {
      applyCanvasFooterField(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_NAVIGATION_FIELD" && storePreviewEditorEnabled) {
      applyCanvasNavigationField(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_NAVIGATION_STYLE" && storePreviewEditorEnabled) {
      applyCanvasNavigationStyle(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_COLLECTION_FIELD" && storePreviewEditorEnabled) {
      applyCanvasCollectionField(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_FOOTER_STRUCTURE" && storePreviewEditorEnabled) {
      applyCanvasFooterStructure(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SECTION_LOCK" && storePreviewEditorEnabled) {
      const selection = prepareInlinePreviewSelection(event.data.payload?.selection);
      const siteId = selection.section.startsWith("site-") ? selection.section.slice("site-".length) : "";
      const siteSection = pendingSiteSections.find((section) => section.id === siteId);
      const shouldLock = event.data.payload?.locked === true;
      if (siteSection && lockedAiSectionIds.has(siteId) !== shouldLock) previewSectionLockEl.click();
      return;
    }
    if (event.data.type === "STORE_EDITOR_INLINE_IMAGE" && storePreviewEditorEnabled) {
      void applyInlinePreviewImage(event.data.payload?.selection, event.data.payload?.file);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ANIMATION_LAYOUT" && storePreviewEditorEnabled) {
      applyAnimationCanvasLayout(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SITE_TEXT_LAYOUT" && storePreviewEditorEnabled) {
      applySiteTextCanvasLayout(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SECTION_HEIGHT" && storePreviewEditorEnabled) {
      applySiteSectionCanvasHeight(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_MOVE_TEXT_SECTION" && storePreviewEditorEnabled) {
      moveSiteTextToSection(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_TEXT_STYLE" && storePreviewEditorEnabled) {
      applyCanvasTextStyle(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ANIMATION_FIELD" && storePreviewEditorEnabled) {
      applyCanvasAnimationField(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SITE_FIELD" && storePreviewEditorEnabled) {
      applyCanvasSiteField(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SITE_PRODUCTS" && storePreviewEditorEnabled) {
      applyCanvasSiteProducts(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ANNOUNCEMENT_STYLE" && storePreviewEditorEnabled) {
      applyCanvasAnnouncementStyle(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ANNOUNCEMENT_REMOVE" && storePreviewEditorEnabled) {
      removeCanvasAnnouncement(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ADD_TEXT" && storePreviewEditorEnabled) {
      addCanvasText(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_DUPLICATE_TEXT" && storePreviewEditorEnabled) {
      duplicateCanvasText(event.data.payload?.selection);
      return;
    }
    if (event.data.type === "STORE_EDITOR_DELETE_TEXT" && storePreviewEditorEnabled) {
      deleteCanvasText(event.data.payload?.selection);
      return;
    }
    if (event.data.type === "STORE_EDITOR_SECTION_STYLE" && storePreviewEditorEnabled) {
      applyCanvasSectionStyle(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_MOVE_SECTION" && storePreviewEditorEnabled) {
      moveCanvasSection(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_ANIMATION_BUTTON_LAYOUT" && storePreviewEditorEnabled) {
      applyAnimationButtonCanvasLayout(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_LOCATION_MAP" && storePreviewEditorEnabled) {
      applyInlineLocationMap(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_DELETE_LOCATION" && storePreviewEditorEnabled) {
      deleteInlineLocation(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_DELETE_ANIMATION" && storePreviewEditorEnabled) {
      deleteInlineAnimation(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_DELETE_SECTION" && storePreviewEditorEnabled) {
      deleteCanvasSection(event.data.payload);
      return;
    }
    if (event.data.type === "STORE_EDITOR_INSERT_SECTION" && storePreviewEditorEnabled) {
      const choice = typeof event.data.payload?.choice === "string" ? event.data.payload.choice : "";
      const insertAfter = typeof event.data.payload?.insertAfter === "string" ? event.data.payload.insertAfter : SECTION_INSERT_AT_START;
      const pageId = typeof event.data.payload?.pageId === "string" ? event.data.payload.pageId : activePreviewPageId;
      insertStoreSectionChoice(choice, insertAfter, pageId);
      return;
    }
    if (event.data.type === "STORE_EDITOR_UNDO" && storePreviewEditorEnabled) {
      undoStoreEditorChange();
      return;
    }
    if (event.data.type === "STORE_EDITOR_COPY_TEXT" && storePreviewEditorEnabled) {
      copyAnimationText(event.data.payload?.selection, event.data.payload?.value);
      return;
    }
    if (event.data.type === "STORE_EDITOR_PASTE_TEXT" && storePreviewEditorEnabled) {
      pasteAnimationText(event.data.payload?.selection);
      return;
    }
    if (event.data.type !== "CHECKOUT_READY") return;
    clearTimeout(previewReadyTimer);
    setStorePreviewState("ready");
    if (!activeVisualProposalId) postStorePreview();
    } catch (error) {
      console.error("Ignored invalid preview editor event", error);
      previewSelectionStatusEl.textContent = "La vista previa ignoró un cambio inválido y sigue disponible. Intenta el ajuste nuevamente.";
    }
  });
  // A proposal can finish rendering before its one-shot CHECKOUT_READY message
  // reaches this page (notably after a Vite reload or a very large AI preview
  // fragment). The iframe load event is the browser-level confirmation that
  // Checkout is present; use it to avoid covering a successfully rendered
  // storefront with the misleading availability error.
  storePreviewFrameEl.addEventListener("load", () => {
    if (!storePreviewFrameEl.hasAttribute("src")) return;
    clearTimeout(previewReadyTimer);
    setStorePreviewState("ready");
    if (!activeVisualProposalId) postStorePreview();
  });
  function hidePreviewExternalLinkNotice() {
    previewExternalLinkNoticeEl.hidden = true;
    previewExternalLinkOpenEl.href = "#";
    previewExternalLinkDestinationEl.textContent = "";
  }
  previewExternalLinkDismissEl.addEventListener("click", hidePreviewExternalLinkNotice);
  previewExternalLinkOpenEl.addEventListener("click", () => window.setTimeout(hidePreviewExternalLinkNotice, 0));
  document.getElementById("previewReload").addEventListener("click", () => refreshStorePreview(true));
  document.getElementById("previewRetry").addEventListener("click", () => refreshStorePreview(true));
  const PREVIEW_DESKTOP_CANVAS_WIDTH = 1200;
  const PRODUCT_PREVIEW_DESKTOP_CANVAS_WIDTH = 1040;
  function syncPreviewCanvasSize() {
    const mobile = storePreviewStageEl.classList.contains("mobile");
    if (mobile) {
      storePreviewStageEl.style.removeProperty("--preview-desktop-scale");
      storePreviewFrameEl.style.removeProperty("height");
      return;
    }
    const stageStyle = getComputedStyle(storePreviewStageEl);
    const horizontalPadding = parseFloat(stageStyle.paddingLeft || "0") + parseFloat(stageStyle.paddingRight || "0");
    const verticalPadding = parseFloat(stageStyle.paddingTop || "0") + parseFloat(stageStyle.paddingBottom || "0");
    const availableWidth = storePreviewStageEl.clientWidth - horizontalPadding;
    const availableHeight = storePreviewStageEl.clientHeight - verticalPadding;
    if (availableWidth <= 0 || availableHeight <= 0) return;
    const canvasWidth = document.body.dataset.dashboardView === "products" && !storePreviewFullscreen
      ? PRODUCT_PREVIEW_DESKTOP_CANVAS_WIDTH
      : PREVIEW_DESKTOP_CANVAS_WIDTH;
    const scale = Math.min(1, availableWidth / canvasWidth);
    storePreviewStageEl.style.setProperty("--preview-desktop-canvas-width", `${canvasWidth}px`);
    storePreviewStageEl.style.setProperty("--preview-desktop-scale", String(scale));
    storePreviewFrameEl.style.height = `${Math.ceil(availableHeight / scale)}px`;
  }
  function setPreviewDevice(mobile) {
    storePreviewStageEl.classList.toggle("desktop", !mobile);
    storePreviewStageEl.classList.toggle("mobile", mobile);
    previewMobileEl.classList.toggle("active", mobile);
    previewDesktopEl.classList.toggle("active", !mobile);
    previewMobileEl.setAttribute("aria-pressed", String(mobile));
    previewDesktopEl.setAttribute("aria-pressed", String(!mobile));
    window.requestAnimationFrame(syncPreviewCanvasSize);
  }
  previewDesktopEl.addEventListener("click", () => setPreviewDevice(false));
  previewMobileEl.addEventListener("click", () => setPreviewDevice(true));
  setPreviewDevice(window.matchMedia("(max-width: 640px)").matches);
  new ResizeObserver(() => syncPreviewCanvasSize()).observe(storePreviewStageEl);

  document.getElementById("visualStartOver").addEventListener("click", () => {
    visualProposalStatusEl.textContent = "";
    leaveVisualProposalPreview();
    setVisualStep(1);
    document.getElementById("visualCreativeBrief").focus({ preventScroll: true });
  });
  visualGenerateEl.addEventListener("click", async () => {
    if (!currentStoreId) return;
    const generationStoreId = currentStoreId;
    const instructionEl = document.getElementById("visualCreativeBrief");
    const instruction = instructionEl.value.trim();
    if (!instruction) {
      visualSourceStatusEl.textContent = "Escribe el cambio que quieres hacer antes de enviarlo.";
      instructionEl.focus();
      return;
    }
    instructionEl.value = "";
    errorEl.textContent = "";
    storeAgentWorkingPhase = "preparing";
    storeAgentWorkingInstruction = instruction;
    storeAgentMessages.push({ role: "USER", content: instruction, createdAt: new Date().toISOString(), metadata: { optimistic: true } });
    renderStoreAgentTimeline({ forceBottom: true });
    instructionEl.focus({ preventScroll: true });
    setVisualStep(2);
    startVisualGenerationLoader();
    setVisualGenerationPhase(visualAiFiles.length ? "uploading" : "composing");
    visualGenerateEl.disabled = true;
    try {
      if (storeSaveInFlight) throw new Error("Espera a que termine de guardarse el borrador.");
      const requestSelection = currentAgentSelection();
      const requestProposalId = activeVisualProposalId;
      if (storeSettingsDirty) {
        if (requestProposalId) throw new Error("Guarda tus cambios y abre el borrador actual antes de pedir otro cambio.");
        storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
        const operation = storeEditorDraft.beginSave();
        if (!operation) throw new Error("No pudimos capturar el borrador actual.");
        syncStoreDraftUi();
        try { await persistCapturedWebsiteDraft(operation); }
        catch (error) { storeEditorDraft.failSave(operation, error); throw error; }
        finally { storeEditorDraft.finishSave(operation); syncStoreDraftUi(); }
        if (generationStoreId !== currentStoreId) return;
        if (operation.fingerprint !== storeEditorDraft.getState().fingerprint) throw new Error("Guardamos el primer cambio, pero seguiste editando. Vuelve a enviar el pedido con tus cambios más recientes.");
      }
      const requestRevision = websiteRevision;
      const requestFingerprint = storeEditorDraft.getState().fingerprint;
      const assetUrls = visualAiFiles.length ? await uploadedVisualAiAssetUrls() : [];
      visualSourceStatusEl.textContent = "Yapi está preparando un borrador privado…";
      setVisualGenerationPhase("composing");
      const result = await api(`/stores/${generationStoreId}/agent-conversation/messages`, {
        method: "POST",
        body: JSON.stringify({
          instruction,
          proposalId: requestProposalId || undefined,
          revision: requestRevision,
          selection: requestSelection,
          assetUrls: assetUrls.length ? assetUrls : undefined,
        }),
      });
      if (generationStoreId !== currentStoreId) return;
      const generatedProposals = result.proposals || (result.proposal ? [result.proposal] : []);
      if (result.needsClarification) {
        storeAgentMessages = storeAgentMessages.filter((message) => message?.metadata?.optimistic !== true);
        if (result.userMessage) storeAgentMessages.push(result.userMessage);
        if (result.assistantMessage) storeAgentMessages.push(result.assistantMessage);
        storeAgentWorkingInstruction = "";
        setVisualStep(1);
        renderStoreAgentTimeline();
        visualSourceStatusEl.textContent = "Yapi necesita una decisión breve. Elige una respuesta o escribe la tuya; todavía no cambió nada.";
        instructionEl.focus({ preventScroll: true });
        return;
      }
      setVisualGenerationPhase("finishing");
      const generatedIds = new Set(generatedProposals.map((proposal) => proposal.id));
      visualProposals = [...generatedProposals, ...visualProposals.filter((proposal) => !generatedIds.has(proposal.id))];
      storeAgentMessages = storeAgentMessages.filter((message) => message?.metadata?.optimistic !== true);
      if (result.userMessage) storeAgentMessages.push(result.userMessage);
      if (result.assistantMessage) storeAgentMessages.push(result.assistantMessage);
      storeAgentWorkingInstruction = "";
      renderStoreAgentTimeline();
      renderVisualStudio();
      if (generatedProposals.length && websiteRevision === requestRevision && storeEditorDraft.getState().fingerprint === requestFingerprint) previewVisualProposal(generatedProposals[0], { announce: false });
      else if (generatedProposals.length) visualSourceStatusEl.textContent = "Yapi terminó. Conservamos tus cambios más recientes; la propuesta está en el chat para revisar.";
      visualProposalStatusEl.textContent = result.intent === "advice" ? "Yapi dejó sugerencias. El borrador sigue igual." : result.revision
        ? "El cambio ya está visible como borrador privado. Revísalo y apruébalo sólo si quedó como querías."
        : "Yapi preparó direcciones privadas para comparar. La primera ya aparece en la vista previa.";
      visualAiFiles = [];
      visualAiUploads.clear();
      visualAiImagesEl.value = "";
      renderVisualAiFiles();
    } catch (err) {
      if (generationStoreId !== currentStoreId) return;
      storeAgentMessages = storeAgentMessages.filter((message) => message?.metadata?.optimistic !== true);
      storeAgentWorkingInstruction = "";
      await loadStoreAgentConversation(generationStoreId);
      setVisualStep(1);
      if (!instructionEl.value.trim()) instructionEl.value = instruction;
      instructionEl.focus({ preventScroll: true });
      errorEl.textContent = "No se pudo preparar el cambio: " + err.message;
      visualProposalStatusEl.textContent = "La tienda y el borrador anterior siguen intactos. Ajusta la instrucción e inténtalo otra vez.";
    } finally {
      stopVisualGenerationLoader();
      if (generationStoreId === currentStoreId) visualGenerateEl.disabled = false;
    }
  });
  document.getElementById("visualCreativeBrief").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      visualGenerateEl.click();
    }
  });
  document.querySelector(".store-agent-suggestions")?.addEventListener("click", (event) => {
    const suggestion = event.target.closest("[data-agent-suggestion]");
    if (!suggestion) return;
    const instructionEl = document.getElementById("visualCreativeBrief");
    instructionEl.value = suggestion.dataset.agentSuggestion;
    instructionEl.focus();
  });
  storeAgentTimelineEl?.addEventListener("click", async (event) => {
    const reply = event.target.closest("[data-agent-reply]");
    if (reply) {
      if (reply.disabled || visualGenerateEl.disabled) return;
      const instructionEl = document.getElementById("visualCreativeBrief");
      instructionEl.value = reply.dataset.agentReply;
      visualGenerateEl.click();
      return;
    }
    const previewButton = event.target.closest("[data-agent-preview-proposal]");
    if (previewButton) {
      const proposal = visualProposals.find((candidate) => candidate.id === previewButton.dataset.agentPreviewProposal);
      if (proposal) previewVisualProposal(proposal);
      else visualProposalStatusEl.textContent = "Este borrador ya no está disponible entre las propuestas recientes.";
      return;
    }
    const applyButton = event.target.closest("[data-agent-apply-proposal]");
    if (applyButton) {
      if (applyButton.disabled) return;
      const proposal = visualProposals.find((candidate) => candidate.id === applyButton.dataset.agentApplyProposal);
      if (proposal) await applyVisualProposal(proposal, applyButton);
      else visualSourceStatusEl.textContent = "Ese borrador ya no está disponible. Pídele a Yapi que prepare uno nuevo.";
      return;
    }
    const saveTemplateButton = event.target.closest("[data-agent-save-template]");
    if (saveTemplateButton) {
      if (saveTemplateButton.disabled) return;
      const proposal = visualProposals.find((candidate) => candidate.id === saveTemplateButton.dataset.agentSaveTemplate);
      if (proposal) await saveVisualProposalTemplate(proposal, saveTemplateButton);
      return;
    }
    const undoButton = event.target.closest("[data-agent-undo-message-index]");
    if (!undoButton || undoButton.disabled) return;
    const message = storeAgentMessages[Number(undoButton.dataset.agentUndoMessageIndex)];
    if (message) await undoStoreAgentChange(message, undoButton);
  });
  renderStoreAgentTimeline();
  renderVisualSources();

  function samePreviewSelection(left, right) {
    if (!left || !right) return false;
    return left.section === right.section
      && left.field === right.field
      && left.animationId === right.animationId
      && left.itemId === right.itemId
      && left.itemIndex === right.itemIndex;
  }

  function postAnimationControlSelection(control, intent) {
    if (!intent?.section?.startsWith("animation-")) return false;
    const card = control.closest?.(".animation-card");
    const mediaRow = control.closest?.(".animation-media-row");
    const animationId = card?.dataset.animationId || intent.section.slice("animation-".length);
    const rememberedItemIndex = activePreviewSelection?.animationId === animationId && Number.isInteger(activePreviewSelection.itemIndex)
      ? activePreviewSelection.itemIndex
      : null;
    const itemIndex = mediaRow ? Number(mediaRow.dataset.mediaIndex) : rememberedItemIndex;
    const selection = {
      section: intent.section,
      field: mediaRow ? String(control.dataset?.animationMediaField || "media") : "section",
      label: mediaRow && Number.isInteger(itemIndex) ? `escena ${itemIndex + 1}` : "animación",
      animationId,
      ...(Number.isInteger(itemIndex) ? { itemIndex } : {}),
    };
    const changed = !samePreviewSelection(activePreviewSelection, selection);
    activePreviewSelection = selection;
    if (changed) postStorePreviewEditorSelection(selection);
    return true;
  }

  function animationTextControlSelection(control) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) return null;
    const card = control.closest(".animation-card");
    if (!card) return null;
    const animationId = card.dataset.animationId;
    const mediaRow = control.closest(".animation-media-row");
    const mediaField = control.dataset.animationMediaField;
    const generalField = control.dataset.animationField;
    if (mediaRow && ["title", "caption", "body"].includes(mediaField)) {
      const itemIndex = Number(mediaRow.dataset.mediaIndex);
      if (!Number.isInteger(itemIndex)) return null;
      return {
        section: `animation-${animationId}`,
        field: mediaField,
        label: `${mediaField === "title" ? "título" : mediaField === "caption" ? "subtítulo" : "texto"} de la escena ${itemIndex + 1}`,
        animationId,
        itemIndex,
      };
    }
    if (["title", "subtitle", "buttonLabel"].includes(generalField)) {
      return {
        section: `animation-${animationId}`,
        field: generalField === "title" ? "animationTitle" : generalField === "subtitle" ? "animationSubtitle" : "buttonLabel",
        label: generalField === "title" ? "título general de la animación" : generalField === "subtitle" ? "subtítulo general de la animación" : "botón de la animación",
        animationId,
      };
    }
    return null;
  }

  function updateAnimationTextWithoutRebuildingPreview(control) {
    const selection = animationTextControlSelection(control);
    if (!selection) return false;
    const changed = !samePreviewSelection(activePreviewSelection, selection);
    activePreviewSelection = selection;
    if (changed) postStorePreviewEditorSelection(selection, { reveal: false });
    postStorePreviewEditorText(selection, control.value);
    return true;
  }

  function updateAnimationStyleWithoutRebuildingPreview(control) {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement)) return false;
    const key = control.dataset.animationField;
    if (!["textAlign", "textScale", "textWidthPercent", "textColor", "backgroundColor"].includes(key)) return false;
    const animationId = control.closest(".animation-card")?.dataset.animationId;
    if (!animationId) return false;
    const value = ["textScale", "textWidthPercent"].includes(key) ? Number(control.value) : control.value;
    postStorePreviewAnimationStyle(animationId, key, value);
    return true;
  }

  storeSettingsFormEl.addEventListener("click", (event) => {
    const intent = rememberStorePreviewIntent(event.target);
    // Touching a control is presentation state, not store data. Keep the
    // current preview DOM alive; the control's actual input/change handler
    // will publish a patch only when something changes.
    if (postAnimationControlSelection(event.target, intent)) return;
    postStorePreviewNavigation(intent);
  }, true);
  storeSettingsFormEl.addEventListener("focusin", (event) => {
    const intent = rememberStorePreviewIntent(event.target);
    if (!intent) return;
    if (postAnimationControlSelection(event.target, intent)) return;
  });
  storeSettingsFormEl.addEventListener("input", (event) => {
    rememberStorePreviewIntent(event.target);
    setStoreSettingsDirty(true);
    // Dynamic editor controls may have scheduled their own quick redraw before
    // this bubbled event arrives. Cancel it while the merchant is still typing;
    // the change event below flushes the complete value on blur.
    if (storePreviewTextEntry(event.target)) {
      clearTimeout(previewPostTimer);
      updateAnimationTextWithoutRebuildingPreview(event.target);
      return;
    }
    if (updateAnimationStyleWithoutRebuildingPreview(event.target)) {
      clearTimeout(previewPostTimer);
      return;
    }
    scheduleStorePreview(STORE_PREVIEW_INPUT_DEBOUNCE_MS);
  });
  storeSettingsFormEl.addEventListener("change", (event) => {
    rememberStorePreviewIntent(event.target);
    setStoreSettingsDirty(true);
    if (animationTextControlSelection(event.target)) {
      clearTimeout(previewPostTimer);
      return;
    }
    if (event.target?.dataset?.animationField === "name") {
      clearTimeout(previewPostTimer);
      return;
    }
    if (updateAnimationStyleWithoutRebuildingPreview(event.target)) {
      clearTimeout(previewPostTimer);
      return;
    }
    scheduleStorePreview(0);
  });
  storeSettingsFormEl.addEventListener("focusin", (event) => {
    const control = event.target;
    if (storeEditorApplyingUndo || !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) || control.type === "file") return;
    storeEditorControlInitialValues.set(control, {
      value: control.value,
      checked: control instanceof HTMLInputElement ? control.checked : false,
    });
  }, true);
  storeSettingsFormEl.addEventListener("change", (event) => {
    const control = event.target;
    if (storeEditorApplyingUndo || !(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) || !control.id || control.type === "file") return;
    const previous = storeEditorControlInitialValues.get(control);
    if (!previous) return;
    const current = { value: control.value, checked: control instanceof HTMLInputElement ? control.checked : false };
    storeEditorControlInitialValues.set(control, current);
    if (previous.value === current.value && previous.checked === current.checked) return;
    const label = control.labels?.[0]?.textContent?.trim() || control.getAttribute("aria-label") || "cambio del editor";
    pushStoreEditorUndo(label, () => restoreStoreEditorControl(control.id, previous));
  });
  previewUndoButtonEl.addEventListener("click", undoStoreEditorChange);
  previewArtDirectionEl.addEventListener("change", () => {
    if (!applyPendingSiteArtDirection(previewArtDirectionEl.value)) return;
    renderPreviewContextEditor(activePreviewSelection);
  });
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const target = event.target;
    const nativeTextUndo = target instanceof HTMLTextAreaElement
      || (target instanceof HTMLInputElement && ["text", "search", "email", "url", "tel", "number"].includes(target.type))
      || (target instanceof HTMLElement && target.isContentEditable);
    if (nativeTextUndo) return;
    const key = event.key.toLowerCase();
    if (key === "z" && !event.shiftKey && storeEditorUndoStack.length) {
      event.preventDefault();
      undoStoreEditorChange();
    } else if (key === "c" && (animationTextTarget() || String(activePreviewSelection?.section || "").startsWith("site-"))) {
      event.preventDefault();
      copyAnimationText();
    } else if (key === "v" && animationTextClipboard && (animationTextTarget() || String(activePreviewSelection?.section || "").startsWith("site-"))) {
      event.preventDefault();
      pasteAnimationText();
    } else if (key === "d" && (animationTextTarget() || String(activePreviewSelection?.section || "").startsWith("site-"))) {
      event.preventDefault();
      duplicateCanvasText(activePreviewSelection);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    if (!storeSettingsDirty) return;
    event.preventDefault();
  });

  function renderStoreLinksEditor() {
    storeLinksEditorEl.innerHTML = pendingStoreLinks
      .map(
        (link, i) => `<div class="store-link-editor-row" data-index="${i}">
          <input class="link-label" aria-label="Texto del enlace ${i + 1}" placeholder="Texto (ej. Instagram)" maxlength="40" value="${esc(link.label)}">
          <input class="link-url" type="url" aria-label="URL del enlace ${i + 1}" placeholder="https://instagram.com/mitienda" maxlength="500" value="${esc(link.url)}">
          <button type="button" class="ghost link-remove" aria-label="Quitar enlace ${i + 1}">×</button>
        </div>`,
      )
      .join("");
    storeLinksEditorEl.querySelectorAll(".store-link-editor-row").forEach((row) => {
      const i = Number(row.dataset.index);
      row.querySelector(".link-label").addEventListener("input", (e) => (pendingStoreLinks[i].label = e.target.value));
      row.querySelector(".link-url").addEventListener("input", (e) => (pendingStoreLinks[i].url = e.target.value));
      row.querySelector(".link-remove").addEventListener("click", () => {
        pendingStoreLinks.splice(i, 1);
        renderStoreLinksEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      });
    });
  }

  function normalizeStoreContentOrder(order) {
    const animationSections = pendingAnimations.map((animation) => `animation-${animation.id}`);
    const siteSections = pendingSiteSections.map((section) => `site-${section.id}`);
    if (siteSections.length) {
      const allowed = new Set([...siteSections, "motion", ...animationSections]);
      const normalized = [];
      const append = (section) => { if (allowed.has(section) && !normalized.includes(section)) normalized.push(section); };
      const legacyKinds = { hero: "hero", products: "catalog", about: "story", gallery: "gallery", contact: "contact", location: "location", links: "links" };
      if (Array.isArray(order)) {
        order.forEach((section) => {
          if (section === "motion") {
            animationSections.forEach(append);
            return;
          }
          if (typeof section === "string" && section.startsWith("motion-")) {
            const legacyType = section.slice("motion-".length);
            pendingAnimations.filter((animation) => animation.type === legacyType).forEach((animation) => append(`animation-${animation.id}`));
            return;
          }
          if (allowed.has(section)) {
            append(section);
            return;
          }
          const legacyKind = legacyKinds[section];
          if (legacyKind) pendingSiteSections.filter((candidate) => candidate.kind === legacyKind).forEach((candidate) => append(`site-${candidate.id}`));
        });
      }
      siteSections.forEach(append);
      const missingMotion = animationSections.filter((section) => !normalized.includes(section));
      if (missingMotion.length) {
        const linksKey = pendingSiteSections.find((section) => section.kind === "links");
        const linksIndex = linksKey ? normalized.indexOf(`site-${linksKey.id}`) : -1;
        normalized.splice(linksIndex < 0 ? normalized.length : linksIndex, 0, ...missingMotion);
      }
      return normalized;
    }
    const allowed = new Set([...DEFAULT_STORE_CONTENT_ORDER, "motion", ...animationSections]);
    const normalized = [];
    const append = (section) => { if (!normalized.includes(section)) normalized.push(section); };
    if (Array.isArray(order)) {
      order.forEach((section) => {
        if (section === "motion") {
          animationSections.forEach(append);
          return;
        }
        if (typeof section === "string" && section.startsWith("motion-")) {
          const legacyType = section.slice("motion-".length);
          pendingAnimations.filter((animation) => animation.type === legacyType).forEach((animation) => append(`animation-${animation.id}`));
          return;
        }
        if (allowed.has(section)) append(section);
      });
    }
    DEFAULT_STORE_CONTENT_ORDER.forEach(append);
    const missingMotion = animationSections.filter((section) => !normalized.includes(section));
    if (missingMotion.length) {
      const linksIndex = normalized.indexOf("links");
      normalized.splice(linksIndex < 0 ? normalized.length : linksIndex, 0, ...missingMotion);
    }
    return normalized;
  }

  function placeTopLevelContentSection(section, afterSection = null) {
    pendingContentOrder = normalizeStoreContentOrder(pendingContentOrder);
    const currentIndex = pendingContentOrder.indexOf(section);
    if (afterSection === SECTION_INSERT_AT_START && currentIndex === 0) return false;
    const anchorIndex = afterSection ? pendingContentOrder.indexOf(afterSection) : -1;
    if (currentIndex === anchorIndex + 1 && anchorIndex >= 0) return false;
    if (currentIndex >= 0) pendingContentOrder.splice(currentIndex, 1);
    if (afterSection === SECTION_INSERT_AT_START) {
      pendingContentOrder.unshift(section);
      return true;
    }
    const updatedAnchorIndex = afterSection ? pendingContentOrder.indexOf(afterSection) : -1;
    const fallbackIndex = pendingContentOrder.indexOf("links");
    const insertionIndex = updatedAnchorIndex >= 0
      ? updatedAnchorIndex + 1
      : fallbackIndex >= 0
        ? fallbackIndex
        : pendingContentOrder.length;
    pendingContentOrder.splice(insertionIndex, 0, section);
    return true;
  }

  function storeContentOrderEntryLabel(section) {
    const animation = section.startsWith("animation-")
      ? pendingAnimations.find((entry) => `animation-${entry.id}` === section)
      : null;
    const siteSection = section.startsWith("site-")
      ? pendingSiteSections.find((entry) => `site-${entry.id}` === section)
      : null;
    const siteKindCopy = {
      hero: ["Portada", "Primera impresión y acción principal"],
      story: ["Historia", "Relato e imágenes de la marca"],
      catalog: ["Tienda", "Categorías, productos y compra"],
      gallery: ["Galería", "Arte y escenas editoriales"],
      contact: ["Información", "Formulario de contacto"],
      location: ["Ubicación", "Dirección, mapa y horarios"],
      links: ["Redes", "Enlaces de la marca"],
    };
    return animation
      ? [animation.name.trim() || animationTypeCopy(animation.type)[0], `${animationCategory(animation.type) === "text" ? "Texto animado" : "Animación visual"} · ${animationTypeCopy(animation.type)[0]}`]
      : siteSection
        ? [siteSection.title?.trim() || siteKindCopy[siteSection.kind]?.[0] || "Sección", siteKindCopy[siteSection.kind]?.[1] || "Sección creada por IA"]
        : STORE_CONTENT_SECTION_COPY[section] || ["Sección", "Contenido de la tienda"];
  }

  function previewSectionInsertionOptions(pageSpecific = false) {
    const options = [
      `<option value="">Elige qué insertar…</option>`,
      `<optgroup label="Secciones"><option value="about">Texto e historia</option>${pageSpecific ? '<option value="products">Productos seleccionados</option>' : ""}<option value="gallery">Galería visual</option><option value="links">Redes sociales</option><option value="contact">Contacto</option><option value="location">Ubicación</option>${pageSpecific ? "" : '<option value="footer">Pie de página</option>'}</optgroup>`,
      `<optgroup label="Animaciones visuales">${animationTypesForCategory("visual").map((type) => `<option value="animation:${type}">${esc(animationTypeCopy(type)[0])}</option>`).join("")}</optgroup>`,
      `<optgroup label="Animaciones de texto">${animationTypesForCategory("text").map((type) => `<option value="animation:${type}">${esc(animationTypeCopy(type)[0])}</option>`).join("")}</optgroup>`,
    ];
    return options.join("");
  }

  function renderPreviewSectionInsertionMap() {
    if (!previewSectionInsertListEl) return;
    const visibleOrder = contentOrderForPage();
    const options = previewSectionInsertionOptions(Boolean(activePreviewPageId));
    const gaps = Array.from({ length: visibleOrder.length + 1 }, (_, index) => {
      const left = index > 0 ? visibleOrder[index - 1] : null;
      const right = index < visibleOrder.length ? visibleOrder[index] : null;
      const afterSection = left || SECTION_INSERT_AT_START;
      const leftLabel = left ? storeContentOrderEntryLabel(left)[0] : "";
      const rightLabel = right ? storeContentOrderEntryLabel(right)[0] : "";
      const positionLabel = index === 0
        ? "Insertar al inicio"
        : index === visibleOrder.length
          ? "Insertar al final"
          : `Entre ${leftLabel} y ${rightLabel}`;
      return `<label class="preview-section-insert-gap"><span class="preview-section-insert-plus" aria-hidden="true">+</span><strong>${esc(positionLabel)}</strong><select class="preview-section-insert-select" data-insert-after="${esc(afterSection)}" aria-label="${esc(positionLabel)}">${options}</select></label>`;
    });
    previewSectionInsertListEl.innerHTML = gaps.join("");
    previewSectionInsertListEl.querySelectorAll(".preview-section-insert-select").forEach((select) => select.addEventListener("change", () => {
      const choice = select.value;
      const insertAfter = select.dataset.insertAfter || SECTION_INSERT_AT_START;
      select.value = "";
      if (choice) insertStoreSectionChoice(choice, insertAfter, activePreviewPageId);
    }));
  }

  function moveSortableEntry(list, fromIndex, toIndex) {
    const result = storeEditorStateModule.reorderStoreEditorList(list, fromIndex, toIndex);
    if (!result.changed) return false;
    list.splice(0, list.length, ...result.order);
    return true;
  }

  function announceStoreReorder(message) {
    if (!storeReorderStatusEl) return;
    storeReorderStatusEl.textContent = "";
    window.requestAnimationFrame(() => (storeReorderStatusEl.textContent = message));
  }

  function focusReorderHandle(container, key) {
    window.requestAnimationFrame(() => {
      const row = [...container.querySelectorAll("[data-reorder-key]")].find((candidate) => candidate.dataset.reorderKey === key);
      row?.querySelector(".reorder-handle")?.focus();
    });
  }

  function sortableDestination(fromIndex, targetIndex, placeAfter, itemCount) {
    let insertionIndex = targetIndex + (placeAfter ? 1 : 0);
    if (fromIndex < insertionIndex) insertionIndex -= 1;
    return Math.max(0, Math.min(insertionIndex, itemCount - 1));
  }

  function wireSortableList({ container, rowSelector, itemCount, onMove }) {
    if (!container) return;
    const rows = [...container.querySelectorAll(rowSelector)];
    const clearDragState = () => rows.forEach((row) => row.classList.remove("is-dragging", "is-drop-before", "is-drop-after"));
    const move = (fromIndex, toIndex, row) => {
      const key = row.dataset.reorderKey;
      const label = row.dataset.reorderLabel || "Elemento";
      if (fromIndex === toIndex) {
        announceStoreReorder(label + " ya está en esa posición.");
        return;
      }
      onMove(fromIndex, toIndex);
      announceStoreReorder(label + " movido a la posición " + (toIndex + 1) + ".");
      focusReorderHandle(container, key);
    };

    rows.forEach((row, index) => {
      const handle = row.querySelector(".reorder-handle");
      if (!handle) return;
      row.draggable = false;
      handle.disabled = itemCount <= 1;
      handle.addEventListener("keydown", (event) => {
        if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const targetIndex = event.key === "Home"
          ? 0
          : event.key === "End"
            ? itemCount - 1
            : Math.max(0, Math.min(index + (event.key === "ArrowUp" ? -1 : 1), itemCount - 1));
        move(index, targetIndex, row);
      });
      let pointerActive = false;
      let pointerTargetIndex = index;
      let pointerPlaceAfter = false;
      handle.addEventListener("pointerdown", (event) => {
        if (itemCount <= 1 || event.button !== 0) return;
        event.preventDefault();
        pointerActive = true;
        row.classList.add("is-dragging");
        handle.setPointerCapture?.(event.pointerId);
      });
      handle.addEventListener("pointermove", (event) => {
        if (!pointerActive) return;
        event.preventDefault();
        const candidate = document.elementFromPoint(event.clientX, event.clientY)?.closest(rowSelector);
        const targetIndex = rows.indexOf(candidate);
        if (targetIndex < 0) return;
        const bounds = candidate.getBoundingClientRect();
        pointerTargetIndex = targetIndex;
        pointerPlaceAfter = event.clientY >= bounds.top + bounds.height / 2;
        clearDragState();
        row.classList.add("is-dragging");
        if (targetIndex !== index) candidate.classList.add(pointerPlaceAfter ? "is-drop-after" : "is-drop-before");
      });
      handle.addEventListener("pointerup", (event) => {
        if (!pointerActive) return;
        handle.releasePointerCapture?.(event.pointerId);
        pointerActive = false;
        const targetIndex = sortableDestination(index, pointerTargetIndex, pointerPlaceAfter, itemCount);
        clearDragState();
        move(index, targetIndex, row);
      });
      handle.addEventListener("pointercancel", () => {
        pointerActive = false;
        clearDragState();
      });
    });
  }

  function renderStoreContentOrderEditor() {
    pendingContentOrder = normalizeStoreContentOrder(pendingContentOrder);
    const visibleOrder = contentOrderForPage();
    const availableProducts = activeStoreCtaProducts();
    const availableProductIds = new Set(availableProducts.map((product) => product.id));
    storeContentOrderListEl.innerHTML = visibleOrder
      .map((section, index) => {
        const [label, description] = storeContentOrderEntryLabel(section);
        const catalogSection = section.startsWith("site-")
          ? pendingSiteSections.find((entry) => `site-${entry.id}` === section && entry.kind === "catalog")
          : null;
        const selectedProductIds = catalogSection
          ? new Set((Array.isArray(catalogSection.productIds) ? catalogSection.productIds : availableProducts.map((product) => product.id)).filter((id) => availableProductIds.has(id)))
          : new Set();
        const catalogProducts = catalogSection
          ? `<details class="store-content-products" data-catalog-section-id="${esc(catalogSection.id)}" open>
              <summary><strong>Productos de esta sección</strong><span data-store-content-product-count>${selectedProductIds.size} ${selectedProductIds.size === 1 ? "seleccionado" : "seleccionados"}</span></summary>
              <div class="store-content-product-tools">
                <span>Marca los productos que quieres mostrar.</span>
                <span class="store-content-product-tool-actions">
                  <button type="button" class="ghost" data-store-content-products-all>Agregar todos</button>
                  <button type="button" class="ghost" data-store-content-products-clear>Quitar todos</button>
                </span>
              </div>
              <div class="store-content-product-grid" role="group" aria-label="Productos de ${esc(label)}">${availableProducts.length ? availableProducts.map((product) => {
                const imageUrl = (product.imageUrls || []).find(Boolean);
                const selected = selectedProductIds.has(product.id);
                return `<label class="store-content-product-option"><input type="checkbox" data-store-content-product="${esc(product.id)}" ${selected ? "checked" : ""}><span class="sr-only" data-store-content-product-label>${selected ? "Quitar" : "Agregar"} ${esc(product.name)}</span>${imageUrl ? `<img src="${esc(dashboardAssetUrl(imageUrl))}" alt="">` : `<span class="store-content-product-placeholder" aria-hidden="true">${esc(product.name.slice(0, 1).toUpperCase())}</span>`}<span class="store-content-product-option-copy"><strong>${esc(product.name)}</strong><small>${money(product.amount)} · <span class="store-content-product-state" data-store-content-product-state>${selected ? "Quitar" : "Agregar"}</span></small></span></label>`;
              }).join("") : `<p class="store-content-products-empty">Todavía no hay productos activos. Crea uno en Productos y aparecerá aquí.</p>`}</div>
            </details>`
          : "";
        return `<div class="store-content-order-row" data-index="${index}" data-reorder-key="${esc(section)}" data-reorder-label="${esc(label)}">
          <button type="button" class="ghost reorder-handle" aria-label="Mover ${esc(label)}. Usa flechas, Inicio o Fin." aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Arrastrar ${esc(label)}">${REORDER_HANDLE_ICON}</button>
          <span class="store-content-order-index">${index + 1}</span>
          <span class="store-content-order-copy"><strong>${esc(label)}</strong><span>${esc(description)}</span></span>
          ${catalogProducts}
        </div>`;
      })
      .join("");
    const commitCatalogProductSelection = (details, catalogSection, previousIds, nextIds, undoLabel) => {
      const selectedIds = new Set(nextIds);
      pushStoreEditorUndo(undoLabel, () => {
        catalogSection.productIds = previousIds;
        if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
      });
      catalogSection.productIds = [...selectedIds];
      if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
      details.querySelectorAll("[data-store-content-product]").forEach((checkbox) => {
        const checked = selectedIds.has(checkbox.dataset.storeContentProduct);
        checkbox.checked = checked;
        const option = checkbox.closest(".store-content-product-option");
        const productName = availableProducts.find((product) => product.id === checkbox.dataset.storeContentProduct)?.name || "producto";
        const state = option?.querySelector("[data-store-content-product-state]");
        const accessibleLabel = option?.querySelector("[data-store-content-product-label]");
        if (state) state.textContent = checked ? "Quitar" : "Agregar";
        if (accessibleLabel) accessibleLabel.textContent = `${checked ? "Quitar" : "Agregar"} ${productName}`;
      });
      details.querySelector("[data-store-content-product-count]").textContent = `${selectedIds.size} ${selectedIds.size === 1 ? "seleccionado" : "seleccionados"}`;
      setStoreSettingsDirty(true);
      pendingStorePreviewSection = `site-${catalogSection.id}`;
      pendingStorePreviewAction = "scroll";
      scheduleStorePreview(0);
      renderPreviewCatalogEditor();
    };
    storeContentOrderListEl.querySelectorAll("[data-store-content-product]").forEach((input) => input.addEventListener("change", () => {
      const details = input.closest("[data-catalog-section-id]");
      const catalogSection = pendingSiteSections.find((entry) => entry.id === details?.dataset.catalogSectionId && entry.kind === "catalog");
      const productId = input.dataset.storeContentProduct;
      if (!catalogSection || !productId || !availableProductIds.has(productId)) return;
      const previousIds = Array.isArray(catalogSection.productIds)
        ? catalogSection.productIds.filter((id) => availableProductIds.has(id))
        : availableProducts.map((product) => product.id);
      const nextIds = new Set(previousIds);
      if (input.checked) nextIds.add(productId);
      else nextIds.delete(productId);
      commitCatalogProductSelection(details, catalogSection, previousIds, nextIds, "cambiar los productos de la sección");
    }));
    storeContentOrderListEl.querySelectorAll("[data-catalog-section-id]").forEach((details) => {
      const catalogSection = pendingSiteSections.find((entry) => entry.id === details.dataset.catalogSectionId && entry.kind === "catalog");
      if (!catalogSection) return;
      const selectAll = (nextIds, undoLabel) => {
        const previousIds = Array.isArray(catalogSection.productIds)
          ? catalogSection.productIds.filter((id) => availableProductIds.has(id))
          : availableProducts.map((product) => product.id);
        commitCatalogProductSelection(details, catalogSection, previousIds, nextIds, undoLabel);
      };
      details.querySelector("[data-store-content-products-all]")?.addEventListener("click", () => selectAll(availableProducts.map((product) => product.id), "agregar todos los productos a la sección"));
      details.querySelector("[data-store-content-products-clear]")?.addEventListener("click", () => selectAll([], "quitar todos los productos de la sección"));
    });
    wireSortableList({
      container: storeContentOrderListEl,
      rowSelector: ".store-content-order-row",
      itemCount: visibleOrder.length,
      onMove: (fromIndex, toIndex) => {
        const sourceKey = visibleOrder[fromIndex];
        const targetKey = visibleOrder[toIndex];
        if (sourceKey && targetKey) movePreviewContentSection(sourceKey, pendingContentOrder.indexOf(targetKey));
      },
    });
    renderPreviewSectionInsertionMap();
  }

  function renderEditorialGalleryEditor({ preservePicker = false } = {}) {
    storeEditorialGalleryInputEl.disabled = pendingEditorialGallery.length >= 8;
    pendingEditorialGallery.forEach(rememberEditorialGalleryDraft);
    if (preservePicker) syncEditorialPhotoPickerState();
    else renderEditorialPhotoPicker();
    renderAnimationsEditor();
    if (pendingEditorialGallery.length === 0) {
      storeEditorialGalleryListEl.innerHTML = `<div class="hero-slides-empty">Selecciona una foto de arriba o agrega una nueva. Las imágenes elegidas aparecerán aquí para que puedas escribir y ordenar cada historia.</div>`;
      return;
    }
    storeEditorialGalleryListEl.innerHTML = pendingEditorialGallery
      .map((image, index) => {
        const boxColor = editorialBoxColor(image.boxColor);
        const previewText = [image.title.trim(), image.caption.trim(), image.body.trim()].filter(Boolean).join(" · ");
        return `<article class="editorial-gallery-row" data-index="${index}" data-reorder-key="${esc(image.imageUrl)}" data-reorder-label="${esc(image.title || `Historia ${index + 1}`)}">
          <figure class="editorial-card-preview" style="--editorial-card-bg:${boxColor};--editorial-card-ink:${editorialBoxInk(boxColor)}">
            <img src="${esc(dashboardAssetUrl(image.imageUrl))}" alt="Vista previa de foto editorial ${index + 1}" style="object-position:${esc(catalogImagePosition(image.imageUrl))}">
            <figcaption class="${previewText ? "" : "is-placeholder"}">${esc(previewText || "Tu historia aparecerá aquí.")}</figcaption>
          </figure>
          <div class="editorial-gallery-fields">
            <div><label for="editorialTitle${index}">Título de la historia</label><input id="editorialTitle${index}" class="editorial-title" maxlength="100" placeholder="Un detalle que importa" value="${esc(image.title)}"></div>
            <div><label for="editorialCaption${index}">Línea breve</label><input id="editorialCaption${index}" class="editorial-caption" maxlength="180" placeholder="Qué está viendo el cliente" value="${esc(image.caption)}"></div>
            <div><label for="editorialBody${index}">Historia junto a la imagen</label><textarea id="editorialBody${index}" class="editorial-body" rows="5" maxlength="360" placeholder="Amplía el contexto en dos o tres frases.">${esc(image.body)}</textarea></div>
            <div><label for="editorialProductLink${index}">Producto al tocar la foto</label><select id="editorialProductLink${index}" class="editorial-product-link">${editorialProductOptions(image.productId || "")}</select><span class="faint">Sin enlace mantiene la foto como contenido editorial.</span></div>
            <div class="editorial-color-field">
              <label for="editorialBoxColor${index}">Color del cuadro</label>
              <div class="editorial-color-control">
                <input id="editorialBoxColor${index}" class="editorial-box-color" type="color" value="${boxColor}" aria-describedby="editorialBoxColorValue${index}">
                <output id="editorialBoxColorValue${index}" for="editorialBoxColor${index}">${boxColor}</output>
              </div>
            </div>
            <div class="editorial-gallery-actions">
              <button type="button" class="ghost reorder-handle" aria-label="Mover ${esc(image.title || `historia ${index + 1}`)}. Usa flechas, Inicio o Fin." aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Arrastrar para ordenar">${REORDER_HANDLE_ICON}<span>Mover</span></button>
              <button type="button" class="ghost remove-editorial-image">No mostrar</button>
            </div>
          </div>
        </article>`;
      })
      .join("");
    storeEditorialGalleryListEl.querySelectorAll(".editorial-gallery-row").forEach((row) => {
      const index = Number(row.dataset.index);
      const syncEditorialPreview = () => {
        const previewCaption = row.querySelector(".editorial-card-preview figcaption");
        const text = [pendingEditorialGallery[index].title, pendingEditorialGallery[index].caption, pendingEditorialGallery[index].body].map((value) => value.trim()).filter(Boolean).join(" · ");
        previewCaption.textContent = text || "Tu historia aparecerá aquí.";
        previewCaption.classList.toggle("is-placeholder", !text);
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      };
      row.querySelector(".editorial-title").addEventListener("input", (event) => {
        pendingEditorialGallery[index].title = event.target.value;
        syncEditorialPreview();
      });
      row.querySelector(".editorial-caption").addEventListener("input", (event) => {
        pendingEditorialGallery[index].caption = event.target.value;
        syncEditorialPreview();
      });
      row.querySelector(".editorial-body").addEventListener("input", (event) => {
        pendingEditorialGallery[index].body = event.target.value;
        syncEditorialPreview();
      });
      row.querySelector(".editorial-product-link").addEventListener("change", (event) => {
        pendingEditorialGallery[index].productId = event.target.value;
        rememberEditorialGalleryDraft(pendingEditorialGallery[index]);
        setStoreSettingsDirty(true);
        scheduleStorePreview(0);
      });
      row.querySelector(".editorial-box-color").addEventListener("input", (event) => {
        const boxColor = editorialBoxColor(event.target.value);
        pendingEditorialGallery[index].boxColor = boxColor;
        const preview = row.querySelector(".editorial-card-preview");
        preview.style.setProperty("--editorial-card-bg", boxColor);
        preview.style.setProperty("--editorial-card-ink", editorialBoxInk(boxColor));
        row.querySelector("output").textContent = boxColor;
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      });
      row.querySelector(".remove-editorial-image").addEventListener("click", () => {
        rememberEditorialGalleryDraft(pendingEditorialGallery[index]);
        pendingEditorialGallery.splice(index, 1);
        renderEditorialGalleryEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      });
    });
    wireSortableList({
      container: storeEditorialGalleryListEl,
      rowSelector: ".editorial-gallery-row",
      itemCount: pendingEditorialGallery.length,
      onMove: (fromIndex, toIndex) => {
        moveSortableEntry(pendingEditorialGallery, fromIndex, toIndex);
        renderEditorialGalleryEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      },
    });
  }

  storeEditorialGalleryInputEl.addEventListener("change", async () => {
    errorEl.textContent = "";
    const available = 8 - pendingEditorialGallery.length;
    const files = [...storeEditorialGalleryInputEl.files].slice(0, available);
    const unsupported = files.find((file) => !["image/png", "image/jpeg", "image/webp"].includes(file.type));
    const oversized = files.find((file) => file.size > MAX_IMAGE_BYTES);
    if (unsupported || oversized) {
      errorEl.textContent = unsupported
        ? `Formato no soportado para ${unsupported.name}. Usa PNG, JPEG o WEBP.`
        : `${oversized.name} supera el máximo de 8 MB.`;
      storeEditorialGalleryInputEl.value = "";
      return;
    }
    storeEditorialGalleryInputEl.disabled = true;
    storeSaveStatusEl.textContent = "Subiendo fotos editoriales…";
    try {
      for (const file of files) {
        const image = { imageUrl: await uploadFile(file), productId: "", title: "", caption: "", body: "", boxColor: DEFAULT_EDITORIAL_BOX_COLOR };
        pendingEditorialGallery.push(image);
        rememberEditorialGalleryDraft(image);
      }
      renderEditorialGalleryEditor();
      setStoreSettingsDirty(true);
      scheduleStorePreview();
    } catch (err) {
      errorEl.textContent = "No se pudieron subir las fotos editoriales: " + err.message;
    } finally {
      storeEditorialGalleryInputEl.value = "";
      storeEditorialGalleryInputEl.disabled = pendingEditorialGallery.length >= 8;
    }
  });

  renderStoreContentOrderEditor();
  renderEditorialGalleryEditor();

  function renderHeroSlidesEditor() {
    storeHeroSlidesInputEl.disabled = pendingHeroSlides.length >= MAX_HERO_SLIDES;
    if (pendingHeroSlides.length === 0) {
      storeHeroSlidesListEl.innerHTML = `<div class="hero-slides-empty">Agrega imágenes, GIFs o videos horizontales para presentar colecciones, temporadas o promociones sin interrumpir la compra.</div>`;
      return;
    }
    storeHeroSlidesListEl.innerHTML = pendingHeroSlides
      .map((slide, index) => {
        const mediaUrl = dashboardAssetUrl(slide.imageUrl);
        const autoplayVideo = !(typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        const mediaPreview = isVideoUploadUrl(slide.imageUrl)
          ? `<video src="${esc(mediaUrl)}" aria-label="Vista previa del video ${index + 1}" muted loop${autoplayVideo ? " autoplay" : ""} playsinline preload="metadata"></video>`
          : `<img src="${esc(mediaUrl)}" alt="Vista previa del slide ${index + 1}" style="object-position:${esc(catalogImagePosition(slide.imageUrl))}">`;
        return `<article class="hero-slide-editor-row" data-index="${index}" data-reorder-key="${esc(slide.imageUrl)}" data-reorder-label="${esc(slide.title || `Slide ${index + 1}`)}">
          ${mediaPreview}
          <div class="hero-slide-fields">
            <div><label for="heroSlideTitle${index}">Título</label><input id="heroSlideTitle${index}" class="slide-title" maxlength="80" placeholder="Nueva colección" value="${esc(slide.title)}"></div>
            <div><label for="heroSlideCta${index}">Texto del botón</label><input id="heroSlideCta${index}" class="slide-cta-label" maxlength="36" placeholder="Ver colección" value="${esc(slide.ctaLabel)}"></div>
            <div class="full"><label for="heroSlideBody${index}">Descripción</label><textarea id="heroSlideBody${index}" class="slide-body" rows="2" maxlength="180" placeholder="Cuenta en una frase qué hace especial esta selección.">${esc(slide.body)}</textarea></div>
            <div class="full"><label for="heroSlideProduct${index}">Producto que abrirá el botón (opcional)</label><select id="heroSlideProduct${index}" class="slide-product-link" ${activeStoreCtaProducts().length ? "" : "disabled"} aria-describedby="heroSlideProductHelp${index}">${storeProductCtaOptions(slide.ctaUrl)}</select><p class="faint" id="heroSlideProductHelp${index}" style="margin:7px 0 0">Elige un producto de tu catálogo o usa un enlace personalizado abajo.</p></div>
            <div class="full"><label for="heroSlideUrl${index}">Enlace personalizado (opcional)</label><input id="heroSlideUrl${index}" class="slide-cta-url" type="url" maxlength="500" placeholder="https://mitienda.bo/coleccion" value="${esc(slide.ctaUrl)}"><p class="faint" style="margin:7px 0 0">Si eliges un producto arriba, completaremos este enlace automáticamente.</p></div>
            <div class="hero-slide-actions">
              <input class="slide-media-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" hidden>
              <button type="button" class="ghost reorder-handle" aria-label="Mover ${esc(slide.title || `slide ${index + 1}`)}. Usa flechas, Inicio o Fin." aria-keyshortcuts="ArrowUp ArrowDown Home End" title="Arrastrar para ordenar">${REORDER_HANDLE_ICON}<span>Mover</span></button>
              <button type="button" class="ghost replace-slide-media" aria-label="Cambiar medio del slide ${index + 1}">Cambiar medio</button>
              <button type="button" class="ghost remove-slide">Quitar slide</button>
            </div>
          </div>
        </article>`;
      })
      .join("");

    storeHeroSlidesListEl.querySelectorAll(".hero-slide-editor-row").forEach((row) => {
      const index = Number(row.dataset.index);
      row.querySelector(".slide-title").addEventListener("input", (event) => (pendingHeroSlides[index].title = event.target.value));
      row.querySelector(".slide-body").addEventListener("input", (event) => (pendingHeroSlides[index].body = event.target.value));
      row.querySelector(".slide-cta-label").addEventListener("input", (event) => (pendingHeroSlides[index].ctaLabel = event.target.value));
      const productSelect = row.querySelector(".slide-product-link");
      const ctaUrlInput = row.querySelector(".slide-cta-url");
      productSelect.addEventListener("change", () => {
        pendingHeroSlides[index].ctaUrl = storeProductCtaUrl(productSelect.value);
        ctaUrlInput.value = pendingHeroSlides[index].ctaUrl;
      });
      ctaUrlInput.addEventListener("input", (event) => {
        pendingHeroSlides[index].ctaUrl = event.target.value;
        const productId = storeProductIdFromCtaUrl(event.target.value);
        productSelect.value = [...productSelect.options].some((option) => option.value === productId) ? productId : "";
      });
      const slide = pendingHeroSlides[index];
      const replaceInput = row.querySelector(".slide-media-input");
      const replaceButton = row.querySelector(".replace-slide-media");
      replaceButton.addEventListener("click", () => replaceInput.click());
      replaceInput.addEventListener("change", async () => {
        const file = replaceInput.files?.[0];
        if (!file) return;
        errorEl.textContent = "";
        const validationError = heroMediaValidationError(file);
        if (validationError) {
          errorEl.textContent = validationError;
          replaceInput.value = "";
          return;
        }
        const controls = [...row.querySelectorAll("button, input")];
        const disabledStates = controls.map((control) => control.disabled);
        controls.forEach((control) => (control.disabled = true));
        replaceButton.classList.add("is-loading");
        replaceButton.textContent = "Cambiando…";
        try {
          const imageUrl = await uploadFile(file);
          if (!pendingHeroSlides.includes(slide)) return;
          slide.imageUrl = imageUrl;
          renderHeroSlidesEditor();
          renderEditorialGalleryEditor();
          setStoreSettingsDirty(true);
          scheduleStorePreview();
        } catch (err) {
          errorEl.textContent = "No se pudo cambiar el medio del slider: " + err.message;
        } finally {
          if (row.isConnected) {
            controls.forEach((control, controlIndex) => (control.disabled = disabledStates[controlIndex]));
            replaceButton.classList.remove("is-loading");
            replaceButton.textContent = "Cambiar medio";
            replaceInput.value = "";
          }
        }
      });
      row.querySelector(".remove-slide").addEventListener("click", () => {
        pendingHeroSlides.splice(index, 1);
        renderHeroSlidesEditor();
        renderEditorialGalleryEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      });
    });
    wireSortableList({
      container: storeHeroSlidesListEl,
      rowSelector: ".hero-slide-editor-row",
      itemCount: pendingHeroSlides.length,
      onMove: (fromIndex, toIndex) => {
        moveSortableEntry(pendingHeroSlides, fromIndex, toIndex);
        renderHeroSlidesEditor();
        setStoreSettingsDirty(true);
        scheduleStorePreview();
      },
    });
  }

  function isVideoUploadUrl(url) {
    return /\.(mp4|webm)(?:$|[?#])/i.test(url);
  }

  function maxHeroMediaBytes(file) {
    if (file.type === "image/gif") return MAX_GIF_BYTES;
    if (file.type.startsWith("video/")) return MAX_VIDEO_BYTES;
    return MAX_IMAGE_BYTES;
  }

  function heroMediaValidationError(file) {
    const allowedHeroTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm"]);
    if (!allowedHeroTypes.has(file.type)) {
      return `Formato no soportado para ${file.name}. Usa PNG, JPEG, WEBP, GIF, MP4 o WEBM.`;
    }
    if (file.size > maxHeroMediaBytes(file)) {
      const limitMb = Math.floor(maxHeroMediaBytes(file) / 1_000_000);
      return `${file.name} supera el máximo de ${limitMb} MB.`;
    }
    return "";
  }

  storeHeroSlidesInputEl.addEventListener("change", async () => {
    errorEl.textContent = "";
    const available = MAX_HERO_SLIDES - pendingHeroSlides.length;
    const files = [...storeHeroSlidesInputEl.files].slice(0, available);
    if (files.length === 0) return;
    const invalidFile = files.find((file) => heroMediaValidationError(file));
    if (invalidFile) {
      errorEl.textContent = heroMediaValidationError(invalidFile);
      storeHeroSlidesInputEl.value = "";
      return;
    }
    storeHeroSlidesInputEl.disabled = true;
    storeSaveStatusEl.textContent = "Subiendo medios del slider…";
    try {
      for (const file of files) {
        const imageUrl = await uploadFile(file);
        pendingHeroSlides.push({ imageUrl, title: "", body: "", ctaLabel: "", ctaUrl: "" });
      }
      renderHeroSlidesEditor();
      renderEditorialGalleryEditor();
      setStoreSettingsDirty(true);
      scheduleStorePreview();
    } catch (err) {
      errorEl.textContent = "No se pudieron subir los medios del slider: " + err.message;
    } finally {
      storeHeroSlidesInputEl.value = "";
      storeHeroSlidesInputEl.disabled = pendingHeroSlides.length >= MAX_HERO_SLIDES;
    }
  });
  renderHeroSlidesEditor();

  document.getElementById("storeLinkAdd").addEventListener("click", () => {
    if (pendingStoreLinks.length >= MAX_STORE_LINKS) {
      errorEl.textContent = `Error: máximo ${MAX_STORE_LINKS} enlaces por tienda`;
      return;
    }
    pendingStoreLinks.push({ label: "", url: "" });
    renderStoreLinksEditor();
    storeLinksEditorEl.querySelector(".store-link-editor-row:last-child .link-label")?.focus();
    setStoreSettingsDirty(true);
  });

  async function handleBrandImageUpload(input, preview, removeBtn, label, onSuccess, validateFile) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      errorEl.textContent = `Error: ${label} no puede pesar más de 8MB`;
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      input.value = "";
      return;
    }
    try {
      if (validateFile) await validateFile(file);
      const url = await uploadFile(file);
      onSuccess(url);
      preview.src = dashboardAssetUrl(url);
      preview.style.objectPosition = "50% 50%";
      preview.style.display = "block";
      removeBtn.style.display = "inline-block";
      renderEditorialGalleryEditor();
      setStoreSettingsDirty(true);
      scheduleStorePreview();
    } catch (err) {
      errorEl.textContent = `Error subiendo ${label}: ` + err.message;
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      input.value = "";
    }
  }

  // Clearing sets the pending value to explicit null (not just hiding the preview) —
  // the submit handler sends null, not undefined, so the API actually clears the
  // stored field instead of leaving the last-saved URL in place.
  function wireBrandImageRemove(input, preview, removeBtn, setter) {
    removeBtn.addEventListener("click", () => {
      setter(null);
      input.value = "";
      preview.style.display = "none";
      preview.src = EMPTY_IMAGE_SRC;
      removeBtn.style.display = "none";
      renderEditorialGalleryEditor();
      setStoreSettingsDirty(true);
      scheduleStorePreview();
    });
  }

  storeLogoInputEl.addEventListener("change", () =>
    handleBrandImageUpload(storeLogoInputEl, storeLogoPreviewEl, storeLogoRemoveBtnEl, "el logo", (url) => (pendingLogoUrl = url)),
  );
  storeBannerInputEl.addEventListener("change", () =>
    handleBrandImageUpload(storeBannerInputEl, storeBannerPreviewEl, storeBannerRemoveBtnEl, "el banner", (url) => (pendingBannerUrl = url)),
  );
  storeAboutImageInputEl.addEventListener("change", () =>
    handleBrandImageUpload(
      storeAboutImageInputEl,
      storeAboutImagePreviewEl,
      storeAboutImageRemoveBtnEl,
      "el fondo de Nuestra historia",
      (url) => (pendingAboutImageUrl = url),
    ),
  );
  storePromotionImageInputEl.addEventListener("change", () =>
    handleBrandImageUpload(
      storePromotionImageInputEl,
      storePromotionImagePreviewEl,
      storePromotionImageRemoveBtnEl,
      "la imagen de la promoción",
      (url) => (pendingPromotionImageUrl = url),
    ),
  );
  wireBrandImageRemove(storeLogoInputEl, storeLogoPreviewEl, storeLogoRemoveBtnEl, (v) => (pendingLogoUrl = v));
  wireBrandImageRemove(storeBannerInputEl, storeBannerPreviewEl, storeBannerRemoveBtnEl, (v) => (pendingBannerUrl = v));
  wireBrandImageRemove(storeAboutImageInputEl, storeAboutImagePreviewEl, storeAboutImageRemoveBtnEl, (v) => (pendingAboutImageUrl = v));
  wireBrandImageRemove(storePromotionImageInputEl, storePromotionImagePreviewEl, storePromotionImageRemoveBtnEl, (v) => (pendingPromotionImageUrl = v));

  storeSettingsFormEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentStoreId) return;
    const saveStoreId = currentStoreId;
    const savedCheckoutMode = selectedStoreCheckoutMode();
    if (savedCheckoutMode === "whatsapp" && !hasUsableWhatsAppPhone(storeContactPhoneInputEl.value)) {
      errorEl.textContent = "Escribe un número de WhatsApp válido, con 7 a 15 dígitos.";
      storeContactPhoneInputEl.focus();
      return;
    }
    const locations = serializedStoreLocations();
    for (const location of locations) {
      const card = storeLocationsListEl.querySelector(`[data-location-id="${CSS.escape(location.id)}"]`);
      const nameInput = card?.querySelector('[data-location-field="name"]');
      if (!location.name) {
        errorEl.textContent = "Escribe un nombre para cada ubicación.";
        nameInput?.focus();
        return;
      }
      if (!location.pickupEnabled && !location.deliveryEnabled) {
        errorEl.textContent = `${location.name} debe permitir retiro, entrega o ambas opciones.`;
        card?.querySelector('[data-location-field="pickupEnabled"]')?.focus();
        return;
      }
      const invalidHours = location.openingHours.find((hours) => !hours.closed && hours.open >= hours.close);
      if (invalidHours) {
        errorEl.textContent = `En ${location.name}, la hora de cierre del ${STORE_LOCATION_DAYS[invalidHours.day].toLowerCase()} debe ser posterior a la apertura.`;
        card?.querySelector(`[data-location-hours-day="${invalidHours.day}"][data-location-hours-field="close"]`)?.focus();
        return;
      }
      if (!isSupportedStoreLocationMapUrl(location.mapEmbedUrl)) {
        const mapError = "Pega el código de inserción de Google Maps u OpenStreetMap; los enlaces comunes y otros sitios no se pueden incrustar.";
        const mapInput = card?.querySelector('[data-location-field="mapEmbedUrl"]');
        const inlineError = card?.querySelector(".field-validation-error");
        errorEl.textContent = mapError;
        mapInput?.setAttribute("aria-invalid", "true");
        if (inlineError) { inlineError.textContent = mapError; inlineError.hidden = false; }
        mapInput?.focus();
        return;
      }
    }
    errorEl.textContent = "";
    infoEl.textContent = "";
    // Ingest the form adapter once, then freeze the exact revision that will be
    // persisted. Everything below this line reads the captured state snapshot.
    storeEditorDraft.replaceDraft(currentStoreId, readStoreEditorAdapterSnapshot());
    const saveOperation = storeEditorDraft.beginSave();
    if (!saveOperation) return;
    const saveDraftFingerprint = saveOperation.fingerprint;
    syncStoreDraftUi();
    try {
      await persistCapturedWebsiteDraft(saveOperation);
      if (saveStoreId !== currentStoreId) return;
      // Only the captured revision was persisted. If the merchant kept typing
      // or dragged another element during the request, that newer draft stays
      // dirty and renderStoreRows will not replace it with the server response.
      storeEditorDraft.acknowledgeSave(saveOperation);
      syncStoreDraftUi();
      await refresh();
      // Refreshing the preview can repeat idempotent editor messages. Reconcile
      // against the submitted snapshot after that refresh so duplicate events do
      // not manufacture a dirty draft, while real edits made during the request
      // remain different and therefore stay ready for the next save.
      if (saveDraftFingerprint === storeEditorDraft.getState().fingerprint) {
        storeEditorDraft.acknowledgeSave(saveOperation);
        syncStoreDraftUi();
      }
      infoEl.textContent = storeSettingsDirty
        ? "Guardamos el borrador enviado. Tus cambios más recientes siguen listos para guardar."
        : "Borrador guardado en privado. Pulsa Publicar para actualizar la tienda.";
    } catch (err) {
      if (saveStoreId !== currentStoreId) return;
      storeEditorDraft.failSave(saveOperation, err);
      errorEl.textContent = "Error: " + err.message;
      storeSaveStatusEl.textContent = "No se pudieron guardar los cambios";
      storeSaveStatusEl.classList.add("is-dirty");
    } finally {
      storeEditorDraft.finishSave(saveOperation);
      syncStoreDraftUi();
    }
  });

  function storefrontCollections() {
    return Array.isArray(pendingSiteDocument?.merchandising?.collections)
      ? pendingSiteDocument.merchandising.collections
      : [];
  }

  function updateStorefrontCollections(collections, menuStyle, undoLabel) {
    if (!pendingSiteDocument) {
      document.getElementById("catalogCollectionStatus").textContent = "Genera o aplica un diseño de tienda antes de crear colecciones de vitrina.";
      return false;
    }
    const previousDocument = structuredClone(pendingSiteDocument);
    pushStoreEditorUndo(undoLabel, () => {
      pendingSiteDocument = structuredClone(previousDocument);
      pendingSiteSections = pendingSiteDocument.sections || [];
      renderCatalogCollectionRows();
    });
    pendingSiteDocument = {
      ...pendingSiteDocument,
      merchandising: {
        ...(pendingSiteDocument.merchandising || {}),
        collectionMenuStyle: menuStyle === "editorial-sidebar" ? "editorial-sidebar" : "tabs",
        collections: collections.map((collection) => ({
          id: String(collection.id),
          name: String(collection.name || "").trim().slice(0, 60),
          productIds: [...new Set(collection.productIds || [])],
        })),
      },
    };
    pendingSiteSections = pendingSiteDocument.sections || [];
    setStoreSettingsDirty(true);
    pendingStorePreviewSection = "products";
    pendingStorePreviewAction = "scroll";
    scheduleStorePreview(0);
    renderCatalogCollectionRows();
    return true;
  }

  function renderCatalogCollectionRows() {
    const rows = document.getElementById("catalogCollectionRows");
    const status = document.getElementById("catalogCollectionStatus");
    const menuStyle = document.getElementById("catalogCollectionMenuStyle");
    if (!rows || !menuStyle || !status) return;
    const collections = storefrontCollections();
    const createButton = document.querySelector("#catalogCollectionForm button[type='submit']");
    if (createButton) {
      createButton.disabled = !pendingSiteDocument || collections.length >= 12;
      createButton.textContent = collections.length >= 12 ? "Máximo alcanzado" : "Crear colección";
    }
    menuStyle.value = pendingSiteDocument?.merchandising?.collectionMenuStyle === "editorial-sidebar" ? "editorial-sidebar" : "tabs";
    menuStyle.disabled = !pendingSiteDocument;
    const products = lastPaymentLinks.filter((product) => product.status === "ACTIVE");
    if (!pendingSiteDocument) {
      rows.innerHTML = '<p class="muted" style="margin:0">Las colecciones aparecerán aquí cuando tu tienda tenga un diseño generado.</p>';
      status.textContent = "";
      return;
    }
    rows.innerHTML = collections.map((collection) => {
      const selectedIds = new Set((collection.productIds || []).slice(0, 200));
      return `<details class="catalog-collection-card" data-collection-id="${esc(collection.id)}">
        <summary><strong>${esc(collection.name)}</strong><span>${selectedIds.size} ${selectedIds.size === 1 ? "producto" : "productos"}</span></summary>
        <div class="catalog-collection-body">
          <label>Nombre visible<input data-collection-name="${esc(collection.id)}" maxlength="60" value="${esc(collection.name)}"></label>
          <div class="catalog-collection-products">${products.map((product) => `<label class="catalog-collection-product"><input type="checkbox" data-collection-product="${esc(collection.id)}" value="${esc(product.id)}" ${selectedIds.has(product.id) ? "checked" : ""} ${!selectedIds.has(product.id) && selectedIds.size >= 200 ? "disabled" : ""}><span>${esc(product.name)}</span></label>`).join("") || '<p class="muted">Crea productos para asignarlos a esta colección.</p>'}</div>
          <div class="catalog-collection-actions"><button type="button" class="ghost category-delete" data-delete-collection="${esc(collection.id)}">Eliminar colección</button></div>
        </div>
      </details>`;
    }).join("") || '<p class="muted" style="margin:0">Todavía no hay colecciones. Crea Invierno, Verano o cualquier línea que uses.</p>';
    status.textContent = collections.length ? "Los cambios se publican al guardar la tienda." : "";

    rows.querySelectorAll("[data-collection-name]").forEach((input) => input.addEventListener("change", () => {
      const name = input.value.trim();
      if (!name) return renderCatalogCollectionRows();
      updateStorefrontCollections(collections.map((collection) => collection.id === input.dataset.collectionName ? { ...collection, name } : collection), menuStyle.value, "renombrar una colección");
    }));
    rows.querySelectorAll("[data-collection-product]").forEach((input) => input.addEventListener("change", () => {
      const next = collections.map((collection) => {
        if (collection.id !== input.dataset.collectionProduct) return collection;
        const productIds = new Set(collection.productIds || []);
        if (input.checked) productIds.add(input.value);
        else productIds.delete(input.value);
        return { ...collection, productIds: [...productIds] };
      });
      updateStorefrontCollections(next, menuStyle.value, "cambiar productos de una colección");
    }));
    rows.querySelectorAll("[data-delete-collection]").forEach((button) => button.addEventListener("click", () => {
      updateStorefrontCollections(collections.filter((collection) => collection.id !== button.dataset.deleteCollection), menuStyle.value, "eliminar una colección");
    }));
  }

  document.getElementById("catalogCollectionForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("catalogCollectionName");
    const name = input.value.trim();
    if (!name || !pendingSiteDocument) return renderCatalogCollectionRows();
    const collections = storefrontCollections();
    if (collections.length >= 12) return renderCatalogCollectionRows();
    const used = new Set(collections.map((collection) => collection.id));
    const stem = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 38) || "coleccion";
    let id = /^[a-z]/.test(stem) ? stem : `coleccion-${stem}`;
    let suffix = 2;
    while (used.has(id)) id = `${stem.slice(0, 42)}-${suffix++}`;
    if (updateStorefrontCollections([...collections, { id, name, productIds: [] }], document.getElementById("catalogCollectionMenuStyle").value, "crear una colección")) input.value = "";
  });

  document.getElementById("catalogCollectionMenuStyle").addEventListener("change", (event) => {
    updateStorefrontCollections(storefrontCollections(), event.currentTarget.value, "cambiar el menú de colecciones");
  });

  document.getElementById("categoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    infoEl.textContent = "";
    if (!currentStoreId) return;
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api(`/stores/${currentStoreId}/categories`, { method: "POST", body: JSON.stringify({ name: data.name }) });
      e.target.reset();
      await refresh();
      infoEl.textContent = `Categoría "${data.name}" agregada.`;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  function queueCategoryOrderSave() {
    clearTimeout(categoryOrderSaveTimer);
    const version = ++categoryOrderSaveVersion;
    const orderedIds = lastCategories.map((category) => category.id);
    const status = document.getElementById("categoryOrderStatus");
    status.textContent = "Guardando orden…";
    categoryOrderSaveTimer = setTimeout(async () => {
      try {
        const saved = await api(`/stores/${currentStoreId}/categories/order`, {
          method: "PUT",
          body: JSON.stringify({ categoryIds: orderedIds }),
        });
        if (version !== categoryOrderSaveVersion) return;
        lastCategories = saved;
        renderCategoryRows(saved);
        status.textContent = "Orden guardado";
        refreshStorePreview(true);
      } catch (err) {
        if (version !== categoryOrderSaveVersion) return;
        status.textContent = "No se pudo guardar";
        errorEl.textContent = "Error guardando el orden de categorías: " + err.message;
      }
    }, 180);
  }

  function moveCategory(categoryId, targetIndex) {
    const fromIndex = lastCategories.findIndex((category) => category.id === categoryId);
    const boundedTarget = Math.max(0, Math.min(targetIndex, lastCategories.length - 1));
    if (fromIndex < 0 || fromIndex === boundedTarget) return;
    const next = [...lastCategories];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(boundedTarget, 0, moved);
    lastCategories = next;
    renderCategoryRows(next);
    queueCategoryOrderSave();
  }

  function renderCategoryRows(categories) {
    lastCategories = categories;
    const categoryRowsEl = document.getElementById("categoryRows");
    categoryRowsEl.innerHTML =
      categories
        .map(
          (category, index) => `<article class="category-order-row" data-id="${esc(category.id)}" draggable="true">
            <span class="category-grip" title="Arrastrar para ordenar" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/></svg>
            </span>
            <button class="category-name-button" type="button" data-action="rename" data-id="${esc(category.id)}" data-name="${esc(category.name)}" title="Cambiar nombre">${index + 1}. ${esc(category.name)}</button>
            <span class="category-order-actions">
              <button class="ghost" type="button" data-action="up" data-id="${esc(category.id)}" ${index === 0 ? "disabled" : ""} aria-label="Subir ${esc(category.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 15-6-6-6 6"/></svg></button>
              <button class="ghost" type="button" data-action="down" data-id="${esc(category.id)}" ${index === categories.length - 1 ? "disabled" : ""} aria-label="Bajar ${esc(category.name)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>
              <button class="ghost category-delete" type="button" data-action="delete" data-id="${esc(category.id)}" data-name="${esc(category.name)}">Eliminar</button>
            </span>
            <details class="category-customization" data-category-details="${esc(category.id)}" ${openCategoryEditorIds.has(category.id) ? "open" : ""}>
              <summary>Portada y mensajes de confianza</summary>
              <div class="category-customization-body">
                <div class="category-banner-editor">
                  <figure class="category-banner-preview">
                    ${category.bannerUrl ? `<img src="${esc(dashboardAssetUrl(category.bannerUrl))}" alt="Portada actual de ${esc(category.name)}">` : `<span>Se usará la primera foto disponible de esta categoría.</span>`}
                  </figure>
                  <div class="category-banner-copy">
                    <strong>Imagen del banner</strong>
                    <p class="faint">Aparece al entrar a esta sección. Usa PNG, JPEG o WEBP de hasta 8 MB.</p>
                    <div class="category-banner-actions">
                      <input type="file" accept="image/png,image/jpeg,image/webp" data-category-banner-input="${esc(category.id)}">
                      <button class="ghost" type="button" data-action="choose-banner" data-id="${esc(category.id)}">${category.bannerUrl ? "Cambiar imagen" : "Subir imagen"}</button>
                      ${category.bannerUrl ? `<button class="ghost category-delete" type="button" data-action="remove-banner" data-id="${esc(category.id)}">Quitar imagen</button>` : ""}
                    </div>
                  </div>
                </div>
                <div class="category-highlights-editor">
                  <strong>Mensajes informativos</strong>
                  <p class="faint">Agrega hasta cuatro promesas reales de tu negocio, por ejemplo “Envío rápido” o “Compra segura”.</p>
                  <div class="category-highlight-fields">
                    ${Array.from({ length: 4 }, (_, highlightIndex) => `<label>Mensaje ${highlightIndex + 1}<input class="category-highlight-input" type="text" maxlength="40" value="${esc(category.highlights?.[highlightIndex] || "")}" placeholder="${highlightIndex === 0 ? "Envío rápido" : highlightIndex === 1 ? "Compra segura" : "Opcional"}"></label>`).join("")}
                  </div>
                  <button class="primary category-highlight-save" type="button" data-action="save-highlights" data-id="${esc(category.id)}">Guardar mensajes</button>
                </div>
              </div>
            </details>
          </article>`,
        )
        .join("") || `<p class="muted" style="margin:0">Todavía no tienes categorías. Cuando agregues una, podrás ordenar cómo aparece en la tienda.</p>`;
    renderCatalogCollectionRows();
    renderPreviewCatalogEditor();

    categoryRowsEl.querySelectorAll("[data-category-details]").forEach((details) => {
      details.addEventListener("toggle", () => {
        if (details.open) openCategoryEditorIds.add(details.dataset.categoryDetails);
        else openCategoryEditorIds.delete(details.dataset.categoryDetails);
      });
    });

    categoryRowsEl.querySelectorAll("[data-category-banner-input]").forEach((input) => {
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        const categoryId = input.dataset.categoryBannerInput;
        const allowed = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
        if (!allowed || file.size > MAX_IMAGE_BYTES) {
          errorEl.textContent = file.size > MAX_IMAGE_BYTES
            ? "La imagen de la categoría supera el máximo de 8 MB."
            : "Usa una imagen PNG, JPEG o WEBP para la categoría.";
          input.value = "";
          return;
        }
        const row = input.closest(".category-order-row");
        const uploadButton = row?.querySelector('[data-action="choose-banner"]');
        if (uploadButton) {
          uploadButton.disabled = true;
          uploadButton.textContent = "Subiendo…";
        }
        errorEl.textContent = "";
        try {
          const bannerUrl = await uploadFile(file);
          const updated = await api(`/stores/${currentStoreId}/categories/${categoryId}`, {
            method: "PATCH",
            body: JSON.stringify({ bannerUrl }),
          });
          openCategoryEditorIds.add(categoryId);
          renderCategoryRows(lastCategories.map((category) => (category.id === updated.id ? updated : category)));
          infoEl.textContent = `Portada de “${updated.name}” actualizada.`;
          refreshStorePreview(true);
        } catch (err) {
          errorEl.textContent = "No se pudo guardar la portada de la categoría: " + err.message;
        } finally {
          input.value = "";
          if (uploadButton?.isConnected) {
            uploadButton.disabled = false;
            uploadButton.textContent = "Subir imagen";
          }
        }
      });
    });

    categoryRowsEl.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", async () => {
        const index = lastCategories.findIndex((category) => category.id === button.dataset.id);
        if (button.dataset.action === "up") return moveCategory(button.dataset.id, index - 1);
        if (button.dataset.action === "down") return moveCategory(button.dataset.id, index + 1);
        if (button.dataset.action === "choose-banner") {
          categoryRowsEl.querySelector(`[data-category-banner-input="${CSS.escape(button.dataset.id)}"]`)?.click();
          return;
        }
        if (button.dataset.action === "remove-banner") {
          errorEl.textContent = "";
          try {
            button.disabled = true;
            const updated = await api(`/stores/${currentStoreId}/categories/${button.dataset.id}`, {
              method: "PATCH",
              body: JSON.stringify({ bannerUrl: null }),
            });
            openCategoryEditorIds.add(button.dataset.id);
            renderCategoryRows(lastCategories.map((category) => (category.id === updated.id ? updated : category)));
            infoEl.textContent = `Portada personalizada de “${updated.name}” eliminada.`;
            refreshStorePreview(true);
          } catch (err) {
            button.disabled = false;
            errorEl.textContent = "No se pudo quitar la portada de la categoría: " + err.message;
          }
          return;
        }
        if (button.dataset.action === "save-highlights") {
          const row = button.closest(".category-order-row");
          const highlights = [...row.querySelectorAll(".category-highlight-input")]
            .map((input) => input.value.trim())
            .filter(Boolean)
            .filter((highlight, highlightIndex, values) => values.indexOf(highlight) === highlightIndex);
          errorEl.textContent = "";
          try {
            button.disabled = true;
            button.textContent = "Guardando…";
            const updated = await api(`/stores/${currentStoreId}/categories/${button.dataset.id}`, {
              method: "PATCH",
              body: JSON.stringify({ highlights }),
            });
            openCategoryEditorIds.add(button.dataset.id);
            renderCategoryRows(lastCategories.map((category) => (category.id === updated.id ? updated : category)));
            infoEl.textContent = `Mensajes de “${updated.name}” guardados.`;
            refreshStorePreview(true);
          } catch (err) {
            button.disabled = false;
            button.textContent = "Guardar mensajes";
            errorEl.textContent = "No se pudieron guardar los mensajes de la categoría: " + err.message;
          }
          return;
        }
        if (button.dataset.action === "rename") {
          const name = prompt("Nuevo nombre de la categoría:", button.dataset.name)?.trim();
          if (!name || name === button.dataset.name) return;
          try {
            const updated = await api(`/stores/${currentStoreId}/categories/${button.dataset.id}`, {
              method: "PATCH",
              body: JSON.stringify({ name }),
            });
            renderCategoryRows(lastCategories.map((category) => (category.id === updated.id ? updated : category)));
            infoEl.textContent = `Categoría renombrada como "${updated.name}".`;
            refreshStorePreview(true);
          } catch (err) {
            errorEl.textContent = "Error: " + err.message;
          }
          return;
        }
        if (!confirm(`¿Eliminar la categoría "${button.dataset.name}"? Sus productos quedarán sin categoría, no se eliminan.`)) return;
        try {
          await api(`/stores/${currentStoreId}/categories/${button.dataset.id}`, { method: "DELETE" });
          await refresh();
        } catch (err) {
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });

    categoryRowsEl.querySelectorAll(".category-order-row").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        if (!event.target.closest(".category-grip")) {
          event.preventDefault();
          return;
        }
        draggedCategoryId = row.dataset.id;
        row.classList.add("is-dragging");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", row.dataset.id);
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (draggedCategoryId && draggedCategoryId !== row.dataset.id) row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const droppedId = draggedCategoryId || event.dataTransfer.getData("text/plain");
        const targetIndex = lastCategories.findIndex((category) => category.id === row.dataset.id);
        row.classList.remove("is-drop-target");
        moveCategory(droppedId, targetIndex);
      });
      row.addEventListener("dragend", () => {
        draggedCategoryId = null;
        categoryRowsEl.querySelectorAll(".category-order-row").forEach((candidate) => candidate.classList.remove("is-dragging", "is-drop-target"));
      });
    });
  }

  function openCreateStore() {
    document.getElementById("createStoreTitle").textContent = lastStores.length ? "Crea otra tienda" : "Crea tu primera tienda";
    document.getElementById("createStoreError").hidden = true;
    document.getElementById("createStoreDialog").showModal();
    document.getElementById("createStoreName").focus();
  }
  document.getElementById("cancelCreateStore").addEventListener("click", () => document.getElementById("createStoreDialog").close());
  document.getElementById("storeLibrarySearch").addEventListener("input", () => renderStoreRows(lastStores));
  document.getElementById("storeLibraryStatus").addEventListener("change", () => renderStoreRows(lastStores));
  document.getElementById("sidebarStorePicker").addEventListener("change", async event => {
    const nextId = event.target.value;
    if (nextId === currentStoreId) return;
    if (!canLeaveMerchantStudio() || storeSettingsDirty && !confirm("Tienes cambios sin guardar. ¿Cambiar de tienda y descartarlos?")) { event.target.value = currentStoreId || ""; return; }
    setStoreSettingsDirty(false); selectStore(nextId); await refresh();
  });

  document.getElementById("createStoreForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const submit = form.querySelector('button[type="submit"]');
    if (submit.disabled) return;
    const data = Object.fromEntries(new FormData(form));
    if (!canLeaveMerchantStudio()) return;
    setButtonBusy(submit, true, "Creando…");
    try {
      const store = await api("/stores", { method: "POST", body: JSON.stringify({ name: data.name }) });
      form.reset();
      lastStores = [store, ...lastStores.filter(existing => existing.id !== store.id)];
      document.getElementById("createStoreDialog").close();
      selectStore(store.id);
      await refresh();
      history.pushState(null, "", "#dashboard-workspace");
      setDashboardView("workspace");
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
      const createError = document.getElementById("createStoreError");
      createError.textContent = err.message; createError.hidden = false;
      // Refresh after a concurrent change while keeping the creation dialog usable.
      if (err.status === 409) {
        try { renderStoreRows(await api("/stores")); } catch { /* Keep the original error visible. */ }
      }
    } finally {
      setButtonBusy(submit, false, "Crear tienda");
    }
  });

  document.getElementById("quickPaymentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    const form = event.currentTarget;
    const submit = document.getElementById("quickPaymentSubmit");
    const formStatus = document.getElementById("quickPaymentFormStatus");
    formStatus.textContent = "";
    try {
      const data = new FormData(form);
      const amount = debtAmountInCents(data.get("amount"));
      const description = String(data.get("description") || "").trim();
      submit.disabled = true;
      submit.textContent = "Generando…";
      stopQuickPaymentPolling();
      const payment = await api(`/stores/${currentStoreId}/quick-qr-payments`, {
        method: "POST",
        body: JSON.stringify({ amount, ...(description && { description }) }),
      });
      const result = document.getElementById("quickPaymentResult");
      const qr = document.getElementById("quickPaymentQr");
      document.getElementById("quickPaymentResultDescription").textContent = payment.description;
      document.getElementById("quickPaymentResultAmount").textContent = `${(payment.amount / 100).toFixed(2)} ${payment.currency}`;
      document.getElementById("quickPaymentResultStatus").classList.remove("success-text");
      if (payment.qrImageDataUrl) {
        qr.src = payment.qrImageDataUrl;
        qr.hidden = false;
        document.getElementById("quickPaymentResultStatus").textContent = "Esperando que el cliente escanee y confirme el pago…";
      } else {
        qr.removeAttribute("src");
        qr.hidden = true;
        document.getElementById("quickPaymentResultStatus").textContent = "El banco no devolvió una imagen QR. Crea un nuevo cobro o inténtalo nuevamente en unos segundos.";
      }
      result.hidden = false;
      result.scrollIntoView({ behavior: "smooth", block: "nearest" });
      if (!setQuickPaymentOutcome(payment.status)) pollQuickPayment(payment.paymentIntentId);
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = "Generar QR";
    }
  });

  document.getElementById("quickPaymentNew").addEventListener("click", () => {
    stopQuickPaymentPolling();
    document.getElementById("quickPaymentResult").hidden = true;
    document.getElementById("quickPaymentForm").reset();
    document.getElementById("quickPaymentFormStatus").textContent = "";
    document.getElementById("quickPaymentAmount").focus();
  });

  function resetDebtCollectionEntry(statusText = "") {
    const form = document.getElementById("debtCollectionForm");
    form.reset();
    debtAppendTarget = null;
    preparedDebtCsvRows = [];
    debtCsvImportVersion += 1;
    document.getElementById("debtCsvStatus").textContent = "";
    document.getElementById("debtManualPanel").hidden = false;
    document.getElementById("debtCsvPanel").hidden = true;
    document.getElementById("debtAppendContext").hidden = true;
    document.querySelectorAll(".debt-collection-metadata-field").forEach((field) => { field.hidden = false; });
    document.getElementById("debtCollectionName").required = true;
    document.getElementById("debtNotificationEmail").required = true;
    document.getElementById("debtNotificationEmail").value = emailEl.value;
    document.getElementById("debtCollectionSubmit").textContent = "Agregar deudas al portal";
    document.getElementById("debtCollectionStatus").textContent = statusText;
  }

  function enterDebtAppendMode(link) {
    resetDebtCollectionEntry();
    debtAppendTarget = { id: link.id, name: link.name };
    document.querySelectorAll(".debt-collection-metadata-field").forEach((field) => { field.hidden = true; });
    document.getElementById("debtCollectionName").required = false;
    document.getElementById("debtNotificationEmail").required = false;
    document.getElementById("debtAppendTargetName").textContent = `Agregar deudas a “${link.name}”`;
    document.getElementById("debtAppendContext").hidden = false;
    document.getElementById("debtCollectionSubmit").textContent = "Agregar a esta colección";
    document.getElementById("debtAppendContext").scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("debtCollectionRows").focus({ preventScroll: true });
  }

  document.getElementById("debtAppendCancel").addEventListener("click", () => resetDebtCollectionEntry());

  document.querySelectorAll('input[name="debtInputMode"]').forEach((radio) => radio.addEventListener("change", () => {
    const csvMode = document.querySelector('input[name="debtInputMode"]:checked')?.value === "csv";
    document.getElementById("debtManualPanel").hidden = csvMode;
    document.getElementById("debtCsvPanel").hidden = !csvMode;
    document.getElementById(csvMode ? "debtCsvInput" : "debtCollectionRows").focus();
  }));

  document.getElementById("debtCsvInput").addEventListener("change", async (event) => {
    const input = event.currentTarget;
    const status = document.getElementById("debtCsvStatus");
    preparedDebtCsvRows = [];
    status.textContent = "";
    const file = input.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      status.textContent = "Elige un archivo con extensión .csv.";
      return;
    }
    if (!currentStoreId) {
      status.textContent = "Selecciona una tienda antes de adaptar el CSV.";
      return;
    }
    const targetStoreId = currentStoreId;
    const importVersion = ++debtCsvImportVersion;
    status.textContent = "La IA está interpretando las columnas y los montos…";
    try {
      const csv = await file.text();
      try {
        const normalized = await api(`/stores/${targetStoreId}/debt-collection-links/import/normalize`, {
          method: "POST",
          body: JSON.stringify({ csv }),
        });
        if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
        preparedDebtCsvRows = Array.isArray(normalized?.debts) ? normalized.debts : [];
        if (!preparedDebtCsvRows.length) throw new Error("La IA no encontró deudas válidas en el archivo.");
        const warnings = Array.isArray(normalized?.warnings) ? normalized.warnings : [];
        const warningSummary = warnings.length ? ` · ${warnings.slice(0, 2).join(" ")}${warnings.length > 2 ? ` (+${warnings.length - 2} más)` : ""}` : "";
        const ignoredColumns = Number(normalized?.ignoredColumnCount || 0);
        const ignoredRows = Number(normalized?.ignoredRowCount || 0);
        const cleanupSummary = [
          ignoredColumns ? `${ignoredColumns} ${ignoredColumns === 1 ? "columna innecesaria omitida" : "columnas innecesarias omitidas"}` : "",
          ignoredRows ? `${ignoredRows} ${ignoredRows === 1 ? "fila innecesaria o excedente omitida" : "filas innecesarias o excedentes omitidas"}` : "",
        ].filter(Boolean).map((summary) => ` · ${summary}`).join("");
        status.textContent = `${file.name} · ${preparedDebtCsvRows.length} ${preparedDebtCsvRows.length === 1 ? "deuda adaptada" : "deudas adaptadas"} con IA${cleanupSummary}${warningSummary}`;
      } catch (aiError) {
        if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
        preparedDebtCsvRows = parseDebtCsv(csv);
        status.textContent = `${file.name} · ${preparedDebtCsvRows.length} ${preparedDebtCsvRows.length === 1 ? "deuda lista" : "deudas listas"} · adaptación básica (IA no disponible)`;
      }
    } catch (error) {
      if (importVersion !== debtCsvImportVersion || targetStoreId !== currentStoreId) return;
      status.textContent = error.message;
    }
  });

  document.getElementById("debtCollectionForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    const form = event.currentTarget;
    const submit = document.getElementById("debtCollectionSubmit");
    const status = document.getElementById("debtCollectionStatus");
    const appendTarget = debtAppendTarget ? { ...debtAppendTarget } : null;
    const targetStoreId = currentStoreId;
    errorEl.textContent = "";
    status.textContent = "";
    try {
      const data = new FormData(form);
      const csvMode = data.get("debtInputMode") === "csv";
      const debts = csvMode ? preparedDebtCsvRows : parseDebtCollectionRows(String(data.get("debts") || ""));
      if (csvMode && !debts.length) throw new Error("Selecciona un CSV válido con al menos una deuda.");
      submit.disabled = true;
      submit.textContent = appendTarget ? "Agregando…" : "Creando…";
      if (appendTarget) {
        await api(`/stores/${targetStoreId}/debt-collection-links/${appendTarget.id}/debts`, {
          method: "POST",
          body: JSON.stringify({ debts }),
        });
        resetDebtCollectionEntry(`${debts.length} ${debts.length === 1 ? "deuda agregada" : "deudas agregadas"} a “${appendTarget.name}”.`);
      } else {
        const link = await api(`/stores/${targetStoreId}/debt-collection-links`, {
          method: "POST",
          body: JSON.stringify({
            name: String(data.get("name") || "").trim(),
            notificationEmail: String(data.get("notificationEmail") || "").trim(),
            currency: "BOB",
            debts,
          }),
        });
        resetDebtCollectionEntry(`${debts.length} ${debts.length === 1 ? "deuda agregada" : "deudas agregadas"} al portal único. El link fue copiado.`);
        await navigator.clipboard.writeText(debtCollectionUrl(link.portalSlug || link.slug)).catch(() => undefined);
      }
      if (targetStoreId === currentStoreId) {
        renderDebtCollectionLinks(await api(`/stores/${targetStoreId}/debt-collection-links`));
      }
    } catch (error) {
      errorEl.textContent = `${appendTarget ? "Error agregando deudas" : "Error creando la colección"}: ${error.message}`;
    } finally {
      submit.disabled = false;
      submit.textContent = debtAppendTarget ? "Agregar a esta colección" : "Agregar deudas al portal";
    }
  });

  function selectStore(storeId) {
    const storeChanged = storeId !== currentStoreId;
    currentStoreId = storeId;
    domainShop?.setStore(storeId);
    if (storeId) sessionStorage.setItem("pagosya_current_store_id", storeId);
    else sessionStorage.removeItem("pagosya_current_store_id");
    if (storeChanged) {
      resetStoreDraftSession(storeId);
      loadAiSectionLocks(storeId);
      activePreviewSelection = null;
      activePreviewPageId = null;
      selectedPreviewSection = "brand";
      previewAddSectionEl.innerHTML = previewSectionInsertionOptions(false);
      renderPreviewContextEditor(null);
      birdUnlockQueue = birdUnlockQueue.filter((item) => {
        if (item.storeId === storeId) return true;
        queuedProgressLevels.delete(`${item.storeId}:${item.levelIndex}`);
        return false;
      });
      currentStoreDomains = [];
      renderCustomDomains([]);
      stopQuickPaymentPolling();
      resetPaymentLinkBrowseState();
      resetDebtCollectionEntry();
      document.getElementById("quickPaymentResult").hidden = true;
      lastPaymentLinks = [];
      selectedPreviewCatalogSectionId = null;
      previewCatalogEditorEl.hidden = true;
      lastDebtCollectionLinks = [];
      renderDebtCollectionLinks([]);
      window.updateYapiContext?.({ store: lastStores.find((store) => store.id === storeId) || null, products: [], finances: null });
      resetInventoryImportState();
      // Do not leave another store's AI output visible while the selected
      // store and its proposal history are loading.
      visualStudioStoreId = storeId;
      visualProposals = [];
      visualVersions = [];
      visualTemplates = [];
      visualProposalStatusEl.textContent = storeId ? "Cargando las propuestas de esta tienda…" : "";
      visualSourceStatusEl.textContent = storeId
        ? "Cargando el contenido y los borradores de esta tienda…"
        : "Selecciona una tienda para comenzar.";
      renderVisualStudio();
      document.getElementById("visualBusinessCategory").value = "";
      document.getElementById("visualCreativeBrief").value = "";
      visualAiFiles = [];
      visualAiUploads.clear();
      visualAiImagesEl.value = "";
      renderVisualAiFiles();
      clearTimeout(previewPostTimer);
      storePreviewFrameEl.removeAttribute("src");
      setStorePreviewState(storeId ? "loading" : "empty");
    }
  }

  import('/src/domain-shop.mjs').then(({ mountDomainShop }) => {
    domainShop = mountDomainShop(document.getElementById('domainShop'), { api, onSupport: () => assistantSupportOpenEl.click(),
      onConnected: (id) => { if (id === currentStoreId) refreshCurrentStoreDomains().catch(() => {}); } });
    domainShop.setStore(currentStoreId);
  }).catch(() => { document.getElementById('domainShop').textContent = 'No pudimos cargar la compra de dominios. Recarga la página para volver a intentar.'; });

  function setCustomDomainMessage(message, isError = false) {
    const status = document.getElementById("customDomainStatus");
    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function renderCustomDomains(domains) {
    currentStoreDomains = domains;
    const list = document.getElementById("customDomainList");
    const summary = document.getElementById("customDomainSummary");
    const form = document.getElementById("customDomainForm");
    const activeCount = domains.filter((domain) => domain.status === "ACTIVE").length;
    const verifiedCount = domains.filter((domain) => domain.status === "VERIFIED").length;
    summary.textContent = activeCount
      ? `${activeCount} activo${activeCount === 1 ? "" : "s"}`
      : verifiedCount
        ? "Propiedad verificada"
        : domains.length ? "Pendiente" : "Sin conectar";
    summary.className = `badge ${activeCount ? "ACTIVE" : verifiedCount ? "VERIFIED" : "PENDING"}`;
    form.querySelectorAll("input,button").forEach((control) => { control.disabled = !currentStoreId || domains.length >= 3; });

    if (!currentStoreId) {
      list.innerHTML = "";
      return;
    }
    if (!domains.length) {
      list.innerHTML = `<p class="custom-domain-empty">Aún no conectaste un dominio. Puedes seguir compartiendo el link de pagosYa sin cambiar nada.</p>`;
      return;
    }

    list.innerHTML = domains.map((domain) => {
      const active = domain.status === "ACTIVE";
      const ownershipVerified = domain.status === "VERIFIED";
      const verifiedLabel = active ? "Activo" : ownershipVerified ? "Propiedad verificada" : "Esperando DNS";
      return `<article class="custom-domain-card" data-domain-id="${esc(domain.id)}">
        <div class="custom-domain-card-head">
          <strong>${esc(domain.hostname)}</strong>
          <span class="badge ${active ? "ACTIVE" : ownershipVerified ? "VERIFIED" : "PENDING"}">${verifiedLabel}</span>
        </div>
        ${domain.managed ? `<p class="custom-domain-note">${active ? "Dominio conectado automáticamente con HTTPS." : "Estamos preparando este dominio. Consulta el progreso de tu compra arriba."}</p>` : active ? `<p class="custom-domain-note">El dominio ya abre esta tienda. El certificado HTTPS puede tardar unos minutos más en aparecer después de la primera activación.</p>` : `
          <div class="custom-domain-records" aria-label="Registros DNS para ${esc(domain.hostname)}">
            <div class="custom-domain-record-head" aria-hidden="true"><span>Tipo</span><span>Nombre / Host</span><span>Valor / Destino</span><span></span></div>
            <div class="custom-domain-record"><span data-label="Tipo">TXT</span><code data-label="Nombre / Host">${esc(domain.dns.verification.name)}</code><code data-label="Valor / Destino">${esc(domain.dns.verification.value)}</code><button class="ghost domain-copy" type="button" data-copy="${esc(domain.dns.verification.value)}">Copiar valor</button></div>
            <div class="custom-domain-record"><span data-label="Tipo">CNAME</span><code data-label="Nombre / Host">${esc(domain.dns.routing.name)}</code><code data-label="Valor / Destino">${esc(domain.dns.routing.value)}</code><button class="ghost domain-copy" type="button" data-copy="${esc(domain.dns.routing.value)}">Copiar destino</button></div>
          </div>
          <p class="custom-domain-note">${ownershipVerified ? "La propiedad ya está verificada. Falta que el registro de enrutamiento llegue al destino indicado." : "Si conectas el dominio raíz sin “www”, tu proveedor puede llamar al segundo registro ALIAS, ANAME o CNAME aplanado. Usa el mismo destino."}</p>`}
        <div class="custom-domain-actions">
          ${domain.managed ? "" : active ? `<a class="custom-domain-open" href="${esc(domain.url)}" target="_blank" rel="noopener noreferrer">Abrir dominio</a>` : `<button class="primary domain-verify" type="button">${ownershipVerified ? "Revisar enrutamiento" : "Ya agregué los registros"}</button>`}
          ${domain.managed ? "" : `<button class="ghost domain-remove" type="button">Desconectar</button>`}
        </div>
      </article>`;
    }).join("");
  }

  function updateSelectedStoreDomains(domains) {
    const store = lastStores.find((candidate) => candidate.id === currentStoreId);
    if (store) {
      store.customDomains = domains.map((domain) => ({
        id: domain.id,
        hostname: domain.hostname,
        status: domain.status,
        verifiedAt: domain.verifiedAt,
      }));
    }
    renderCustomDomains(domains);
    renderCurrentStoreBanner();
    const openLink = document.querySelector(`.store-row[data-id="${CSS.escape(currentStoreId || "")}"] .store-row-open`);
    if (store && openLink) openLink.href = merchantStoreViewUrl(store);
  }

  async function refreshCurrentStoreDomains() {
    const storeId = currentStoreId;
    if (!storeId) return renderCustomDomains([]);
    const domains = await api(`/stores/${storeId}/domains`);
    if (storeId === currentStoreId) updateSelectedStoreDomains(domains);
  }

  document.getElementById("customDomainForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentStoreId) return;
    const button = document.getElementById("customDomainConnect");
    const input = document.getElementById("customDomainHostname");
    button.disabled = true;
    button.textContent = "Preparando DNS…";
    setCustomDomainMessage("Creando una verificación única para este dominio.");
    try {
      await api(`/stores/${currentStoreId}/domains`, { method: "POST", body: JSON.stringify({ hostname: input.value }) });
      input.value = "";
      await refreshCurrentStoreDomains();
      setCustomDomainMessage("Registros listos. Agrégalos en tu proveedor de dominio y luego verifica la conexión.");
    } catch (error) {
      setCustomDomainMessage(error.message, true);
    } finally {
      button.textContent = "Conectar dominio";
      button.disabled = !currentStoreId || currentStoreDomains.length >= 3;
    }
  });

  document.getElementById("customDomainList").addEventListener("click", async (event) => {
    const copyButton = event.target.closest(".domain-copy");
    if (copyButton) {
      try {
        await navigator.clipboard.writeText(copyButton.dataset.copy);
        setCustomDomainMessage("Valor DNS copiado.");
      } catch {
        setCustomDomainMessage("No pudimos copiarlo automáticamente. Selecciona el valor del registro y cópialo manualmente.", true);
      }
      return;
    }

    const card = event.target.closest(".custom-domain-card");
    if (!card || !currentStoreId) return;
    const domain = currentStoreDomains.find((candidate) => candidate.id === card.dataset.domainId);
    if (!domain) return;

    const verifyButton = event.target.closest(".domain-verify");
    if (verifyButton) {
      verifyButton.disabled = true;
      verifyButton.textContent = "Buscando en DNS…";
      setCustomDomainMessage(`Verificando ${domain.hostname}.`);
      try {
        const result = await api(`/stores/${currentStoreId}/domains/${domain.id}/verify`, { method: "POST" });
        await refreshCurrentStoreDomains();
        setCustomDomainMessage(result.status === "ACTIVE"
          ? `${domain.hostname} está conectado y ya es el link principal de la tienda.`
          : `La propiedad de ${domain.hostname} está verificada. El registro CNAME, ALIAS o ANAME todavía no apunta al destino indicado.`);
      } catch (error) {
        verifyButton.disabled = false;
        verifyButton.textContent = "Volver a verificar";
        setCustomDomainMessage(error.message, true);
      }
      return;
    }

    if (event.target.closest(".domain-remove")) {
      if (!confirm(`¿Desconectar ${domain.hostname} de esta tienda?`)) return;
      try {
        await api(`/stores/${currentStoreId}/domains/${domain.id}`, { method: "DELETE" });
        await refreshCurrentStoreDomains();
        setCustomDomainMessage("Dominio desconectado. También puedes quitar sus registros DNS en tu proveedor.");
      } catch (error) {
        setCustomDomainMessage(error.message, true);
      }
    }
  });

  function currentStoreUrl() {
    const store = lastStores.find((s) => s.id === currentStoreId);
    if (!store) return "";
    return publicStoreUrl(store);
  }

  function publicStoreUrl(store) {
    const activeDomain = (store.customDomains || []).find((domain) => domain.status === "ACTIVE");
    if (activeDomain) return `https://${activeDomain.hostname}`;
    return checkoutOriginEl.value.replace(/\/$/, "") + "/s/" + encodeURIComponent(store.slug);
  }

  function merchantStoreViewUrl(store) {
    return publicStoreUrl(store);
  }

  function debtCollectionUrl(slug) {
    return checkoutOriginEl.value.replace(/\/$/, "") + "/?debt=" + encodeURIComponent(slug);
  }

  function renderDebtCollectionLinks(links) {
    lastDebtCollectionLinks = links;
    const list = document.getElementById("debtCollectionList");
    if (!currentStoreId) {
      list.innerHTML = "";
      return;
    }
    if (!links.length) {
      list.innerHTML = `<p class="debt-collection-empty muted">Todavía no hay links de cobro para esta tienda.</p>`;
      return;
    }
    const portalSlug = links.find((link) => link.portalSlug)?.portalSlug || links.find((link) => link.status === "ACTIVE")?.slug;
    const portalSummary = portalSlug ? `<section class="debt-portal-summary" aria-label="Portal único de cobros">
      <div>
        <span class="debt-portal-kicker">UN SOLO LINK · TODAS LAS DEUDAS</span>
        <h4>Portal único de cobros</h4>
        <p>Este link reúne todas las colecciones activas. Si un carnet tiene varias deudas, la persona podrá elegir cuáles pagar.</p>
      </div>
      <div class="debt-portal-actions">
        <a class="primary" href="${esc(debtCollectionUrl(portalSlug))}" target="_blank" rel="noopener noreferrer">Abrir portal</a>
        <button class="ghost copy-debt-portal" type="button" data-slug="${esc(portalSlug)}">Copiar link</button>
      </div>
    </section>` : "";
    const renderCollectionCard = (link) => {
      const debts = Array.isArray(link.debts) ? link.debts : [];
      const pending = debts.filter((debt) => debt.status === "PENDING");
      const paid = debts.length - pending.length;
      const pendingAmount = pending.reduce((total, debt) => total + Number(debt.amount || 0), 0);
      const active = link.status === "ACTIVE";
      const payerListId = `debt-payers-${link.id}`;
      const expanded = expandedDebtCollectionIds.has(link.id);
      return `<article class="debt-collection-row" data-id="${esc(link.id)}">
        <div class="debt-collection-summary">
          <div>
            <h4>${esc(link.name)} ${active ? "" : '<span class="badge ARCHIVED">ARCHIVADO</span>'}</h4>
            <div class="debt-collection-meta">
              <span>${debts.length} ${debts.length === 1 ? "deuda" : "deudas"}</span>
              <span>${paid} pagadas</span>
              <span>${pending.length} pendientes · ${money(pendingAmount)}</span>
              ${link.notificationEmail ? `<span>Alertas: ${esc(link.notificationEmail)}</span>` : ""}
            </div>
          </div>
          <div class="debt-collection-row-actions">
            ${active ? `<button class="ghost add-debts-to-collection" type="button" data-id="${esc(link.id)}">Agregar deudas</button>
              <button class="ghost archive-debt-link" type="button" data-id="${esc(link.id)}">Archivar colección</button>`
              : `<button class="ghost restore-debt-link" type="button" data-id="${esc(link.id)}">Restaurar link</button>`}
          </div>
        </div>
        <button class="debt-payer-toggle" type="button" data-id="${esc(link.id)}" aria-expanded="${expanded}" aria-controls="${esc(payerListId)}">
          <span class="debt-payer-toggle-copy">
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m7 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>
            <strong>Estado de las personas</strong>
          </span>
          <span class="debt-payer-toggle-count">${paid} de ${debts.length} pagaron</span>
        </button>
        <div class="debt-payer-list" id="${esc(payerListId)}" data-id="${esc(link.id)}" ${expanded ? "" : "hidden"}>
          <div class="debt-payer-tools">
            <label class="debt-payer-search-wrap">
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" stroke-width="1.8"/><path d="m13 13 4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="square"/></svg>
              <input class="debt-payer-search" type="search" placeholder="Buscar persona, carnet o referencia" aria-label="Buscar en ${esc(link.name)}">
            </label>
            <span class="debt-payer-results" aria-live="polite">${debts.length} ${debts.length === 1 ? "persona" : "personas"}</span>
            <button class="ghost debt-payer-export" type="button" data-id="${esc(link.id)}" data-slug="${esc(link.slug)}">Descargar PDF</button>
          </div>
          ${debts.map((debt) => {
            const isPaid = debt.status === "PAID";
            const supportingLabel = [debt.customerDocument && `CI ${debt.customerDocument}`, debt.customerEmail, debt.customerPhone, debt.reference].filter(Boolean).join(" · ");
            return `<div class="debt-payer-row${isPaid ? " is-paid" : ""}">
              <span class="debt-payer-mark" aria-hidden="true">${isPaid ? '<svg viewBox="0 0 20 20" fill="none"><path d="m4 10 4 4 8-9" stroke="currentColor" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/></svg>' : ""}</span>
              <span class="debt-payer-identity"><strong>${esc(debt.customerName || "Persona sin nombre")}</strong>${supportingLabel ? `<span>${esc(supportingLabel)}</span>` : ""}</span>
              <span class="debt-payer-state">${isPaid ? "Pagó" : "Pendiente"}<span class="debt-payer-amount">${money(Number(debt.amount || 0))}</span></span>
            </div>`;
          }).join("")}
          <p class="debt-payer-empty" hidden>No hay personas que coincidan con la búsqueda.</p>
          <nav class="debt-payer-pagination" aria-label="Páginas de ${esc(link.name)}" hidden>
            <span class="debt-page-summary"></span>
            <span class="debt-page-controls"></span>
          </nav>
        </div>
      </article>`;
    };
    const collectionGroups = [
      { status: "ACTIVE", title: "En el portal", description: "Colecciones visibles y listas para cobrar", className: "is-active", empty: "No hay colecciones activas en el portal." },
      { status: "ARCHIVED", title: "Archivados", description: "Colecciones ocultas que puedes restaurar", className: "is-archived", empty: "No hay colecciones archivadas." },
    ];
    const compactPageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      ordered.forEach((page, index) => {
        if (index && page - ordered[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };
    const previousIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
    const nextIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
    const groupedLinks = collectionGroups.map((group) => {
      const matchingLinks = links.filter((link) => link.status === group.status);
      const totalPages = Math.max(1, Math.ceil(matchingLinks.length / debtCollectionPageSize));
      const requestedPage = debtCollectionPageByStatus.get(group.status) || 1;
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
      debtCollectionPageByStatus.set(group.status, currentPage);
      const start = (currentPage - 1) * debtCollectionPageSize;
      const visibleLinks = matchingLinks.slice(start, start + debtCollectionPageSize);
      const summary = matchingLinks.length ? `${start + 1}–${Math.min(start + debtCollectionPageSize, matchingLinks.length)} de ${matchingLinks.length}` : "0 links";
      return `<section class="debt-link-group ${group.className}" id="debt-link-${group.status.toLowerCase()}-panel" role="tabpanel" data-debt-link-status="${group.status}" aria-labelledby="debt-link-tab-${group.status.toLowerCase()}" ${debtLinkStatusTab === group.status ? "" : "hidden"}>
        <header class="debt-link-group-head">
          <h4>${group.title}</h4>
          <span class="debt-link-group-count">${matchingLinks.length} ${matchingLinks.length === 1 ? "link" : "links"}</span>
        </header>
        <div class="debt-link-group-body">${visibleLinks.length ? visibleLinks.map(renderCollectionCard).join("") : `<p class="debt-link-group-empty">${group.empty}</p>`}</div>
        <nav class="debt-link-pagination" aria-label="Páginas de ${group.title.toLowerCase()}" ${totalPages <= 1 ? "hidden" : ""}>
          <span class="debt-link-page-summary">${summary}</span>
          <span class="debt-link-page-controls">
            <button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${currentPage - 1}" aria-label="Página anterior de ${group.title.toLowerCase()}" ${currentPage === 1 ? "disabled" : ""}>${previousIcon}</button>
            ${compactPageTokens(currentPage, totalPages).map((token) => token === "gap"
              ? '<span class="debt-page-gap" aria-hidden="true">…</span>'
              : `<button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${token}" aria-label="Página ${token} de ${group.title.toLowerCase()}" ${token === currentPage ? 'aria-current="page"' : ""}>${token}</button>`).join("")}
            <button class="debt-link-page-button" type="button" data-status="${group.status}" data-page="${currentPage + 1}" aria-label="Página siguiente de ${group.title.toLowerCase()}" ${currentPage === totalPages ? "disabled" : ""}>${nextIcon}</button>
          </span>
        </nav>
      </section>`;
    }).join("");
    const debtTabs = `<div class="debt-link-tabs" role="tablist" aria-label="Estado de las colecciones">
      ${collectionGroups.map((group) => {
        const count = links.filter((link) => link.status === group.status).length;
        return `<button class="debt-link-tab" id="debt-link-tab-${group.status.toLowerCase()}" type="button" role="tab" data-status="${group.status}" aria-selected="${debtLinkStatusTab === group.status}" aria-controls="debt-link-${group.status.toLowerCase()}-panel">
          <strong>${group.title}</strong><span>${count}</span><small>${group.description}</small>
        </button>`;
      }).join("")}
    </div>`;
    list.innerHTML = portalSummary + debtTabs + `<div class="debt-link-groups">${groupedLinks}</div>`;

    list.querySelectorAll(".debt-link-tab").forEach((button) => button.addEventListener("click", () => {
      debtLinkStatusTab = button.dataset.status;
      renderDebtCollectionLinks(lastDebtCollectionLinks);
      document.getElementById(`debt-link-tab-${debtLinkStatusTab.toLowerCase()}`)?.focus();
    }));

    list.querySelectorAll(".debt-link-page-button:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
      debtCollectionPageByStatus.set(button.dataset.status, Number(button.dataset.page));
      renderDebtCollectionLinks(lastDebtCollectionLinks);
    }));

    const pageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const sorted = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      sorted.forEach((page, index) => {
        if (index > 0 && page - sorted[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };

    const updatePayerPage = (container, requestedPage) => {
      const collectionId = container.dataset.id;
      const rows = [...container.querySelectorAll(".debt-payer-row")];
      const matchingRows = rows.filter((row) => row.dataset.searchMatch !== "false");
      const totalPages = Math.max(1, Math.ceil(matchingRows.length / debtPayerPageSize));
      const storedPage = requestedPage ?? debtPayerPageByCollectionId.get(collectionId) ?? 1;
      const currentPage = Math.min(Math.max(1, storedPage), totalPages);
      debtPayerPageByCollectionId.set(collectionId, currentPage);
      const firstIndex = (currentPage - 1) * debtPayerPageSize;
      const visibleRows = new Set(matchingRows.slice(firstIndex, firstIndex + debtPayerPageSize));
      rows.forEach((row) => { row.hidden = !visibleRows.has(row); });

      const resultCount = container.querySelector(".debt-payer-results");
      resultCount.textContent = `${matchingRows.length} ${matchingRows.length === 1 ? "persona" : "personas"}`;
      container.querySelector(".debt-payer-empty").hidden = matchingRows.length > 0;
      const pagination = container.querySelector(".debt-payer-pagination");
      pagination.hidden = matchingRows.length <= debtPayerPageSize;
      if (pagination.hidden) return;

      const rangeStart = firstIndex + 1;
      const rangeEnd = Math.min(firstIndex + debtPayerPageSize, matchingRows.length);
      pagination.querySelector(".debt-page-summary").textContent = `${rangeStart}–${rangeEnd} de ${matchingRows.length}`;
      const previousIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m12 4-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
      const nextIcon = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="m8 4 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter"/></svg>';
      const controls = pagination.querySelector(".debt-page-controls");
      controls.innerHTML = `
        <button class="debt-page-button" type="button" data-page="${currentPage - 1}" aria-label="Página anterior" ${currentPage === 1 ? "disabled" : ""}>${previousIcon}</button>
        ${pageTokens(currentPage, totalPages).map((token) => token === "gap"
          ? '<span class="debt-page-gap" aria-hidden="true">…</span>'
          : `<button class="debt-page-button" type="button" data-page="${token}" aria-label="Página ${token}" ${token === currentPage ? 'aria-current="page"' : ""}>${token}</button>`).join("")}
        <button class="debt-page-button" type="button" data-page="${currentPage + 1}" aria-label="Página siguiente" ${currentPage === totalPages ? "disabled" : ""}>${nextIcon}</button>`;
      controls.querySelectorAll(".debt-page-button:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
        updatePayerPage(container, Number(button.dataset.page));
      }));
    };

    list.querySelectorAll(".debt-payer-list").forEach((container) => updatePayerPage(container));

    list.querySelectorAll(".debt-payer-toggle").forEach((button) => button.addEventListener("click", () => {
      const linkId = button.dataset.id;
      const payerList = document.getElementById(button.getAttribute("aria-controls"));
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      payerList.hidden = expanded;
      if (expanded) expandedDebtCollectionIds.delete(linkId);
      else expandedDebtCollectionIds.add(linkId);
    }));

    list.querySelectorAll(".debt-payer-search").forEach((input) => input.addEventListener("input", () => {
      const container = input.closest(".debt-payer-list");
      const searchKey = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]/g, "");
      const query = searchKey(input.value);
      const rows = [...container.querySelectorAll(".debt-payer-row")];
      rows.forEach((row) => {
        const searchable = searchKey(row.textContent);
        row.dataset.searchMatch = String(!query || searchable.includes(query));
      });
      updatePayerPage(container, 1);
    }));

    list.querySelectorAll(".debt-payer-export").forEach((button) => button.addEventListener("click", async () => {
      const original = button.textContent;
      button.disabled = true;
      button.textContent = "Preparando PDF…";
      try {
        const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/status.pdf`, {
          headers: { authorization: "Bearer " + sessionToken },
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || "No se pudo generar el PDF.");
        }
        const url = URL.createObjectURL(await response.blob());
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `estado-pagos-${button.dataset.slug}.pdf`;
        anchor.click();
        URL.revokeObjectURL(url);
        button.textContent = "PDF descargado";
        window.setTimeout(() => { if (button.isConnected) button.textContent = original; }, 1600);
      } catch (error) {
        errorEl.textContent = `Error al descargar el PDF: ${error.message}`;
        button.textContent = original;
      } finally {
        button.disabled = false;
      }
    }));

    list.querySelectorAll(".copy-debt-portal").forEach((button) => button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(debtCollectionUrl(button.dataset.slug));
      const original = button.textContent;
      button.textContent = "Copiado";
      window.setTimeout(() => (button.textContent = original), 1400);
    }));
    list.querySelectorAll(".add-debts-to-collection").forEach((button) => button.addEventListener("click", () => {
      const link = links.find((candidate) => candidate.id === button.dataset.id);
      if (link) enterDebtAppendMode(link);
    }));
    list.querySelectorAll(".archive-debt-link").forEach((button) => button.addEventListener("click", async () => {
      if (!confirm("¿Archivar esta colección? Sus deudas pendientes dejarán de aparecer en el portal único.")) return;
      try {
        await api(`/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/archive`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${currentStoreId}/debt-collection-links`));
      } catch (error) {
        errorEl.textContent = "Error: " + error.message;
      }
    }));
    list.querySelectorAll(".restore-debt-link").forEach((button) => button.addEventListener("click", async () => {
      try {
        button.disabled = true;
        button.textContent = "Restaurando…";
        await api(`/stores/${currentStoreId}/debt-collection-links/${button.dataset.id}/restore`, { method: "POST" });
        renderDebtCollectionLinks(await api(`/stores/${currentStoreId}/debt-collection-links`));
        infoEl.textContent = "Link de deuda restaurado y agregado nuevamente al portal.";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Restaurar link";
        errorEl.textContent = "Error: " + error.message;
      }
    }));
  }

  function debtAmountInCents(value, lineNumber) {
    let normalized = String(value || "").trim().replace(/\s|Bs\.?/gi, "");
    if (normalized.includes(",") && normalized.includes(".")) normalized = normalized.replace(/\./g, "").replace(",", ".");
    else normalized = normalized.replace(",", ".");
    const amount = Number(normalized);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(lineNumber ? `Monto inválido en la línea ${lineNumber}.` : "Escribe un monto válido mayor a cero.");
    }
    return Math.round(amount * 100);
  }

  function parseDebtCollectionRows(text) {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error("Agrega al menos una deuda.");
    if (lines.length > 1000) throw new Error("Puedes cargar hasta 1.000 deudas por link.");
    return lines.map((line, index) => {
      const [rawDocument = "", customerName = "", rawAmount = "", description = "", reference = "", customerEmail = "", customerPhone = ""] = line.split(";").map((cell) => cell.trim());
      const customerDocument = debtDocumentDigits(rawDocument);
      if (!customerDocument || !customerName || !rawAmount) throw new Error(`Completa carnet, nombre y monto en la línea ${index + 1}.`);
      return {
        customerDocument,
        customerName,
        amount: debtAmountInCents(rawAmount, index + 1),
        ...(description && { description }),
        ...(reference && { reference }),
        ...(customerEmail && { customerEmail }),
        ...(customerPhone && { customerPhone }),
      };
    });
  }

  function parseDebtCsv(text) {
    const source = String(text || "").replace(/^\uFEFF/, "").trim();
    if (!source) throw new Error("El CSV está vacío.");
    const delimiter = csvDelimiter(source);
    const table = parseCsvTable(source, delimiter).filter((row) => row.some((cell) => cell.trim()));
    if (!table.length) throw new Error("El CSV está vacío.");
    const aliases = {
      customerDocument: ["nit", "nro_nit", "numeronit", "carnet", "ci", "cedula", "documento", "nrodocumento", "identificacion", "customerdocument", "customer_document"],
      customerName: ["nombre", "cliente", "alumno", "estudiante", "socio", "nombrecliente", "customername", "customer_name"],
      amount: ["monto", "montobs", "importe", "deuda", "saldo", "saldobs", "cuota", "precio", "total", "amount"],
      customerEmail: ["gmail", "correo", "correoelectronico", "email", "customeremail", "customer_email"],
      customerPhone: ["telefono", "telefonocelular", "celular", "movil", "whatsapp", "phone", "customerphone", "customer_phone"],
    };
    const normalizedHeader = table[0].map(normalizeDebtCsvHeader);
    const positions = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, normalizedHeader.findIndex((value) => names.includes(value))]));
    const hasHeader = positions.customerDocument >= 0 && positions.customerName >= 0 && positions.amount >= 0;
    const rows = hasHeader ? table.slice(1) : table;
    if (!rows.length) throw new Error("El CSV no contiene deudas debajo de los encabezados.");
    const parsed = rows.flatMap((row, index) => {
      const line = index + (hasHeader ? 2 : 1);
      const cell = (key, fallback) => String(row[hasHeader ? positions[key] : fallback] || "").trim();
      const customerDocument = debtDocumentDigits(cell("customerDocument", 0));
      const customerName = cell("customerName", 1);
      const rawAmount = cell("amount", 2);
      const customerEmail = cell("customerEmail", 3);
      const customerPhone = cell("customerPhone", 4);
      if (!customerDocument || !customerName || !rawAmount) return [];
      let amount;
      try { amount = debtAmountInCents(rawAmount, line); }
      catch { return []; }
      return [{
        customerDocument,
        customerName,
        amount,
        ...(customerEmail && { customerEmail }),
        ...(customerPhone && { customerPhone }),
      }];
    });
    if (!parsed.length) throw new Error("El CSV no contiene filas con NIT/CI, nombre y monto válidos.");
    return parsed.slice(0, 1000);
  }

  function debtDocumentDigits(value) {
    return String(value || "").normalize("NFKC").replace(/[^0-9]/g, "");
  }

  function normalizeDebtCsvHeader(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  function csvDelimiter(text) {
    const firstLine = text.split(/\r?\n/, 1)[0] || "";
    return (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : ",";
  }

  function parseCsvTable(text, delimiter) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (char === '"') {
        if (quoted && text[index + 1] === '"') { cell += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        row.push(cell); cell = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && text[index + 1] === "\n") index += 1;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += char;
    }
    row.push(cell);
    if (row.some((value) => value.length)) rows.push(row);
    if (quoted) throw new Error("El CSV tiene una comilla sin cerrar.");
    return rows;
  }

  function stopQuickPaymentPolling() {
    quickPaymentPollGeneration += 1;
    if (quickPaymentPollTimer) window.clearTimeout(quickPaymentPollTimer);
    quickPaymentPollTimer = null;
  }

  function setQuickPaymentOutcome(status) {
    const statusEl = document.getElementById("quickPaymentResultStatus");
    if (status === "SUCCEEDED") {
      statusEl.textContent = "Pago recibido y registrado correctamente.";
      statusEl.classList.add("success-text");
      refreshFinancesInBackground();
      return true;
    }
    if (["FAILED", "CANCELED"].includes(status)) {
      statusEl.textContent = status === "CANCELED" ? "Este cobro fue cancelado." : "El pago no se completó. Crea un nuevo QR para reintentar.";
      statusEl.classList.remove("success-text");
      return true;
    }
    return false;
  }

  function pollQuickPayment(paymentIntentId) {
    stopQuickPaymentPolling();
    const generation = quickPaymentPollGeneration;
    let attempts = 0;
    const poll = async () => {
      if (generation !== quickPaymentPollGeneration) return;
      attempts += 1;
      try {
        const payment = await api(`/payment_intents/${paymentIntentId}`);
        if (generation !== quickPaymentPollGeneration || setQuickPaymentOutcome(payment.status)) return;
      } catch {
        // A temporary dashboard/network failure does not invalidate the bank
        // QR. Keep the visible QR and try again within the bounded window.
      }
      if (attempts >= 60) {
        document.getElementById("quickPaymentResultStatus").textContent = "El QR sigue visible, pero dejamos de consultar automáticamente. Revisa Pedidos y pagos para confirmar el estado.";
        return;
      }
      quickPaymentPollTimer = window.setTimeout(poll, 2500);
    };
    quickPaymentPollTimer = window.setTimeout(poll, 2500);
  }

  function renderCurrentStoreBanner() {
    const store = lastStores.find((s) => s.id === currentStoreId);
    document.getElementById("currentStoreLabel").textContent = store ? store.name : "esta tienda";
    document.getElementById("currentStoreLink").value = currentStoreUrl();
    refreshStorePreview();
  }

  function renderStoreRows(stores) {
    lastStores = stores;
    const picker = document.getElementById("sidebarStorePicker");
    picker.innerHTML = stores.length ? stores.map(store => `<option value="${esc(store.id)}">${esc(store.name)}</option>`).join("") : '<option value="">Crea tu primera tienda</option>';
    picker.disabled = !stores.length;

    // If the previously selected store is gone (or nothing was selected yet), fall back
    // to the first store so the Productos/Apariencia sections always show something usable.
    if (!stores.some((s) => s.id === currentStoreId)) {
      selectStore(stores[0] ? stores[0].id : null);
    }

    picker.value = currentStoreId || "";
    const search = document.getElementById("storeLibrarySearch").value.trim().toLocaleLowerCase();
    const filter = document.getElementById("storeLibraryStatus").value;
    const statusFor = store => store.status === "ARCHIVED" ? "archived" : (store.publishedSourceRevision ? !store.sourcePublicationPaused : store.websitePublishedRevision > 0) ? "published" : "draft";
    const visible = stores.filter(store => (!search || store.name.toLocaleLowerCase().includes(search)) && (!filter || statusFor(store) === filter));
    document.getElementById("storeLibraryCount").textContent = `${visible.length} de ${stores.length} ${stores.length === 1 ? "tienda" : "tiendas"}`;
    document.getElementById("storeRows").innerHTML = `<button class="store-create-tile" id="openCreateStore" type="button"><span aria-hidden="true">+</span><strong>Crear una tienda</strong><small>Empieza desde cero</small></button>` + visible.map(store => {
      const revision = store.sourceProject?.revision || store.publishedSourceRevision;
      const cover = store.bannerUrl || store.heroSlides?.[0]?.imageUrl || store.publicityImageUrl;
      const preview = revision ? `<iframe src="/studio/?thumbnail=1&embedded=1&store=${encodeURIComponent(store.id)}&revision=${Number(revision)}" title="Vista de ${esc(store.name)}" loading="lazy" tabindex="-1" aria-hidden="true"></iframe>` : cover ? `<img src="${esc(dashboardAssetUrl(cover))}" alt="" loading="lazy">` : `<div class="store-card-placeholder"><span aria-hidden="true">${esc(store.name.slice(0,1).toUpperCase())}</span><strong>${esc(store.name)}</strong><small>Tu próximo gran comienzo</small></div>`;
      const state = statusFor(store), stateLabel = { published: "Publicada", draft: "Borrador", archived: "Archivada" }[state];
      return `<article class="store-row ${store.id === currentStoreId ? "active" : ""}" data-id="${esc(store.id)}">
        <div class="store-card-preview">${preview}</div>
        <div class="store-card-info"><div><h3 class="store-row-name">${esc(store.name)}</h3><p><span class="store-card-status" data-status="${state}">${stateLabel}</span>${store.id === currentStoreId ? '<span class="store-card-current">Tienda actual</span>' : ''}</p></div><details class="store-card-menu"><summary aria-label="Opciones de ${esc(store.name)}">•••</summary><div><a class="store-row-open" href="${esc(publicStoreUrl(store))}" target="_blank" rel="noopener noreferrer">Abrir tienda pública</a><button class="ghost delete-store" data-id="${esc(store.id)}" data-name="${esc(store.name)}" type="button">Eliminar tienda</button></div></details></div>
        <span class="store-card-edit">Abrir editor ↗</span>
      </article>`;
    }).join("") + (!visible.length ? `<p class="store-library-empty">${stores.length ? "No hay tiendas que coincidan con tu búsqueda." : "Todavía no tienes una tienda. Crea la tuya para comenzar."}</p>` : "");
    document.getElementById("openCreateStore").addEventListener("click", openCreateStore);
    document.querySelectorAll(".store-card-menu").forEach(menu => menu.addEventListener("click", event => event.stopPropagation()));

    document.querySelectorAll(".store-row").forEach((row) => {
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Administrar ${stores.find(store => store.id === row.dataset.id)?.name || "tienda"}`);
      row.addEventListener("keydown", event => { if (event.target === row && ["Enter", " "].includes(event.key)) { event.preventDefault(); row.click(); } });
      row.addEventListener("click", async () => {
        const changingStore = row.dataset.id !== currentStoreId;
        if (changingStore && !canLeaveMerchantStudio()) return;
        if (changingStore && storeSettingsDirty && !confirm("Tienes cambios sin guardar. ¿Cambiar de tienda y descartarlos?")) return;
        if (changingStore) setStoreSettingsDirty(false);
        selectStore(row.dataset.id);
        history.pushState(null, "", "#dashboard-workspace");
        setDashboardView("workspace");
        await refresh();
      });
    });
    document.querySelectorAll(".delete-store").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (currentStoreId === btn.dataset.id && !canLeaveMerchantStudio()) return;
        if (!confirm(`¿Eliminar la tienda "${btn.dataset.name}" y todos sus productos? Esta acción no se puede deshacer.`)) return;
        try {
          await api(`/stores/${btn.dataset.id}`, { method: "DELETE" });
          if (currentStoreId === btn.dataset.id) selectStore(null);
          await refresh();
        } catch (err) {
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".store-row-open").forEach((link) => {
      link.addEventListener("click", (event) => event.stopPropagation());
    });

    syncMerchantStoreWorkspace();
    const hasStore = !!currentStoreId;
    if (!hasStore && storePreviewFullscreen) setStorePreviewFullscreen(false);
    if (hasStore && storePreviewInitialOpenPending && document.body.dataset.dashboardView === "appearance") setStorePreviewFullscreen(true);
    document.getElementById("categoriesSection").style.display = hasStore ? "block" : "none";
    document.getElementById("paymentLinksSection").style.display = hasStore ? "block" : "none";
    document.getElementById("storeSettingsSection").style.display = hasStore ? "block" : "none";
    document.getElementById("debtCollectionSection").style.display = hasStore ? "block" : "none";
    document.getElementById("quickPaymentSection").style.display = hasStore ? "block" : "none";
    document.getElementById("noStoreMessage").style.display = hasStore ? "none" : "block";

    // Server refreshes update operational data frequently. The editor draft is
    // store-scoped and authoritative until it is saved or explicitly discarded;
    // rehydrating the same store here made inline copy and drag coordinates snap
    // back to the last persisted response.
    // A save-triggered refresh may briefly return an older server projection.
    // Keep the submitted local snapshot authoritative until that request fully
    // settles; normal clean refreshes can hydrate from the server afterward.
    const shouldHydrateStoreDraft = !hasStore
      || storeEditorDraft.getState().storeId !== currentStoreId
      || (!storeSettingsDirty && !storeSaveInFlight);
    if (hasStore && !shouldHydrateStoreDraft) {
      window.updateYapiContext?.({ store: stores.find((candidate) => candidate.id === currentStoreId), products: lastPaymentLinks });
      renderCurrentStoreBanner();
      return;
    }
    resetStoreDraftSession(currentStoreId, { preserveSave: true });

    clearStoreEditorUndo();
    animationTextClipboard = null;
    if (hasStore) {
      const publishedStore = stores.find((s) => s.id === currentStoreId);
      websiteInventoryEditedIds.clear();
      websiteRevision = publishedStore.websiteRevision ?? 0;
      websiteHasDraft = Boolean(publishedStore.websiteDraft);
      websiteInventoryChanges = publishedStore.websiteDraft?.inventoryChanges || [];
      const store = editableWebsiteStore(publishedStore);
      if (!document.getElementById("debtNotificationEmail").value) {
        document.getElementById("debtNotificationEmail").value = emailEl.value;
      }
      window.updateYapiContext?.({ store, products: lastPaymentLinks });
      document.getElementById("storeNameInput").value = store.name;
      storeTaglineInputEl.value = store.tagline || "";
      pendingLogoUrl = store.logoUrl || null;
      storeLogoPreviewEl.style.display = store.logoUrl ? "block" : "none";
      if (store.logoUrl) storeLogoPreviewEl.src = dashboardAssetUrl(store.logoUrl);
      storeLogoRemoveBtnEl.style.display = store.logoUrl ? "inline-block" : "none";
      pendingBannerUrl = store.bannerUrl || null;
      storeBannerPreviewEl.style.display = store.bannerUrl ? "block" : "none";
      if (store.bannerUrl) {
        storeBannerPreviewEl.src = dashboardAssetUrl(store.bannerUrl);
        storeBannerPreviewEl.style.objectPosition = catalogImagePosition(store.bannerUrl);
      }
      storeBannerRemoveBtnEl.style.display = store.bannerUrl ? "inline-block" : "none";
      pendingHeroSlides = [];
      pendingLayoutStyle = ["cinematic", "editorial", "collage", "catalog-first"].includes(store.layoutStyle) ? store.layoutStyle : "cinematic";
      storeExperienceStyleEl.value = store.experienceStyle === "story-scroller" ? "story-scroller" : "editorial-grid";
      const savedMotionExperiences = Array.isArray(store.motionExperiences) && store.motionExperiences.length
        ? store.motionExperiences.filter((experience) => STORE_MOTION_EXPERIENCES.includes(experience))
        : STORE_MOTION_EXPERIENCES.includes(store.motionExperience) ? [store.motionExperience] : [];
      const authoredGalleryMedia = Array.isArray(store.siteDocument?.sections)
        ? store.siteDocument.sections.find((section) => section?.kind === "gallery")?.mediaUrls || []
        : [];
      const editableGallery = store.editorialGallery?.length
        ? store.editorialGallery
        : authoredGalleryMedia.map((imageUrl) => ({ imageUrl }));
      pendingEditorialGallery = editableGallery.slice(0, 8).map((image) => ({
        imageUrl: image.imageUrl,
        productId: image.productId || "",
        title: image.title || "",
        caption: image.caption || "",
        body: image.body || "",
        boxColor: editorialBoxColor(image.boxColor),
      }));
      editorialGalleryDraftsByUrl = new Map();
      pendingEditorialGallery.forEach(rememberEditorialGalleryDraft);
      pendingAnimations = Array.isArray(store.animations) && store.animations.length
        ? store.animations.filter((animation) => animation && STORE_MOTION_EXPERIENCES.includes(animation.type)).map((animation, index) => ({
            id: /^[a-z0-9][a-z0-9_-]{0,47}$/.test(animation.id || "") ? animation.id : `saved-${index + 1}-${animation.type}`,
            name: animation.name || animationTypeCopy(animation.type)[0],
            type: animation.type,
            ...(typeof animation.pageId === "string" && (store.siteDocument?.pages || []).some((page) => page.id === animation.pageId) ? { pageId: animation.pageId } : {}),
            title: animation.title || "",
            subtitle: animation.subtitle || "",
            productId: animation.productId || "",
            buttonLabel: animation.buttonLabel || "",
            ...(Number.isInteger(animation.buttonPositionX) && animation.buttonPositionX >= 0 && animation.buttonPositionX <= 100 ? { buttonPositionX: animation.buttonPositionX } : {}),
            ...(Number.isInteger(animation.buttonPositionY) && animation.buttonPositionY >= 0 && animation.buttonPositionY <= 100 ? { buttonPositionY: animation.buttonPositionY } : {}),
            ...(Number.isInteger(animation.textPositionX) && animation.textPositionX >= 0 && animation.textPositionX <= 100 ? { textPositionX: animation.textPositionX } : {}),
            ...(Number.isInteger(animation.textPositionY) && animation.textPositionY >= 0 && animation.textPositionY <= 100 ? { textPositionY: animation.textPositionY } : {}),
            ...(Number.isInteger(animation.textScale) && animation.textScale >= 50 && animation.textScale <= 200 ? { textScale: animation.textScale } : {}),
            ...(Number.isInteger(animation.textWidthPercent) && animation.textWidthPercent >= 20 && animation.textWidthPercent <= 100 ? { textWidthPercent: animation.textWidthPercent } : {}),
            ...(["left", "center", "right"].includes(animation.textAlign) ? { textAlign: animation.textAlign } : {}),
            ...(["small", "medium", "large"].includes(animation.textSize) ? { textSize: animation.textSize } : {}),
            ...(["narrow", "medium", "wide"].includes(animation.textWidth) ? { textWidth: animation.textWidth } : {}),
            ...(/^#[0-9a-f]{6}$/i.test(animation.textColor || "") ? { textColor: animation.textColor } : {}),
	            ...(/^#[0-9a-f]{6}$/i.test(animation.backgroundColor || "") ? { backgroundColor: animation.backgroundColor } : {}),
	            ...(STORE_FONT_STYLES.includes(animation.fontStyle) ? { fontStyle: animation.fontStyle } : {}),
	            textBlocks: (animation.textBlocks || []).map(cloneAnimationTextBlock),
	            media: (animation.media || []).slice(0, animationMediaRequirement(animation.type).max).map(cloneAnimationMedia),
          }))
        : store.motionDuoEnabled === true
          ? savedMotionExperiences.map((type, index) => ({
              id: `legacy-${index + 1}-${type}`,
              name: animationTypeCopy(type)[0],
              type,
              title: animationTypeCopy(type)[0],
              subtitle: store.gallerySubtitle || "",
              productId: "",
              media: pendingEditorialGallery.map(cloneAnimationMedia),
            }))
          : [];
      pendingSiteDocument = store.siteDocument && typeof store.siteDocument === "object"
        ? structuredClone(store.siteDocument)
        : null;
      if (pendingSiteDocument) {
        if (pendingSiteDocument.experience && !STORE_TEXT_ANIMATIONS.has(pendingSiteDocument.experience.type)) {
          pendingSiteDocument.experience = { ...pendingSiteDocument.experience, type: "none", mediaUrls: [] };
        }
      }
      pendingSiteSections = Array.isArray(pendingSiteDocument?.sections)
        ? pendingSiteDocument.sections
            .filter((section) => section && section.kind !== "benefits" && /^[a-z][a-z0-9-]{1,47}$/.test(section.id || ""))
            .map((section) => ({ ...section, family: resolvedSiteSectionFamily(section) }))
        : [];
      if (pendingSiteDocument) pendingSiteDocument.sections = pendingSiteSections;
      ensureSiteChromeDraft(store);
      renderPreviewSectionTabs();
      renderPreviewCatalogEditor();
      let contentOrderToMigrate = Array.isArray(store.contentOrder) ? [...store.contentOrder] : store.contentOrder;
      const aiSignatureAnimation = editableAiSignatureAnimation(store);
      const hasEditableSignature = pendingAnimations.some((animation) => animation.id === AI_SIGNATURE_ANIMATION_ID);
      const signatureAlreadyRepresented = aiSignatureAnimation
        && pendingAnimations.some((animation) => animation.type === aiSignatureAnimation.type);
      if (aiSignatureAnimation && !hasEditableSignature && !signatureAlreadyRepresented) {
        pendingAnimations.push(aiSignatureAnimation);
        contentOrderToMigrate = placeAiSignatureAnimation(contentOrderToMigrate, store, aiSignatureAnimation.id);
      } else if (hasEditableSignature && (!Array.isArray(contentOrderToMigrate) || !contentOrderToMigrate.includes(`animation-${AI_SIGNATURE_ANIMATION_ID}`))) {
        contentOrderToMigrate = placeAiSignatureAnimation(contentOrderToMigrate, store, AI_SIGNATURE_ANIMATION_ID);
      }
      pendingContentOrder = normalizeStoreContentOrder(contentOrderToMigrate);
      pendingSectionBackgrounds = store.sectionBackgrounds && typeof store.sectionBackgrounds === "object" && !Array.isArray(store.sectionBackgrounds)
        ? Object.fromEntries(Object.entries(store.sectionBackgrounds).filter(([section, color]) => pendingContentOrder.includes(section) && /^#[0-9a-f]{6}$/i.test(color)))
        : {};
      const firstOrderedAnimationId = pendingContentOrder.find((section) => section.startsWith("animation-"))?.slice("animation-".length);
      const firstOrderedAnimation = pendingAnimations.find((animation) => animation.id === firstOrderedAnimationId) || pendingAnimations[0];
      activeAnimationCategory = firstOrderedAnimation ? animationCategory(firstOrderedAnimation.type) : "text";
      renderAnimationTypePicker();
      renderAnimationsEditor();
      renderStoreContentOrderEditor();
      renderEditorialGalleryEditor();
      storeBackgroundColorEl.value = store.backgroundColor || "#f8fafc";
      storeContactPhoneInputEl.value = store.contactPhone || "";
      const visualMode = ["payment", "whatsapp", "external"].includes(store.checkoutMode) ? store.checkoutMode : "payment";
      document.querySelector(`input[name="visualCheckoutMode"][value="${visualMode}"]`).checked = true;
      visualWhatsappPhoneEl.value = store.contactPhone || "";
      visualLeadUrlEl.value = store.leadCaptureUrl || "";
      syncVisualCheckoutMode();
      document.querySelector(`input[name="storeCheckoutMode"][value="${visualMode}"]`).checked = true;
      storeLeadUrlEl.value = store.leadCaptureUrl || "";
      storeCartRecommendationsEl.checked = store.cartRecommendationsEnabled !== false;
      pendingCartRecommendationProductIds = Array.isArray(store.cartRecommendationProductIds) ? [...store.cartRecommendationProductIds] : [];
      renderStoreRecommendationChoices();
      storeShowLowStockEl.checked = store.showLowStockToCustomers === true;
      syncStoreCheckoutMode();
      storeContactEmailInputEl.value = store.contactEmail || "";
      storeContactFormEnabledEl.checked = store.contactFormEnabled === true;
      storeContactFormEmailEl.value = store.contactFormEmail || "";
      storeContactTitleEl.value = store.contactTitle || "";
      storeContactSubtitleEl.value = store.contactSubtitle || "";
      pendingStoreLocations = Array.isArray(store.locations) && store.locations.length
        ? store.locations.map((location) => ({
            id: location.id,
            name: location.name || "Ubicación",
            address: location.address || "",
            mapEmbedUrl: location.mapEmbedUrl || "",
            highlight: location.highlight || "",
            description: location.description || "",
            pickupEnabled: location.pickupEnabled === true,
            deliveryEnabled: location.deliveryEnabled === true,
            openingHours: Array.isArray(location.openingHours) && location.openingHours.length ? location.openingHours.map((hours) => ({ ...hours })) : defaultStoreLocationHours(),
            inventory: Object.fromEntries((location.inventory || []).map((entry) => [entry.paymentLinkId, entry.stock])),
          }))
        : (store.locationMapUrl || store.locationHighlight || store.locationDescription)
          ? [{
              id: "location-principal",
              name: "Ubicación principal",
              address: "",
              mapEmbedUrl: store.locationMapUrl || "",
              highlight: store.locationHighlight || "",
              description: store.locationDescription || "",
              pickupEnabled: true,
              deliveryEnabled: false,
              openingHours: defaultStoreLocationHours(),
              inventory: {},
            }]
          : [];
      renderStoreLocationsEditor();
      storeLocationTitleEl.value = store.locationTitle || "";
      storeLocationSubtitleEl.value = store.locationSubtitle || "";
      storeAboutInputEl.value = store.aboutText || "";
      storeAboutTitleEl.value = store.aboutTitle || "";
      storeAboutSubtitleEl.value = store.aboutSubtitle || "";
      storeCatalogTitleEl.value = store.catalogTitle || "";
      storeCatalogSubtitleEl.value = store.catalogSubtitle || "";
      storeGalleryTitleEl.value = store.galleryTitle || "";
      storeGallerySubtitleEl.value = store.gallerySubtitle || "";
      storeLinksTitleEl.value = store.linksTitle || "";
      pendingAboutImageUrl = store.aboutImageUrl || null;
      storeAboutImagePreviewEl.style.display = store.aboutImageUrl ? "block" : "none";
      if (store.aboutImageUrl) storeAboutImagePreviewEl.src = dashboardAssetUrl(store.aboutImageUrl);
      storeAboutImageRemoveBtnEl.style.display = store.aboutImageUrl ? "inline-block" : "none";
      storeAnnouncementInputEl.value = store.announcement || "";
      storeAnnouncementModeEl.value = store.announcementMode || "static";
      storeAnnouncementSpeedEl.value = String(store.announcementSpeed || 18);
      storeAnnouncementSizeEl.value = ["small", "medium", "large"].includes(store.announcementSize) ? store.announcementSize : "medium";
      storeAnnouncementColorEl.value = /^#[0-9a-f]{6}$/i.test(store.announcementColor || "") ? store.announcementColor : "#ffffff";
      storeAnnouncementFontEl.value = ["store", ...STORE_FONT_STYLES].includes(store.announcementFont) ? store.announcementFont : "store";
      storeAnnouncementEffectEl.value = ["none", "wave", "pulse", "sparkle"].includes(store.announcementEffect) ? store.announcementEffect : "none";
      storePromotionEnabledEl.checked = !!store.promotionEnabled;
      pendingPromotionImageUrl = store.promotionImageUrl || null;
      storePromotionImagePreviewEl.style.display = store.promotionImageUrl ? "block" : "none";
      if (store.promotionImageUrl) storePromotionImagePreviewEl.src = dashboardAssetUrl(store.promotionImageUrl);
      else storePromotionImagePreviewEl.src = EMPTY_IMAGE_SRC;
      storePromotionImageRemoveBtnEl.style.display = store.promotionImageUrl ? "inline-block" : "none";
      storePromotionTitleEl.value = store.promotionTitle || "";
      storePromotionBodyEl.value = store.promotionBody || "";
      storePromotionCtaLabelEl.value = store.promotionCtaLabel || "";
      storePromotionCtaUrlEl.value = store.promotionCtaUrl || "";
      renderPromotionProductChoice();
      storeAccentToggleEl.checked = !!store.accentColor;
      storeAccentColorEl.disabled = !store.accentColor;
      if (store.accentColor) storeAccentColorEl.value = store.accentColor;
      const storeFontStyle = normalizeStoreFontStyle(store.fontStyle);
      storeFontStyleEl.value = storeFontStyle;
      storeButtonStyleEl.value = store.buttonStyle || "rounded";
      storeButtonVariantEl.value = store.buttonVariant || "solid";
      storeButtonMotionEl.value = store.buttonMotion || "lift";
      storeCartButtonLabelEl.value = store.cartButtonLabel || "Ir a pagar";
      syncStoreCustomizationControls();
      renderEditorialGalleryEditor();
      pendingStoreLinks = (store.links || []).map((l) => ({ label: l.label, url: l.url }));
      renderStoreLinksEditor();
      renderVisualSources();
      renderCurrentStoreBanner();
      syncPreviewSectionInspector();
      scheduleStorePaletteExtraction(0);
      loadVisualStudioState(store.id);
    } else {
      window.updateYapiContext?.({ store: null, products: [] });
      refreshStorePreview();
      renderVisualSources();
      pendingSectionBackgrounds = {};
      pendingSiteSections = [];
      pendingSiteDocument = null;
      renderPreviewSectionTabs();
      syncPreviewSectionInspector();
      storePaletteSourceSignature = "";
      scheduleStorePaletteExtraction(0);
      loadVisualStudioState(null);
    }
    hydrateStoreDraftSnapshot(hasStore ? currentStoreId : null);
  }

  document.getElementById("copyCurrentStoreLink").addEventListener("click", async () => {
    const url = currentStoreUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    const btn = document.getElementById("copyCurrentStoreLink");
    const original = btn.textContent;
    btn.textContent = "¡Copiado!";
    setTimeout(() => (btn.textContent = original), 1200);
  });

  document.getElementById("shareCurrentStoreLink").addEventListener("click", async () => {
    const store = lastStores.find((item) => item.id === currentStoreId);
    const url = store ? publicStoreUrl(store) : "";
    if (!url) return;
    const btn = document.getElementById("shareCurrentStoreLink");
    const original = btn.textContent;
    try {
      if (navigator.share) {
        await navigator.share({ title: store.name, text: `Visita ${store.name} en pagosYa`, url });
        btn.textContent = "¡Compartido!";
      } else {
        await navigator.clipboard.writeText(url);
        btn.textContent = "Link copiado";
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      btn.textContent = "Link copiado";
    }
    setTimeout(() => (btn.textContent = original), 1400);
  });


  function setButtonBusy(button, busy, label) {
    button.disabled = busy;
    button.classList.toggle("is-loading", busy);
    button.setAttribute("aria-busy", String(busy));
    button.textContent = label;
  }

  function money(cents, currency = "BOB") {
    if (monetaryValuesHidden) return `•••••• ${currency}`;
    return (cents / 100).toFixed(2) + " " + currency;
  }

  function moneyNumber(cents) {
    return monetaryValuesHidden ? "••••••" : (cents / 100).toFixed(2);
  }

  const BALANCE_CARD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;

  function renderBalanceCards(balances) {
    document.getElementById("balanceCards").innerHTML = balances
      .map(
        (entry) => `<div class="card">
          <div class="card-head">
            <span class="muted">Saldo por desembolsar (${esc(entry.currency)})</span>
            <span class="card-icon">${BALANCE_CARD_ICON}</span>
          </div>
          <div class="value">${money(entry.payableBalance, esc(entry.currency))}</div>
          <p class="faint" style="margin:4px 0 0">Se transfiere a tu cuenta bancaria en el próximo desembolso</p>
        </div>`,
      )
      .join("");
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

  function setPasswordVisible(visible) {
    passwordEl.type = visible ? "text" : "password";
    passwordVisibilityToggleEl.setAttribute("aria-pressed", String(visible));
    const label = visible ? "Ocultar contraseña" : "Mostrar contraseña";
    passwordVisibilityToggleEl.setAttribute("aria-label", label);
    passwordVisibilityToggleEl.title = label;
  }

  passwordVisibilityToggleEl.addEventListener("click", () => {
    setPasswordVisible(passwordEl.type === "password");
    passwordEl.focus({ preventScroll: true });
  });

  function renderPayoutRows(payouts) {
    lastPayouts = payouts;
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

  function setMonetaryValuesHidden(hidden, remember = true) {
    monetaryValuesHidden = hidden;
    moneyVisibilityToggleEl.setAttribute("aria-pressed", String(hidden));
    moneyVisibilityToggleEl.setAttribute("aria-label", hidden ? "Mostrar valores monetarios" : "Ocultar valores monetarios");
    moneyVisibilityToggleEl.title = hidden ? "Mostrar valores monetarios" : "Ocultar valores monetarios";
    moneyVisibilityLabelEl.textContent = hidden ? "Mostrar montos" : "Ocultar montos";
    if (remember) {
      try {
        localStorage.setItem(MONEY_VISIBILITY_KEY, String(hidden));
      } catch {
        // The privacy choice still applies for this visit when storage is unavailable.
      }
    }
    if (lastBalances) renderBalanceCards(lastBalances);
    if (lastTotalFinances) renderTotalFinances(lastTotalFinances);
    if (lastFinances) renderFinances(lastFinances);
    if (lastPayments.length) renderPaymentRows();
    if (lastPayouts.length) renderPayoutRows(lastPayouts);
    if (lastPaymentLinks.length) renderPaymentLinkRows(lastPaymentLinks);
    if (preparedInventoryRows.length) renderInventoryReview();
  }

  moneyVisibilityToggleEl.addEventListener("click", () => setMonetaryValuesHidden(!monetaryValuesHidden));
  setMonetaryValuesHidden(monetaryValuesHidden, false);
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
    lastTotalFinances = finances;
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

  const GAMIFICATION_STAR_SVG = `<svg class="gamification-star-icon" viewBox="0 0 24 24" fill="currentColor" stroke="#050505" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.7 2.86 5.8 6.4.93-4.63 4.51 1.1 6.38L12 17.3l-5.73 3.02 1.1-6.38-4.63-4.51 6.4-.93z"/></svg>`;

  function gamificationIdentityHash() {
    const identity = (emailEl.value || sessionStorage.getItem("pagosya_merchant_email") || "merchant").trim().toLocaleLowerCase("es");
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index++) hash = Math.imul(hash ^ identity.charCodeAt(index), 16777619);
    return (hash >>> 0).toString(36);
  }

  function gamificationStorageScope() {
    return `${gamificationIdentityHash()}_${currentStoreId || "all-stores"}`;
  }

  function gamificationCompanionKey() {
    return `pagosya_gamification_companion_${gamificationStorageScope()}`;
  }

  function gamificationSnapshotKey() {
    return `pagosya_gamification_snapshot_${gamificationStorageScope()}`;
  }

  function gamificationRunnerKey() {
    return `pagosya_gamification_runner_${gamificationStorageScope()}`;
  }

  function adventureDebugXpKey() {
    return `pagosya_adventure_debug_xp_${gamificationStorageScope()}`;
  }

  function gamificationSeenAchievementsKey(scope = gamificationStorageScope()) {
    return `pagosya_gamification_seen_achievements_${scope}`;
  }

  function gamificationPendingAchievementsKey(scope = gamificationStorageScope()) {
    return `pagosya_gamification_pending_achievements_${scope}`;
  }

  function selectedGamificationCompanion(levelIndex) {
    try {
      const saved = localStorage.getItem(gamificationCompanionKey());
      if (saved === null) return levelIndex;
      const stored = Number(saved);
      if (Number.isInteger(stored) && stored >= 0 && stored <= levelIndex && stored < ADVENTURE_LEVELS.length) return stored;
    } catch {}
    return levelIndex;
  }

  function selectedGamificationRunner() {
    try {
      const stored = Number(localStorage.getItem(gamificationRunnerKey()));
      if (Number.isInteger(stored) && stored >= 0 && stored < GAMIFICATION_RUNNERS.length) return stored;
    } catch {}
    return 0;
  }

  function storedStringList(key) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  }

  function pendingAchievementIds(state) {
    const scope = gamificationStorageScope();
    const seen = new Set(storedStringList(gamificationSeenAchievementsKey(scope)));
    const pending = storedStringList(gamificationPendingAchievementsKey(scope)).filter((id) => !seen.has(id));
    const pendingSet = new Set(pending);
    state.stars.filter((star) => star.isEarned).forEach((star) => {
      if (!seen.has(star.id) && !pendingSet.has(star.id)) {
        pending.push(star.id);
        pendingSet.add(star.id);
      }
    });
    try { localStorage.setItem(gamificationPendingAchievementsKey(scope), JSON.stringify(pending)); } catch {}
    return pending;
  }

  function markAchievementSeen(achievementId, scope = gamificationStorageScope()) {
    if (!achievementId) return;
    const seenKey = gamificationSeenAchievementsKey(scope);
    const pendingKey = gamificationPendingAchievementsKey(scope);
    const seen = new Set(storedStringList(seenKey));
    seen.add(achievementId);
    const pending = storedStringList(pendingKey).filter((id) => id !== achievementId);
    try {
      localStorage.setItem(seenKey, JSON.stringify([...seen]));
      localStorage.setItem(pendingKey, JSON.stringify(pending));
    } catch {}
  }

  function gamificationState(finances) {
    const sales = Math.max(0, Number(finances?.paymentCount) || 0);
    const visits = Math.max(0, Number(finances?.totalStoreViews) || 0);
    const salesXp = sales * GAMIFICATION_XP_PER_SALE;
    const visitsXp = visits * GAMIFICATION_XP_PER_VISIT;
    const xp = salesXp + visitsXp;
    let levelIndex = 0;
    ADVENTURE_LEVELS.forEach((entry, index) => { if (xp >= entry.xpRequired) levelIndex = index; });
    const level = ADVENTURE_LEVELS[levelIndex];
    const nextLevel = ADVENTURE_LEVELS[levelIndex + 1] || null;
    const span = nextLevel ? nextLevel.xpRequired - level.xpRequired : 1;
    const progress = nextLevel ? Math.max(0, Math.min(100, Math.round(((xp - level.xpRequired) / span) * 100))) : 100;
    const stars = GAMIFICATION_STARS.map((star) => ({ ...star, isEarned: star.earned({ sales, visits }) }));
    return { sales, visits, salesXp, visitsXp, xp, levelIndex, level, nextLevel, progress, stars, earnedStars: stars.filter((star) => star.isEarned).length, dailyLoginStars: Math.max(0, Number(dailyLoginReward.totalStars) || 0) };
  }

  function getProgressState(currentXP, levels = ADVENTURE_LEVELS) {
    const safeLevels = Array.isArray(levels) && levels.length ? levels : ADVENTURE_LEVELS;
    const rawXP = Math.max(0, Number(currentXP) || 0);
    const maxXP = Math.max(0, Number(safeLevels[safeLevels.length - 1].xpRequired) || 0);
    const clampedXP = Math.min(rawXP, maxXP);
    let currentLevelIndex = 0;
    safeLevels.forEach((level, index) => {
      if (clampedXP >= Number(level.xpRequired)) currentLevelIndex = index;
    });
    const currentLevel = safeLevels[currentLevelIndex];
    const nextLevel = safeLevels[currentLevelIndex + 1] || null;
    const currentFloor = Number(currentLevel.xpRequired) || 0;
    const currentCeiling = nextLevel ? Number(nextLevel.xpRequired) : maxXP;
    const currentSpan = Math.max(1, currentCeiling - currentFloor);
    const currentLevelPercentage = nextLevel ? ((clampedXP - currentFloor) / currentSpan) * 100 : 100;
    return {
      currentXP: rawXP,
      clampedXP,
      maxXP,
      currentLevelIndex,
      currentLevel,
      nextLevel,
      completedLevels: safeLevels.filter((_, index) => index < currentLevelIndex || (!nextLevel && index === currentLevelIndex)),
      lockedLevels: safeLevels.filter((_, index) => index > currentLevelIndex),
      xpUntilNext: nextLevel ? Math.max(0, Number(nextLevel.xpRequired) - rawXP) : 0,
      overallPercentage: maxXP ? (clampedXP / maxXP) * 100 : 100,
      currentLevelPercentage: Math.max(0, Math.min(100, currentLevelPercentage)),
      isAdventureComplete: !nextLevel,
    };
  }
  window.getProgressState = getProgressState;

  function storedAdventureDebugXp() {
    try {
      const stored = localStorage.getItem(adventureDebugXpKey());
      if (stored === null) return null;
      const xp = Number(stored);
      return Number.isFinite(xp) && xp >= 0 ? xp : null;
    } catch {
      return null;
    }
  }

  function resolvedAdventureXp(actualXP) {
    const debugXP = storedAdventureDebugXp();
    return debugXP === null ? Math.max(0, Number(actualXP) || 0) : debugXP;
  }

  function adventureNodeStatus(index, state) {
    if (index < state.currentLevelIndex || (state.isAdventureComplete && index === state.currentLevelIndex)) return "completed";
    if (index === state.currentLevelIndex) return "current";
    return "locked";
  }

  function renderAdventureLevelDetail(level, state = lastAdventureState) {
    if (!level || !state) return;
    const statusIndex = ADVENTURE_LEVELS.findIndex((entry) => entry.id === level.id);
    const status = adventureNodeStatus(statusIndex, state);
    const statusCopy = status === "completed" ? "Completado" : status === "current" ? "Etapa actual" : `Se abre con ${level.xpRequired.toLocaleString("es-BO")} XP`;
    document.getElementById("adventureLevelDetail").innerHTML = `<strong>Nivel ${level.id} · ${esc(level.name)} <small>(${esc(level.englishName)})</small></strong>${esc(level.description)} · ${esc(statusCopy)}`;
  }

  function showAdventureXpToast(delta) {
    if (!(delta > 0)) return;
    const toast = document.getElementById("adventureXpToast");
    window.clearTimeout(adventureXpToastTimer);
    toast.textContent = `+${delta.toLocaleString("es-BO")} XP`;
    toast.hidden = true;
    void toast.offsetWidth;
    toast.hidden = false;
    adventureXpToastTimer = window.setTimeout(() => { toast.hidden = true; }, 820);
  }

  function showAdventureLevelUp(level) {
    const overlay = document.getElementById("adventureLevelUp");
    window.clearTimeout(adventureLevelUpTimer);
    document.getElementById("adventureLevelUpTitle").textContent = `Nivel ${level.id} — ${level.name}`;
    overlay.hidden = true;
    void overlay.offsetWidth;
    overlay.hidden = false;
    adventureLevelUpTimer = window.setTimeout(() => { overlay.hidden = true; }, 1120);
  }

  let adventureAudioContext = null;
  function playAdventureTouchSound(kind = "open") {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      adventureAudioContext ||= new AudioContext();
      const context = adventureAudioContext;
      if (context.state === "suspended") context.resume();
      const now = context.currentTime;
      const notes = kind === "close" ? [620, 430] : [480, 720];
      notes.forEach((frequency, index) => {
        const start = now + (index * .075);
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = index ? "sine" : "triangle";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, start + .09);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(.045, start + .018);
        gain.gain.exponentialRampToValueAtTime(.0001, start + .13);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + .14);
      });
    } catch {
      // Sound is optional; blocked audio must never affect the guide interaction.
    }
  }

  function setAdventureGuideOpen(open, { restoreFocus = false } = {}) {
    const guide = document.getElementById("adventureGuide");
    const bubble = document.getElementById("adventureGuideBubble");
    guide.setAttribute("aria-expanded", String(open));
    bubble.hidden = !open;
    document.body.classList.toggle("adventure-guide-open", open);
    document.querySelectorAll("#adventureMapStage > :not(#adventureGuideBubble)").forEach((element) => { element.inert = open; });
    if (open) requestAnimationFrame(() => document.getElementById("adventureGuideClose").focus());
    else if (restoreFocus) guide.focus();
  }

  function renderAdventureRunner(state = lastAdventureState) {
    const runnerIndex = selectedGamificationRunner();
    const runner = GAMIFICATION_RUNNERS[runnerIndex];
    document.getElementById("gamificationRunnerPicker").innerHTML = GAMIFICATION_RUNNERS.map((entry, index) => `<button class="adventure-runner-option" type="button" data-runner-select="${index}" aria-pressed="${index === runnerIndex}" aria-label="Elegir a ${esc(entry.name)} para las celebraciones" title="${esc(entry.name)}">
      <span class="gamification-runner-face">${profileAvatarSvg(index + 1)}</span><span><strong>${esc(entry.name)}</strong><span>${esc(entry.description)}</span></span>
    </button>`).join("");
    const currentLevel = state?.currentLevel || ADVENTURE_LEVELS[0];
    document.getElementById("adventurePlayerFace").innerHTML = `<img class="profile-avatar-image" src="${esc(currentLevel.asset)}" alt="">`;
    document.getElementById("adventurePlayer").setAttribute("aria-label", `${currentLevel.name}, tu nivel actual, está viajando hacia ${state?.nextLevel?.name || "la guía final"}. ${runner.name} es tu compañero de celebraciones.`);
  }

  const JOURNEY_NODE_Y = [350, 235, 365, 205, 325, 245, 380, 220, 345, 235, 375, 210, 330, 250, 370, 205];
  let journeySoundTimer = null;
  let journeySoundEnabled = false;
  const journeyStagePositions = () => ADVENTURE_WORLD_STAGES.map((_, index) => ({ x: 130 + (index * 235), y: JOURNEY_NODE_Y[index] }));
  function journeyPathData(positions) {
    return positions.slice(1).reduce((path, point, index) => {
      const previous = positions[index];
      const midpoint = (previous.x + point.x) / 2;
      return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
    }, `M ${positions[0].x} ${positions[0].y}`);
  }
  function journeyRewardUnlocked(reward, commerce) {
    const requirement = reward.requirement;
    if (requirement.kind === "combined") return commerce.sales >= requirement.sales && commerce.visits >= requirement.visits;
    return Math.max(0, Number(commerce[requirement.kind]) || 0) >= requirement.threshold;
  }
  function journeyStageStatus(stage, state, commerce) {
    if (stage.type === "start") return "completed";
    if (stage.type === "reward") return journeyRewardUnlocked(ADVENTURE_REWARDS[stage.rewardIndex], commerce) ? "earned" : "locked";
    if (stage.levelIndex < state.currentLevelIndex || (state.isAdventureComplete && stage.levelIndex === state.currentLevelIndex)) return "completed";
    if (stage.levelIndex === state.currentLevelIndex) return "current";
    return "locked";
  }
  function journeyPathProgress(state) {
    const characterStops = ADVENTURE_WORLD_STAGES.map((stage, index) => stage.type === "character" ? index : -1).filter((index) => index >= 0);
    const from = characterStops[state.currentLevelIndex] || 0;
    const to = characterStops[state.currentLevelIndex + 1] ?? from;
    return (state.nextLevel ? from + ((to - from) * state.currentLevelPercentage / 100) : from) / (ADVENTURE_WORLD_STAGES.length - 1);
  }
  function scheduleJourneySoundtrack() {
    if (!journeySoundEnabled) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      adventureAudioContext ||= new AudioContext();
      const context = adventureAudioContext;
      if (context.state === "suspended") context.resume();
      [261.63,329.63,392,329.63,293.66,349.23,440,349.23].forEach((frequency, index) => {
        const oscillator = context.createOscillator(); const gain = context.createGain(); const start = context.currentTime + .04 + (index * .34);
        oscillator.type = index % 2 ? "sine" : "triangle"; oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.018, start + .035); gain.gain.exponentialRampToValueAtTime(.0001, start + .28);
        oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + .3);
      });
    } catch {}
  }
  function setJourneySound(enabled) {
    journeySoundEnabled = enabled; window.clearInterval(journeySoundTimer); journeySoundTimer = null;
    try { localStorage.setItem("pagosya_journey_sound", enabled ? "on" : "off"); } catch {}
    const button = document.getElementById("journeySoundToggle");
    button?.setAttribute("aria-pressed", String(enabled)); button?.setAttribute("aria-label", enabled ? "Silenciar música de la ruta" : "Reproducir música de la ruta");
    if (enabled) { scheduleJourneySoundtrack(); journeySoundTimer = window.setInterval(scheduleJourneySoundtrack, 3200); }
  }
  function renderJourneyDetail(stageIndex, state, commerce) {
    const stage = ADVENTURE_WORLD_STAGES[stageIndex]; if (!stage) return;
    if (stage.type === "start") { document.getElementById("adventureLevelDetail").innerHTML = `<strong>Inicio · Tu tienda despega</strong>Cada venta suma ${GAMIFICATION_XP_PER_SALE} XP y cada visita suma ${GAMIFICATION_XP_PER_VISIT} XP.`; return; }
    if (stage.type === "reward") {
      const reward = ADVENTURE_REWARDS[stage.rewardIndex]; const unlocked = journeyRewardUnlocked(reward, commerce);
      document.getElementById("adventureLevelDetail").innerHTML = `<strong>${unlocked ? "Recompensa ganada" : "Recompensa misteriosa"} · ${esc(reward.title)}</strong>${esc(unlocked ? reward.description : reward.requirementCopy)}.`; return;
    }
    const level = ADVENTURE_LEVELS[stage.levelIndex]; const unlocked = stage.levelIndex <= state.currentLevelIndex;
    document.getElementById("adventureLevelDetail").innerHTML = `<strong>${unlocked ? `${esc(level.character)} · ${esc(level.rarity)}` : "Personaje bloqueado"}</strong>${esc(unlocked ? level.description : `Consigue ${level.xpRequired.toLocaleString("es-BO")} XP para descubrirlo`)}.`;
  }
  function renderJourneyNodes(state, commerce) {
    const selected = selectedGamificationCompanion(state.currentLevelIndex); const positions = journeyStagePositions();
    document.getElementById("adventureLevelNodes").innerHTML = ADVENTURE_WORLD_STAGES.map((stage, index) => {
      const position = positions[index]; const status = journeyStageStatus(stage, state, commerce);
      if (stage.type === "start") return `<button class="journey-node is-start is-completed" type="button" data-world-stage-index="${index}" style="left:${position.x}px;top:${position.y}px"><span class="journey-node-platform"><span class="journey-start-flag"></span></span><span class="journey-node-copy"><strong>Comienza aquí</strong><small>Comparte tu tienda</small></span><span class="journey-node-badge">✓</span></button>`;
      if (stage.type === "reward") { const reward = ADVENTURE_REWARDS[stage.rewardIndex]; return `<button class="journey-node is-reward is-${status}" type="button" data-world-stage-index="${index}" style="left:${position.x}px;top:${position.y}px" aria-label="${esc(reward.title)}, ${status === "earned" ? "ganada" : "bloqueada"}"><span class="journey-node-platform"><span class="journey-reward-gem" aria-hidden="true">${esc(reward.icon)}</span></span><span class="journey-node-copy"><strong>${status === "earned" ? esc(reward.title) : "Recompensa misteriosa"}</strong><small>${status === "earned" ? "Ganada" : esc(reward.requirementCopy)}</small></span><span class="journey-node-badge">${status === "earned" ? "✓" : "🔒"}</span></button>`; }
      const level = ADVENTURE_LEVELS[stage.levelIndex]; const isSelected = selected === stage.levelIndex;
      return `<button class="journey-node is-${status}${isSelected ? " is-selected" : ""}" type="button" data-world-stage-index="${index}" data-journey-companion="${stage.levelIndex}" style="left:${position.x}px;top:${position.y}px" aria-label="${esc(level.character)}, ${status === "locked" ? `bloqueado hasta ${level.xpRequired} XP` : `${level.rarity}, desbloqueado`}" aria-disabled="${status === "locked"}"><span class="journey-node-platform"><span class="journey-node-art"><img src="${esc(level.asset)}" alt="${esc(level.alt)}" loading="${status === "locked" ? "lazy" : "eager"}" decoding="async"></span></span><span class="journey-node-copy"><strong>${status === "locked" ? "???" : esc(level.character)}</strong><small>${status === "locked" ? `${level.xpRequired.toLocaleString("es-BO")} XP` : esc(level.rarity)}</small></span><span class="journey-node-badge">${status === "completed" ? "✓" : status === "current" ? "AHORA" : "🔒"}</span></button>`;
    }).join("");
    const route = journeyPathData(positions); ["journeyRouteShadow","journeyRouteBase","journeyRouteProgressShadow","journeyRouteProgress"].forEach((id) => document.getElementById(id).setAttribute("d", route)); return positions;
  }
  function renderJourneyCompanions(state) {
    const selected = selectedGamificationCompanion(state.currentLevelIndex);
    document.getElementById("gamificationRunnerPicker").innerHTML = ADVENTURE_LEVELS.slice(0, state.currentLevelIndex + 1).map((level, index) => `<button class="journey-companion-option" type="button" data-journey-companion="${index}" aria-pressed="${index === selected}" aria-label="Elegir a ${esc(level.character)}" title="${esc(level.character)} · ${esc(level.rarity)}"><img src="${esc(level.asset)}" alt=""></button>`).join("");
  }
  function ensureJourneyMarkup() {
    const root = document.getElementById("animalAdventure"); if (root.querySelector(".journey-shell")) return;
    root.className = "animal-adventure journey-experience";
    root.innerHTML = `<div class="journey-shell">
      <header class="journey-topbar"><div class="journey-title"><small>Ruta de crecimiento</small><h2 id="adventureMapTitle">Horizonte pagosYa</h2></div><div class="journey-progress-card" aria-live="polite"><div class="journey-progress-heading"><span id="adventureCurrentLevel">Nivel 1 · Pipa</span><strong id="adventureXpValue">0 / 100 XP</strong></div><div class="journey-xp-track" id="adventureXpTrack" role="progressbar" aria-label="Progreso de la etapa actual" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span id="adventureXpFill"></span></div><div class="journey-progress-meta"><span id="adventureXpRemaining">100 XP para Capi</span><span id="adventureOverallProgress">0% de la ruta</span></div></div><div class="journey-actions"><button class="journey-icon-button" id="journeySoundToggle" type="button" aria-pressed="false" aria-label="Reproducir música de la ruta" title="Música de la ruta"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg></button><button class="journey-icon-button" type="button" data-journey-scroll="-1" aria-label="Explorar hacia atrás"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><button class="journey-icon-button" type="button" data-journey-scroll="1" aria-label="Explorar hacia adelante"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button></div></header>
      <div class="journey-viewport" id="journeyViewport" tabindex="0" aria-label="Mundo de progreso. Desliza horizontalmente para explorar."><div class="journey-world" id="journeyWorld"><span class="journey-sun" aria-hidden="true"></span><span class="journey-cloud cloud-a" aria-hidden="true"></span><span class="journey-cloud cloud-b" aria-hidden="true"></span><span class="journey-cloud cloud-c" aria-hidden="true"></span><span class="journey-biome-label biome-a">Valle inicial</span><span class="journey-biome-label biome-b">Bosque de impulso</span><span class="journey-biome-label biome-c">Cumbre brillante</span><svg class="journey-route" viewBox="0 0 3860 500" preserveAspectRatio="none" aria-hidden="true"><path class="journey-route-shadow" id="journeyRouteShadow"/><path class="journey-route-base" id="journeyRouteBase" pathLength="100"/><path class="journey-route-progress-shadow" id="journeyRouteProgressShadow" pathLength="100"/><path class="journey-route-progress" id="journeyRouteProgress" pathLength="100"/></svg><div class="journey-nodes" id="adventureLevelNodes"></div><div class="journey-player" id="adventurePlayer"><span class="journey-player-face" id="adventurePlayerFace"></span><span class="journey-player-flag">Tú</span></div></div></div>
      <footer class="journey-footer"><div class="journey-stage-detail" id="adventureLevelDetail" aria-live="polite"></div><div class="journey-companion-control"><span>Tu compañero</span><div class="journey-companion-picker" id="gamificationRunnerPicker" role="group" aria-label="Personajes desbloqueados"></div></div><div class="journey-help">Desliza para explorar. En escritorio también puedes arrastrar o usar las flechas.</div><div id="adventureDebugControls" hidden></div></footer><div class="journey-xp-toast" id="adventureXpToast" hidden aria-live="polite"></div><div class="journey-level-up" id="adventureLevelUp" hidden aria-live="assertive"><span>Nueva etapa</span><strong id="adventureLevelUpTitle"></strong></div></div>`;
    const viewport = document.getElementById("journeyViewport");
    root.addEventListener("click", (event) => {
      const scrollButton = event.target.closest("[data-journey-scroll]"); if (scrollButton) viewport.scrollBy({ left: Number(scrollButton.dataset.journeyScroll) * viewport.clientWidth * .72, behavior: "smooth" });
      if (event.target.closest("#journeySoundToggle")) setJourneySound(!journeySoundEnabled);
      const companionButton = event.target.closest("[data-journey-companion]");
      if (companionButton && lastAdventureState && Number(companionButton.dataset.journeyCompanion) <= lastAdventureState.currentLevelIndex) {
        try { localStorage.setItem(gamificationCompanionKey(), companionButton.dataset.journeyCompanion); } catch {}
        playAdventureTouchSound("open"); renderAnimalAdventure(lastAdventureState.currentXP, { animate: false, commerce: lastAdventureCommerceState });
      }
      const node = event.target.closest("[data-world-stage-index]"); if (node && lastAdventureState) renderJourneyDetail(Number(node.dataset.worldStageIndex), lastAdventureState, lastAdventureCommerceState);
    });
    let dragStartX = 0; let dragStartScroll = 0;
    viewport.addEventListener("pointerdown", (event) => { if (event.pointerType !== "mouse" || event.target.closest("button")) return; dragStartX = event.clientX; dragStartScroll = viewport.scrollLeft; viewport.classList.add("is-dragging"); viewport.setPointerCapture(event.pointerId); });
    viewport.addEventListener("pointermove", (event) => { if (viewport.classList.contains("is-dragging")) viewport.scrollLeft = dragStartScroll - (event.clientX - dragStartX); });
    const endDrag = () => viewport.classList.remove("is-dragging"); viewport.addEventListener("pointerup", endDrag); viewport.addEventListener("pointercancel", endDrag);
    viewport.addEventListener("wheel", (event) => { if (!event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return; event.preventDefault(); viewport.scrollLeft += event.deltaY; }, { passive: false });
    journeySoundEnabled = false;
    document.getElementById("journeySoundToggle").setAttribute("aria-pressed", "false");
  }

  function renderAnimalAdventure(currentXP, { animate = true, delta = null, commerce = null } = {}) {
    const scope = gamificationStorageScope();
    const state = getProgressState(currentXP);
    const previousState = adventureRenderedXp === null || adventureRenderedScope !== scope ? null : getProgressState(adventureRenderedXp);
    const commerceState = commerce || lastAdventureCommerceState || { sales: 0, visits: 0, dailyLoginStars: 0 };
    lastAdventureState = state; lastAdventureCommerceState = commerceState;
    ensureJourneyMarkup();
    const positions = renderJourneyNodes(state, commerceState);
    renderJourneyCompanions(state);
    const selected = ADVENTURE_LEVELS[selectedGamificationCompanion(state.currentLevelIndex)];
    document.getElementById("adventurePlayerFace").innerHTML = `<img src="${esc(selected.asset)}" alt="" loading="eager" decoding="async">`;
    const path = document.getElementById("journeyRouteBase");
    const progress = journeyPathProgress(state);
    const totalLength = path.getTotalLength();
    const point = path.getPointAtLength(totalLength * progress);
    const player = document.getElementById("adventurePlayer");
    const finalTransform = `translate3d(${point.x - 32}px,${point.y - 32}px,0)`;
    const shouldAnimate = animate && previousState && previousState.currentXP !== state.currentXP;
    if (shouldAnimate && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const previousPoint = path.getPointAtLength(totalLength * journeyPathProgress(previousState));
      adventureMarkerAnimation?.cancel();
      adventureMarkerAnimation = player.animate([{ transform: `translate3d(${previousPoint.x - 32}px,${previousPoint.y - 32}px,0)` }, { transform: finalTransform }], { duration: 500, easing: "cubic-bezier(.23,1,.32,1)", fill: "forwards" });
      adventureMarkerAnimation.addEventListener("finish", () => { player.style.transform = finalTransform; adventureMarkerAnimation?.cancel(); adventureMarkerAnimation = null; }, { once: true });
    } else player.style.transform = finalTransform;
    const routePercent = progress * 100;
    document.getElementById("journeyRouteProgress").style.strokeDasharray = `${routePercent} ${100 - routePercent}`;
    document.getElementById("journeyRouteProgressShadow").style.strokeDasharray = `${routePercent} ${100 - routePercent}`;
    document.getElementById("adventureCurrentLevel").textContent = `Nivel ${state.currentLevel.id} · ${state.currentLevel.character}`;
    document.getElementById("adventureXpValue").textContent = state.nextLevel ? `${state.currentXP.toLocaleString("es-BO")} / ${state.nextLevel.xpRequired.toLocaleString("es-BO")} XP` : `${state.currentXP.toLocaleString("es-BO")} XP · Ruta completa`;
    document.getElementById("adventureXpRemaining").textContent = state.nextLevel ? `${state.xpUntilNext.toLocaleString("es-BO")} XP para ${state.nextLevel.character}` : "Todos los personajes desbloqueados";
    document.getElementById("adventureOverallProgress").textContent = `${Math.round(state.overallPercentage)}% de la ruta`;
    const xpTrack = document.getElementById("adventureXpTrack"); xpTrack.setAttribute("aria-valuenow", String(Math.round(state.currentLevelPercentage))); xpTrack.setAttribute("aria-valuetext", `${Math.round(state.currentLevelPercentage)}% de la etapa actual`);
    document.getElementById("adventureXpFill").style.transform = `scaleX(${state.currentLevelPercentage / 100})`;
    const currentStageIndex = ADVENTURE_WORLD_STAGES.findIndex((stage) => stage.type === "character" && stage.levelIndex === state.currentLevelIndex);
    renderJourneyDetail(currentStageIndex, state, commerceState);
    const viewport = document.getElementById("journeyViewport");
    if (adventureInitialScrollScope !== scope && viewport.clientWidth > 0) { viewport.scrollLeft = Math.max(0, positions[currentStageIndex].x - (viewport.clientWidth * .38)); adventureInitialScrollScope = scope; }
    const inferredDelta = delta === null && previousState ? state.currentXP - previousState.currentXP : delta;
    if (shouldAnimate && inferredDelta > 0) showAdventureXpToast(inferredDelta);
    if (shouldAnimate && state.currentLevelIndex > previousState.currentLevelIndex) { showAdventureLevelUp(state.currentLevel); playAdventureTouchSound("open"); }
    adventureRenderedXp = state.currentXP; adventureRenderedScope = scope;
    return state;
  }
  window.renderAnimalAdventure = renderAnimalAdventure;

  function defaultGamificationSpeech(state, storeName) {
    const subject = storeName || "tu negocio";
    if (state.sales === 0 && state.visits === 0) {
      return `¡${subject} está listo para comenzar! Comparte el enlace de tu tienda: la primera visita ya suma experiencia.`;
    }
    if (!state.nextLevel) {
      return `¡Qué recorrido! ${subject} llegó a la guía final con ${state.sales.toLocaleString("es-BO")} ventas y ${state.visits.toLocaleString("es-BO")} visitas. Sigue creciendo a tu ritmo.`;
    }
    if (state.sales > 0) {
      return `¡Buen trabajo! ${subject} ya convirtió ${state.sales.toLocaleString("es-BO")} ${state.sales === 1 ? "venta" : "ventas"} y ${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"} en progreso real.`;
    }
    return `¡Ya te están descubriendo! ${subject} sumó ${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"}. La primera venta desbloqueará 50 XP de una vez.`;
  }

  function setGamificationProgress(element, progress) {
    element.style.setProperty("--xp-progress-scale", String(progress / 100));
    element.setAttribute("aria-valuenow", String(progress));
    element.setAttribute("aria-valuetext", `${progress}% del nivel completado`);
  }

  function hideGamificationToast() {
    window.clearTimeout(gamificationToastTimer);
    gamificationToastTimer = null;
    const toast = document.getElementById("gamificationToast");
    toast.hidden = true;
    if (activeGamificationAnnouncement?.achievementId) {
      markAchievementSeen(activeGamificationAnnouncement.achievementId, activeGamificationAnnouncement.achievementScope);
      document.querySelector(`[data-achievement-id="${activeGamificationAnnouncement.achievementId}"]`)?.classList.remove("is-unlocking");
    }
    activeGamificationAnnouncement = null;
    window.setTimeout(showNextGamificationAnnouncement, 220);
  }

  function showNextGamificationAnnouncement() {
    if (activeGamificationAnnouncement || !gamificationAnnouncementQueue.length) return;
    activeGamificationAnnouncement = gamificationAnnouncementQueue.shift();
    const { companion, title, message, achievementId } = activeGamificationAnnouncement;
    const toast = document.getElementById("gamificationToast");
    document.getElementById("gamificationToastImage").src = companion.asset;
    document.getElementById("gamificationToastTitle").textContent = title;
    document.getElementById("gamificationToastMessage").textContent = message;
    toast.dataset.kind = achievementId ? "achievement" : "progress";
    if (achievementId) {
      const card = document.querySelector(`[data-achievement-id="${achievementId}"]`);
      card?.classList.remove("is-unlocking");
      requestAnimationFrame(() => card?.classList.add("is-unlocking"));
    }
    window.clearTimeout(gamificationToastTimer);
    toast.hidden = false;
    gamificationToastTimer = window.setTimeout(hideGamificationToast, 8500);
  }

  function showGamificationToast(companion, title, message, achievementId = null, achievementScope = null) {
    const duplicate = achievementId && (
      (activeGamificationAnnouncement?.achievementId === achievementId && activeGamificationAnnouncement?.achievementScope === achievementScope)
      || gamificationAnnouncementQueue.some((item) => item.achievementId === achievementId && item.achievementScope === achievementScope)
    );
    if (duplicate) return;
    gamificationAnnouncementQueue.push({ companion, title, message, achievementId, achievementScope });
    showNextGamificationAnnouncement();
  }

  function showNextBirdUnlock() {
    const dialog = document.getElementById("birdUnlockDialog");
    const blockingDialog = document.querySelector("dialog[open]:not(#birdUnlockDialog)");
    if (dialog.open || blockingDialog || !birdUnlockQueue.length) return;
    const pending = birdUnlockQueue[0];
    if (pending.storeId !== currentStoreId) {
      birdUnlockQueue.shift();
      queuedProgressLevels.delete(`${pending.storeId}:${pending.levelIndex}`);
      window.setTimeout(showNextBirdUnlock, 0);
      return;
    }
    const { level, storeName, storeId, levelIndex } = pending;
    document.getElementById("birdUnlockImage").src = level.asset;
    document.getElementById("birdUnlockImage").alt = level.alt;
    document.getElementById("birdUnlockTitle").textContent = `¡${level.character} llegó!`;
    document.getElementById("birdUnlockLevel").textContent = `Nivel ${level.id} · ${level.name}`;
    document.getElementById("birdUnlockSpeech").textContent = `¡Felicidades! Has llegado al nivel ${level.id}. ${storeName} va muy bien; cada venta y cada visita cuentan. Desde ahora ${level.character} te acompaña. ¡Sigue así!`;
    try {
      dialog.showModal();
      birdUnlockQueue.shift();
      document.getElementById("birdUnlockContinue").focus();
      progressAcknowledgementChain = progressAcknowledgementChain.then(() => acknowledgeBirdUnlock(storeId, levelIndex));
    } catch {
      // Keep the unlock pending locally and on the server so a later render can retry it.
    }
  }

  function queueBirdUnlock(levelIndex, storeName, storeId) {
    const level = ADVENTURE_LEVELS[levelIndex];
    const queueKey = `${storeId}:${levelIndex}`;
    if (!level || queuedProgressLevels.has(queueKey)) return;
    queuedProgressLevels.add(queueKey);
    birdUnlockQueue.push({ level, levelIndex, storeName, storeId });
    showNextBirdUnlock();
  }

  async function acknowledgeBirdUnlock(storeId, levelIndex) {
    try {
      await api("/dashboard/progress-celebrations/acknowledge", {
        method: "POST",
        body: JSON.stringify({ storeId, level: levelIndex }),
      });
    } catch {
      // The server remains authoritative and will offer the unlock again next login.
    }
  }

  async function claimProgressCelebrations() {
    if (!sessionToken || !currentStoreId) return;
    const storeId = currentStoreId;
    if (progressCelebrationFetches.has(storeId)) return;
    progressCelebrationFetches.add(storeId);
    try {
      const result = await api("/dashboard/progress-celebrations", {
        method: "POST",
        body: JSON.stringify({ storeId }),
      });
      if (storeId !== currentStoreId) return;
      const storeName = lastStores.find((store) => store.id === storeId)?.name || "Tu tienda";
      (result.newlyUnlockedLevels || []).forEach((levelIndex) => queueBirdUnlock(levelIndex, storeName, storeId));
    } catch {
      // Progress celebration must never block the operational dashboard.
    } finally {
      progressCelebrationFetches.delete(storeId);
    }
  }

  document.getElementById("birdUnlockContinue").addEventListener("click", () => document.getElementById("birdUnlockDialog").close());
  document.getElementById("birdUnlockDialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    event.currentTarget.close();
  });
  document.getElementById("birdUnlockDialog").addEventListener("close", () => window.setTimeout(showNextBirdUnlock, 120));
  document.addEventListener("close", (event) => {
    if (event.target?.id !== "birdUnlockDialog") window.setTimeout(showNextBirdUnlock, 120);
  }, true);

  async function claimDailyLoginReward() {
    try {
      const reward = await api("/dashboard/daily-login-reward", { method: "POST" });
      dailyLoginReward = {
        awarded: reward?.awarded === true,
        totalStars: Math.max(0, Number(reward?.totalStars) || 0),
      };
      if (lastFinances) renderGamification(lastFinances, { announce: false });
      if (!dailyLoginReward.awarded) return;

      const state = gamificationState(lastFinances);
      const companion = ADVENTURE_LEVELS[selectedGamificationCompanion(state.levelIndex)];
      const totalLabel = state.dailyLoginStars === 1 ? "tu primera estrella de constancia" : `${state.dailyLoginStars.toLocaleString("es-BO")} estrellas de constancia`;
      showGamificationToast(companion, "¡Ganaste 1 estrella!", `${companion.character} celebra que volviste hoy. Ya tienes ${totalLabel}.`);
    } catch {
      // A gamification reward must never block access to the operational dashboard.
    }
  }

  function gamificationCelebration(state, companion) {
    let previous = null;
    try { previous = JSON.parse(localStorage.getItem(gamificationSnapshotKey()) || "null"); } catch {}
    const snapshot = { xp: state.xp, levelIndex: state.levelIndex };
    try { localStorage.setItem(gamificationSnapshotKey(), JSON.stringify(snapshot)); } catch {}
    if (!previous || state.xp <= (Number(previous.xp) || 0)) return null;

    const gained = state.xp - (Number(previous.xp) || 0);
    if (state.levelIndex > (Number(previous.levelIndex) || 0)) {
      // The durable server claim owns level-up celebrations so they work on
      // another device and after an offline acquisition without duplicating.
      return null;
    }
    return { title: `¡+${gained.toLocaleString("es-BO")} XP!`, message: `${companion.character} te felicita: nuevas ventas o visitas acercaron tu tienda al siguiente nivel.` };
  }

  function renderGamificationMap(state) {
    renderAnimalAdventure(resolvedAdventureXp(state.xp), { commerce: state });
  }

  function renderGamification(finances, { announce = true } = {}) {
    const state = gamificationState(finances);
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
    const storeName = finances?.scope?.storeName || selectedStore?.name || "tu negocio";
    const companionIndex = selectedGamificationCompanion(state.levelIndex);
    const companion = ADVENTURE_LEVELS[companionIndex];
    const achievementIds = announce ? pendingAchievementIds(state) : [];
    const celebration = announce ? gamificationCelebration(state, companion) : null;
    const speech = celebration?.message || defaultGamificationSpeech(state, storeName);
    const nextCopy = state.nextLevel
      ? `${(state.nextLevel.xpRequired - state.xp).toLocaleString("es-BO")} XP para ${state.nextLevel.name}`
      : "Nivel máximo alcanzado";

    const imageTargets = [
      ["gamificationSummaryImage", `${companion.character}, compañero de progreso`],
      ["gamificationHeroImage", companion.alt],
    ];
    imageTargets.forEach(([id, alt]) => {
      const image = document.getElementById(id);
      image.src = companion.asset;
      image.alt = alt;
    });

    document.getElementById("gamificationSummaryXp").textContent = `${state.xp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationSummarySpeech").textContent = speech;
    document.getElementById("gamificationSummaryLevel").textContent = `Nivel ${state.levelIndex + 1} · ${state.level.name}`;
    document.getElementById("gamificationSummaryNext").textContent = nextCopy;
    setGamificationProgress(document.getElementById("gamificationSummaryTrack"), state.progress);

    document.getElementById("gamificationLevelTitle").textContent = state.level.name;
    document.getElementById("gamificationLevelNumber").textContent = `Nivel ${state.levelIndex + 1} de ${ADVENTURE_LEVELS.length}`;
    document.getElementById("gamificationSpeech").textContent = speech;
    document.getElementById("gamificationXpTotal").textContent = `${state.xp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationXpNext").textContent = state.nextLevel ? `Te faltan ${nextCopy}` : nextCopy;
    document.getElementById("gamificationLevelFloor").textContent = `${state.level.xpRequired.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationLevelCeiling").textContent = state.nextLevel ? `${state.nextLevel.xpRequired.toLocaleString("es-BO")} XP` : "Nivel máximo";
    setGamificationProgress(document.getElementById("gamificationLevelTrack"), state.progress);
    document.getElementById("gamificationSalesXp").textContent = `${state.salesXp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationSalesSource").textContent = `${state.sales.toLocaleString("es-BO")} ${state.sales === 1 ? "venta" : "ventas"} × ${GAMIFICATION_XP_PER_SALE} XP`;
    document.getElementById("gamificationVisitsXp").textContent = `${state.visitsXp.toLocaleString("es-BO")} XP`;
    document.getElementById("gamificationVisitsSource").textContent = `${state.visits.toLocaleString("es-BO")} ${state.visits === 1 ? "visita" : "visitas"} × ${GAMIFICATION_XP_PER_VISIT} XP`;
    document.getElementById("gamificationDailyStars").textContent = `${state.dailyLoginStars.toLocaleString("es-BO")} ${state.dailyLoginStars === 1 ? "estrella" : "estrellas"}`;
    document.getElementById("gamificationDailySource").textContent = dailyLoginReward.awarded ? "Ganaste 1 hoy · vuelve mañana" : "+1 por tu primer ingreso de cada día";

    document.getElementById("gamificationStarsSummary").textContent = `${state.earnedStars} de ${state.stars.length} estrellas ganadas con la actividad real de ${storeName}.`;
    document.getElementById("gamificationStars").innerHTML = state.stars.map((star) => `<article class="gamification-star${star.isEarned ? " is-earned" : ""}" data-achievement-id="${star.id}">
      ${GAMIFICATION_STAR_SVG}
      <strong>${esc(star.title)}</strong>
      <p>${esc(star.description)}</p>
      <span class="gamification-star-status">${star.isEarned ? "Ganada" : esc(star.progress(state))}</span>
    </article>`).join("");

    document.getElementById("gamificationCompanions").innerHTML = ADVENTURE_LEVELS.map((entry, index) => {
      const isLocked = index > state.levelIndex;
      const isSelected = index === companionIndex;
      const buttonLabel = isLocked ? `Se abre en nivel ${index + 1}` : isSelected ? "Acompañándote" : `Elegir a ${entry.character}`;
      return `<article class="gamification-companion${isLocked ? " is-locked" : ""}${isSelected ? " is-selected" : ""}">
        ${isLocked ? `<span class="gamification-companion-lock">Nivel ${index + 1}</span>` : ""}
        <div class="gamification-companion-art"><img src="${entry.asset}" alt="${esc(entry.alt)}"></div>
        <div class="gamification-companion-copy"><strong>${esc(entry.character)} · ${esc(entry.name)}</strong><span>${esc(entry.description)}</span><button type="button" data-companion-select="${index}" aria-pressed="${isSelected}"${isLocked ? " disabled" : ""}>${esc(buttonLabel)}</button></div>
      </article>`;
    }).join("");

    renderGamificationMap(state);
    if (activeGamificationAnnouncement?.achievementId) {
      document.querySelector(`[data-achievement-id="${activeGamificationAnnouncement.achievementId}"]`)?.classList.add("is-unlocking");
    }
    const runner = GAMIFICATION_RUNNERS[selectedGamificationRunner()];
    achievementIds.forEach((achievementId) => {
      const achievement = state.stars.find((star) => star.id === achievementId);
      if (!achievement) return;
      showGamificationToast(runner, "¡Logro desbloqueado!", `${runner.name} encontró “${achievement.title}”. ${achievement.description}`, achievement.id, gamificationStorageScope());
    });
    if (celebration) showGamificationToast(companion, celebration.title, celebration.message);
  }

  function renderFinances(finances) {
    lastFinances = finances;
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
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
    renderGamification(finances);
    void claimProgressCelebrations();
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
    const storeId = currentStoreId;
    Promise.all([
      api("/merchants/finances"),
      storeId ? api(`/merchants/finances?storeId=${encodeURIComponent(storeId)}`) : api("/merchants/finances"),
    ]).then(([totalFinances, scopedFinances]) => {
      if (storeId !== currentStoreId) return;
      renderTotalFinances(totalFinances);
      renderFinances(scopedFinances);
      window.updateYapiContext?.({ finances: scopedFinances });
    }).catch(() => {
      // The product mutation already succeeded. Keep the last summary instead
      // of turning a non-critical refresh into a blocking error.
    });
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  // Shows only the last 4 digits — a payout row has no reason to repeat the
  // full account number on every line.
  function maskBankAccount(s) {
    const str = String(s ?? "");
    const digits = str.replace(/\D/g, "");
    if (digits.length <= 4) return str;
    return str.slice(0, -4).replace(/[0-9]/g, "•") + str.slice(-4);
  }

  // "active" hides REQUIRES_PAYMENT_METHOD specifically — a customer who
  // never even chose how to pay isn't a real payment attempt, and on a busy
  // store these dwarf real payments in the raw list. "Todos" still shows
  // them for anyone who wants the full picture.
  const PENDING_STATUSES = ["REQUIRES_PAYMENT_METHOD", "REQUIRES_CONFIRMATION", "PROCESSING"];
  const ENDED_STATUSES = ["CANCELED", "FAILED"];

  function filteredPayments() {
    const normalizedSearch = orderSearch.trim().toLocaleLowerCase("es");
    const matchingSearch = normalizedSearch
      ? lastPayments.filter((p) => [p.id, p.customerName, p.customerEmail, p.customerPhone, p.description]
          .some((value) => String(value || "").toLocaleLowerCase("es").includes(normalizedSearch)))
      : lastPayments;
    if (paymentStatusFilter === "all") return matchingSearch;
    if (paymentStatusFilter === "active") return matchingSearch.filter((p) => p.status !== "REQUIRES_PAYMENT_METHOD");
    if (paymentStatusFilter === "pending") return matchingSearch.filter((p) => PENDING_STATUSES.includes(p.status));
    if (paymentStatusFilter === "ended") return matchingSearch.filter((p) => ENDED_STATUSES.includes(p.status));
    return matchingSearch.filter((p) => p.status === paymentStatusFilter);
  }

  const ORDER_STATUS_LABELS = {
    LEAD_RECEIVED: "Interesado recibido",
    SUCCEEDED: "Pago exitoso",
    REQUIRES_ACTION: "Necesita acción",
    REQUIRES_PAYMENT_METHOD: "Sin método de pago",
    REQUIRES_CONFIRMATION: "Por confirmar",
    PROCESSING: "Procesando",
    CANCELED: "Cancelado",
    FAILED: "Fallido",
    PAID: "Pagado · por preparar",
    PREPARING: "En preparación",
    READY_FOR_PICKUP: "Listo para recoger",
    SHIPPED: "Enviado",
    DELIVERED: "Entregado",
    REFUNDED: "Reembolsado",
  };

  const FULFILLMENT_NEXT = {
    PAID: ["PREPARING", "READY_FOR_PICKUP", "SHIPPED", "CANCELED", "REFUNDED"],
    PREPARING: ["READY_FOR_PICKUP", "SHIPPED", "CANCELED"],
    READY_FOR_PICKUP: ["DELIVERED", "CANCELED"],
    SHIPPED: ["DELIVERED", "CANCELED"],
    DELIVERED: ["REFUNDED"],
  };

  function orderItemsLabel(order) {
    if (!Array.isArray(order.items) || order.items.length === 0) return order.description || "Sin detalle de productos";
    return order.items.map((item) => {
      const name = item.name || item.label || "Producto";
      const option = item.variantName ? ` (${item.variantName})` : "";
      return `${name}${option} × ${item.quantity || 1}`;
    }).join(" · ");
  }

  function renderPaymentRows() {
    const selectedStore = lastStores.find((store) => store.id === currentStoreId);
    document.getElementById("paymentScopeLabel").textContent = selectedStore?.name || "Toda la cuenta";
    const filtered = filteredPayments();
    const pageCount = Math.max(1, Math.ceil(filtered.length / PAYMENT_PAGE_SIZE));
    paymentPage = Math.min(paymentPage, pageCount);
    const start = (paymentPage - 1) * PAYMENT_PAGE_SIZE;
    const pageRows = filtered.slice(start, start + PAYMENT_PAGE_SIZE);
    document.getElementById("downloadOrdersCsv").disabled = filtered.length === 0;
    document.getElementById("downloadOrdersPdf").disabled = filtered.length === 0;
    document.getElementById("downloadSalesCsv").disabled = !(lastFinances?.paymentCount > 0);

    document.getElementById("paymentRows").innerHTML = pageRows
      .map(
        (p) => `<tr>
          <td><div class="buyer-summary"><strong>${p.kind === "LEAD" ? "Interesado" : "Pago"}</strong><code>${esc(p.id)}</code>${p.storeName ? `<span>${esc(p.storeName)}</span>` : ""}</div></td>
          <td><div class="buyer-summary"><strong>${esc(p.customerName || "Sin nombre")}</strong><span>${esc(p.customerEmail || "Sin correo")}</span><span>${esc(p.customerPhone || "Sin teléfono")}</span></div></td>
          <td>${money(p.amount)}</td>
          <td><span class="badge ${esc(p.status)}">${esc(ORDER_STATUS_LABELS[p.status] || p.status)}</span>${p.paymentMethodType ? `<div class="faint" style="margin-top:4px">${esc(p.paymentMethodType)}</div>` : ""}</td>
          <td>${esc(new Date(p.createdAt).toLocaleString())}</td>
          <td><details class="order-detail"><summary>Ver datos</summary><div class="order-detail-card"><strong>${esc(orderItemsLabel(p))}</strong>${p.description ? `<span>${esc(p.description)}</span>` : ""}${p.fulfillmentStatus ? `<span>Entrega: <b>${esc(ORDER_STATUS_LABELS[p.fulfillmentStatus] || p.fulfillmentStatus)}</b></span>` : ""}${p.deliveryRequested ? `<span><b>Entrega solicitada</b>${p.deliveryAddress ? ` · ${esc(p.deliveryAddress)}` : ""}</span>` : ""}<div class="order-contact-links">${p.customerEmail ? `<a href="mailto:${encodeURIComponent(p.customerEmail)}">Enviar correo</a>` : ""}${p.customerPhone ? `<a href="tel:${esc(String(p.customerPhone).replace(/[^+\d]/g, ""))}">Llamar</a>` : ""}${Number.isFinite(p.customerLatitude) && Number.isFinite(p.customerLongitude) ? `<a href="https://www.google.com/maps?q=${encodeURIComponent(`${p.customerLatitude},${p.customerLongitude}`)}" target="_blank" rel="noopener noreferrer">Abrir ubicación</a>` : ""}</div>${p.orderId && (FULFILLMENT_NEXT[p.fulfillmentStatus] || []).length ? `<label class="faint">Actualizar entrega<select class="fulfillment-select" data-order-id="${esc(p.orderId)}" style="margin-top:6px"><option value="">Selecciona…</option>${FULFILLMENT_NEXT[p.fulfillmentStatus].map((status) => `<option value="${status}">${esc(ORDER_STATUS_LABELS[status] || status)}</option>`).join("")}</select></label>` : ""}<code>ID: ${esc(p.id)}</code></div></details></td>
        </tr>`,
      )
      .join("") ||
      `<tr><td colspan="6" class="muted">${lastPayments.length === 0 ? "Todavía no hay pedidos ni interesados." : "No encontramos pedidos con estos filtros."}</td></tr>`;

    document.getElementById("paymentPager").innerHTML =
      filtered.length === 0
        ? ""
        : `<button type="button" class="ghost" id="paymentPrev" ${paymentPage <= 1 ? "disabled" : ""}>&larr; Anterior</button>
           <span>Página ${paymentPage} de ${pageCount} (${filtered.length} pedidos)</span>
           <button type="button" class="ghost" id="paymentNext" ${paymentPage >= pageCount ? "disabled" : ""}>Siguiente &rarr;</button>`;

    document.getElementById("paymentPrev")?.addEventListener("click", () => {
      paymentPage--;
      renderPaymentRows();
    });
    document.getElementById("paymentNext")?.addEventListener("click", () => {
      paymentPage++;
      renderPaymentRows();
    });
    document.querySelectorAll(".fulfillment-select").forEach((select) => {
      select.addEventListener("change", async () => {
        if (!select.value) return;
        select.disabled = true;
        try {
          await api(`/orders/${encodeURIComponent(select.dataset.orderId)}/fulfillment`, {
            method: "PATCH",
            body: JSON.stringify({ status: select.value }),
          });
          infoEl.textContent = "Estado de entrega actualizado.";
          await refresh();
        } catch (error) {
          errorEl.textContent = "Error actualizando la entrega: " + error.message;
          select.disabled = false;
        }
      });
    });
  }

  document.getElementById("paymentStatusFilter").addEventListener("change", (e) => {
    paymentStatusFilter = e.target.value;
    paymentPage = 1;
    renderPaymentRows();
  });
  document.getElementById("orderSearch").addEventListener("input", (e) => {
    orderSearch = e.target.value;
    paymentPage = 1;
    renderPaymentRows();
  });

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function safeFilename(value) {
    const valueOrDefault = value || "documento";
    return String(valueOrDefault)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  async function downloadPdf(path, filename, button) {
    const response = await fetch(`${apiBaseEl.value.replace(/\/$/, "")}${path}`, {
      headers: { authorization: "Bearer " + sessionToken },
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error((body && body.message) || "No se pudo generar el PDF.");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    if (button?.isConnected) {
      button.textContent = "PDF descargado";
      window.setTimeout(() => {
        if (button?.isConnected) button.textContent = "Descargar";
      }, 1400);
    }
  }

  function downloadOrdersCsv(rows, filename, includeTotal = false) {
    const headers = ["Tipo", "ID", "Tienda", "Fecha", "Estado", "Nombre", "Correo", "Teléfono", "Productos", "Monto", "Moneda", "Método"];
    const data = rows.map((order) => [
      order.kind === "LEAD" ? "Interesado" : "Pago",
      order.id,
      order.storeName || "Sin tienda",
      new Date(order.createdAt).toISOString(),
      ORDER_STATUS_LABELS[order.status] || order.status,
      order.customerName || "",
      order.customerEmail || "",
      order.customerPhone || "",
      orderItemsLabel(order),
      (Number(order.amount || 0) / 100).toFixed(2),
      order.currency || "BOB",
      order.paymentMethodType || "",
    ]);
    if (includeTotal) {
      data.push(["TOTAL", "", "", "", "", "", "", "", "", (rows.reduce((sum, order) => sum + Number(order.amount || 0), 0) / 100).toFixed(2), rows[0]?.currency || "BOB", ""]);
    }
    const csv = "\ufeff" + [headers, ...data].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  document.getElementById("downloadOrdersCsv").addEventListener("click", () => {
    const rows = filteredPayments();
    if (!rows.length) return;
    downloadOrdersCsv(rows, `pedidos-${new Date().toISOString().slice(0, 10)}.csv`);
  });
  document.getElementById("downloadOrdersPdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const selectedStore = lastStores.find((candidate) => candidate.id === currentStoreId);
      const datePart = new Date().toISOString().slice(0, 10);
      const query = new URLSearchParams({ export: "true" });
      if (currentStoreId) query.set("storeId", currentStoreId);
      if (orderSearch.trim()) query.set("search", orderSearch.trim());
      if (paymentStatusFilter && paymentStatusFilter !== "all") query.set("status", paymentStatusFilter);
      await downloadPdf(`/merchants/orders.pdf?${query.toString()}`, `pedidos-${safeFilename(selectedStore?.slug || selectedStore?.name || "tienda")}-${datePart}.pdf`, button);
      infoEl.textContent = "PDF de pagos preparado.";
      button.textContent = original;
    } catch (error) {
      button.disabled = false;
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = original;
    } finally {
      button.disabled = false;
      if (button.textContent === "PDF descargado") return;
      button.textContent = original;
    }
  });
  document.getElementById("downloadSalesCsv").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando CSV…";
    try {
      const query = currentStoreId
        ? `?storeId=${encodeURIComponent(currentStoreId)}&export=true`
        : "?export=true";
      const allOrders = await api(`/merchants/orders${query}`);
      const rows = allOrders.filter((order) => order.kind === "PAYMENT" && order.status === "SUCCEEDED");
      if (!rows.length) throw new Error("Todavía no hay ventas exitosas para descargar.");
      const store = lastStores.find((candidate) => candidate.id === currentStoreId);
      const slug = String(store?.slug || "negocio").replace(/[^a-z0-9_-]+/gi, "-").toLowerCase();
      downloadOrdersCsv(rows, `ventas-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, true);
      infoEl.textContent = `CSV preparado con ${rows.length} ${rows.length === 1 ? "venta" : "ventas"}.`;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    } finally {
      button.textContent = originalText;
      renderPaymentRows();
    }
  });
  document.getElementById("downloadPayoutsPdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const datePart = new Date().toISOString().slice(0, 10);
      await downloadPdf(`/merchants/payouts.pdf`, `desembolsos-${datePart}.pdf`, button);
      infoEl.textContent = "Estado de desembolsos en PDF preparado.";
      button.textContent = originalText;
    } catch (error) {
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("downloadFinancePdf").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Preparando PDF…";
    try {
      const datePart = new Date().toISOString().slice(0, 10);
      const query = currentStoreId ? `?storeId=${encodeURIComponent(currentStoreId)}` : "";
      await downloadPdf(
        `/merchants/finances.pdf${query}`,
        `finanzas-${safeFilename(currentStoreId ? (lastStores.find((store) => store.id === currentStoreId)?.name || "tienda") : "negocio")}-${datePart}.pdf`,
        button,
      );
      infoEl.textContent = "Resumen financiero en PDF preparado.";
      button.textContent = originalText;
    } catch (error) {
      errorEl.textContent = "Error al descargar el PDF: " + error.message;
      button.textContent = originalText;
    } finally {
      button.disabled = false;
    }
  });

  function beginPaymentLinkEdit(link) {
    if (!link) return;
    syncStoreResourceViews("products");
    const guide = document.getElementById("productGuideFrame");
    if (guide.dataset.ready === "true") guide.contentWindow?.postMessage({type:"pagosya:product-guide-edit", storeId: currentStoreId, product: link}, location.origin);
    else guide.dataset.pendingProduct = JSON.stringify(link);
    guide.scrollIntoView({block:"center",behavior:"smooth"});
  }
  function renderPaymentLinkRows(links) {
    lastPaymentLinks = links;
    renderCatalogCollectionRows();
    renderPreviewProductNavigation();
    renderPreviewCatalogEditor();
    renderStoreContentOrderEditor();
    pendingStoreLocations.forEach((location, locationIndex) => {
      location.inventory ||= {};
      links.filter((product) => product.status !== "ARCHIVED").forEach((product) => {
        if (Object.prototype.hasOwnProperty.call(location.inventory, product.id)) return;
        if (product.locationStocks && Object.prototype.hasOwnProperty.call(product.locationStocks, location.id)) {
          location.inventory[product.id] = product.locationStocks[location.id];
        } else {
          location.inventory[product.id] = pendingStoreLocations.length === 1 && locationIndex === 0 ? product.stock : 0;
        }
      });
    });
    renderStoreLocationsEditor();
    bulkDiscountClearAllEl.disabled = !links.some((product) => product.discountPercent !== null && product.discountPercent !== undefined);
    if (!bulkDiscountStudioEl.hidden) renderBulkDiscountProducts();
    renderHeroSlidesEditor();
    renderPromotionProductChoice();
    renderEditorialGalleryEditor();
    renderStoreRecommendationChoices();
    window.updateYapiContext?.({ store: lastStores.find((store) => store.id === currentStoreId) || null, products: links });
    const rowsEl = document.getElementById("paymentLinkRows");
    const searchQuery = normalizeProductSearch(paymentLinkSearchEl.value);
    const matchingLinks = searchQuery
      ? links.filter((link) => {
          const category = lastCategories.find((item) => item.id === link.categoryId);
          return normalizeProductSearch([
            link.name,
            link.description,
            category?.name,
            ...(link.tags || []),
          ].filter(Boolean).join(" ")).includes(searchQuery);
        })
      : links;
    paymentLinkSearchClearEl.hidden = !searchQuery;
    paymentLinkSearchSummaryEl.textContent = searchQuery
      ? `${matchingLinks.length} de ${links.length} ${links.length === 1 ? "producto coincide" : "productos coinciden"} con tu búsqueda.`
      : links.length > paymentLinkPageSize
        ? `${links.length} productos guardados. Los más nuevos aparecen primero; los anteriores continúan en las páginas siguientes.`
        : `${links.length} ${links.length === 1 ? "producto guardado" : "productos guardados"}. Los más nuevos aparecen primero.`;
    const pageTokens = (currentPage, totalPages) => {
      if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
      const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
      const ordered = [...pages].filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b);
      const tokens = [];
      ordered.forEach((page, index) => {
        if (index && page - ordered[index - 1] > 1) tokens.push("gap");
        tokens.push(page);
      });
      return tokens;
    };
    const renderRow = (link) => {
        const cover = link.imageUrls && link.imageUrls[0];
        const thumb = cover ? `<img class="link-thumb" src="${esc(dashboardAssetUrl(cover))}" alt="" style="object-position:${esc(link.imagePositions?.[0] || "50% 50%")}">` : "";
        const swatch = link.color
          ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(link.color)};border:1px solid rgba(0,0,0,.15);margin-right:6px" title="${esc(link.color)}"></span>`
          : "";
        const category = lastCategories.find((c) => c.id === link.categoryId);
        const meta = [];
        if (category) meta.push(esc(category.name));
        if (link.stock !== null && link.stock !== undefined) meta.push(`Stock: ${link.stock}`);
        if (link.variants?.length) {
          meta.push(
            `Opciones: ${link.variants
              .map((variant) => `${esc(variant.name)} (${variant.stock === undefined ? "compartido" : variant.stock === null ? "∞" : variant.stock})`)
              .join(", ")}`,
          );
        }
        if (link.codigoProducto) meta.push(`SKU: ${esc(link.codigoProducto)}`);
        if (link.codigoProductoSin) meta.push("SIN clasificado");
        const discountStartsAt = Date.parse(link.discountStartsAt || "");
        const discountEndsAt = Date.parse(link.discountEndsAt || "");
        const discountActive = Number.isInteger(link.discountPercent) && Date.now() >= discountStartsAt && Date.now() < discountEndsAt;
        if (Number.isInteger(link.discountPercent) && Number.isFinite(discountStartsAt) && Number.isFinite(discountEndsAt)) {
          const discountState = discountActive ? "Activa" : Date.now() < discountStartsAt ? "Programada" : "Finalizada";
          meta.push(`${discountState}: ${link.discountPercent}% hasta ${new Intl.DateTimeFormat("es-BO", { dateStyle: "short", timeStyle: "short" }).format(new Date(discountEndsAt))}`);
        }
        const metaLine = meta.length ? `<div class="faint" style="margin-top:2px">${meta.join(" · ")}</div>` : "";
        const tagBadges = (link.tags || []).map((t) => `<span class="tag-badge">${esc(t)}</span>`).join("");
        const prices = (link.variants || []).map((variant) => variant.amount);
        const regularPriceLabel = prices.length
          ? Math.min(...prices) === Math.max(...prices)
            ? money(prices[0])
            : `${money(Math.min(...prices))} – ${money(Math.max(...prices))}`
          : money(link.amount);
        const priceLabel = discountActive
          ? `<strong style="color:#be123c">${link.discountPercent}% menos</strong><br><span class="faint"><s>${regularPriceLabel}</s></span>`
          : regularPriceLabel;
        const soldOut = link.variants?.length
          ? link.variants.every((variant) => variant.stock === 0)
          : link.stock === 0;
        const statusLabel = link.status === "ACTIVE" ? "Activo" : link.status === "ARCHIVED" ? "Archivado" : link.status;
        return `<tr data-payment-link-id="${esc(link.id)}">
          <td>${thumb}${swatch}${esc(link.name)}${tagBadges ? `<br>${tagBadges}` : ""}${metaLine}</td>
          <td>${priceLabel}</td>
          <td><div class="product-availability-badges"><span class="badge ${esc(link.status)}">${esc(statusLabel)}</span>${soldOut ? '<span class="badge SOLD_OUT">Agotado</span>' : ""}</div></td>
          <td>
            <div class="product-row-actions">
              ${link.status === "ACTIVE" ? `<button class="ghost edit-link" data-id="${esc(link.id)}">Editar</button>` : ""}
              ${link.status === "ACTIVE" && !soldOut ? `<button class="ghost sold-out-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Marcar agotado</button>` : ""}
              ${link.status === "ACTIVE" ? `<button class="ghost archive-link" data-id="${esc(link.id)}">Archivar</button>` : ""}
              ${link.status === "ARCHIVED" ? `<button class="ghost restore-link" data-id="${esc(link.id)}">Restaurar</button>` : ""}
              <button class="ghost delete-link" data-id="${esc(link.id)}" data-name="${esc(link.name)}">Eliminar</button>
            </div>
          </td>
        </tr>`;
    };
    const groups = [
      { status: "ACTIVE", title: "Productos activos", className: "is-active", empty: "No hay productos activos." },
      { status: "ARCHIVED", title: "Productos archivados", className: "is-archived", empty: "No hay productos archivados." },
    ];
    rowsEl.innerHTML = groups.map((group) => {
      const statusLinks = links.filter((link) => link.status === group.status);
      const groupLinks = matchingLinks.filter((link) => link.status === group.status);
      const totalPages = Math.max(1, Math.ceil(groupLinks.length / paymentLinkPageSize));
      const requestedPage = paymentLinkPageByStatus.get(group.status) || 1;
      const currentPage = Math.min(Math.max(requestedPage, 1), totalPages);
      paymentLinkPageByStatus.set(group.status, currentPage);
      const start = (currentPage - 1) * paymentLinkPageSize;
      const visibleLinks = groupLinks.slice(start, start + paymentLinkPageSize);
      const summary = groupLinks.length ? `${start + 1}–${Math.min(start + paymentLinkPageSize, groupLinks.length)} de ${groupLinks.length}` : "0 productos";
      const controls = pageTokens(currentPage, totalPages).map((token) => token === "gap"
        ? `<span class="payment-link-page-gap" aria-hidden="true">…</span>`
        : `<button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${token}" ${token === currentPage ? 'aria-current="page"' : ""} aria-label="Página ${token} de ${group.title.toLowerCase()}">${token}</button>`).join("");
      return `<section class="payment-link-group ${group.className}" data-payment-link-status="${group.status}" aria-labelledby="payment-link-${group.status.toLowerCase()}-title">
        <header class="payment-link-group-head">
          <h3 id="payment-link-${group.status.toLowerCase()}-title">${group.title}</h3>
          <span class="payment-link-group-count">${searchQuery ? `${groupLinks.length} de ${statusLinks.length}` : groupLinks.length} ${statusLinks.length === 1 ? "producto" : "productos"}</span>
        </header>
        ${groupLinks.length ? `<div class="payment-link-table-wrap"><table class="payment-link-table">
          <thead><tr><th>Nombre</th><th>Precio</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>${visibleLinks.map(renderRow).join("")}</tbody>
        </table></div>` : group.status === "ACTIVE" && !searchQuery && links.length === 0
          ? '<p class="payment-link-group-empty">Todavía no tienes productos. <button class="ghost" type="button" id="emptyCatalogImport">Importar catálogo</button></p>'
          : `<p class="payment-link-group-empty">${searchQuery ? "No hay productos de este estado que coincidan con tu búsqueda." : group.empty}</p>`}
        <nav class="payment-link-pagination" aria-label="Páginas de ${group.title.toLowerCase()}" ${totalPages <= 1 ? "hidden" : ""}>
          <span class="payment-link-page-summary">${summary}</span>
          <div class="payment-link-page-controls">
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage - 1}" aria-label="Página anterior" ${currentPage === 1 ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
            ${controls}
            <button type="button" class="payment-link-page-button" data-status="${group.status}" data-page="${currentPage + 1}" aria-label="Página siguiente" ${currentPage === totalPages ? "disabled" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
          </div>
        </nav>
      </section>`;
    }).join("");

    document.getElementById("emptyCatalogImport")?.addEventListener("click", () => {
      document.getElementById("catalogImportDisclosure").open = true;
      const toggle = document.getElementById("inventoryImporterToggle");
      if (toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      document.getElementById("inventoryImporter").scrollIntoView({ block: "start" });
      document.getElementById("inventoryCsvInput").focus();
    });

    document.querySelectorAll(".payment-link-page-button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        paymentLinkPageByStatus.set(btn.dataset.status, Number(btn.dataset.page));
        renderPaymentLinkRows(lastPaymentLinks);
        document.querySelector(`[data-payment-link-status="${btn.dataset.status}"]`)?.scrollIntoView({ block: "nearest" });
      });
    });

    document.querySelectorAll(".archive-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Archivando…";
          const archivedLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}/archive`, { method: "POST" });
          renderPaymentLinkRows(lastPaymentLinks.map((link) => (link.id === archivedLink.id ? archivedLink : link)));
          infoEl.textContent = `Producto "${archivedLink.name}" archivado.`;
          refreshFinancesInBackground();
          refreshStorePreview(true);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Archivar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".sold-out-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const link = lastPaymentLinks.find((item) => item.id === btn.dataset.id);
        if (!link || !confirm(`¿Marcar "${btn.dataset.name}" como agotado? Los clientes lo verán, pero no podrán comprarlo hasta que vuelvas a asignar stock.`)) return;
        const body = link.variants?.length
          ? { variants: link.variants.map((variant) => ({ id: variant.id, name: variant.name, amount: variant.amount, stock: 0 })) }
          : { stock: 0 };
        try {
          btn.disabled = true;
          btn.textContent = "Marcando…";
          const updatedLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
          renderPaymentLinkRows(lastPaymentLinks.map((item) => (item.id === updatedLink.id ? updatedLink : item)));
          infoEl.textContent = `Producto "${updatedLink.name}" marcado como agotado.`;
          refreshFinancesInBackground();
          refreshStorePreview(true);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Marcar agotado";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".restore-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          btn.disabled = true;
          btn.textContent = "Restaurando…";
          const restoredLink = await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}/restore`, { method: "POST" });
          renderPaymentLinkRows(lastPaymentLinks.map((link) => (link.id === restoredLink.id ? restoredLink : link)));
          infoEl.textContent = `Producto "${restoredLink.name}" restaurado.`;
          refreshFinancesInBackground();
          refreshStorePreview(true);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Restaurar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".delete-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`¿Eliminar "${btn.dataset.name}"? Esta acción no se puede deshacer.`)) return;
        try {
          btn.disabled = true;
          btn.textContent = "Eliminando…";
          await api(`/stores/${currentStoreId}/payment_links/${btn.dataset.id}`, { method: "DELETE" });
          renderPaymentLinkRows(lastPaymentLinks.filter((link) => link.id !== btn.dataset.id));
          infoEl.textContent = `Producto "${btn.dataset.name}" eliminado.`;
          refreshFinancesInBackground();
          refreshStorePreview(true);
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Eliminar";
          errorEl.textContent = "Error: " + err.message;
        }
      });
    });
    document.querySelectorAll(".edit-link").forEach((btn) => {
      btn.addEventListener("click", () => {
        const link = lastPaymentLinks.find((l) => l.id === btn.dataset.id);
        beginPaymentLinkEdit(link);
      });
    });
  }

  function normalizeProductSearch(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .trim();
  }

  function resetPaymentLinkBrowseState() {
    paymentLinkPageByStatus.set("ACTIVE", 1);
    paymentLinkPageByStatus.set("ARCHIVED", 1);
    if (paymentLinkSearchEl) paymentLinkSearchEl.value = "";
  }

  paymentLinkSearchEl.addEventListener("input", () => {
    paymentLinkPageByStatus.set("ACTIVE", 1);
    paymentLinkPageByStatus.set("ARCHIVED", 1);
    renderPaymentLinkRows(lastPaymentLinks);
  });
  paymentLinkSearchClearEl.addEventListener("click", () => {
    resetPaymentLinkBrowseState();
    renderPaymentLinkRows(lastPaymentLinks);
    paymentLinkSearchEl.focus();
  });

  async function api(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    let res;
    try {
      res = await fetch(apiBaseEl.value.replace(/\/$/, "") + path, {
        ...options,
        headers: {
          // The browser supplies the multipart boundary for uploaded files.
          ...(isFormData ? {} : { "content-type": "application/json" }),
          authorization: "Bearer " + sessionToken,
          ...(options.headers || {}),
        },
      });
    } catch (cause) {
      if (cause?.name === "AbortError") throw cause;
      const error = new Error("No se pudo conectar con el servidor de pagosYa. Comprueba tu conexión y vuelve a intentarlo.");
      error.networkFailure = true;
      error.retryable = true;
      throw error;
    }
    const body = await res.json().catch(() => null);
    if (res.status === 429) {
      throw new Error("El panel recibió demasiadas solicitudes seguidas. Espera unos segundos y vuelve a intentarlo.");
    }
    if (!res.ok) {
      const responseMessage = Array.isArray(body?.message)
        ? body.message.filter((entry) => typeof entry === "string").join(". ")
        : typeof body?.message === "string" ? body.message : "";
      const genericServerFailure = res.status >= 500 && (!responseMessage || /^internal server error$/i.test(responseMessage));
      const error = new Error(genericServerFailure
        ? "El servidor no pudo completar esta operación. Tus cambios siguen aquí; vuelve a intentarlo en unos segundos."
        : responseMessage || res.statusText || "No pudimos completar la solicitud.");
      error.status = res.status;
      error.retryable = res.status === 408 || res.status === 425 || res.status === 429 || res.status >= 500;
      throw error;
    }
    return body;
  }

  // apiBase is ".../v1" — strip that to resolve uploaded-image paths.
  function apiRoot() {
    return apiBaseEl.value.replace(/\/v1\/?$/, "");
  }

  async function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    const { url } = await api("/uploads", { method: "POST", body: form });
    if (typeof url !== "string" || !/^\/v1\/uploads\/[A-Za-z0-9._-]+$/i.test(url)) {
      throw new Error("El servidor no devolvió una ruta válida para la foto.");
    }
    return url;
  }

  function inventoryFilenameKey(value) {
    let filename = String(value || "").trim();
    try { filename = decodeURIComponent(filename); } catch {}
    filename = filename.split(/[?#]/, 1)[0].replace(/\\/g, "/").split("/").pop() || filename;
    return filename.normalize("NFC").toLocaleLowerCase("es");
  }

  function inventoryStemKey(value) {
    return inventoryFilenameKey(value)
      .replace(/\.[^.]+$/, "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles) {
    const nameKey = inventoryStemKey(name);
    const skuKey = inventoryStemKey(codigoProducto);
    const nameTokens = nameKey.split(" ").filter((token) => token.length >= 3);
    const candidates = imageFiles
      .filter((file) => !matchedImageFiles.has(file))
      .map((file) => {
        const stem = inventoryStemKey(file.name);
        let score = 0;
        if (skuKey && stem === skuKey) score = 100;
        else if (nameKey && stem === nameKey) score = 100;
        else if (skuKey && (stem.startsWith(`${skuKey} `) || stem.endsWith(` ${skuKey}`))) score = 92;
        else if (nameKey && (stem.startsWith(`${nameKey} `) || stem.endsWith(` ${nameKey}`))) score = 88;
        else if (nameTokens.length && nameTokens.every((token) => stem.includes(token))) score = 72;
        return { file, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.file.name.localeCompare(right.file.name, "es"));
    const strongMatches = candidates.filter((candidate) => candidate.score >= 88).slice(0, MAX_GALLERY_IMAGES);
    if (strongMatches.length) return strongMatches.map((candidate) => candidate.file);
    return candidates.length === 1 ? [candidates[0].file] : [];
  }

  function markDuplicateInventorySkus(rows) {
    const firstRowBySku = new Map();
    rows.forEach((row) => {
      const sku = row.product.codigoProducto;
      if (!sku) return;
      if (firstRowBySku.has(sku)) {
        row.errors.push(`El SKU ${sku} ya aparece en la fila ${firstRowBySku.get(sku)}`);
      } else {
        firstRowBySku.set(sku, row.rowNumber);
      }
    });
  }

  function prepareAiInventoryRows(products, imageFiles) {
    if (!Array.isArray(products) || products.length === 0) throw new Error("La IA no encontró productos en el archivo.");
    if (products.length > 100) throw new Error("La IA encontró más de 100 productos. Divide el archivo e intenta nuevamente.");
    const imagesByName = new Map();
    const imagesByStem = new Map();
    const matchedImageFiles = new Set();
    imageFiles.forEach((file) => {
      imagesByName.set(inventoryFilenameKey(file.name), file);
      const stem = inventoryStemKey(file.name);
      imagesByStem.set(stem, [...(imagesByStem.get(stem) || []), file]);
    });

    const rows = products.map((source, index) => {
      const errors = Array.isArray(source.errors) ? source.errors.map((value) => String(value)).filter(Boolean) : [];
      const name = String(source.name || "").trim();
      const codigoProducto = String(source.codigoProducto || "").trim();
      if (codigoProducto.length > 64) errors.push("El SKU supera 64 caracteres");
      if (codigoProducto && !/^[A-Za-z0-9._-]+$/.test(codigoProducto)) errors.push("El SKU solo admite letras, números, punto, guion y guion bajo");
      const requestedImages = Array.isArray(source.imageNames) ? source.imageNames.map((value) => String(value).trim()).filter(Boolean) : [];
      const matchedImages = requestedImages.map((filename) => {
        const exact = imagesByName.get(inventoryFilenameKey(filename));
        const stemMatches = imagesByStem.get(inventoryStemKey(filename)) || [];
        const file = exact || (stemMatches.length === 1 ? stemMatches[0] : undefined);
        if (!file) errors.push(`No se seleccionó la foto "${filename}"`);
        else matchedImageFiles.add(file);
        return file;
      }).filter(Boolean);
      if (requestedImages.length === 0 && name) {
        const automaticMatches = inventoryAutomaticImageMatches(name, codigoProducto, imageFiles, matchedImageFiles);
        automaticMatches.forEach((file) => matchedImageFiles.add(file));
        matchedImages.push(...automaticMatches);
      }
      matchedImages.forEach((file) => {
        if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) errors.push(`Formato no admitido para "${file.name}"`);
        else if (file.size > MAX_IMAGE_BYTES) errors.push(`"${file.name}" supera 8 MB`);
      });
      const variants = Array.isArray(source.variants) ? source.variants : [];
      if (variants.length === 1) errors.push("Un producto con tamaños necesita por lo menos 2 opciones");
      return {
        rowNumber: Number.isInteger(source.sourceRow) ? source.sourceRow : index + 2,
        errors,
        imageFiles: matchedImages,
        product: {
          name,
          codigoProducto: codigoProducto || null,
          description: source.description || null,
          tags: Array.isArray(source.tags) ? source.tags : [],
          stock: variants.length ? null : source.stock ?? null,
          variants,
          categoryName: source.categoryName || undefined,
          color: source.color || null,
          amount: source.amount,
          currency: "BOB",
        },
      };
    });
    const unmatchedImageCount = imageFiles.filter((file) => !matchedImageFiles.has(file)).length;
    markDuplicateInventorySkus(rows);
    return {
      rows,
      warnings: unmatchedImageCount
        ? [`${unmatchedImageCount} ${unmatchedImageCount === 1 ? "foto no pudo relacionarse" : "fotos no pudieron relacionarse"} con un producto. Puedes renombrarlas con el nombre o SKU del producto y volver a adaptar el archivo.`]
        : [],
    };
  }

  function renderInventoryAiWarnings(warnings = []) {
    const visibleWarnings = Array.isArray(warnings) ? warnings.filter(Boolean).slice(0, 30) : [];
    inventoryAiWarningsEl.replaceChildren(...visibleWarnings.map((warning) => {
      const item = document.createElement("li");
      item.textContent = warning;
      return item;
    }));
    inventoryAiWarningsEl.hidden = visibleWarnings.length === 0;
  }

  function renderInventoryReview() {
    const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
    const categoryCount = new Set(preparedInventoryRows.map((row) => row.product.categoryName).filter(Boolean).map((name) => name.toLocaleLowerCase("es"))).size;
    const preparedStore = lastStores.find((store) => store.id === preparedInventoryStoreId);
    const belongsToCurrentStore = !!preparedInventoryStoreId && preparedInventoryStoreId === currentStoreId;
    inventoryReviewEl.hidden = preparedInventoryRows.length === 0;
    const skuCount = preparedInventoryRows.filter((row) => row.product.codigoProducto).length;
    const connectionLabel = inventoryConnectionEl.selectedOptions[0]?.textContent || "sin conexión";
    inventoryReviewSummaryEl.innerHTML = `<strong>${preparedInventoryRows.length} productos</strong> · destino: <strong>${esc(preparedStore?.name || "tienda seleccionada")}</strong> · ${skuCount} con SKU · ${inventoryConnectionEl.value ? `conectar a <strong>${esc(connectionLabel)}</strong>` : "guardar sin conexión"} · ${categoryCount} categorías · ${invalidCount ? `${invalidCount} filas por corregir` : "listos para importar"}`;
    inventoryCommitEl.disabled = preparedInventoryRows.length === 0 || invalidCount > 0 || !belongsToCurrentStore || inventoryImportInProgress;
    inventoryReviewRowsEl.innerHTML = preparedInventoryRows.map((row) => {
      const amounts = row.product.variants.length ? row.product.variants.map((variant) => variant.amount) : [row.product.amount];
      const price = Math.min(...amounts) === Math.max(...amounts)
        ? money(amounts[0])
        : `${money(Math.min(...amounts))} – ${money(Math.max(...amounts))}`;
      return `<tr>
        <td>${row.rowNumber}</td>
        <td><strong>${esc(row.product.name || "Sin nombre")}</strong></td>
        <td><code>${esc(row.product.codigoProducto || "—")}</code></td>
        <td>${esc(row.product.categoryName || "Sin categoría")}</td>
        <td>${price}</td>
        <td>${row.product.variants.length ? row.product.variants.map((variant) => esc(variant.name)).join(", ") : "—"}</td>
        <td class="inventory-photo-count">${row.imageFiles.length}</td>
        <td>${row.errors.length ? `<span class="inventory-row-error">${row.errors.map(esc).join("<br>")}</span>` : '<span class="inventory-row-ready">Lista</span>'}</td>
      </tr>`;
    }).join("");
  }

  function resetInventoryImportState(status = "Aún no hay un archivo preparado.") {
    inventoryImportVersion++;
    preparedInventoryRows = [];
    preparedInventoryStoreId = null;
    inventoryCsvInputEl.value = "";
    inventoryImagesInputEl.value = "";
    updateInventoryFileSummary();
    renderInventoryAiWarnings();
    inventoryImportStatusEl.textContent = status;
    renderInventoryReview();
  }

  async function loadInventoryConnections({ force = false } = {}) {
    if (!currentStoreId) {
      inventoryConnectionEl.innerHTML = '<option value="">Crea o selecciona una tienda primero</option>';
      inventoryConnectionEl.disabled = true;
      return [];
    }
    if (!force && inventoryConnectionEl.dataset.storeId === currentStoreId) return [];
    const selected = inventoryConnectionEl.value;
    inventoryConnectionEl.disabled = true;
    inventoryConnectionEl.innerHTML = '<option value="">Cargando conexiones…</option>';
    try {
      const connections = await api(`/stores/${currentStoreId}/operations/integrations`);
      inventoryConnectionEl.innerHTML = '<option value="">Guardar SKU sin conectar todavía</option>' +
        connections.map((connection) => `<option value="${esc(connection.id)}">${esc(connection.name)} · ${esc(inventoryConnectionKindLabel(connection.kind))}</option>`).join("");
      inventoryConnectionEl.dataset.storeId = currentStoreId;
      inventoryConnectionEl.disabled = false;
      if (connections.some((connection) => connection.id === selected)) inventoryConnectionEl.value = selected;
      renderInventoryReview();
      return connections;
    } catch (error) {
      inventoryConnectionEl.innerHTML = '<option value="">No se pudieron cargar las conexiones</option>';
      inventoryConnectionEl.disabled = false;
      inventoryImportStatusEl.textContent = `Puedes importar sin conexión. ${error.message}`;
      return [];
    }
  }

  inventoryConnectionEl.addEventListener("focus", () => loadInventoryConnections().catch(() => undefined));
  inventoryConnectionEl.addEventListener("change", renderInventoryReview);

  function inventoryConnectionKindLabel(kind) {
    return ({
      CUSTOM_DATABASE: "base propia",
      SHOPIFY: "Shopify",
      WOOCOMMERCE: "WooCommerce",
      POS: "otro POS",
      ACCOUNTING: "contabilidad",
      OTHER: "otro sistema",
    })[kind] || String(kind || "conexión").replaceAll("_", " ").toLowerCase();
  }

  async function runWithConcurrency(items, limit, worker) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function takeNext() {
      while (nextIndex < items.length) {
        const index = nextIndex++;
        results[index] = await worker(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, takeNext));
    return results;
  }

  function updateInventoryFileSummary() {
    const csv = inventoryCsvInputEl.files[0];
    const imageCount = inventoryImagesInputEl.files.length;
    if (!csv && imageCount === 0) {
      inventoryFileSummaryEl.textContent = "Ningún archivo seleccionado.";
      return;
    }
    inventoryFileSummaryEl.innerHTML = [
      csv ? `<strong>${esc(csv.name)}</strong>` : "Falta el CSV",
      imageCount ? `${imageCount} ${imageCount === 1 ? "foto seleccionada" : "fotos seleccionadas"}` : "sin fotos",
    ].join(" · ");
  }

  function replaceInventoryInputFiles(input, files) {
    const transfer = new DataTransfer();
    files.forEach((file) => transfer.items.add(file));
    input.files = transfer.files;
  }

  function acceptDroppedInventoryFiles(files) {
    const dropped = [...files];
    const csvFiles = dropped.filter((file) => /\.(csv|tsv)$/i.test(file.name) || ["text/csv", "text/tab-separated-values"].includes(file.type));
    const imageFiles = dropped.filter((file) => ["image/png", "image/jpeg", "image/webp"].includes(file.type));
    if (csvFiles.length) replaceInventoryInputFiles(inventoryCsvInputEl, [csvFiles[0]]);
    if (imageFiles.length) {
      const combined = [...inventoryImagesInputEl.files, ...imageFiles];
      const unique = [...new Map(combined.map((file) => [`${file.name.toLocaleLowerCase("es")}:${file.size}:${file.lastModified}`, file])).values()];
      replaceInventoryInputFiles(inventoryImagesInputEl, unique);
    }
    const unsupported = dropped.length - csvFiles.length - imageFiles.length;
    inventoryImportStatusEl.textContent = unsupported
      ? `${unsupported} ${unsupported === 1 ? "archivo no compatible fue ignorado" : "archivos no compatibles fueron ignorados"}. Usa CSV, TSV, PNG, JPG o WebP.`
      : csvFiles.length || imageFiles.length
        ? "Archivos listos. Presiona “Adaptar y revisar con IA”."
        : "No encontramos un CSV ni fotos compatibles en lo que soltaste.";
    updateInventoryFileSummary();
  }

  ["dragenter", "dragover"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    inventoryDropzoneEl.classList.add("is-dragging");
  }));
  ["dragleave", "dragend"].forEach((eventName) => inventoryDropzoneEl.addEventListener(eventName, () => {
    inventoryDropzoneEl.classList.remove("is-dragging");
  }));
  inventoryDropzoneEl.addEventListener("drop", (event) => {
    event.preventDefault();
    inventoryDropzoneEl.classList.remove("is-dragging");
    acceptDroppedInventoryFiles(event.dataTransfer?.files || []);
  });
  inventoryDropzoneEl.addEventListener("keydown", (event) => {
    if (event.target !== inventoryDropzoneEl || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    inventoryCsvInputEl.click();
  });
  inventoryCsvInputEl.addEventListener("change", updateInventoryFileSummary);
  inventoryImagesInputEl.addEventListener("change", updateInventoryFileSummary);

  async function readInventoryCsvFile(file) {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      return new TextDecoder("windows-1252").decode(buffer);
    }
  }

  function downloadInventoryTemplate(advanced = false) {
    const template = advanced
      ? [
          "sku;nombre;precio;categoria;stock;descripcion;etiquetas;imagenes;opciones;color",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;Popular|Almuerzo;silpancho.webp;;#c2410c",
          "BEB-001;Limonada;;Bebidas;;Preparada al momento;Fría;limonada.jpg;Vaso:12:20|Jarra:30:8;#15803d",
        ].join("\r\n")
      : [
          "sku;nombre;precio;categoria;stock;descripcion;imagenes",
          "COM-001;Silpancho;45,50;Comida;12;Plato completo;silpancho.webp",
          "BEB-001;Limonada;12,50;Bebidas;;Preparada al momento;limonada.jpg",
        ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = advanced ? "plantilla-productos-pagosya-completa.csv" : "plantilla-productos-pagosya.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  document.getElementById("inventoryTemplateDownload").addEventListener("click", () => downloadInventoryTemplate());
  document.getElementById("inventoryTemplateAdvancedDownload").addEventListener("click", () => downloadInventoryTemplate(true));

  document.getElementById("inventoryPrepare").addEventListener("click", async () => {
    const prepareButton = document.getElementById("inventoryPrepare");
    const csvFile = inventoryCsvInputEl.files[0];
    if (!csvFile) {
      inventoryImportStatusEl.textContent = "Selecciona primero un archivo CSV.";
      inventoryCsvInputEl.focus();
      return;
    }
    if (!currentStoreId) {
      inventoryImportStatusEl.textContent = "Selecciona una tienda antes de revisar el CSV.";
      return;
    }
    const targetStoreId = currentStoreId;
    const prepareVersion = ++inventoryImportVersion;
    if (inventoryConnectionEl.dataset.storeId !== targetStoreId) await loadInventoryConnections();
    prepareButton.disabled = true;
    prepareButton.textContent = "Adaptando inventario…";
    inventoryImportStatusEl.textContent = "La IA está interpretando columnas, precios y stock…";
    renderInventoryAiWarnings();
    try {
      const normalized = await api(`/stores/${targetStoreId}/payment_links/import/normalize`, {
        method: "POST",
        body: JSON.stringify({
          csv: await readInventoryCsvFile(csvFile),
          imageFileNames: [...inventoryImagesInputEl.files].map((file) => file.name),
        }),
      });
      const prepared = prepareAiInventoryRows(normalized?.products, [...inventoryImagesInputEl.files]);
      if (prepareVersion !== inventoryImportVersion || targetStoreId !== currentStoreId) return;
      preparedInventoryRows = prepared.rows;
      preparedInventoryStoreId = targetStoreId;
      renderInventoryAiWarnings([...(normalized?.warnings || []), ...prepared.warnings]);
      renderInventoryReview();
      const invalidCount = preparedInventoryRows.filter((row) => row.errors.length).length;
      inventoryImportStatusEl.textContent = invalidCount
        ? `Revisa ${invalidCount} ${invalidCount === 1 ? "fila marcada" : "filas marcadas"}.`
        : "Archivo adaptado por IA y listo para revisar.";
    } catch (err) {
      if (prepareVersion !== inventoryImportVersion || targetStoreId !== currentStoreId) return;
      preparedInventoryRows = [];
      preparedInventoryStoreId = null;
      renderInventoryReview();
      inventoryImportStatusEl.textContent = err.networkFailure
        ? `${err.message} El CSV y las fotos siguen seleccionados.`
        : err.message;
    } finally {
      if (prepareVersion === inventoryImportVersion) {
        prepareButton.disabled = false;
        prepareButton.textContent = "Adaptar y revisar con IA";
      }
    }
  });

  inventoryCommitEl.addEventListener("click", async () => {
    if (
      inventoryImportInProgress ||
      !currentStoreId ||
      preparedInventoryStoreId !== currentStoreId ||
      preparedInventoryRows.length === 0 ||
      preparedInventoryRows.some((row) => row.errors.length)
    ) return;
    errorEl.textContent = "";
    infoEl.textContent = "";
    const importStoreId = currentStoreId;
    const importVersion = inventoryImportVersion;
    const rowsToImport = preparedInventoryRows;
    inventoryImportInProgress = true;
    inventoryCommitEl.disabled = true;
    let importCommitted = false;
    const uniqueFiles = [...new Map(rowsToImport.flatMap((row) => row.imageFiles).map((file) => [file.name.toLocaleLowerCase("es"), file])).values()];
    const importStillVisible = () => importVersion === inventoryImportVersion && importStoreId === currentStoreId;
    try {
      let uploadedCount = 0;
      const uploadedUrls = await runWithConcurrency(uniqueFiles, 3, async (file) => {
        const url = await uploadFile(file);
        uploadedCount++;
        if (importStillVisible()) inventoryImportStatusEl.textContent = `Subiendo fotos ${uploadedCount} de ${uniqueFiles.length}…`;
        return [file.name.toLocaleLowerCase("es"), url];
      });
      const urlByFilename = new Map(uploadedUrls);
      if (importStillVisible()) inventoryImportStatusEl.textContent = "Creando productos y categorías…";
      const products = rowsToImport.map((row) => ({
        ...row.product,
        imageUrls: row.imageFiles.map((file) => urlByFilename.get(file.name.toLocaleLowerCase("es"))).filter(Boolean),
      }));
      const result = await api(`/stores/${importStoreId}/payment_links/import`, {
        method: "POST",
        body: JSON.stringify({
          products,
          ...(inventoryConnectionEl.value && { integrationConnectionId: inventoryConnectionEl.value }),
        }),
      });
      importCommitted = true;
      if (importStillVisible()) {
        const importedProducts = Array.isArray(result?.products) ? result.products : [];
        const categoriesCreated = Array.isArray(result?.categoriesCreated) ? result.categoriesCreated : [];
        // Once the API confirms the transaction, the import succeeded. Mark it
        // complete before refreshing local views so a rendering problem cannot
        // be reported as a failed import (and tempt the merchant to retry it).
        resetInventoryImportState("Importación completada.");
        const mappingsCreated = Number(result?.mappingsCreated || 0);
        infoEl.textContent = `${importedProducts.length} ${importedProducts.length === 1 ? "producto importado" : "productos importados"}${categoriesCreated.length ? ` y ${categoriesCreated.length} categorías nuevas` : ""}${mappingsCreated ? `; ${mappingsCreated} SKU ${mappingsCreated === 1 ? "conectado" : "conectados"}` : ""}.`;
        try {
          resetPaymentLinkBrowseState();
          renderCategoryRows([...lastCategories, ...categoriesCreated]);
          renderPaymentLinkRows([...importedProducts, ...lastPaymentLinks]);
        } catch (renderError) {
          console.error("La importación terminó, pero el catálogo no se pudo actualizar en pantalla.", renderError);
          infoEl.textContent += " Actualiza la página para ver el catálogo completo.";
        }
        refreshStorePreview(true);
      }
      refreshFinancesInBackground();
    } catch (err) {
      if (importStillVisible()) {
        if (importCommitted) {
          inventoryImportStatusEl.textContent = "Importación completada.";
          infoEl.textContent = "Los productos se importaron. Actualiza la página para ver el catálogo completo.";
        } else {
          errorEl.textContent = "Error importando el inventario: " + err.message;
          inventoryImportStatusEl.textContent = "La importación no se completó. Corrige el problema e intenta otra vez.";
        }
      }
    } finally {
      inventoryImportInProgress = false;
      renderInventoryReview();
    }
  });

  function showLoggedOut() {
    const studioFrame = document.getElementById("merchantStudioFrame");
    studioFrame.removeAttribute("src"); delete studioFrame.dataset.storeId;
    dashboardRefreshVersion += 1;
    document.body.classList.add("is-logged-out");
    document.body.classList.remove("is-logged-in");
    setStorePreviewFullscreen(false);
    storePreviewInitialOpenPending = true;
    document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    currentProfileName = "";
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    loginFormEl.style.display = "grid";
    loggedInBarEl.style.display = "none";
    appEl.style.display = "none";
  }

  function showLoggedIn() {
    document.body.classList.remove("is-logged-out");
    document.body.classList.add("is-logged-in");
    loginFormEl.style.display = "none";
    loggedInBarEl.style.display = "flex";
    applyProfileIdentity();
  }

  function loadGoogleIdentity() {
    if (window.google?.accounts?.id) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-google-identity]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.dataset.googleIdentity = "true";
      script.onload = resolve;
      script.onerror = () => reject(new Error("No se pudo cargar Google"));
      document.head.appendChild(script);
    });
  }

  async function completeMerchantLogin(result) {
    sessionToken = result.token;
    const sessionEmail = result.user?.email || emailEl.value.trim();
    if (sessionEmail) emailEl.value = sessionEmail;
    sessionStorage.setItem("pagosya_merchant_session", sessionToken);
    if (sessionEmail) sessionStorage.setItem("pagosya_merchant_email", sessionEmail);
    await chooseProfileForNewLogin(result);
    showLoggedIn();
    appEl.style.display = "block";
    infoEl.textContent = "Sesión iniciada. Cargando tu panel…";
    await refresh();
    if (sessionToken) await claimDailyLoginReward();
    if (sessionToken) infoEl.textContent = "";
  }

  async function setupMerchantGoogleSignIn() {
    try {
      const googleConfig = await api("/auth/google");
      if (!googleConfig?.enabled || !googleConfig.clientId) return;
      await loadGoogleIdentity();
      window.google.accounts.id.initialize({
        client_id: googleConfig.clientId,
        callback: async ({ credential }) => {
          if (!credential) return;
          errorEl.textContent = "";
          infoEl.textContent = "Validando tu cuenta Google…";
          try {
            const result = await api("/dashboard/google", { method: "POST", body: JSON.stringify({ credential }) });
            await completeMerchantLogin(result);
          } catch (err) {
            errorEl.textContent = "Error: " + err.message;
            infoEl.textContent = "";
          }
        },
      });
      window.google.accounts.id.renderButton(document.getElementById("merchantGoogleButton"), {
        theme: document.documentElement.dataset.dashboardTheme === "light" ? "outline" : "filled_black",
        size: "large",
        shape: "rectangular",
        text: "continue_with",
        logo_alignment: "left",
        width: 320,
      });
      document.getElementById("merchantGoogleAuth").hidden = false;
    } catch {
      // El acceso por contraseña sigue disponible si Google está sin configurar o bloqueado.
    }
  }

  async function refresh() {
    const refreshVersion = ++dashboardRefreshVersion;
    errorEl.textContent = "";
    sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
    appEl.setAttribute("aria-busy", "true");

    try {
      // Start secondary dashboard data immediately, but let the store list
      // resolve independently so its catalog requests do not wait behind it.
      const overviewPromise = Promise.all([
        api("/merchants/balance"),
        api("/merchants/kyc"),
        api("/merchants/invoicing_profile"),
        api("/merchants/payouts"),
        api("/merchants/finances"),
        api("/merchants/international_payments").catch(() => null),
      ]);
      const stores = await api("/stores");
      if (refreshVersion !== dashboardRefreshVersion) {
        await overviewPromise.catch(() => undefined);
        return;
      }

      showLoggedIn();
      appEl.style.display = "block";
      renderStoreRows(stores);

      const selectedStoreId = currentStoreId;
      const storeQuery = selectedStoreId ? `?storeId=${encodeURIComponent(selectedStoreId)}` : "";
      const [[balance, kyc, invoicing, payouts, totalFinances, international], payments, finances, categories, paymentLinks, promoCodes, debtCollectionLinks, customDomains] = await Promise.all([
        overviewPromise,
        api(`/merchants/orders${storeQuery}`),
        selectedStoreId ? api(`/merchants/finances${storeQuery}`) : api("/merchants/finances"),
        selectedStoreId ? api(`/stores/${selectedStoreId}/categories`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/payment_links`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/promo-codes`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/debt-collection-links`) : Promise.resolve([]),
        selectedStoreId ? api(`/stores/${selectedStoreId}/domains`) : Promise.resolve([]),
      ]);
      if (refreshVersion !== dashboardRefreshVersion || selectedStoreId !== currentStoreId) return;

      lastPayableBalance = balance.payableBalance;
      lastBalances = balance.balances?.length
        ? balance.balances
        : [{ currency: balance.currency || "BOB", payableBalance: balance.payableBalance || 0 }];
      renderBalanceCards(lastBalances);
      document.getElementById("internationalPaymentsCard").innerHTML = renderInternationalCard(international);
      const selectedStore = lastStores.find((store) => store.id === currentStoreId) || null;
      const paymentStore = (selectedStore?.checkoutMode || "payment") === "payment";

      const kycBadge = document.getElementById("kycBadge");
      const dashboardStatusLabels = { NOT_SUBMITTED: "Pendiente de envío", NOT_CONFIGURED: "Sin configurar" };
      kycBadge.textContent = paymentStore ? dashboardStatusLabels[kyc.status] || kyc.status : "No requerido para esta tienda";
      kycBadge.className = "badge " + (paymentStore ? kyc.status : "");
      document.getElementById("kycSection").style.display = !paymentStore || kyc.status !== "APPROVED" ? "block" : "none";
      document.getElementById("kycModeNotice").hidden = paymentStore;
      document.getElementById("kycForm").hidden = !paymentStore;
      document.getElementById("liveKeysSection").style.display = paymentStore ? "block" : "none";
      currentKyc = kyc;

      const invBadge = document.getElementById("invoicingBadge");
      const invStatus = invoicing.status || (invoicing.cuis ? "CONFIGURED" : "NOT_CONFIGURED");
      invBadge.textContent = paymentStore ? dashboardStatusLabels[invStatus] || invStatus : "No requerido para esta tienda";
      invBadge.className = "badge " + (paymentStore ? invoicing.cuis ? "APPROVED" : "NOT_CONFIGURED" : "");
      document.getElementById("invoicingSection").style.display = !paymentStore || !invoicing.cuis ? "block" : "none";
      document.getElementById("invoicingModeNotice").hidden = paymentStore;
      document.getElementById("invoicingForm").hidden = !paymentStore;
      currentInvoicingProfile = invoicing;

      renderTotalFinances(totalFinances);
      renderFinances(finances);

      renderCategoryRows(categories);
      renderPaymentLinkRows(paymentLinks);
      renderPromoCodes(promoCodes);
      renderDebtCollectionLinks(debtCollectionLinks);
      updateSelectedStoreDomains(customDomains);
      window.updateYapiContext?.({
        store: lastStores.find((store) => store.id === currentStoreId) || null,
        products: paymentLinks,
        kyc: currentKyc,
        invoicing: currentInvoicingProfile,
        finances,
        complianceReady: true,
      });
      refreshAssistantSupport().catch(() => undefined);

      lastPayments = payments;
      paymentPage = 1;
      renderPaymentRows();

      renderPayoutRows(payouts);
    } catch (err) {
      if (refreshVersion !== dashboardRefreshVersion) return;
      errorEl.textContent = "Error: " + err.message;
      // Una sesión vencida o inválida debe volver al formulario de acceso, no
      // solo mostrar un error sobre un panel vacío.
      if (err.status === 401 || err.message.match(/session|credentials/i)) {
        sessionToken = "";
        sessionStorage.removeItem("pagosya_merchant_session");
        showLoggedOut();
      } else {
        // Preserve any sections that already loaded; one secondary endpoint
        // should not blank the entire dashboard.
        appEl.style.display = "block";
      }
    } finally {
      if (refreshVersion === dashboardRefreshVersion) appEl.removeAttribute("aria-busy");
    }
  }

  loginFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const loginButton = document.getElementById("login");
    if (loginButton.disabled) return;
    errorEl.textContent = "";
    infoEl.textContent = "";
    sessionStorage.setItem("pagosya_merchant_api_base", apiBaseEl.value);
    setButtonBusy(loginButton, true, "Ingresando…");
    try {
      const result = await api("/dashboard/login", {
        method: "POST",
        body: JSON.stringify({ email: emailEl.value, password: passwordEl.value }),
      });
      await completeMerchantLogin(result);
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    } finally {
      setButtonBusy(loginButton, false, "Iniciar sesión");
    }
  });

  document.getElementById("showForgot").addEventListener("click", () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    forgotFormEl.style.display = forgotFormEl.style.display === "none" ? "block" : "none";
  });

  document.getElementById("requestReset").addEventListener("click", async () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    try {
      const result = await api("/dashboard/forgot_password", {
        method: "POST",
        body: JSON.stringify({ email: document.getElementById("forgotEmail").value }),
      });
      infoEl.textContent = result.message;
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("submitReset").addEventListener("click", async () => {
    errorEl.textContent = "";
    infoEl.textContent = "";
    try {
      await api("/dashboard/reset_password", {
        method: "POST",
        body: JSON.stringify({
          token: document.getElementById("resetToken").value,
          newPassword: document.getElementById("newPassword").value,
        }),
      });
      infoEl.textContent = "Contraseña actualizada — inicia sesión con tu nueva contraseña.";
      forgotFormEl.style.display = "none";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("logout").addEventListener("click", async () => {
    if (!canLeaveMerchantStudio()) return;
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    try {
      await api("/dashboard/logout", { method: "POST" });
    } catch {
      // mejor esfuerzo — igual limpiamos el estado local
    }
    sessionToken = "";
    sessionStorage.removeItem("pagosya_merchant_session");
    showLoggedOut();
  });

  const merchantDeleteDialogEl = document.getElementById("merchantDeleteDialog");
  const merchantDeleteFormEl = document.getElementById("merchantDeleteForm");
  const merchantDeleteConfirmationEl = document.getElementById("merchantDeleteConfirmation");
  const merchantDeleteConfirmEl = document.getElementById("merchantDeleteConfirm");
  const merchantDeleteErrorEl = document.getElementById("merchantDeleteError");
  function closeMerchantDeleteDialog() {
    if (merchantDeleteDialogEl.open) merchantDeleteDialogEl.close();
    merchantDeleteFormEl.reset();
    merchantDeleteConfirmEl.disabled = true;
    merchantDeleteErrorEl.hidden = true;
    merchantDeleteErrorEl.textContent = "";
  }
  document.getElementById("deleteMerchantAccount").addEventListener("click", () => {
    if (profileMenuEl.matches(":popover-open")) profileMenuEl.hidePopover();
    closeMerchantDeleteDialog();
    merchantDeleteDialogEl.showModal();
    merchantDeleteConfirmationEl.focus();
  });
  document.getElementById("merchantDeleteClose").addEventListener("click", closeMerchantDeleteDialog);
  document.getElementById("merchantDeleteCancel").addEventListener("click", closeMerchantDeleteDialog);
  merchantDeleteConfirmationEl.addEventListener("input", () => {
    merchantDeleteConfirmEl.disabled = merchantDeleteConfirmationEl.value !== "ELIMINAR";
  });
  merchantDeleteFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (merchantDeleteConfirmationEl.value !== "ELIMINAR") return;
    setButtonBusy(merchantDeleteConfirmEl, true, "Eliminando acceso…");
    merchantDeleteErrorEl.hidden = true;
    try {
      const result = await api("/dashboard/account", { method: "DELETE", body: JSON.stringify({ confirmation: "ELIMINAR" }) });
      sessionToken = "";
      sessionStorage.removeItem("pagosya_merchant_session");
      sessionStorage.removeItem("pagosya_current_store_id");
      closeMerchantDeleteDialog();
      showLoggedOut();
      infoEl.textContent = result.merchantSuspended
        ? "Acceso eliminado. Tus tiendas fueron archivadas y las credenciales quedaron revocadas."
        : "Tu acceso fue eliminado y todas tus sesiones quedaron cerradas.";
    } catch (err) {
      merchantDeleteErrorEl.textContent = err.message;
      merchantDeleteErrorEl.hidden = false;
    } finally {
      setButtonBusy(merchantDeleteConfirmEl, false, "Eliminar definitivamente mi acceso");
      merchantDeleteConfirmEl.disabled = merchantDeleteConfirmationEl.value !== "ELIMINAR";
    }
  });

  document.getElementById("internationalPaymentsCard").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-intl-request]");
    if (!button) return;
    errorEl.textContent = "";
    setButtonBusy(button, true, button.textContent);
    try {
      await api("/merchants/international_payments/request", { method: "POST" });
      await refresh();
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
      setButtonBusy(button, false, button.textContent);
    }
  });

  document.getElementById("kycForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    infoEl.textContent = "";
    const data = Object.fromEntries(new FormData(e.target));
    try {
      await api("/merchants/kyc", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      infoEl.textContent = "Verificación enviada — te avisaremos cuando sea revisada.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  document.getElementById("invoicingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.textContent = "";
    infoEl.textContent = "";
    const data = Object.fromEntries(new FormData(e.target));
    data.sucursal = Number(data.sucursal) || 0;
    data.puntoVenta = Number(data.puntoVenta) || 0;
    try {
      await api("/merchants/invoicing_profile", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      infoEl.textContent = "Perfil de facturación guardado.";
    } catch (err) {
      errorEl.textContent = "Error: " + err.message;
    }
  });

  if (sessionToken) {
    showLoggedIn();
    appEl.style.display = "block";
    infoEl.textContent = "Actualizando tu panel…";
    refresh().then(() => sessionToken ? claimDailyLoginReward() : undefined).finally(() => {
      if (sessionToken) infoEl.textContent = "";
    });
  } else {
    showLoggedOut();
  }
  setupMerchantGoogleSignIn();
  window.refresh = refresh;
  window.setDashboardView = setDashboardView;
  }).catch((error) => {
    console.error("No se pudo iniciar el estado del editor de tienda", error);
    const message = document.getElementById("error");
    if (message) message.textContent = "No se pudo iniciar el editor de tienda. Recarga la página.";
  });
