import "./complaints-page.css";
import { API_BASE_URL } from "../api";
import { markPrivateStorePage } from "../store-seo";
import { BUYER_STATUS_LABEL, CATEGORY_OPTIONS, OUTCOME_LABEL, REQUEST_OPTIONS, clientFileProblem, complaintDateLabel, validateComplaintDraft, type ComplaintDraft } from "./complaints-form";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
const options = (list: Array<{ value: string; label: string }>) => `<option value="">Elige una opción</option>${list.map((o) => `<option value="${o.value}">${esc(o.label)}</option>`).join("")}`;
const DRAFT_FIELDS = ["buyerName", "buyerEmail", "buyerPhone", "reference", "storeName", "category", "request", "description"] as const;

async function apiError(response: Response): Promise<string> {
  if (response.status === 429) return "Enviaste demasiados reclamos seguidos. Intenta de nuevo en una hora.";
  const body = await response.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
  return typeof message === "string" ? message : "No pudimos enviar tu reclamo. Intenta de nuevo.";
}

export function mountComplaintForm(root: HTMLElement, prefillReference: string | null): void {
  markPrivateStorePage();
  document.title = "Presentar un reclamo · pagosYa";
  root.innerHTML = `
  <main class="complaint-page">
    <h1>Presentar un reclamo</h1>
    <p class="complaint-lead">pagosYa registra tu reclamo, lo revisa con la tienda y te responde por escrito en un máximo de 5 días hábiles.</p>
    <form id="complaintForm" novalidate>
      <label>Tu nombre<input name="buyerName" autocomplete="name" required></label>
      <label>Tu correo<input name="buyerEmail" type="email" autocomplete="email" required></label>
      <label>Tu teléfono (opcional)<input name="buyerPhone" type="tel" autocomplete="tel"></label>
      <label>Referencia del pago<input name="reference" value="${esc(prefillReference ?? "")}" placeholder="La encuentras en tu recibo como «Orden: pi_…»"></label>
      <label>Si no tienes la referencia, nombre de la tienda<input name="storeName"></label>
      <label>¿Qué pasó?<select name="category" required>${options(CATEGORY_OPTIONS)}</select></label>
      <label>¿Qué solución esperas?<select name="request" required>${options(REQUEST_OPTIONS)}</select></label>
      <label>Cuéntanos qué pasó<textarea name="description" rows="6" maxlength="5000" required></textarea></label>
      <label>Fotos o documentos (opcional, hasta 3: JPG, PNG o PDF de 5 MB)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label>
      <div class="complaint-trap" aria-hidden="true"><label>Sitio web<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <p class="complaint-privacy">Usamos estos datos solo para atender tu reclamo. Compartimos con la tienda lo necesario para resolverlo, como indica nuestra <a href="https://pagosya.bo/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</p>
      <p class="complaint-error" id="complaintError" role="alert" hidden></p>
      <button type="submit" class="complaint-submit">Enviar reclamo</button>
    </form>
  </main>`;
  const form = root.querySelector<HTMLFormElement>("#complaintForm")!;
  const error = root.querySelector<HTMLElement>("#complaintError")!;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const draft = Object.fromEntries(DRAFT_FIELDS.map((key) => [key, String(data.get(key) ?? "")])) as ComplaintDraft;
    const errors = validateComplaintDraft(draft);
    const files = (data.getAll("files") as File[]).filter((file) => file.size > 0);
    const fileProblem = clientFileProblem(files);
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    for (const name of Object.keys(errors)) form.querySelector(`[name="${name}"]`)?.setAttribute("aria-invalid", "true");
    const first = Object.values(errors)[0] ?? fileProblem;
    if (first) { error.textContent = first; error.hidden = false; return; }
    error.hidden = true;
    const body = new FormData();
    for (const [key, value] of Object.entries(draft)) if (value.trim()) body.append(key, value.trim());
    const trap = String(data.get("website") ?? "");
    if (trap) body.append("website", trap);
    for (const file of files) body.append("files", file);
    const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
    button.disabled = true;
    button.textContent = "Enviando…";
    try {
      const response = await fetch(`${API_BASE_URL}/complaints`, { method: "POST", body });
      if (!response.ok) throw new Error(await apiError(response));
      const result = (await response.json()) as { number: string; dueAt: string; trackingUrl: string };
      root.querySelector("main")!.innerHTML = `
        <h1>Recibimos tu reclamo</h1>
        <p class="complaint-number">Número de reclamo: <strong>${esc(result.number)}</strong></p>
        <p>Te responderemos por escrito a más tardar el <strong>${esc(complaintDateLabel(result.dueAt))}</strong>.</p>
        <p>Te enviamos un correo con este número y un enlace para seguir tu reclamo.</p>
        <p><a href="${esc(result.trackingUrl)}">Ver mi reclamo</a></p>`;
    } catch (cause) {
      error.textContent = (cause as Error).message;
      error.hidden = false;
      button.disabled = false;
      button.textContent = "Enviar reclamo";
    }
  });
}

