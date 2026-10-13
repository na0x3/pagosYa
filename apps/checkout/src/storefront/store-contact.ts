import { Store, submitStoreLead, subscribeStoreNewsletter } from "../api";
import { app } from "../ui/app";
import { escapeHtml } from "../ui/html";
import { loadLeadEmail, saveLeadEmail } from "../checkout/customer-contact";
import type { StoreSiteSectionLookup } from "./store-site-sections";

export function bindStoreContactWidget(): void {
  const widget = app.querySelector<HTMLElement>("[data-store-contact-widget]");
  if (!widget) return;
  const toggle = widget.querySelector<HTMLButtonElement>("[data-contact-toggle]");
  const panel = widget.querySelector<HTMLElement>("[data-contact-panel]");
  const close = widget.querySelector<HTMLButtonElement>("[data-contact-close]");
  if (!toggle || !panel || !close) return;
  const setOpen = (open: boolean, returnFocus = false) => {
    widget.dataset.contactOpen = String(open);
    toggle.setAttribute("aria-expanded", String(open));
    panel.hidden = !open;
    if (open) requestAnimationFrame(() => panel.querySelector<HTMLElement>("input, textarea, button[type=submit]")?.focus());
    else if (returnFocus) toggle.focus();
  };
  toggle.addEventListener("click", () => setOpen(panel.hidden));
  close.addEventListener("click", () => setOpen(false, true));
  widget.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && widget.dataset.contactOpen === "true") setOpen(false, true);
  });
}

/** The floating contact widget: a launcher plus the panel holding the question form. */
export function storeContactHtml(store: Store, siteSection: StoreSiteSectionLookup): string {
  return store.contactFormEnabled === true
    ? `<section class="store-contact-section store-contact-widget" id="store-contact" data-store-contact-widget aria-labelledby="store-contact-title">
        <button class="store-contact-launcher" id="store-contact-toggle" type="button" data-contact-toggle aria-controls="store-contact-panel" aria-expanded="false" aria-label="Abrir formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 7.4 7.4 0 0 1-3.2-.72L5 19.5l1.22-3.15A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01"/></svg><span>Contacto</span></button>
        <div class="store-contact-panel" id="store-contact-panel" data-contact-panel hidden>
          <div class="store-contact-heading">
            <div class="store-contact-copy">
              <h2 id="store-contact-title">${escapeHtml(siteSection("contact")?.title || store.contactTitle?.trim() || "¿Tienes una pregunta?")}</h2>
              <p>${escapeHtml(siteSection("contact")?.body || store.contactSubtitle?.trim() || `Escríbele directamente al equipo de ${store.storeName}. La tienda recibirá tu pregunta desde pagosYa y podrá responder a tu correo.`)}</p>
            </div>
            <button class="store-contact-close" type="button" data-contact-close aria-label="Cerrar formulario de contacto"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
          </div>
          <form class="store-contact-form" id="store-contact-form">
          <div class="field"><label for="store-contact-name">Nombre <span class="store-contact-optional">(opcional)</span></label><input id="store-contact-name" name="name" autocomplete="name" maxlength="120" placeholder="Cómo te llamas"></div>
          <div class="field"><label for="store-contact-email">Tu Gmail o correo</label><input id="store-contact-email" name="email" type="email" autocomplete="email" maxlength="254" value="${escapeHtml(loadLeadEmail(store.storeId))}" placeholder="tunombre@gmail.com" aria-describedby="store-contact-email-help" required><small id="store-contact-email-help" class="store-contact-field-help">La tienda usará este correo para responderte.</small></div>
          <div class="field"><label for="store-contact-phone">WhatsApp (opcional)</label><input id="store-contact-phone" name="phone" type="tel" autocomplete="tel" maxlength="40"></div>
          <div class="field store-contact-message"><label for="store-contact-message">Tu pregunta</label><textarea id="store-contact-message" name="message" maxlength="600" rows="5" placeholder="Escribe aquí lo que quieres consultar…" required></textarea></div>
          <div class="store-contact-actions"><button class="primary" type="submit">Enviar pregunta</button><span class="store-contact-status" role="status" aria-live="polite"></span></div>
          </form>
        </div>
      </section>`
    : "";
}

export function bindStoreNewsletterForm(slug: string): void {
  app.querySelector<HTMLFormElement>("#store-newsletter-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".store-newsletter-status")!;
    const email = String(new FormData(form).get("email") || "").trim().toLowerCase();
    status.textContent = "";
    status.setAttribute("role", "status");
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    const originalLabel = submit.textContent || "Suscribirme";
    submit.textContent = "Guardando…";
    try {
      await subscribeStoreNewsletter(slug, email);
      form.reset();
      status.textContent = status.dataset.successMessage || "Listo. Ya estás en la lista.";
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = `No pudimos guardar tu correo: ${(error as Error).message}`;
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = originalLabel;
    }
  });
}

export function bindStoreContactForm(slug: string, store: Store): void {
  app.querySelector<HTMLFormElement>("#store-contact-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = form.querySelector<HTMLElement>(".store-contact-status")!;
    const data = new FormData(form);
    status.textContent = "";
    status.removeAttribute("role");
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Enviando…";
    try {
      const email = String(data.get("email") || "").trim().toLowerCase();
      const name = String(data.get("name") || "").trim();
      await submitStoreLead(slug, {
        ...(name ? { name } : {}),
        email,
        message: String(data.get("message") || "").trim(),
        phone: String(data.get("phone") || "").trim() || undefined,
      }, []);
      saveLeadEmail(store.storeId, email);
      form.reset();
      const emailInput = form.querySelector<HTMLInputElement>("#store-contact-email");
      if (emailInput) emailInput.value = email;
      status.setAttribute("role", "status");
      status.textContent = "Pregunta enviada. La tienda ya la recibió y responderá a tu correo.";
    } catch (error) {
      status.setAttribute("role", "alert");
      status.textContent = `No pudimos enviar el mensaje: ${(error as Error).message}`;
    } finally {
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = "Enviar pregunta";
    }
  });
}
