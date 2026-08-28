import assert from "node:assert/strict";

const base = process.env.API_BASE_URL ?? "http://localhost:3011/v1";
async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`${method} ${path}: ${payload?.message || response.statusText}`), { status: response.status, payload });
  return payload;
}
async function login(email) {
  return (await request("/dashboard/login", { method: "POST", body: { email, password: "PayaDemo!2026" } })).token;
}

const admin = await login("admin@demo.pagosya.bo");
const events = await request("/events", { token: admin });
const event = events.find((item) => item.slug === "fiesta-demo");
assert(event, "seeded Fiesta Demo must exist");
const general = event.ticketTypes.find((item) => item.name === "General");
assert.equal(general.price, 8000);
const publicEvent = await request(`/events/public/id/${event.id}`);
assert.equal(publicEvent.ticketTypes.find((item) => item.id === general.id).currency, "BOB");
const storefront = await request("/stores/public/noche-demo/store");
assert(storefront.siteDocument.sections.some((section) => section.kind === "event-tickets" && section.eventId === event.id));

const prior = await request(`/events/${event.id}/operations`, { token: admin });
for (const shift of prior.shifts.filter((item) => !item.closedAt)) {
  await request(`/events/cash-shifts/${shift.id}/close`, { token: admin, method: "POST", body: { declaredCash: 0 } });
}
const shift = await request("/events/cash-shifts/open", { token: admin, method: "POST", body: { eventId: event.id, openingFloat: 0 } });
const cash = await request(`/events/${event.id}/orders/cash`, { token: admin, method: "POST", body: { cashShiftId: shift.id, paymentMethod: "CASH", items: [{ ticketTypeId: general.id, quantity: 3 }] } });
assert.equal(cash.admissions.length, 3, "group sale must create three admissions");
assert.equal(new Set(cash.admissions.map((item) => item.admissionId)).size, 3, "admissions must be independent");

let dashboard = await request(`/events/${event.id}/dashboard`, { token: admin });
const device = dashboard.devices.find((item) => item.role === "BIDIRECTIONAL");
assert(device, "mock bidirectional device must exist");
const enrolled = [];
for (const [index, admission] of cash.admissions.entries()) {
  const session = await request(`/events/admissions/${admission.admissionId}/enrollment-session`, { token: admin, method: "POST", body: { deviceId: device.id } });
  enrolled.push(await request(`/events/public/enrollment-sessions/${session.id}/complete`, { method: "POST", body: { code: session.code, deviceId: device.id, displayName: `Persona Verificación ${index + 1}`, consent: true, consentVersion: "events-biometric-v1" } }));
}
assert.equal(new Set(enrolled.map((item) => item.attendeeId)).size, 3, "each face must map to one attendee");

const simulate = (action, extra = {}) => request("/events/dev/device-simulator", { token: admin, method: "POST", body: { deviceId: device.id, attendeeId: enrolled[0].attendeeId, action, ...extra } });
const firstEntry = await simulate("FACE_RECOGNIZED_ENTRY");
assert.equal(firstEntry.decision, "ALLOW");
const secondEntry = await simulate("FACE_RECOGNIZED_ENTRY");
assert.deepEqual([secondEntry.decision, secondEntry.reason], ["DENY", "ALREADY_INSIDE"]);
const exit = await simulate("FACE_RECOGNIZED_EXIT");
assert.equal(exit.presenceStatus, "OUTSIDE");
const reentry = await simulate("FACE_RECOGNIZED_ENTRY");
assert.equal(reentry.presenceStatus, "INSIDE");

const simulateConcurrent = (attendeeId) => request("/events/dev/device-simulator", { token: admin, method: "POST", body: { deviceId: device.id, attendeeId, action: "FACE_RECOGNIZED_ENTRY" } });
const concurrent = await Promise.all([simulateConcurrent(enrolled[2].attendeeId), simulateConcurrent(enrolled[2].attendeeId)]);
assert.deepEqual(concurrent.map((item) => item.decision).sort(), ["ALLOW", "DENY"], "simultaneous readers must not bypass anti-passback");
assert.equal(concurrent.find((item) => item.decision === "DENY").reason, "ALREADY_INSIDE");

