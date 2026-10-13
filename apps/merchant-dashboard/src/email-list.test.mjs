import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMAIL_ROWS, emailListGroups, normalizeOverview, sampleText, templateDraftError, templateSaveBody } from './email-list.mjs';

const T = (id, extra = {}) => ({ id, name: id, trigger: `Cuando ${id}`, supported: true, enabled: false, subject: `Asunto ${id}`, body: `Mensaje ${id}`, delayHours: 0, ...extra });
const ALL = ['REFUND', 'SHIPPED', 'WELCOME', 'CANCELED', 'DELIVERED', 'GIFT_CARD', 'SUBSCRIPTION_FAILED', 'SUBSCRIPTION_SKIPPED', 'RECOVERY', 'REVIEW_REQUEST'].map(id => T(id));

test('every store email appears once, grouped in the order a buyer meets them', () => {
  const groups = emailListGroups(ALL);
  assert.deepEqual(groups.map(g => g.title), ['Compras', 'Suscripciones', 'Automáticos']);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => r.label)), ['Confirmación de compra', 'Cita confirmada', 'Enviado', 'Entregado', 'Cancelado', 'Reembolso', 'Tarjeta de regalo', 'Pago de suscripción fallido', 'Suscripción omitida', 'Bienvenida', 'Carrito abandonado', 'Pedir reseña']);
  assert.equal(new Set(groups.flatMap(g => g.rows.map(r => r.id))).size, EMAIL_ROWS.length);
});

test('a plain-text order confirmation from the API never becomes a second confirmation', () => {
  const ids = emailListGroups([...ALL, T('ORDER_CONFIRMATION', { enabled: true })]).flatMap(g => g.rows.map(r => r.id));
  assert.equal(ids.includes('ORDER_CONFIRMATION'), false);
  assert.equal(ids.filter(id => id === 'order_confirmation').length, 1);
});

test('the confirmations are always on and listed even when the workspace is unavailable', () => {
  const groups = emailListGroups(undefined);
  assert.deepEqual(groups.flatMap(g => g.rows.map(r => [r.id, r.designed, r.enabled])), [['order_confirmation', true, true], ['appointment_confirmed', true, true]]);
});

test('plain-text rows carry the stored switch, wording and wait', () => {
  const recovery = emailListGroups([T('RECOVERY', { enabled: true, delayHours: 48, subject: 'Tu carrito' })]).flatMap(g => g.rows).find(r => r.id === 'RECOVERY');
  assert.deepEqual([recovery.enabled, recovery.supported, recovery.subject, recovery.delayHours, recovery.trigger], [true, true, 'Tu carrito', 48, 'Cuando RECOVERY']);
});

test('the save body trims, keeps unsupported emails off and carries the wait only for Carrito abandonado', () => {
  const row = id => emailListGroups([...ALL]).flatMap(g => g.rows).find(r => r.id === id);
  assert.deepEqual(templateSaveBody(row('SHIPPED'), { enabled: true, subject: '  Va  ', body: ' En camino ', recoveryHours: 9 }, 4), { revision: 4, enabled: true, subject: 'Va', body: 'En camino' });
  assert.deepEqual(templateSaveBody(row('RECOVERY'), { enabled: false, subject: 'a', body: 'b', recoveryHours: '48' }, 4), { revision: 4, enabled: false, subject: 'a', body: 'b', recoveryHours: 48 });
  const skipped = emailListGroups([T('SUBSCRIPTION_SKIPPED', { supported: false })]).flatMap(g => g.rows).find(r => r.id === 'SUBSCRIPTION_SKIPPED');
  assert.equal(templateSaveBody(skipped, { enabled: true, subject: 'a', body: 'b' }, 1).enabled, false);
});

test('a draft needs a subject, a message and, for the reminder, 1 to 168 whole hours', () => {
  const recovery = { id: 'RECOVERY', supported: true }, shipped = { id: 'SHIPPED', supported: true };
  assert.equal(templateDraftError(shipped, { subject: ' ', body: 'b' }), 'Completa el asunto y el mensaje.');
  assert.equal(templateDraftError(shipped, { subject: 'a', body: 'b' }), '');
  for (const hours of ['0', '169', '2.5', '']) assert.equal(templateDraftError(recovery, { subject: 'a', body: 'b', recoveryHours: hours }), 'Las horas de espera van de 1 a 168.');
  assert.equal(templateDraftError(recovery, { subject: 'a', body: 'b', recoveryHours: '168' }), '');
});

test('the sample fills example values and the store name', () => {
  assert.equal(sampleText('Hola {{customer}}, {{order}} por {{amount}} en {{store}}', 'Café'), 'Hola María, PEDIDO-123 por Bs 180,00 en Café');
});

test('an odd overview reply leaves an empty list of templates', () => {
  assert.deepEqual(normalizeOverview([]), { templates: [] });
  assert.deepEqual(normalizeOverview(null), { templates: [] });
  assert.deepEqual(normalizeOverview({ revision: 3 }), { revision: 3, templates: [] });
});
