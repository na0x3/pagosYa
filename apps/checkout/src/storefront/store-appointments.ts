import { Store, fetchAppointmentAvailability, createAppointmentPayment } from "../api";
import { app } from "../ui/app";
import { escapeHtml, formatAmount } from "../ui/html";
import { storeCatalogUrl } from "./routes";

export function storeAppointmentsHtml(store: Store): string {
  const appointmentOfferings = store.appointmentOfferings ?? [];
  return appointmentOfferings.length
    ? `<section class="store-appointments" aria-labelledby="store-appointments-title">
        <div class="store-appointments-copy"><h2 id="store-appointments-title">Reserva tu cita</h2><p>Elige un servicio y uno de los horarios realmente disponibles. El horario se apartará durante 15 minutos mientras completas el pago.</p></div>
        <form class="store-appointment-form" id="store-appointment-form">
          <div class="field"><label for="store-appointment-offering">Servicio</label><select id="store-appointment-offering" name="offeringId" required>${appointmentOfferings.map((offering) => `<option value="${escapeHtml(offering.id)}">${escapeHtml(offering.name)} · ${formatAmount(offering.price, offering.currency)} · ${offering.durationMinutes} min</option>`).join("")}</select></div>
          <div class="field"><label for="store-appointment-date">Fecha</label><input id="store-appointment-date" name="date" type="date" required></div>
          <div class="store-appointment-slots-field"><span>Horarios disponibles</span><div class="store-appointment-slots" id="store-appointment-slots" role="radiogroup" aria-label="Horarios disponibles"></div><small id="store-appointment-calendar-status" aria-live="polite">Selecciona una fecha para consultar la agenda.</small></div>
          <div class="field"><label for="store-appointment-name">Nombre</label><input id="store-appointment-name" name="customerName" autocomplete="name" maxlength="120" required></div>
          <div class="field"><label for="store-appointment-email">Correo</label><input id="store-appointment-email" name="customerEmail" type="email" autocomplete="email" maxlength="254" required></div>
          <div class="field"><label for="store-appointment-phone">Teléfono</label><input id="store-appointment-phone" name="customerPhone" autocomplete="tel" inputmode="tel" maxlength="40"></div>
          <div class="store-appointment-actions"><button class="primary" type="submit" disabled>Reservar y pagar</button><span id="store-appointment-status" role="status" aria-live="polite"></span></div>
        </form>
      </section>`
    : "";
}

export function bindStoreAppointmentForm(slug: string): void {
  const appointmentForm = app.querySelector<HTMLFormElement>("#store-appointment-form");
  if (appointmentForm) {
    const offering = appointmentForm.elements.namedItem("offeringId") as HTMLSelectElement;
    const dateInput = appointmentForm.elements.namedItem("date") as HTMLInputElement;
    const slots = appointmentForm.querySelector<HTMLElement>("#store-appointment-slots")!;
    const calendarStatus = appointmentForm.querySelector<HTMLElement>("#store-appointment-calendar-status")!;
    const submit = appointmentForm.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    const status = appointmentForm.querySelector<HTMLElement>("#store-appointment-status")!;
    let selectedStartsAt = "";
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    dateInput.min = localDate;
    dateInput.value = localDate;

    const loadSlots = async () => {
      selectedStartsAt = "";
      submit.disabled = true;
      slots.setAttribute("aria-busy", "true");
      slots.innerHTML = '<span class="store-appointment-loading">Consultando agenda…</span>';
      calendarStatus.textContent = "";
      try {
        const availability = await fetchAppointmentAvailability(slug, offering.value, dateInput.value);
        slots.innerHTML = availability.slots.map((slot) => `<button type="button" role="radio" aria-checked="false" data-appointment-slot="${escapeHtml(slot.startsAt)}">${escapeHtml(slot.label)}</button>`).join("") || '<span class="store-appointment-loading">No quedan horarios para este día. Prueba otra fecha.</span>';
        calendarStatus.textContent = availability.connectedToGoogleCalendar ? "Disponibilidad verificada con Google Calendar." : "Disponibilidad verificada con la agenda de pagosYa.";
      } catch (error) {
        slots.innerHTML = '<span class="store-appointment-loading">No pudimos consultar los horarios.</span>';
        calendarStatus.textContent = (error as Error).message;
      } finally {
        slots.removeAttribute("aria-busy");
      }
    };
    slots.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-appointment-slot]");
      if (!button) return;
      selectedStartsAt = button.dataset.appointmentSlot || "";
      slots.querySelectorAll<HTMLButtonElement>("[data-appointment-slot]").forEach((item) => item.setAttribute("aria-checked", String(item === button)));
      submit.disabled = !selectedStartsAt;
    });
    offering.addEventListener("change", loadSlots);
    dateInput.addEventListener("change", loadSlots);
    appointmentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!selectedStartsAt) return;
      const data = new FormData(appointmentForm);
      status.textContent = "";
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Apartando horario…";
      try {
        const result = await createAppointmentPayment(slug, {
          offeringId: String(data.get("offeringId")),
          customerName: String(data.get("customerName") || "").trim(),
          customerEmail: String(data.get("customerEmail") || "").trim().toLowerCase(),
          customerPhone: String(data.get("customerPhone") || "").trim() || undefined,
          startsAt: selectedStartsAt,
        });
        if (result.clientSecret) {
          window.location.assign(`${storeCatalogUrl(slug)}#client_secret=${encodeURIComponent(result.clientSecret)}`);
          return;
        }
        status.textContent = "Cita confirmada. Recibirás los detalles por correo.";
        await loadSlots();
      } catch (error) {
        status.textContent = (error as Error).message;
        await loadSlots();
      } finally {
        submit.removeAttribute("aria-busy");
        submit.textContent = "Reservar y pagar";
        submit.disabled = !selectedStartsAt;
      }
    });
    void loadSlots();
  }
}