const duplicateId = `verify-idempotency-${Date.now()}`;
await simulate("FACE_RECOGNIZED_EXIT", { duplicateExternalEventId: duplicateId });
const duplicate = await simulate("FACE_RECOGNIZED_EXIT", { duplicateExternalEventId: duplicateId });
assert.equal(duplicate.idempotent, true, "replayed device event must be idempotent");
const closed = await request(`/events/cash-shifts/${shift.id}/close`, { token: admin, method: "POST", body: { declaredCash: 24000 } });
assert.equal(closed.expectedCash, 24000);
assert.equal(closed.difference, 0);

const reservation = await request(`/events/public/${event.slug}/reservations`, { method: "POST", body: { buyerName: "Comprador Demo", buyerEmail: "comprador@example.test", items: [{ ticketTypeId: general.id, quantity: 3 }] } });
assert.equal(reservation.amount, 24000);
const confirmation = await request(`/payment_intents/${reservation.paymentIntentId}/confirm`, { token: reservation.clientSecret, method: "POST", body: { paymentMethod: { type: "CARD", token: "tok_visa_success" }, customerName: "Comprador Demo", customerEmail: "comprador@example.test" } });
assert.equal(confirmation.paymentIntent.status, "SUCCEEDED");
const managed = await request(`/events/public/reservations/${reservation.reservationId}/manage`, { method: "POST", body: { managementToken: reservation.managementToken } });
assert.equal(managed.order.admissions.length, 3, "online payment creates one admission per reserved unit");
const supersededInvitation = await request(`/events/public/admissions/${managed.order.admissions[0].id}/invitations`, { method: "POST", body: { managementToken: reservation.managementToken } });
const invitation = await request(`/events/public/admissions/${managed.order.admissions[0].id}/invitations`, { method: "POST", body: { managementToken: reservation.managementToken } });
await assert.rejects(() => request(`/events/public/admissions/${managed.order.admissions[0].id}/claim`, { method: "POST", body: { token: supersededInvitation.token, displayName: "Invitación Revocada" } }), (error) => error.status === 400, "new invitations must revoke earlier claim links");
const claimed = await request(`/events/public/admissions/${managed.order.admissions[0].id}/claim`, { method: "POST", body: { token: invitation.token, displayName: "Asistente Distinto", email: "asistente@example.test" } });
assert.notEqual(claimed.attendeeId, null);

const cashier = await login("cashier@demo.pagosya.bo");
await assert.rejects(() => request(`/events/${event.id}/ticket-types`, { token: cashier, method: "POST", body: { kind: "CUSTOM", name: "No autorizado", price: 100, inventory: 1 } }), (error) => error.status === 403);
const promoter = await login("promoter@demo.pagosya.bo");
await assert.rejects(() => request(`/events/${event.id}/operations`, { token: promoter }), (error) => error.status === 403);

const operations = await request(`/events/${event.id}/operations`, { token: admin });
const cashAdmission = operations.admissions.find((item) => item.id === cash.admissions[1].admissionId);
assert.equal(Object.hasOwn(cashAdmission.credentials[0] || {}, "externalCredentialId"), false, "operations response must not expose device credential identifiers");
const deletion = await request(`/events/biometric-credentials/${cashAdmission.credentials[0].id}/delete`, { token: admin, method: "POST", body: { reason: "Verificación de eliminación MVP" } });
assert.equal(deletion.status, "COMPLETED");

dashboard = await request(`/events/${event.id}/dashboard`, { token: admin });
assert(dashboard.deniedAttempts >= 1);
console.log(JSON.stringify({
  event: event.name, cashAdmissions: cash.admissions.length, onlineAdmissions: managed.order.admissions.length,
  antiPassback: secondEntry.reason, reentry: reentry.decision, expectedCash: closed.expectedCash,
  concurrentAntiPassback: concurrent.map((item) => item.decision).sort(), idempotentReplay: duplicate.idempotent, biometricDeletion: deletion.status,
}, null, 2));
