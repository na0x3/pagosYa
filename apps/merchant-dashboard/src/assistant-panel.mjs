import { escapeHtml as esc } from "./html.mjs";
import { conversationTags, NOTES_MAX, notesLeft, shortDate, usageLabel } from "./assistant.mjs";

// Crecer › Asistente: settings, test chat, conversations and questions the assistant could not answer.
export function mountAssistantPanel(deps) {
  const root = document.getElementById("assistantRoot");
  let data = null, list = [], questions = [], open = null, failure = null, loading = false, loadedFor = null, request = 0, testId = null, status = "", epoch = 0, testing = false;
  let drafts = {}, testLog = [];
  const base = () => `/stores/${encodeURIComponent(deps.storeId())}/assistant`;

  async function load() {
    if (!deps.storeId() || !deps.signedIn()) { data = null; render(); return; }
    const mine = ++request, store = deps.storeId();
    loading = true; failure = null; render();
    try {
      const [view, conv, unanswered] = await Promise.all([deps.api(base()), deps.api(`${base()}/conversations`), deps.api(`${base()}/unanswered`)]);
      if (mine !== request) return;
      data = view; list = conv.conversations || []; questions = unanswered.questions || []; loadedFor = store;
    } catch (error) {
      if (mine !== request) return;
      failure = error?.message || "No pudimos cargar el asistente.";
    } finally { if (mine === request) { loading = false; render(); } }
  }

  async function save(patch, message, clear = []) {
    const e = epoch;
    let ok = false;
    try { const next = await deps.api(base(), { method: "PUT", body: JSON.stringify(patch) }); if (e !== epoch) return false; data = next; status = message; ok = true; clear.forEach((key) => delete drafts[key]); }
    catch (error) { if (e !== epoch) return false; status = error.message; }
    render();
    return ok;
  }
  async function reloadQuestions() {
    const e = epoch;
    try { const next = await deps.api(`${base()}/unanswered`); if (e === epoch) questions = next.questions || []; } catch { /* the list stays as it was */ }
  }

  function render() {
    if (!deps.storeId()) { root.innerHTML = `<section class="growth-empty"><h3>Elige una tienda</h3><p>El asistente se configura por tienda.</p></section>`; return; }
    if (loading && !data) { root.innerHTML = `<div class="growth-skeleton"><span></span><span></span><span></span></div>`; return; }
    if (failure) { root.innerHTML = `<div class="growth-error" role="alert"><p>${esc(failure)}</p><button class="primary" type="button" data-assistant-retry>Reintentar</button></div>`; return; }
    if (!data) { root.innerHTML = ""; return; }
    const s = data.settings, nameValue = drafts.name ?? s.name ?? "", greetingValue = drafts.greeting ?? s.greeting ?? "", formalityValue = drafts.formality ?? s.formality, notesValue = drafts.notes ?? s.notes, avatar = s.avatarUrl ? deps.assetUrl(s.avatarUrl) : null;
    root.innerHTML = `
      ${!data.publishedDesign ? `<p class="assistant-note">El asistente aparece en tiendas con diseño publicado. Publica tu diseño en Studio para activarlo.</p>` : ""}
      ${!data.platformEnabled ? `<p class="assistant-note">El asistente todavía no está disponible en pagosYa.</p>` : ""}
      <section class="assistant-card">
        <label class="email-list-switch"><input type="checkbox" data-assistant-enabled ${s.enabled ? "checked" : ""} ${data.publishedDesign ? "" : "disabled"} aria-label="Activar asistente"><span>${s.enabled ? "Activo" : "Desactivado"}</span></label>
        <h3>Asistente de tu tienda</h3>
        <p>${esc(usageLabel(data.usage.used, data.usage.cap))}</p>
        <p class="assistant-status" role="status">${esc(status)}</p>
      </section>
      <section class="assistant-card">
        <h3>Apariencia</h3>
        <div class="store-settings-logo"><div class="store-logo-frame">${avatar ? `<img src="${esc(avatar)}" alt="">` : "<span>Logo de la tienda</span>"}</div>
          <div class="store-logo-copy"><input id="assistantAvatarInput" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp">
          <label class="button-like ghost" for="assistantAvatarInput">${avatar ? "Cambiar foto" : "Subir foto"}</label>${avatar ? `<button class="ghost" type="button" data-assistant-avatar-remove>Quitar</button>` : ""}</div></div>
        <label>Nombre<input data-assistant-field="name" maxlength="60" value="${esc(nameValue)}" placeholder="Asistente de ${esc(deps.store()?.name ?? "tu tienda")}"></label>
        <label>Saludo<input data-assistant-field="greeting" maxlength="200" value="${esc(greetingValue)}" placeholder="¡Hola! ¿En qué te ayudo?"></label>
        <fieldset><legend>Trato</legend>
          <label><input type="radio" name="assistantFormality" value="tu" ${formalityValue === "tu" ? "checked" : ""}> Tú</label>
          <label><input type="radio" name="assistantFormality" value="usted" ${formalityValue === "usted" ? "checked" : ""}> Usted</label></fieldset>
        <button class="primary" type="button" data-assistant-save-look>Guardar apariencia</button>
      </section>
      <section class="assistant-card">
        <h3>Lo que el asistente debe saber</h3>
        <p>Lo que no está en tus productos ni en tus páginas: días de envío, feriados, tu historia.</p>
        <textarea data-assistant-notes maxlength="${NOTES_MAX}" rows="8" aria-label="Lo que el asistente debe saber">${esc(notesValue)}</textarea>
        <p class="assistant-count" data-assistant-count>${notesLeft(notesValue)} caracteres disponibles</p>
        <div class="assistant-row"><button class="ghost" type="button" data-assistant-draft>Redactar con YAPI</button><button class="primary" type="button" data-assistant-save-notes>Guardar notas</button></div>
      </section>
      <section class="assistant-card">
        <h3>Cupones que puede ofrecer</h3>
        ${data.coupons.length ? `<ul class="email-list-group">${data.coupons.map((c) => `<li class="email-list-row"><span><strong>${esc(c.code)}</strong> <small>${esc(c.label)}</small></span>
          <label class="email-list-switch"><input type="checkbox" data-assistant-coupon="${esc(c.id)}" ${c.showInAssistant ? "checked" : ""} aria-label="El asistente puede ofrecer ${esc(c.code)}"><span>${c.showInAssistant ? "Puede ofrecerlo" : "No lo ofrece"}</span></label></li>`).join("")}</ul>` : `<p class="carts-empty">No tienes cupones activos.</p>`}
      </section>
      <section class="assistant-card">
        <h3>Probar</h3><p>${esc(`${data.usage.previewUsed} de ${data.usage.previewCap} pruebas este mes`)}</p>
        <div class="assistant-test-log" data-assistant-test-log aria-live="polite">${testLog.map((m) => `<p class="assistant-msg is-${m.role}"${m.error ? ' role="alert"' : ""}>${esc(m.text)}</p>${(m.products || []).map((p) => `<p class="assistant-product">${esc(p.name)} · ${esc(p.price)}${p.inStock ? "" : " · Agotado"}</p>`).join("")}`).join("")}</div>
        <form class="assistant-row" data-assistant-test><input name="message" maxlength="500" placeholder="Pregunta como un cliente" aria-label="Pregunta de prueba" value="${esc(drafts.test ?? "")}" required><button class="primary" type="submit" ${testing ? "disabled" : ""}>Enviar</button></form>
      </section>
      <section class="assistant-card">
        <h3>Preguntas que no supo</h3>
        ${questions.length ? `<ul class="email-list-group">${questions.map((q) => `<li class="email-list-row assistant-question"><span>${esc(q.question)} <small>${q.count} ${q.count === 1 ? "vez" : "veces"}</small></span>
          <span class="assistant-row"><input data-assistant-answer="${esc(q.id)}" maxlength="500" placeholder="Respuesta" aria-label="Respuesta para ${esc(q.question)}"><button class="ghost" type="button" data-assistant-teach="${esc(q.id)}">Enseñar respuesta</button><button class="ghost" type="button" data-assistant-ignore="${esc(q.id)}">Ignorar</button></span></li>`).join("")}</ul>` : `<p class="carts-empty">Todavía no hay preguntas sin respuesta.</p>`}
      </section>
      <section class="assistant-card">
        <h3>Conversaciones</h3>
        ${list.length ? `<ul class="email-list-group">${list.map((c) => `<li class="email-list-row"><button class="email-list-open" type="button" data-assistant-open="${esc(c.id)}">${esc(c.firstQuestion || "(sin texto)")}<small>${esc(shortDate(c.startedAt))} · ${conversationTags(c).map(esc).join(" · ")}</small></button></li>
          ${open && open.id === c.id ? `<li class="assistant-thread">${open.messages.map((m) => `<p class="assistant-msg is-${m.role === "buyer" ? "buyer" : "bot"}">${esc(m.text)}</p>`).join("")}</li>` : ""}`).join("")}</ul>` : `<p class="carts-empty">Todavía no hay conversaciones.</p>`}
      </section>`;
  }

  root.addEventListener("change", async (event) => {
    const target = event.target, e = epoch;
    if (target.name === "assistantFormality") drafts.formality = target.value;
    else if (target.matches("[data-assistant-enabled]")) await save({ enabled: target.checked }, target.checked ? "Asistente activado." : "Asistente desactivado.");
    else if (target.matches("[data-assistant-coupon]")) {
      const id = target.dataset.assistantCoupon;
      try {
        await deps.api(`/stores/${encodeURIComponent(deps.storeId())}/promo-codes/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ showInAssistant: target.checked }) });
        if (e !== epoch) return;
        data.coupons = data.coupons.map((c) => c.id === id ? { ...c, showInAssistant: target.checked } : c); status = "Cupones actualizados.";
      } catch (error) { if (e !== epoch) return; status = error.message; }
      render();
    } else if (target.id === "assistantAvatarInput" && target.files?.[0]) {
      const file = target.files[0];
      if (file.size > 8_000_000) { status = "La foto no puede pesar más de 8MB."; render(); return; }
      try { const url = await deps.uploadFile(file); if (e !== epoch) return; await save({ avatarUrl: url }, "Foto guardada."); } catch (error) { if (e !== epoch) return; status = error.message; render(); }
    }
  });
  root.addEventListener("input", (event) => {
    const target = event.target;
    if (target.matches("[data-assistant-notes]")) { drafts.notes = target.value; root.querySelector("[data-assistant-count]").textContent = `${notesLeft(target.value)} caracteres disponibles`; }
    else if (target.matches("[data-assistant-field]")) drafts[target.dataset.assistantField] = target.value;
    else if (target.name === "message") drafts.test = target.value;
  });
  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button"); if (!button) return;
    const e = epoch;
    if (button.matches("[data-assistant-retry]")) load();
    else if (button.matches("[data-assistant-avatar-remove]")) await save({ avatarUrl: null }, "Se usará el logo de la tienda.");
    else if (button.matches("[data-assistant-save-look]")) await save({ name: root.querySelector('[data-assistant-field="name"]').value, greeting: root.querySelector('[data-assistant-field="greeting"]').value, formality: root.querySelector('[name="assistantFormality"]:checked')?.value || "tu" }, "Apariencia guardada.", ["name", "greeting", "formality"]);
    else if (button.matches("[data-assistant-save-notes]")) await save({ notes: root.querySelector("[data-assistant-notes]").value }, "Notas guardadas.", ["notes"]);
    else if (button.matches("[data-assistant-draft]")) {
      button.disabled = true;
      try { const { notes } = await deps.api(`${base()}/notes-draft`, { method: "POST" }); if (e !== epoch) return; drafts.notes = notes; root.querySelector("[data-assistant-notes]").value = notes; root.querySelector("[data-assistant-count]").textContent = `${notesLeft(notes)} caracteres disponibles`; }
      catch (error) { if (e !== epoch) return; status = error.message; render(); }
      finally { button.disabled = false; }
    } else if (button.matches("[data-assistant-teach]")) {
      const id = button.dataset.assistantTeach, answer = root.querySelector(`[data-assistant-answer="${CSS.escape(id)}"]`).value.trim();
      if (!answer) { status = "Escribe la respuesta."; render(); return; }
      try { data = await deps.api(`${base()}/unanswered/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "teach", answer }) }); if (e !== epoch) return; questions = questions.filter((q) => q.id !== id); status = "Respuesta agregada a las notas."; }
      catch (error) { if (e !== epoch) return; status = error.message; if (/ya fue atendida/.test(error.message)) await reloadQuestions(); }
      render();
    } else if (button.matches("[data-assistant-ignore]")) {
      const id = button.dataset.assistantIgnore;
      try { data = await deps.api(`${base()}/unanswered/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ action: "ignore" }) }); if (e !== epoch) return; questions = questions.filter((q) => q.id !== id); } catch (error) { if (e !== epoch) return; status = error.message; if (/ya fue atendida/.test(error.message)) await reloadQuestions(); }
      render();
    } else if (button.matches("[data-assistant-open]")) {
      const id = button.dataset.assistantOpen;
      if (open?.id === id) { open = null; render(); return; }
      try { const next = await deps.api(`${base()}/conversations/${encodeURIComponent(id)}`); if (e !== epoch) return; open = next; } catch (error) { if (e !== epoch) return; status = error.message; }
      render();
    }
  });
  root.addEventListener("submit", async (event) => {
    if (!event.target.matches("[data-assistant-test]")) return;
    event.preventDefault();
    const e = epoch;
    const message = event.target.elements.message.value.trim();
    if (!message || testing) return;
    drafts.test = ""; testing = true; testLog.push({ role: "buyer", text: message }); render();
    try {
      const result = await deps.api(`${base()}/test`, { method: "POST", body: JSON.stringify(testId ? { conversationId: testId, message } : { message }) });
      if (e !== epoch) return;
      testId = result.conversationId || testId;
      const reply = result.reply;
      testLog.push({ role: "bot", text: reply?.text ?? "Sin respuesta.", products: (reply?.blocks || []).filter((b) => b.type === "products").flatMap((b) => b.items) });
      try { const next = await deps.api(base()); if (e === epoch) data = next; } catch { /* the usage count refreshes on the next load */ }
    } catch (error) { if (e !== epoch) return; testLog.push({ role: "bot", text: error.message, error: true }); }
    if (e !== epoch) return;
    testing = false; render();
    root.querySelector("[data-assistant-test] input")?.focus();
  });

  return {
    show() { if (loadedFor !== deps.storeId() || !data) load(); else render(); },
    reset() { request++; epoch++; drafts = {}; testLog = []; testing = false; data = null; list = []; questions = []; open = null; failure = null; loadedFor = null; testId = null; status = ""; if (document.body.dataset.dashboardView === "assistant") load(); },
  };
}
