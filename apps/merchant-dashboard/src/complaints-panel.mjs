import { escapeHtml as esc } from "./html.mjs";
import { canReply, complaintCategoryLabel, complaintStatusLabel, replyByLabel } from "./complaints.mjs";

/**
 * Reclamos (ASFI sub-project 4): complaints pagosYa sent this merchant for their side. The merchant never answers
 * the buyer here; pagosYa does. Buyer contact details are not shown.
 */
export function mountComplaintsPanel({ api, signedIn }) {
  const root = document.getElementById("complaintsRoot");
  const money = (amount, currency) => `${(amount / 100).toFixed(2)} ${esc(currency)}`;
  const date = (iso) => new Date(iso).toLocaleDateString("es-BO", { timeZone: "America/La_Paz" });
  const paragraphs = (text) => esc(text).replace(/\n/g, "<br>");

  async function openFile(id, attachmentId) {
    const blob = await api(`/dashboard/complaints/${encodeURIComponent(id)}/attachments/${encodeURIComponent(attachmentId)}`, { raw: true });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const fileButtons = (id, files) => files.map((f) => `<button type="button" class="ghost" data-file="${esc(f.id)}" data-complaint="${esc(id)}">${esc(f.fileName)}</button>`).join(" ");

  async function renderDetail(id) {
    const d = await api(`/dashboard/complaints/${encodeURIComponent(id)}`);
    root.innerHTML = `
      <button type="button" class="ghost" id="complaintsBack">← Reclamos</button>
      <h2>Reclamo ${esc(d.number)}</h2>
      <p>${esc(complaintStatusLabel(d.status))} · ${esc(complaintCategoryLabel(d.category))}${canReply(d) ? ` · <strong>${esc(replyByLabel(d.merchantDueAt))}</strong>` : ""}</p>
      ${d.payment ? `<p>Pago ${esc(d.payment.id)} · ${money(d.payment.amount, d.payment.currency)} · ${esc(date(d.payment.createdAt))}</p>` : ""}
      <h3>Lo que dice ${esc(d.buyerName)}</h3>
      <p>${paragraphs(d.description)}</p>
      ${d.buyerAttachments.length ? `<p>${fileButtons(d.id, d.buyerAttachments)}</p>` : ""}
      ${d.questions.map((q) => `<h3>Consulta de pagosYa (${esc(date(q.at))})</h3><p>${paragraphs(q.body)}</p>`).join("")}
      ${d.replies.map((r) => `<h3>Tu respuesta (${esc(date(r.at))})${r.late ? " · fuera de plazo" : ""}</h3><p>${paragraphs(r.body)}</p>${fileButtons(d.id, r.attachments)}`).join("")}
      ${canReply(d) ? `
      <form id="complaintReply">
        <label>Tu respuesta para pagosYa<textarea name="body" rows="6" minlength="10" maxlength="5000" required></textarea></label>
        <label>Comprobantes (opcional, hasta 3: JPG, PNG o PDF de 5 MB)<input name="files" type="file" multiple accept="image/jpeg,image/png,application/pdf"></label>
        <p class="notice error" id="complaintReplyError" role="alert" hidden></p>
        <button class="primary" type="submit">Enviar respuesta</button>
      </form>` : ""}`;
    root.querySelector("#complaintsBack").addEventListener("click", () => renderList());
    root.querySelectorAll("[data-file]").forEach((button) => button.addEventListener("click", () => openFile(button.dataset.complaint, button.dataset.file)));
    root.querySelector("#complaintReply")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const body = new FormData();
      body.append("body", String(data.get("body") ?? "").trim());
      for (const file of data.getAll("files")) if (file.size > 0) body.append("files", file);
      try {
        await api(`/dashboard/complaints/${encodeURIComponent(d.id)}/reply`, { method: "POST", body });
        await renderDetail(d.id);
      } catch (error) {
        const notice = root.querySelector("#complaintReplyError");
        notice.textContent = error.message;
        notice.hidden = false;
      }
    });
  }

  async function renderList() {
    const rows = await api("/dashboard/complaints");
    root.innerHTML = rows.length
      ? `<h2>Reclamos</h2><p class="faint">Cuando un comprador presenta un reclamo sobre un pago tuyo, pagosYa lo revisa y te pide tu versión aquí.</p>
         <ul class="complaints-list">${rows.map((r) => `<li><button type="button" class="complaints-row" data-open="${esc(r.id)}"><strong>${esc(r.number)}</strong> · ${esc(complaintCategoryLabel(r.category))} · ${esc(complaintStatusLabel(r.status))}${r.waitingOnYou ? ` · <span class="${r.late ? "is-late" : ""}">${esc(replyByLabel(r.merchantDueAt))}</span>` : ""}</button></li>`).join("")}</ul>`
      : `<h2>Reclamos</h2><p class="faint">No tienes reclamos. Si un comprador presenta uno sobre un pago tuyo, te avisaremos por correo.</p>`;
    root.querySelectorAll("[data-open]").forEach((button) => button.addEventListener("click", () => renderDetail(button.dataset.open)));
  }

  return {
    async show() {
      if (!signedIn()) return;
      try { await renderList(); } catch (error) { root.innerHTML = `<p class="notice error" role="alert">${esc(error.message)}</p>`; }
    },
  };
}
