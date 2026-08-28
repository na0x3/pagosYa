import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const base = process.env.API_BASE_URL ?? "http://localhost:3011/v1";

async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`${method} ${path}: ${payload?.message || response.statusText}`), { status: response.status, payload });
  return payload;
}

const merchantToken = (await request("/dashboard/login", { method: "POST", body: { email: "admin@demo.pagosya.bo", password: "PayaDemo!2026" } })).token;
const consumerToken = (await request("/consumer/login", { method: "POST", body: { email: "maria.face@example.test", password: "PayaDemo!2026" } })).token;
const venues = await request("/events/venues", { token: merchantToken });
const venue = venues.find((item) => item.name === "Club Demo La Paz") ?? venues[0];
assert(venue, "a demo venue is required");

async function createEvent(label, { past = false } = {}) {
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const reference = Date.now();
  const doorsOpenAt = new Date(reference + (past ? -4 : -1) * 60 * 60_000);
  const startsAt = new Date(reference + (past ? -3 : 0) * 60 * 60_000);
  const endsAt = new Date(reference + (past ? -2 : 4) * 60 * 60_000);
  const event = await request("/events", { token: merchantToken, method: "POST", body: { venueId: venue.id, name: `${label} ${stamp}`, doorsOpenAt: doorsOpenAt.toISOString(), startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), capacity: 100, allowReentry: true, biometricRequired: true, retentionHours: 1, status: "ACTIVE" } });
  const ticket = await request(`/events/${event.id}/ticket-types`, { token: merchantToken, method: "POST", body: { kind: "GENERAL", name: "General", price: 8000, inventory: 100, currency: "BOB", reentryAllowed: true } });
  const device = await request("/events/devices", { token: merchantToken, method: "POST", body: { venueId: venue.id, eventId: event.id, name: `Mock ${label}`, role: "BIDIRECTIONAL", vendor: "Mock", model: "Simulator", serialNumber: `MOCK-${stamp}`, faceCapacity: 5000, algorithmVersion: "MOCK-v1", providerCapabilities: { reusableProfiles: true, templatePortability: "SIMULATED" } } });
  return { event, ticket, device };
}

async function purchase({ event, ticket }) {
  const reservation = await request(`/events/public/${event.slug}/reservations`, { method: "POST", body: { buyerName: "María Demo", buyerEmail: "maria.face@example.test", items: [{ ticketTypeId: ticket.id, quantity: 1 }] } });
  await request(`/payment_intents/${reservation.paymentIntentId}/confirm`, { token: reservation.clientSecret, method: "POST", body: { paymentMethod: { type: "CARD", token: "tok_visa_success" }, customerName: "María Demo", customerEmail: "maria.face@example.test" } });
  const managed = await request(`/events/public/reservations/${reservation.reservationId}/manage`, { method: "POST", body: { managementToken: reservation.managementToken } });
  assert.equal(managed.order.admissions.length, 1);
  return { admission: managed.order.admissions[0], reservation, managed };
}

const eventA = await createEvent("Face Entry A");
const purchaseA = await purchase(eventA);
const initialActivation = await request(`/events/consumer/admissions/${purchaseA.admission.id}/face-entry`, { token: consumerToken, method: "POST", body: { managementToken: purchaseA.reservation.managementToken } });
assert.equal(initialActivation.requiresEnrollment, true, "first event must require enrollment");
const sessionA = await request(`/events/consumer/admissions/${purchaseA.admission.id}/enrollment-session`, { token: consumerToken, method: "POST", body: { managementToken: purchaseA.reservation.managementToken, deviceId: eventA.device.id, scope: "REUSABLE" } });
const enrollmentA = await request(`/events/consumer/enrollment-sessions/${sessionA.id}/complete`, { token: consumerToken, method: "POST", body: { code: sessionA.code, deviceId: eventA.device.id, displayName: "María Demo", consent: true, consentVersion: "face-entry-reusable-v1" } });
assert.equal(enrollmentA.reusableAcrossEvents, true);
const centralIdentityId = enrollmentA.biometricIdentityId;
assert(centralIdentityId, "a central reusable BiometricIdentity must be created");
const syncA = await request(`/events/${eventA.event.id}/devices/${eventA.device.id}/roster/sync`, { token: merchantToken, method: "POST" });
assert.equal(syncA.desired, 1);
const entryA = await request("/events/dev/device-simulator", { token: merchantToken, method: "POST", body: { deviceId: eventA.device.id, attendeeId: enrollmentA.attendeeId, action: "FACE_RECOGNIZED_ENTRY" } });
assert.equal(entryA.decision, "ALLOW");
await request(`/events/${eventA.event.id}/end`, { token: merchantToken, method: "POST" });
const removedA = await request(`/events/${eventA.event.id}/devices/${eventA.device.id}/roster/remove`, { token: merchantToken, method: "POST" });
assert.equal(removedA.removed, 1, "event A terminal cache must be emptied");
const statusAfterA = await request("/events/consumer/face-entry", { token: consumerToken });
assert.equal(statusAfterA.biometricIdentityId, centralIdentityId, "reusable identity must remain centrally after event A");
assert.equal(statusAfterA.registered, true);