type TrackingView = {
  number: string; status: keyof typeof BUYER_STATUS_LABEL; dueAt: string; extendedAt: string | null; extensionReason: string | null;
  outcome: string | null; answer: string | null; secondInstanceNotice: string | null;
  messages: Array<{ id: string; at: string; body: string; attachments: Array<{ id: string; fileName: string }> }>;
};

export async function mountComplaintTracking(root: HTMLElement, token: string): Promise<void> {
  markPrivateStorePage();
  document.title = "Tu reclamo · pagosYa";
  const headers = { authorization: `Bearer ${token}` };
  const render = (view: TrackingView) => {
    const answered = view.status === "ANSWERED";
    root.innerHTML = `
    <main class="complaint-page">
      <h1>Reclamo ${esc(view.number)}</h1>
      <p class="complaint-status">Estado: <strong>${esc(BUYER_STATUS_LABEL[view.status])}</strong></p>
      ${answered ? "" : `<p>Respuesta a más tardar el <strong>${esc(complaintDateLabel(view.dueAt))}</strong>.</p>`}
      ${view.extendedAt ? `<p>Extendimos el plazo. Motivo: ${esc(view.extensionReason)}</p>` : ""}
      ${answered ? `<section class="complaint-answer"><h2>Nuestra respuesta</h2><p>Resultado: <strong>${esc(OUTCOME_LABEL[view.outcome ?? ""] ?? "")}</strong></p><p>${esc(view.answer).replace(/\n/g, "<br>")}</p><p class="complaint-second-instance">${esc(view.secondInstanceNotice)}</p></section>` : ""}
      <section><h2>Lo que nos enviaste</h2>${view.messages.map((m) => `<article class="complaint-message"><time>${esc(complaintDateLabel(m.at))}</time><p>${esc(m.body).replace(/\n/g, "<br>")}</p>${m.attachments.map((a) => `<button type="button" class="complaint-file" data-attachment="${esc(a.id)}">${esc(a.fileName)}</button>`).join("")}</article>`).join("")}</section>
      ${answered ? "" : `<form id="complaintMessage"><label>Agregar información<textarea name="body" rows="4" maxlength="5000" required></textarea></label><label>Archivos (opcional)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label><p class="complaint-error" id="messageError" role="alert" hidden></p><button type="submit">Enviar</button></form>`}
    </main>`;
    root.querySelectorAll<HTMLButtonElement>("[data-attachment]").forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE_URL}/complaints/track/attachments/${encodeURIComponent(button.dataset.attachment!)}`, { headers });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }));
    const form = root.querySelector<HTMLFormElement>("#complaintMessage");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const files = (data.getAll("files") as File[]).filter((file) => file.size > 0);
      const error = root.querySelector<HTMLElement>("#messageError")!;
      const problem = String(data.get("body") ?? "").trim().length < 2 ? "Escribe tu mensaje." : clientFileProblem(files);
      if (problem) { error.textContent = problem; error.hidden = false; return; }
      const body = new FormData();
      body.append("body", String(data.get("body")).trim());
      for (const file of files) body.append("files", file);
      const response = await fetch(`${API_BASE_URL}/complaints/track/messages`, { method: "POST", headers, body });
      if (!response.ok) { error.textContent = await apiError(response); error.hidden = false; return; }
      render(await response.json());
    });
  };
  const response = await fetch(`${API_BASE_URL}/complaints/track`, { headers });
  if (!response.ok) {
    root.innerHTML = `<main class="complaint-page"><h1>Reclamo no encontrado</h1><p>Revisa que el enlace sea el de tu correo, o <a href="/reclamos">presenta un reclamo nuevo</a>.</p></main>`;
    return;
  }
  render(await response.json());
}