const eventB = await createEvent("Face Entry B");
const purchaseB = await purchase(eventB);
const activationB = await request(`/events/consumer/admissions/${purchaseB.admission.id}/face-entry`, { token: consumerToken, method: "POST", body: { managementToken: purchaseB.reservation.managementToken } });
assert.equal(activationB.biometricIdentityId, centralIdentityId, "event B must reuse the same central identity");
assert.equal(activationB.requiresEnrollment, false, "returning customer must not scan again");
const syncB = await request(`/events/${eventB.event.id}/devices/${eventB.device.id}/roster/sync`, { token: merchantToken, method: "POST" });
assert.equal(syncB.desired, 1);
const operationsB = await request(`/events/${eventB.event.id}/operations`, { token: merchantToken });
const admissionB = operationsB.admissions.find((item) => item.id === purchaseB.admission.id);
const entryB = await request("/events/dev/device-simulator", { token: merchantToken, method: "POST", body: { deviceId: eventB.device.id, attendeeId: admissionB.attendee.id, action: "FACE_RECOGNIZED_ENTRY" } });
assert.equal(entryB.decision, "ALLOW");

const deletion = await request("/events/consumer/face-entry", { token: consumerToken, method: "DELETE", body: { reason: "AUTOMATED_REUSABLE_FACE_ENTRY_TEST" } });
assert.equal(deletion.status, "COMPLETED");
const deletedStatus = await request("/events/consumer/face-entry", { token: consumerToken });
assert.equal(deletedStatus.registered, false);
const historicalA = await request(`/events/public/reservations/${purchaseA.reservation.reservationId}/manage`, { method: "POST", body: { managementToken: purchaseA.reservation.managementToken } });
assert.equal(historicalA.order.admissions.length, 1, "historical admission remains after biometric deletion");

const eventC = await createEvent("Face Entry C");
const purchaseC = await purchase(eventC);
const activationC = await request(`/events/consumer/admissions/${purchaseC.admission.id}/face-entry`, { token: consumerToken, method: "POST", body: { managementToken: purchaseC.reservation.managementToken } });
assert.equal(activationC.requiresEnrollment, true, "future purchase must require enrollment after deletion");

const oneEvent = await createEvent("Solo este evento", { past: true });
const shift = await request("/events/cash-shifts/open", { token: merchantToken, method: "POST", body: { eventId: oneEvent.event.id, openingFloat: 0 } });
const cash = await request(`/events/${oneEvent.event.id}/orders/cash`, { token: merchantToken, method: "POST", body: { cashShiftId: shift.id, paymentMethod: "CASH", items: [{ ticketTypeId: oneEvent.ticket.id, quantity: 1 }] } });
const eventOnlySession = await request(`/events/admissions/${cash.admissions[0].admissionId}/enrollment-session`, { token: merchantToken, method: "POST", body: { deviceId: oneEvent.device.id } });
const eventOnlyEnrollment = await request(`/events/public/enrollment-sessions/${eventOnlySession.id}/complete`, { method: "POST", body: { code: eventOnlySession.code, deviceId: oneEvent.device.id, displayName: "Persona Evento Único", consent: true, consentVersion: "face-entry-event-only-v1" } });
assert.equal(eventOnlyEnrollment.reusableAcrossEvents, false);
await request(`/events/${oneEvent.event.id}/end`, { token: merchantToken, method: "POST" });
const cleanup = await request(`/events/${oneEvent.event.id}/biometrics/cleanup`, { token: merchantToken, method: "POST" });
assert(cleanup.deletedIdentityIds.includes(eventOnlyEnrollment.biometricIdentityId), "event-only identity must be deleted after retention");
const oneEventOperations = await request(`/events/${oneEvent.event.id}/operations`, { token: merchantToken });
assert(oneEventOperations.admissions.some((item) => item.id === cash.admissions[0].admissionId), "event-only biometric deletion must preserve admission history");

console.log(JSON.stringify({
  firstEventEnrollment: "REQUIRED",
  centralIdentityId,
  eventARosterRemoved: removedA.removed,
  eventBReusedWithoutScan: !activationB.requiresEnrollment,
  eventBEntry: entryB.decision,
  centralDeletion: deletion.status,
  futureEnrollmentRequired: activationC.requiresEnrollment,
  eventOnlyIdentityDeleted: cleanup.deletedIdentityIds.includes(eventOnlyEnrollment.biometricIdentityId),
  historicalAdmissionsPreserved: true,
}, null, 2));
